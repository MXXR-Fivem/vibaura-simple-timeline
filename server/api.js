import express from 'express'
import { db, now } from './db.js'

export const apiRouter = express.Router()

// ---------- helpers ----------
function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg })
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const GRANULARITIES = new Set(['day', 'week', 'month', 'quarter', 'year'])
const KINDS = new Set(['point', 'period'])

// Valide la forme ET la validité calendaire (rejette 2024-02-30, 0000-01-01, etc.)
function isDate(s) {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  if (y < 1970 || m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}
function isTime(s) {
  return typeof s === 'string' && HHMM.test(s)
}
function trimStr(v, max) {
  return (typeof v === 'string' ? v : '').slice(0, max)
}
function id(req) {
  const n = Number(req.params.id)
  return Number.isInteger(n) && n > 0 ? n : null
}

// bump parent updated_at so lists sort by recent activity
function touchTimeline(tid) {
  db.prepare('UPDATE timelines SET updated_at=? WHERE id=?').run(now(), tid)
  const row = db.prepare('SELECT project_id FROM timelines WHERE id=?').get(tid)
  if (row) db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(now(), row.project_id)
}
function touchProject(pid) {
  db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(now(), pid)
}

// ===================== PROJECTS =====================
apiRouter.get('/projects', (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM timelines t WHERE t.project_id = p.id) AS timeline_count
       FROM projects p ORDER BY p.updated_at DESC`
    )
    .all()
  res.json(rows)
})

apiRouter.post('/projects', (req, res) => {
  const name = trimStr(req.body?.name, 200).trim()
  if (!name) return bad(res, 'name_required')
  const description = trimStr(req.body?.description, 4000)
  const ts = now()
  const info = db
    .prepare('INSERT INTO projects (name, description, created_at, updated_at) VALUES (?,?,?,?)')
    .run(name, description, ts, ts)
  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id=?').get(info.lastInsertRowid))
})

apiRouter.get('/projects/:id', (req, res) => {
  const pid = id(req)
  if (!pid) return bad(res, 'invalid_id')
  const row = db.prepare('SELECT * FROM projects WHERE id=?').get(pid)
  if (!row) return bad(res, 'not_found', 404)
  res.json(row)
})

apiRouter.patch('/projects/:id', (req, res) => {
  const pid = id(req)
  if (!pid) return bad(res, 'invalid_id')
  const cur = db.prepare('SELECT * FROM projects WHERE id=?').get(pid)
  if (!cur) return bad(res, 'not_found', 404)
  const name = req.body?.name !== undefined ? trimStr(req.body.name, 200).trim() : cur.name
  if (!name) return bad(res, 'name_required')
  const description = req.body?.description !== undefined ? trimStr(req.body.description, 4000) : cur.description
  db.prepare('UPDATE projects SET name=?, description=?, updated_at=? WHERE id=?').run(name, description, now(), pid)
  res.json(db.prepare('SELECT * FROM projects WHERE id=?').get(pid))
})

apiRouter.delete('/projects/:id', (req, res) => {
  const pid = id(req)
  if (!pid) return bad(res, 'invalid_id')
  db.prepare('DELETE FROM projects WHERE id=?').run(pid)
  res.status(204).end()
})

// ===================== TIMELINES =====================
apiRouter.get('/projects/:id/timelines', (req, res) => {
  const pid = id(req)
  if (!pid) return bad(res, 'invalid_id')
  const rows = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM events e WHERE e.timeline_id = t.id) AS event_count
       FROM timelines t WHERE t.project_id=? ORDER BY t.updated_at DESC`
    )
    .all(pid)
  res.json(rows)
})

apiRouter.post('/projects/:id/timelines', (req, res) => {
  const pid = id(req)
  if (!pid) return bad(res, 'invalid_id')
  if (!db.prepare('SELECT 1 FROM projects WHERE id=?').get(pid)) return bad(res, 'project_not_found', 404)

  const name = trimStr(req.body?.name, 200).trim()
  if (!name) return bad(res, 'name_required')
  const { start_date, end_date } = req.body || {}
  if (!isDate(start_date) || !isDate(end_date)) return bad(res, 'invalid_dates')
  if (start_date > end_date) return bad(res, 'end_before_start')
  const granularity = GRANULARITIES.has(req.body?.granularity) ? req.body.granularity : 'month'
  const color = HEX_COLOR.test(req.body?.color) ? req.body.color : '#3b82f6'
  const description = trimStr(req.body?.description, 4000)
  const ts = now()
  const info = db
    .prepare(
      `INSERT INTO timelines (project_id, name, description, start_date, end_date, granularity, color, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(pid, name, description, start_date, end_date, granularity, color, ts, ts)
  touchProject(pid)
  res.status(201).json(db.prepare('SELECT * FROM timelines WHERE id=?').get(info.lastInsertRowid))
})

apiRouter.get('/timelines/:id', (req, res) => {
  const tid = id(req)
  if (!tid) return bad(res, 'invalid_id')
  const row = db.prepare('SELECT * FROM timelines WHERE id=?').get(tid)
  if (!row) return bad(res, 'not_found', 404)
  res.json(row)
})

apiRouter.patch('/timelines/:id', (req, res) => {
  const tid = id(req)
  if (!tid) return bad(res, 'invalid_id')
  const cur = db.prepare('SELECT * FROM timelines WHERE id=?').get(tid)
  if (!cur) return bad(res, 'not_found', 404)

  const b = req.body || {}
  const name = b.name !== undefined ? trimStr(b.name, 200).trim() : cur.name
  if (!name) return bad(res, 'name_required')
  const description = b.description !== undefined ? trimStr(b.description, 4000) : cur.description
  const start_date = b.start_date !== undefined ? b.start_date : cur.start_date
  const end_date = b.end_date !== undefined ? b.end_date : cur.end_date
  if (!isDate(start_date) || !isDate(end_date)) return bad(res, 'invalid_dates')
  if (start_date > end_date) return bad(res, 'end_before_start')
  const granularity = b.granularity !== undefined
    ? (GRANULARITIES.has(b.granularity) ? b.granularity : cur.granularity)
    : cur.granularity
  const color = b.color !== undefined ? (HEX_COLOR.test(b.color) ? b.color : cur.color) : cur.color

  db.prepare(
    `UPDATE timelines SET name=?, description=?, start_date=?, end_date=?, granularity=?, color=?, updated_at=? WHERE id=?`
  ).run(name, description, start_date, end_date, granularity, color, now(), tid)
  touchProject(cur.project_id)
  res.json(db.prepare('SELECT * FROM timelines WHERE id=?').get(tid))
})

apiRouter.delete('/timelines/:id', (req, res) => {
  const tid = id(req)
  if (!tid) return bad(res, 'invalid_id')
  const cur = db.prepare('SELECT project_id FROM timelines WHERE id=?').get(tid)
  db.prepare('DELETE FROM timelines WHERE id=?').run(tid)
  if (cur) touchProject(cur.project_id)
  res.status(204).end()
})

// ===================== EVENTS =====================
apiRouter.get('/timelines/:id/events', (req, res) => {
  const tid = id(req)
  if (!tid) return bad(res, 'invalid_id')
  const rows = db.prepare('SELECT * FROM events WHERE timeline_id=? ORDER BY start_date ASC, id ASC').all(tid)
  res.json(rows)
})

function readEventBody(b, cur) {
  // Returns { value } or { error }. cur is the existing row for PATCH (or null for POST).
  const title = b.title !== undefined ? trimStr(b.title, 300).trim() : cur?.title
  if (!title) return { error: 'title_required' }
  const description = b.description !== undefined ? trimStr(b.description, 4000) : (cur?.description ?? '')
  const kind = b.kind !== undefined ? (KINDS.has(b.kind) ? b.kind : null) : (cur?.kind ?? 'point')
  if (!kind) return { error: 'invalid_kind' }
  const start_date = b.start_date !== undefined ? b.start_date : cur?.start_date
  if (!isDate(start_date)) return { error: 'invalid_start' }

  // Heure optionnelle (null = journée entière). '' ou null efface l'heure.
  let start_time
  if (b.start_time !== undefined) {
    start_time = b.start_time == null || b.start_time === '' ? null : b.start_time
    if (start_time != null && !isTime(start_time)) return { error: 'invalid_time' }
  } else {
    start_time = cur?.start_time ?? null
  }

  let end_date = null
  if (kind === 'period') {
    end_date = b.end_date !== undefined ? b.end_date : cur?.end_date
    if (!isDate(end_date)) return { error: 'invalid_end' }
    if (start_date > end_date) return { error: 'end_before_start' }
  }
  let color = b.color !== undefined ? b.color : cur?.color
  if (color != null && !HEX_COLOR.test(color)) color = null
  return { value: { title, description, kind, start_date, start_time, end_date, color: color ?? null } }
}

apiRouter.post('/timelines/:id/events', (req, res) => {
  const tid = id(req)
  if (!tid) return bad(res, 'invalid_id')
  if (!db.prepare('SELECT 1 FROM timelines WHERE id=?').get(tid)) return bad(res, 'timeline_not_found', 404)

  const parsed = readEventBody(req.body || {}, null)
  if (parsed.error) return bad(res, parsed.error)
  const v = parsed.value
  const ts = now()
  const info = db
    .prepare(
      `INSERT INTO events (timeline_id, title, description, kind, start_date, start_time, end_date, color, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(tid, v.title, v.description, v.kind, v.start_date, v.start_time, v.end_date, v.color, ts, ts)
  touchTimeline(tid)
  res.status(201).json(db.prepare('SELECT * FROM events WHERE id=?').get(info.lastInsertRowid))
})

apiRouter.patch('/events/:id', (req, res) => {
  const eid = id(req)
  if (!eid) return bad(res, 'invalid_id')
  const cur = db.prepare('SELECT * FROM events WHERE id=?').get(eid)
  if (!cur) return bad(res, 'not_found', 404)

  const parsed = readEventBody(req.body || {}, cur)
  if (parsed.error) return bad(res, parsed.error)
  const v = parsed.value
  db.prepare(
    `UPDATE events SET title=?, description=?, kind=?, start_date=?, start_time=?, end_date=?, color=?, updated_at=? WHERE id=?`
  ).run(v.title, v.description, v.kind, v.start_date, v.start_time, v.end_date, v.color, now(), eid)
  touchTimeline(cur.timeline_id)
  res.json(db.prepare('SELECT * FROM events WHERE id=?').get(eid))
})

apiRouter.delete('/events/:id', (req, res) => {
  const eid = id(req)
  if (!eid) return bad(res, 'invalid_id')
  const cur = db.prepare('SELECT timeline_id FROM events WHERE id=?').get(eid)
  db.prepare('DELETE FROM events WHERE id=?').run(eid)
  if (cur) touchTimeline(cur.timeline_id)
  res.status(204).end()
})
