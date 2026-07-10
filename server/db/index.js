import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { migrate } from './migrate.js'

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true })

export const db = new Database(config.dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000') // attend au lieu d'échouer si une écriture concurrente verrouille

migrate(db)

export function now() {
  return new Date().toISOString()
}
