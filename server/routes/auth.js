import { Router } from 'express'
import { setSession, clearSession, checkCredentials, currentUser } from '../auth.js'
import { loginThrottle, noteLoginFailure, resetLoginAttempts } from '../middleware/rateLimit.js'

// Routes d'authentification publiques (non protégées par requireAuth).
export const authRouter = Router()

authRouter.post('/login', loginThrottle, (req, res) => {
  const { username, password } = req.body || {}
  if (!checkCredentials(username, password)) {
    noteLoginFailure(req)
    return res.status(401).json({ error: 'invalid_credentials' })
  }
  resetLoginAttempts(req)
  setSession(res)
  res.json({ user: username })
})

authRouter.post('/logout', (req, res) => {
  clearSession(res)
  res.json({ ok: true })
})

authRouter.get('/me', (req, res) => {
  const u = currentUser(req)
  if (!u) return res.status(401).json({ error: 'unauthorized' })
  res.json({ user: u })
})
