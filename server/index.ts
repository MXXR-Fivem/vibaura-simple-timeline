import express from 'express'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import fs from 'node:fs'

import { config, usingInsecureDefaults, insecureConfigReasons } from './config.js'
import { publicDir } from './paths.js'
import { db } from './db/index.js'
import { requireAuth } from './auth.js'
import { authRouter } from './routes/auth.js'
import { apiRouter } from './routes/index.js'

// Refuse de démarrer en production tant que les identifiants / le secret ne sont
// pas configurés (valeurs d'exemple, secret trop court...).
if (usingInsecureDefaults && config.isProduction) {
  console.error('[FATAL] Configuration non sécurisée en production :')
  for (const reason of insecureConfigReasons) console.error('  - ' + reason)
  console.error(
    'Configure .env (AUTH_PASSWORD fort + SESSION_SECRET via `openssl rand -hex 32`) avant de démarrer.'
  )
  process.exit(1)
}

const app = express()

app.set('trust proxy', 1) // derrière nginx
app.disable('x-powered-by')
app.use(express.json({ limit: '256kb' }))
app.use(cookieParser())

// --- API ---
app.use('/api', authRouter) // login / logout / me (public)
app.use('/api', requireAuth, apiRouter) // projets / timelines / évènements (protégé)

// --- front statique + fallback SPA ---
if (fs.existsSync(publicDir)) {
  app.use(
    express.static(publicDir, {
      index: false,
      setHeaders: (res, filePath) => {
        // Assets hashés par contenu => cache long immuable ; index.html jamais caché.
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache')
        else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      },
    })
  )
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(publicDir, 'index.html'))
  })
}

const server = app.listen(config.port, () => {
  console.log(`Timeline server prêt sur http://localhost:${config.port}`)
  if (usingInsecureDefaults) {
    console.warn('[ATTENTION] Configuration non sécurisée : ' + insecureConfigReasons.join(' ; '))
  }
})

// --- arrêt propre : ferme le HTTP, checkpoint WAL, ferme SQLite ---
let shuttingDown = false
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\n${signal} reçu, arrêt en cours…`)
  server.close(() => {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
      db.close()
    } catch {
      /* ignore */
    }
    process.exit(0)
  })
  // filet de sécurité si des connexions traînent
  setTimeout(() => process.exit(0), 5000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
