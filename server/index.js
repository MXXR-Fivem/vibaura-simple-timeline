import express from 'express'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { apiRouter } from './api.js'
import {
  requireAuth,
  setSession,
  clearSession,
  checkCredentials,
  currentUser,
  usingInsecureDefaults,
} from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Refuse de démarrer en production avec des identifiants / secret par défaut.
if (usingInsecureDefaults && process.env.NODE_ENV === 'production') {
  console.error(
    '[FATAL] AUTH_PASSWORD et/ou SESSION_SECRET manquants (ou valeurs par défaut) en production. ' +
      'Configure-les dans .env avant de démarrer.'
  )
  process.exit(1)
}

const app = express()

app.set('trust proxy', 1) // derrière nginx
app.disable('x-powered-by')
app.use(express.json({ limit: '256kb' }))
app.use(cookieParser())

// --- petit throttle mémoire pour /api/login (anti brute-force basique) ---
const attempts = new Map() // ip -> { count, first }
const WINDOW_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 20
// Purge périodique des entrées expirées : le Map ne grossit pas indéfiniment.
const sweep = setInterval(() => {
  const t = Date.now()
  for (const [ip, rec] of attempts) {
    if (t - rec.first >= WINDOW_MS) attempts.delete(ip)
  }
}, WINDOW_MS)
sweep.unref?.()
function loginThrottle(req, res, next) {
  const ip = req.ip || 'unknown'
  const rec = attempts.get(ip)
  const t = Date.now()
  if (rec && t - rec.first >= WINDOW_MS) attempts.delete(ip) // fenêtre expirée
  else if (rec && rec.count >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'too_many_attempts' })
  }
  next()
}
function noteFailure(req) {
  const ip = req.ip || 'unknown'
  const t = Date.now()
  const rec = attempts.get(ip)
  if (!rec || t - rec.first >= WINDOW_MS) attempts.set(ip, { count: 1, first: t })
  else rec.count++
}

// --- auth (public) ---
app.post('/api/login', loginThrottle, (req, res) => {
  const { username, password } = req.body || {}
  if (!checkCredentials(username, password)) {
    noteFailure(req)
    return res.status(401).json({ error: 'invalid_credentials' })
  }
  attempts.delete(req.ip || 'unknown')
  setSession(res, username)
  res.json({ user: username })
})

app.post('/api/logout', (req, res) => {
  clearSession(res)
  res.json({ ok: true })
})

app.get('/api/me', (req, res) => {
  const u = currentUser(req)
  if (!u) return res.status(401).json({ error: 'unauthorized' })
  res.json({ user: u })
})

// --- API protégée ---
app.use('/api', requireAuth, apiRouter)

// --- front statique + fallback SPA ---
const distDir = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Timeline server prêt sur http://localhost:${PORT}`)
  if (usingInsecureDefaults) {
    console.warn(
      '[ATTENTION] AUTH_PASSWORD / SESSION_SECRET non définis (ou valeurs par défaut). ' +
        'Configure-les dans .env avant toute mise en production.'
    )
  }
})
