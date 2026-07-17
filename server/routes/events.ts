import { Router } from 'express'
import { db, now } from '../db/index.js'
import { isDate, isEventKind, isHexColor, isTime, trimStr, parseId } from '../validation.js'
import { bad, readBody, touchTimeline } from './helpers.js'
import type { RequestBody } from './helpers.js'
import type { EventKind, HexColor, IsoDate, IsoTime, TimelineEvent } from '../../shared/types.js'

export const eventsRouter = Router()

const selectEvent = () => db.prepare<[number | bigint], TimelineEvent>('SELECT * FROM events WHERE id=?')

/** Colonnes écrites par un POST/PATCH, une fois normalisées et validées. */
interface EventValues {
  title: string
  description: string
  kind: EventKind
  start_date: IsoDate
  start_time: IsoTime | null
  end_date: IsoDate | null
  end_time: IsoTime | null
  color: HexColor | null
}

type ParsedEvent = { ok: true; value: EventValues } | { ok: false; error: string }

// Normalise + valide un corps d'évènement.
// `cur` = ligne existante pour un PATCH (ou null pour un POST).
function readEventBody(b: RequestBody, cur: TimelineEvent | null): ParsedEvent {
  const title = b.title !== undefined ? trimStr(b.title, 300).trim() : cur?.title
  if (!title) return { ok: false, error: 'title_required' }
  const description = b.description !== undefined ? trimStr(b.description, 4000) : (cur?.description ?? '')
  const kind = b.kind !== undefined ? (isEventKind(b.kind) ? b.kind : null) : (cur?.kind ?? 'point')
  if (!kind) return { ok: false, error: 'invalid_kind' }
  const start_date = b.start_date !== undefined ? b.start_date : cur?.start_date
  if (!isDate(start_date)) return { ok: false, error: 'invalid_start' }

  // Heure optionnelle (null = journée entière). '' ou null efface l'heure.
  let start_time: IsoTime | null
  if (b.start_time !== undefined) {
    const raw = b.start_time
    if (raw == null || raw === '') start_time = null
    else if (!isTime(raw)) return { ok: false, error: 'invalid_time' }
    else start_time = raw
  } else {
    start_time = cur?.start_time ?? null
  }

  let end_date: IsoDate | null = null
  let end_time: IsoTime | null = null
  if (kind === 'period') {
    const rawEnd = b.end_date !== undefined ? b.end_date : cur?.end_date
    if (!isDate(rawEnd)) return { ok: false, error: 'invalid_end' }
    if (start_date > rawEnd) return { ok: false, error: 'end_before_start' }
    end_date = rawEnd
    if (b.end_time !== undefined) {
      const raw = b.end_time
      if (raw == null || raw === '') end_time = null
      else if (!isTime(raw)) return { ok: false, error: 'invalid_end_time' }
      else end_time = raw
    } else {
      end_time = cur?.end_time ?? null
    }
  }

  const rawColor = b.color !== undefined ? b.color : cur?.color
  const color = isHexColor(rawColor) ? rawColor : null
  return { ok: true, value: { title, description, kind, start_date, start_time, end_date, end_time, color } }
}

eventsRouter.get('/timelines/:id/events', (req, res) => {
  const tid = parseId(req.params.id)
  if (!tid) return bad(res, 'invalid_id')
  const rows = db
    .prepare<[number], TimelineEvent>(
      'SELECT * FROM events WHERE timeline_id=? ORDER BY start_date ASC, id ASC'
    )
    .all(tid)
  res.json(rows)
})

eventsRouter.post('/timelines/:id/events', (req, res) => {
  const tid = parseId(req.params.id)
  if (!tid) return bad(res, 'invalid_id')
  if (!db.prepare('SELECT 1 FROM timelines WHERE id=?').get(tid)) {
    return bad(res, 'timeline_not_found', 404)
  }

  const parsed = readEventBody(readBody(req), null)
  if (!parsed.ok) return bad(res, parsed.error)
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
    return selectEvent().get(info.lastInsertRowid)
  })()
  res.status(201).json(created)
})

eventsRouter.patch('/events/:id', (req, res) => {
  const eid = parseId(req.params.id)
  if (!eid) return bad(res, 'invalid_id')
  const cur = selectEvent().get(eid)
  if (!cur) return bad(res, 'not_found', 404)

  const parsed = readEventBody(readBody(req), cur)
  if (!parsed.ok) return bad(res, parsed.error)
  const v = parsed.value

  const updated = db.transaction(() => {
    db.prepare(
      `UPDATE events SET title=?, description=?, kind=?, start_date=?, start_time=?, end_date=?, end_time=?, color=?, updated_at=? WHERE id=?`
    ).run(v.title, v.description, v.kind, v.start_date, v.start_time, v.end_date, v.end_time, v.color, now(), eid)
    touchTimeline(cur.timeline_id)
    return selectEvent().get(eid)
  })()
  res.json(updated)
})

eventsRouter.delete('/events/:id', (req, res) => {
  const eid = parseId(req.params.id)
  if (!eid) return bad(res, 'invalid_id')
  const cur = db
    .prepare<[number], { timeline_id: number }>('SELECT timeline_id FROM events WHERE id=?')
    .get(eid)
  db.transaction(() => {
    db.prepare('DELETE FROM events WHERE id=?').run(eid)
    if (cur) touchTimeline(cur.timeline_id)
  })()
  res.status(204).end()
})
