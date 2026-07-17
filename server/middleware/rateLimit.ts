// Throttle mémoire best-effort pour /api/login (anti brute-force basique).
// Le compteur n'est ni distribué ni persistant : pour une vraie protection,
// déléguer à nginx (limit_req) ou fail2ban en amont.
import type { Request, RequestHandler } from 'express'

const WINDOW_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 10

interface AttemptRecord {
  count: number
  /** début de la fenêtre courante (ms epoch) */
  first: number
}

const attempts = new Map<string, AttemptRecord>()

// Purge périodique : la Map ne grossit pas indéfiniment.
const sweep = setInterval(() => {
  const t = Date.now()
  for (const [ip, rec] of attempts) {
    if (t - rec.first >= WINDOW_MS) attempts.delete(ip)
  }
}, WINDOW_MS)
sweep.unref?.()

function clientIp(req: Request): string {
  return req.ip || 'unknown'
}

export const loginThrottle: RequestHandler = (req, res, next) => {
  const ip = clientIp(req)
  const rec = attempts.get(ip)
  const t = Date.now()
  if (rec && t - rec.first >= WINDOW_MS) attempts.delete(ip) // fenêtre expirée
  else if (rec && rec.count >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'too_many_attempts' })
  }
  next()
}

export function noteLoginFailure(req: Request): void {
  const ip = clientIp(req)
  const t = Date.now()
  const rec = attempts.get(ip)
  if (!rec || t - rec.first >= WINDOW_MS) attempts.set(ip, { count: 1, first: t })
  else rec.count++
}

export function resetLoginAttempts(req: Request): void {
  attempts.delete(clientIp(req))
}
