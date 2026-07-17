import crypto from 'node:crypto'
import type { Request, RequestHandler, Response } from 'express'
import { config } from './config.js'

const COOKIE = 'sid'
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30 // 30 jours

interface SessionPayload {
  /** username au moment de l'émission */
  u: string
  /** empreinte des identifiants (voir credentialFingerprint) */
  f: string
  /** date d'émission (ms epoch) */
  iat: number
}

// Empreinte dérivée des identifiants courants : incorporée au token signé, elle
// invalide toutes les sessions dès que le username OU le mot de passe change.
function credentialFingerprint(): string {
  return crypto
    .createHmac('sha256', config.secret)
    .update(`${config.username}:${config.password}`)
    .digest('base64url')
    .slice(0, 16)
}

function sign(value: string): string {
  return crypto.createHmac('sha256', config.secret).update(value).digest('base64url')
}

function makeToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ u: config.username, f: credentialFingerprint(), iat: Date.now() })
  ).toString('base64url')
  return `${payload}.${sign(payload)}`
}

function verifyToken(token: unknown): SessionPayload | null {
  if (!token || typeof token !== 'string') return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const a = Buffer.from(sig)
  const b = Buffer.from(sign(payload))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Partial<SessionPayload>
    if (data.u !== config.username) return null
    if (data.f !== credentialFingerprint()) return null // identifiants changés => sessions invalidées
    const { iat } = data
    if (!Number.isFinite(iat) || Date.now() - (iat as number) > MAX_AGE_MS) return null
    return data as SessionPayload
  } catch {
    return null
  }
}

// Comparaison à temps constant SANS fuite de longueur : on hache les deux côtés
// vers des empreintes de taille fixe avant de comparer.
function safeEqual(a: unknown, b: unknown): boolean {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}

export function checkCredentials(username: unknown, password: unknown): boolean {
  // On évalue les deux pour ne pas court-circuiter selon le champ.
  const okUser = safeEqual(username ?? '', config.username)
  const okPass = safeEqual(password ?? '', config.password)
  return okUser && okPass
}

export function setSession(res: Response): void {
  res.cookie(COOKIE, makeToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: MAX_AGE_MS,
    path: '/',
  })
}

export function clearSession(res: Response): void {
  res.clearCookie(COOKIE, { path: '/' })
}

export function currentUser(req: Request): string | null {
  return verifyToken(req.cookies?.[COOKIE])?.u ?? null
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const u = currentUser(req)
  if (!u) return res.status(401).json({ error: 'unauthorized' })
  req.user = u
  next()
}
