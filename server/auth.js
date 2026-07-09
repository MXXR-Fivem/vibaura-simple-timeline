import crypto from 'node:crypto'

const USERNAME = process.env.AUTH_USERNAME || 'vibaura'
const PASSWORD = process.env.AUTH_PASSWORD || 'changeme'
const SECRET = process.env.SESSION_SECRET || 'dev-insecure-secret-change-me'
const COOKIE = 'sid'
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30 // 30 jours

export const usingInsecureDefaults =
  (!process.env.AUTH_PASSWORD || process.env.AUTH_PASSWORD === 'changeme') ||
  !process.env.SESSION_SECRET

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url')
}

function makeToken(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, iat: Date.now() })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = sign(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (data.u !== USERNAME) return null // identifiants changés => sessions invalidées
    if (!Number.isFinite(data.iat) || Date.now() - data.iat > MAX_AGE_MS) return null
    return data
  } catch {
    return null
  }
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

export function checkCredentials(username, password) {
  // On évalue les deux pour ne pas court-circuiter selon le champ.
  const okUser = safeEqual(username ?? '', USERNAME)
  const okPass = safeEqual(password ?? '', PASSWORD)
  return okUser && okPass
}

export function setSession(res, username) {
  res.cookie(COOKIE, makeToken(username), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
    path: '/',
  })
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' })
}

export function currentUser(req) {
  const data = verifyToken(req.cookies?.[COOKIE])
  return data?.u || null
}

export function requireAuth(req, res, next) {
  const u = currentUser(req)
  if (!u) return res.status(401).json({ error: 'unauthorized' })
  req.user = u
  next()
}
