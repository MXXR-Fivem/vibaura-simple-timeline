import Database from 'better-sqlite3'
import type { Database as DatabaseHandle } from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { migrate } from './migrate.js'
import type { IsoTimestamp } from '../../shared/types.js'

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true })

export const db: DatabaseHandle = new Database(config.dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000') // attend au lieu d'échouer si une écriture concurrente verrouille

migrate(db)

export function now(): IsoTimestamp {
  return new Date().toISOString()
}
