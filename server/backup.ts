// Journal des mutations + instantanés JSON, sur le disque monté en volume
// (`data/backups/`). Deux mécanismes distincts et complémentaires :
//
// - le JOURNAL (`journal.jsonl`) enregistre chaque écriture avec l'état des
//   lignes touchées AVANT et APRÈS : c'est ce qui rend un `rollback` chirurgical
//   (on ne restaure que les lignes concernées, pas toute la base) ;
// - les INSTANTANÉS (`snapshots/*.json`) sont des copies complètes, prises avant
//   les opérations qui cascadent (suppression d'un projet ou d'une timeline) et
//   avant toute restauration : c'est le filet de sécurité si le journal ne suffit
//   plus.
//
// Aucune écriture ici ne doit faire échouer une requête utilisateur : les erreurs
// de disque sont journalisées en console et avalées.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { db, now } from './db/index.js'
import type { IsoTimestamp, Project, Timeline, TimelineEvent } from '../shared/types.js'

/** Qui écrit : l'app web (compte partagé) ou un agent via MCP (token nominatif). */
export interface Actor {
  origin: 'web' | 'mcp'
  name: string
}

export const WEB_ACTOR: Actor = { origin: 'web', name: 'web' }

/** Lignes des trois tables, telles quelles. Sert de payload aux journaux et instantanés. */
export interface Rows {
  projects: Project[]
  timelines: Timeline[]
  events: TimelineEvent[]
}

/** Une mutation enregistrée : `before` restauré et `after` défait par un rollback. */
export interface Change {
  id: string
  at: IsoTimestamp
  actor: Actor
  op: string
  /** Résumé lisible, affiché tel quel aux agents par `list_changes`. */
  summary: string
  before: Rows
  after: Rows
}

export interface SnapshotMeta {
  id: string
  at: IsoTimestamp
  reason: string
  counts: { projects: number; timelines: number; events: number }
}

interface SnapshotFile extends SnapshotMeta {
  rows: Rows
}

const JOURNAL_MAX_ENTRIES = 2000
const JOURNAL_KEEP_ROTATIONS = 5
const SNAPSHOTS_KEEP = 50

const journalPath = path.join(config.backupDir, 'journal.jsonl')
const snapshotsDir = path.join(config.backupDir, 'snapshots')

export function emptyRows(): Rows {
  return { projects: [], timelines: [], events: [] }
}

function ensureDirs(): void {
  fs.mkdirSync(snapshotsDir, { recursive: true })
}

function newId(): string {
  return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`
}

// ---------- capture ----------

const selProject = () => db.prepare<[number], Project>('SELECT * FROM projects WHERE id=?')
const selTimeline = () => db.prepare<[number], Timeline>('SELECT * FROM timelines WHERE id=?')
const selEvent = () => db.prepare<[number], TimelineEvent>('SELECT * FROM events WHERE id=?')

/** L'évènement seul. */
export function captureEvent(id: number): Rows {
  const rows = emptyRows()
  const e = selEvent().get(id)
  if (e) rows.events.push(e)
  return rows
}

/** La timeline ET ses évènements (que `DELETE` emporterait en cascade). */
export function captureTimeline(id: number): Rows {
  const rows = emptyRows()
  const t = selTimeline().get(id)
  if (!t) return rows
  rows.timelines.push(t)
  rows.events.push(
    ...db.prepare<[number], TimelineEvent>('SELECT * FROM events WHERE timeline_id=?').all(id)
  )
  return rows
}

/** Le projet, ses timelines et tous leurs évènements. */
export function captureProject(id: number): Rows {
  const rows = emptyRows()
  const p = selProject().get(id)
  if (!p) return rows
  rows.projects.push(p)
  const timelines = db
    .prepare<[number], Timeline>('SELECT * FROM timelines WHERE project_id=?')
    .all(id)
  rows.timelines.push(...timelines)
  for (const t of timelines) {
    rows.events.push(
      ...db.prepare<[number], TimelineEvent>('SELECT * FROM events WHERE timeline_id=?').all(t.id)
    )
  }
  return rows
}

/** Toute la base. */
export function captureAll(): Rows {
  return {
    projects: db.prepare<[], Project>('SELECT * FROM projects ORDER BY id').all(),
    timelines: db.prepare<[], Timeline>('SELECT * FROM timelines ORDER BY id').all(),
    events: db.prepare<[], TimelineEvent>('SELECT * FROM events ORDER BY id').all(),
  }
}

// ---------- écriture / lecture / restauration de lignes ----------

// `INSERT OR REPLACE` est proscrit : REPLACE efface la ligne existante, ce qui
// déclenche le ON DELETE CASCADE et emporte les enfants. On fait donc un upsert
// explicite (DO UPDATE), qui préserve les lignes filles.
const upsertProject = () =>
  db.prepare(`INSERT INTO projects (id, name, description, created_at, updated_at)
    VALUES (@id, @name, @description, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, description=excluded.description,
      created_at=excluded.created_at, updated_at=excluded.updated_at`)

const upsertTimeline = () =>
  db.prepare(`INSERT INTO timelines (id, project_id, name, description, start_date, end_date, granularity, color, created_at, updated_at)
    VALUES (@id, @project_id, @name, @description, @start_date, @end_date, @granularity, @color, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      project_id=excluded.project_id, name=excluded.name, description=excluded.description,
      start_date=excluded.start_date, end_date=excluded.end_date, granularity=excluded.granularity,
      color=excluded.color, created_at=excluded.created_at, updated_at=excluded.updated_at`)

const upsertEvent = () =>
  db.prepare(`INSERT INTO events (id, timeline_id, title, description, kind, start_date, start_time, end_date, end_time, color, created_at, updated_at)
    VALUES (@id, @timeline_id, @title, @description, @kind, @start_date, @start_time, @end_date, @end_time, @color, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      timeline_id=excluded.timeline_id, title=excluded.title, description=excluded.description,
      kind=excluded.kind, start_date=excluded.start_date, start_time=excluded.start_time,
      end_date=excluded.end_date, end_time=excluded.end_time, color=excluded.color,
      created_at=excluded.created_at, updated_at=excluded.updated_at`)

/** Réinsère/met à jour des lignes, parents d'abord (contrainte de clé étrangère). */
function writeRows(rows: Rows): void {
  for (const p of rows.projects) upsertProject().run(p)
  for (const t of rows.timelines) upsertTimeline().run(t)
  for (const e of rows.events) upsertEvent().run(e)
}

/** Supprime des lignes, enfants d'abord. */
function deleteRows(rows: Rows): void {
  const delEvent = db.prepare('DELETE FROM events WHERE id=?')
  const delTimeline = db.prepare('DELETE FROM timelines WHERE id=?')
  const delProject = db.prepare('DELETE FROM projects WHERE id=?')
  for (const e of rows.events) delEvent.run(e.id)
  for (const t of rows.timelines) delTimeline.run(t.id)
  for (const p of rows.projects) delProject.run(p.id)
}

// ---------- journal ----------

function rotateJournalIfNeeded(): void {
  let lines: number
  try {
    lines = fs.readFileSync(journalPath, 'utf8').split('\n').filter(Boolean).length
  } catch {
    return
  }
  if (lines < JOURNAL_MAX_ENTRIES) return
  fs.renameSync(journalPath, path.join(config.backupDir, `journal-${now().replace(/[:.]/g, '-')}.jsonl`))
  const rotated = fs
    .readdirSync(config.backupDir)
    .filter((f) => f.startsWith('journal-'))
    .sort()
  for (const f of rotated.slice(0, Math.max(0, rotated.length - JOURNAL_KEEP_ROTATIONS))) {
    fs.rmSync(path.join(config.backupDir, f), { force: true })
  }
}

/**
 * Enregistre une mutation. Appelée APRÈS que la transaction SQLite a réussi :
 * un échec d'écriture disque ne doit jamais annuler une opération déjà validée.
 */
export function recordChange(input: Omit<Change, 'id' | 'at'>): Change | null {
  const change: Change = { id: newId(), at: now(), ...input }
  try {
    ensureDirs()
    rotateJournalIfNeeded()
    fs.appendFileSync(journalPath, JSON.stringify(change) + '\n')
    return change
  } catch (err) {
    console.error('[backup] écriture du journal impossible :', (err as Error).message)
    return null
  }
}

/** Les `limit` mutations les plus récentes, de la plus récente à la plus ancienne. */
export function readChanges(limit: number): Change[] {
  let raw: string
  try {
    raw = fs.readFileSync(journalPath, 'utf8')
  } catch {
    return []
  }
  const out: Change[] = []
  const lines = raw.split('\n').filter(Boolean)
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    try {
      out.push(JSON.parse(lines[i]) as Change)
    } catch {
      /* ligne corrompue : on l'ignore plutôt que de perdre tout le journal */
    }
  }
  return out
}

export function findChange(id: string): Change | null {
  return readChanges(JOURNAL_MAX_ENTRIES).find((c) => c.id === id) ?? null
}

// ---------- rollback ----------

/** Clés « table:id » de toutes les lignes contenues. */
export function rowKeys(rows: Rows): string[] {
  return [...index(rows).keys()]
}

/** Relit dans la base l'état courant des lignes désignées par ces clés. */
export function captureKeys(keys: readonly string[]): Rows {
  const rows = emptyRows()
  for (const key of keys) {
    const [table, rawId] = key.split(':')
    const id = Number(rawId)
    if (table === 'projects') {
      const r = selProject().get(id)
      if (r) rows.projects.push(r)
    } else if (table === 'timelines') {
      const r = selTimeline().get(id)
      if (r) rows.timelines.push(r)
    } else {
      const r = selEvent().get(id)
      if (r) rows.events.push(r)
    }
  }
  return rows
}

function index(rows: Rows): Map<string, Project | Timeline | TimelineEvent> {
  const m = new Map<string, Project | Timeline | TimelineEvent>()
  for (const p of rows.projects) m.set(`projects:${p.id}`, p)
  for (const t of rows.timelines) m.set(`timelines:${t.id}`, t)
  for (const e of rows.events) m.set(`events:${e.id}`, e)
  return m
}

function currentRow(key: string): unknown {
  const [table, rawId] = key.split(':')
  const id = Number(rawId)
  if (table === 'projects') return selProject().get(id) ?? null
  if (table === 'timelines') return selTimeline().get(id) ?? null
  return selEvent().get(id) ?? null
}

/**
 * Lignes qui ont bougé depuis la mutation : quelqu'un (l'UI, un autre agent) a
 * écrit par-dessus. Défaire à l'aveugle écraserait ce travail, donc on le
 * signale et on exige `force`.
 */
export function detectDrift(change: Change): string[] {
  const drift: string[] = []
  const before = index(change.before)
  const after = index(change.after)
  for (const [key, row] of after) {
    if (JSON.stringify(currentRow(key)) !== JSON.stringify(row)) drift.push(key)
  }
  for (const key of before.keys()) {
    if (!after.has(key) && currentRow(key) !== null) drift.push(key)
  }
  return drift
}

/** Défait une mutation : remet `before`, retire ce que `after` avait créé. */
export function applyRollback(change: Change): void {
  const before = index(change.before)
  const created: Rows = {
    projects: change.after.projects.filter((p) => !before.has(`projects:${p.id}`)),
    timelines: change.after.timelines.filter((t) => !before.has(`timelines:${t.id}`)),
    events: change.after.events.filter((e) => !before.has(`events:${e.id}`)),
  }
  db.transaction(() => {
    deleteRows(created)
    writeRows(change.before)
  })()
}

// ---------- instantanés ----------

export function createSnapshot(reason: string): SnapshotMeta {
  ensureDirs()
  const rows = captureAll()
  const meta: SnapshotMeta = {
    id: `${now().replace(/[:.]/g, '-')}-${reason.replace(/[^a-z0-9_-]/gi, '_')}`,
    at: now(),
    reason,
    counts: {
      projects: rows.projects.length,
      timelines: rows.timelines.length,
      events: rows.events.length,
    },
  }
  const file: SnapshotFile = { ...meta, rows }
  fs.writeFileSync(path.join(snapshotsDir, `${meta.id}.json`), JSON.stringify(file, null, 2))
  pruneSnapshots()
  return meta
}

function pruneSnapshots(): void {
  const files = fs.readdirSync(snapshotsDir).filter((f) => f.endsWith('.json')).sort()
  for (const f of files.slice(0, Math.max(0, files.length - SNAPSHOTS_KEEP))) {
    fs.rmSync(path.join(snapshotsDir, f), { force: true })
  }
}

export function listSnapshots(): SnapshotMeta[] {
  let files: string[]
  try {
    files = fs.readdirSync(snapshotsDir).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  const metas: SnapshotMeta[] = []
  for (const f of files.sort().reverse()) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(snapshotsDir, f), 'utf8')) as SnapshotFile
      metas.push({ id: parsed.id, at: parsed.at, reason: parsed.reason, counts: parsed.counts })
    } catch {
      /* fichier illisible : on l'ignore */
    }
  }
  return metas
}

/** Remplace TOUT le contenu de la base par celui de l'instantané. */
export function restoreSnapshot(id: string): { ok: true; counts: SnapshotMeta['counts'] } | { ok: false; error: string } {
  const file = path.join(snapshotsDir, `${path.basename(id)}.json`)
  let parsed: SnapshotFile
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as SnapshotFile
  } catch {
    return { ok: false, error: 'snapshot_not_found' }
  }
  db.transaction(() => {
    db.prepare('DELETE FROM events').run()
    db.prepare('DELETE FROM timelines').run()
    db.prepare('DELETE FROM projects').run()
    writeRows(parsed.rows)
  })()
  return { ok: true, counts: parsed.counts }
}
