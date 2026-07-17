// Schéma initial (migration v1). Ne jamais modifier ce bloc pour faire évoluer
// une table déjà déployée : ajouter une migration dans migrate.ts à la place.
export const INITIAL_SCHEMA = `
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
    end_time    TEXT,
    color       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_timelines_project ON timelines(project_id);
  CREATE INDEX IF NOT EXISTS idx_events_timeline   ON events(timeline_id);
`
