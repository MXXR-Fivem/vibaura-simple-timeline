import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const DB_PATH = process.env.DB_PATH || './data/timeline.db'
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

export const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS timelines (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    start_date  TEXT NOT NULL,
    end_date    TEXT NOT NULL,
    granularity TEXT NOT NULL DEFAULT 'month',
    color       TEXT NOT NULL DEFAULT '#3b82f6',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timeline_id INTEGER NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    kind        TEXT NOT NULL DEFAULT 'point',
    start_date  TEXT NOT NULL,
    start_time  TEXT,
    end_date    TEXT,
    color       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_timelines_project ON timelines(project_id);
  CREATE INDEX IF NOT EXISTS idx_events_timeline   ON events(timeline_id);
`)

// Migration idempotente : ajoute start_time aux bases créées avant son introduction.
const eventCols = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name)
if (!eventCols.includes('start_time')) {
  db.exec('ALTER TABLE events ADD COLUMN start_time TEXT')
}

export function now() {
  return new Date().toISOString()
}
