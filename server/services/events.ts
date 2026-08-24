import { db, now } from '../db/index.js'
import { isDate, isEventKind, isHexColor, isTime, trimStr } from '../validation.js'
import { captureEvent, emptyRows, recordChange } from '../backup.js'
import type { Actor } from '../backup.js'
import { fail, ok, touchTimeline } from './base.js'
import type { Mutated, Result, ServiceInput } from './base.js'
import type { EventKind, HexColor, IsoDate, IsoTime, TimelineEvent } from '../../shared/types.js'

const selectEvent = () =>
  db.prepare<[number | bigint], TimelineEvent>('SELECT * FROM events WHERE id=?')

/** Colonnes écrites par une création/modification, une fois normalisées et validées. */
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

// Normalise + valide une charge utile d'évènement.
// `cur` = ligne existante pour une modification (ou null pour une création).
function readEventInput(b: ServiceInput, cur: TimelineEvent | null): Result<EventValues> {
  const title = b.title !== undefined ? trimStr(b.title, 300).trim() : cur?.title
  if (!title) return fail('title_required')
  const description =
    b.description !== undefined ? trimStr(b.description, 4000) : (cur?.description ?? '')
  const kind = b.kind !== undefined ? (isEventKind(b.kind) ? b.kind : null) : (cur?.kind ?? 'point')
  if (!kind) return fail('invalid_kind')
  const start_date = b.start_date !== undefined ? b.start_date : cur?.start_date
  if (!isDate(start_date)) return fail('invalid_start')

  // Heure optionnelle (null = journée entière). '' ou null efface l'heure.
  let start_time: IsoTime | null
  if (b.start_time !== undefined) {
    const raw = b.start_time
    if (raw == null || raw === '') start_time = null
    else if (!isTime(raw)) return fail('invalid_time')
    else start_time = raw
  } else {
    start_time = cur?.start_time ?? null
  }

  let end_date: IsoDate | null = null
  let end_time: IsoTime | null = null
  if (kind === 'period') {
    const rawEnd = b.end_date !== undefined ? b.end_date : cur?.end_date
    if (!isDate(rawEnd)) return fail('invalid_end')
    if (start_date > rawEnd) return fail('end_before_start')
    end_date = rawEnd
    if (b.end_time !== undefined) {
      const raw = b.end_time
      if (raw == null || raw === '') end_time = null
      else if (!isTime(raw)) return fail('invalid_end_time')
      else end_time = raw
    } else {
      end_time = cur?.end_time ?? null
    }
  }

  const rawColor = b.color !== undefined ? b.color : cur?.color
  const color = isHexColor(rawColor) ? rawColor : null
  return ok({ title, description, kind, start_date, start_time, end_date, end_time, color })
}

export function listEvents(timelineId: number): TimelineEvent[] {
  return db
    .prepare<[number], TimelineEvent>(
      'SELECT * FROM events WHERE timeline_id=? ORDER BY start_date ASC, id ASC'
    )
    .all(timelineId)
}

export function getEvent(id: number): Result<TimelineEvent> {
  const row = selectEvent().get(id)
  return row ? ok(row) : fail('not_found', 404)
}

export function createEvent(
  actor: Actor,
  timelineId: number,
  input: ServiceInput
): Result<Mutated<TimelineEvent>> {
  if (!db.prepare('SELECT 1 FROM timelines WHERE id=?').get(timelineId)) {
    return fail('timeline_not_found', 404)
  }
  const parsed = readEventInput(input, null)
  if (!parsed.ok) return parsed
  const v = parsed.value

  const row = db.transaction(() => {
    const ts = now()
    const info = db
      .prepare(
        `INSERT INTO events (timeline_id, title, description, kind, start_date, start_time, end_date, end_time, color, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        timelineId,
        v.title,
        v.description,
        v.kind,
        v.start_date,
        v.start_time,
        v.end_date,
        v.end_time,
        v.color,
        ts,
        ts
      )
    touchTimeline(timelineId)
    return selectEvent().get(info.lastInsertRowid) as TimelineEvent
  })()

  const change = recordChange({
    actor,
    op: 'create_event',
    summary: `Évènement « ${row.title} » créé le ${row.start_date} (id ${row.id}, timeline ${timelineId})`,
    before: emptyRows(),
    after: captureEvent(row.id),
  })
  return ok({ row, change })
}

export function updateEvent(
  actor: Actor,
  id: number,
  input: ServiceInput
): Result<Mutated<TimelineEvent>> {
  const cur = selectEvent().get(id)
  if (!cur) return fail('not_found', 404)
  const parsed = readEventInput(input, cur)
  if (!parsed.ok) return parsed
  const v = parsed.value

  const before = captureEvent(id)
  const row = db.transaction(() => {
    db.prepare(
      `UPDATE events SET title=?, description=?, kind=?, start_date=?, start_time=?, end_date=?, end_time=?, color=?, updated_at=? WHERE id=?`
    ).run(
      v.title,
      v.description,
      v.kind,
      v.start_date,
      v.start_time,
      v.end_date,
      v.end_time,
      v.color,
      now(),
      id
    )
    touchTimeline(cur.timeline_id)
    return selectEvent().get(id) as TimelineEvent
  })()

  const change = recordChange({
    actor,
    op: 'update_event',
    summary: `Évènement « ${row.title} » modifié (id ${row.id})`,
    before,
    after: captureEvent(id),
  })
  return ok({ row, change })
}

export function deleteEvent(actor: Actor, id: number): Result<Mutated<TimelineEvent>> {
  const before = captureEvent(id)
  const cur = before.events[0]
  if (!cur) return fail('not_found', 404)

  db.transaction(() => {
    db.prepare('DELETE FROM events WHERE id=?').run(id)
    touchTimeline(cur.timeline_id)
  })()

  const change = recordChange({
    actor,
    op: 'delete_event',
    summary: `Évènement « ${cur.title} » du ${cur.start_date} supprimé (id ${id})`,
    before,
    after: emptyRows(),
  })
  return ok({ row: cur, change })
}
