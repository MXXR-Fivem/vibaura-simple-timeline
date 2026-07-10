import { Router } from 'express'
import { db, now } from '../db/index.js'
import { isDate, isTime, trimStr, parseId, KINDS, HEX_COLOR } from '../validation.js'
import { bad, touchTimeline } from './helpers.js'

export const eventsRouter = Router()

// Normalise + valide un corps d'évènement. Retourne { value } ou { error }.
// `cur` = ligne existante pour un PATCH (ou null pour un POST).
function readEventBody(b, cur) {
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
  let end_time = null
  if (kind === 'period') {
    end_date = b.end_date !== undefined ? b.end_date : cur?.end_date
    if (!isDate(end_date)) return { error: 'invalid_end' }
    if (start_date > end_date) return { error: 'end_before_start' }
    if (b.end_time !== undefined) {
      end_time = b.end_time == null || b.end_time === '' ? null : b.end_time
      if (end_time != null && !isTime(end_time)) return { error: 'invalid_end_time' }
    } else {
      end_time = cur?.end_time ?? null
    }
  }
  let color = b.color !== undefined ? b.color : cur?.color
  if (color != null && !HEX_COLOR.test(color)) color = null
  return { value: { title, description, kind, start_date, start_time, end_date, end_time, color: color ?? null } }
}

eventsRouter.get('/timelines/:id/events', (req, res) => {
  const tid = parseId(req.params.id)
  if (!tid) return bad(res, 'invalid_id')
  const rows = db
    .prepare('SELECT * FROM events WHERE timeline_id=? ORDER BY start_date ASC, id ASC')
    .all(tid)
  res.json(rows)
})

eventsRouter.post('/timelines/:id/events', (req, res) => {
  const tid = parseId(req.params.id)
  if (!tid) return bad(res, 'invalid_id')
  if (!db.prepare('SELECT 1 FROM timelines WHERE id=?').get(tid)) return bad(res, 'timeline_not_found', 404)

  const parsed = readEventBody(req.body || {}, null)
  if (parsed.error) return bad(res, parsed.error)
  const v = parsed.value

  const created = db.transaction(() => {
    const ts = now()
    const info = db
      .prepare(
        `INSERT INTO events (timeline_id, title, description, kind, start_date, start_time, end_date, end_time, color, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(tid, v.title, v.description, v.kind, v.start_date, v.start_time, v.end_date, v.end_time, v.color, ts, ts)
    touchTimeline(tid)
    return db.prepare('SELECT * FROM events WHERE id=?').get(info.lastInsertRowid)
  })()
  res.status(201).json(created)
})

eventsRouter.patch('/events/:id', (req, res) => {
  const eid = parseId(req.params.id)
  if (!eid) return bad(res, 'invalid_id')
  const cur = db.prepare('SELECT * FROM events WHERE id=?').get(eid)
  if (!cur) return bad(res, 'not_found', 404)

  const parsed = readEventBody(req.body || {}, cur)
  if (parsed.error) return bad(res, parsed.error)
  const v = parsed.value

  const updated = db.transaction(() => {
    db.prepare(
      `UPDATE events SET title=?, description=?, kind=?, start_date=?, start_time=?, end_date=?, end_time=?, color=?, updated_at=? WHERE id=?`
    ).run(v.title, v.description, v.kind, v.start_date, v.start_time, v.end_date, v.end_time, v.color, now(), eid)
    touchTimeline(cur.timeline_id)
    return db.prepare('SELECT * FROM events WHERE id=?').get(eid)
  })()
  res.json(updated)
})

eventsRouter.delete('/events/:id', (req, res) => {
  const eid = parseId(req.params.id)
  if (!eid) return bad(res, 'invalid_id')
  const cur = db.prepare('SELECT timeline_id FROM events WHERE id=?').get(eid)
  db.transaction(() => {
    db.prepare('DELETE FROM events WHERE id=?').run(eid)
    if (cur) touchTimeline(cur.timeline_id)
  })()
  res.status(204).end()
})
