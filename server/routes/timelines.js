import { Router } from 'express'
import { db, now } from '../db/index.js'
import { isDate, trimStr, parseId, GRANULARITIES, HEX_COLOR } from '../validation.js'
import { bad, touchProject } from './helpers.js'

export const timelinesRouter = Router()

timelinesRouter.get('/projects/:id/timelines', (req, res) => {
  const pid = parseId(req.params.id)
  if (!pid) return bad(res, 'invalid_id')
  const rows = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM events e WHERE e.timeline_id = t.id) AS event_count
       FROM timelines t WHERE t.project_id=? ORDER BY t.updated_at DESC`
    )
    .all(pid)
  res.json(rows)
})

timelinesRouter.post('/projects/:id/timelines', (req, res) => {
  const pid = parseId(req.params.id)
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

  const created = db.transaction(() => {
    const ts = now()
    const info = db
      .prepare(
        `INSERT INTO timelines (project_id, name, description, start_date, end_date, granularity, color, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(pid, name, description, start_date, end_date, granularity, color, ts, ts)
    touchProject(pid)
    return db.prepare('SELECT * FROM timelines WHERE id=?').get(info.lastInsertRowid)
  })()
  res.status(201).json(created)
})

timelinesRouter.get('/timelines/:id', (req, res) => {
  const tid = parseId(req.params.id)
  if (!tid) return bad(res, 'invalid_id')
  const row = db.prepare('SELECT * FROM timelines WHERE id=?').get(tid)
  if (!row) return bad(res, 'not_found', 404)
  res.json(row)
})

timelinesRouter.patch('/timelines/:id', (req, res) => {
  const tid = parseId(req.params.id)
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
  const granularity =
    b.granularity !== undefined
      ? GRANULARITIES.has(b.granularity)
        ? b.granularity
        : cur.granularity
      : cur.granularity
  const color = b.color !== undefined ? (HEX_COLOR.test(b.color) ? b.color : cur.color) : cur.color

  const updated = db.transaction(() => {
    db.prepare(
      `UPDATE timelines SET name=?, description=?, start_date=?, end_date=?, granularity=?, color=?, updated_at=? WHERE id=?`
    ).run(name, description, start_date, end_date, granularity, color, now(), tid)
    touchProject(cur.project_id)
    return db.prepare('SELECT * FROM timelines WHERE id=?').get(tid)
  })()
  res.json(updated)
})

timelinesRouter.delete('/timelines/:id', (req, res) => {
  const tid = parseId(req.params.id)
  if (!tid) return bad(res, 'invalid_id')
  const cur = db.prepare('SELECT project_id FROM timelines WHERE id=?').get(tid)
  db.transaction(() => {
    db.prepare('DELETE FROM timelines WHERE id=?').run(tid)
    if (cur) touchProject(cur.project_id)
  })()
  res.status(204).end()
})
