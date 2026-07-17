import { Router } from 'express'
import { setSession, clearSession, checkCredentials, currentUser } from '../auth.js'
import { config } from '../config.js'
import { loginThrottle, noteLoginFailure, resetLoginAttempts } from '../middleware/rateLimit.js'
import { readBody } from './helpers.js'
import type { SessionResponse } from '../../shared/types.js'

// Routes d'authentification publiques (non protégées par requireAuth).
export const authRouter = Router()

authRouter.post('/login', loginThrottle, (req, res) => {
  const { username, password } = readBody(req)
  if (!checkCredentials(username, password)) {
    noteLoginFailure(req)
    return res.status(401).json({ error: 'invalid_credentials' })
  }
  resetLoginAttempts(req)
  setSession(res)
  // On renvoie l'identifiant canonique, pas l'écho du corps de requête : celui-ci
  // est `unknown` et pourrait ne pas être une chaîne (12 valide si le compte est « 12 »).
  const body: SessionResponse = { user: config.username }
  res.json(body)
})

authRouter.post('/logout', (_req, res) => {
  clearSession(res)
  res.json({ ok: true })
})

authRouter.get('/me', (req, res) => {
  const u = currentUser(req)
  if (!u) return res.status(401).json({ error: 'unauthorized' })
  const body: SessionResponse = { user: u }
  res.json(body)
})
