import { db, now } from '../db/index.js'
import { isDate, isGranularity, isHexColor, trimStr } from '../validation.js'
import { captureTimeline, createSnapshot, emptyRows, recordChange } from '../backup.js'
import type { Actor } from '../backup.js'
import { fail, ok, touchProject } from './base.js'
import type { Mutated, Result, ServiceInput } from './base.js'
import type { Timeline, TimelineListItem } from '../../shared/types.js'

const selectTimeline = () =>
  db.prepare<[number | bigint], Timeline>('SELECT * FROM timelines WHERE id=?')

export function listTimelines(projectId: number): TimelineListItem[] {
  return db
    .prepare<[number], TimelineListItem>(
      `SELECT t.*, (SELECT COUNT(*) FROM events e WHERE e.timeline_id = t.id) AS event_count
       FROM timelines t WHERE t.project_id=? ORDER BY t.updated_at DESC`
    )
    .all(projectId)
}

export function getTimeline(id: number): Result<Timeline> {
  const row = selectTimeline().get(id)
  return row ? ok(row) : fail('not_found', 404)
}

export function createTimeline(
  actor: Actor,
  projectId: number,
  input: ServiceInput
): Result<Mutated<Timeline>> {
  if (!db.prepare('SELECT 1 FROM projects WHERE id=?').get(projectId)) {
    return fail('project_not_found', 404)
  }
  const name = trimStr(input.name, 200).trim()
  if (!name) return fail('name_required')
  const { start_date, end_date } = input
  if (!isDate(start_date) || !isDate(end_date)) return fail('invalid_dates')
  if (start_date > end_date) return fail('end_before_start')
  const granularity = isGranularity(input.granularity) ? input.granularity : 'month'
  const color = isHexColor(input.color) ? input.color : '#3b82f6'
  const description = trimStr(input.description, 4000)

  const row = db.transaction(() => {
    const ts = now()
    const info = db
      .prepare(
        `INSERT INTO timelines (project_id, name, description, start_date, end_date, granularity, color, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(projectId, name, description, start_date, end_date, granularity, color, ts, ts)
    touchProject(projectId)
    return selectTimeline().get(info.lastInsertRowid) as Timeline
  })()

  const change = recordChange({
    actor,
    op: 'create_timeline',
    summary: `Timeline « ${row.name} » créée (id ${row.id}, projet ${projectId})`,
    before: emptyRows(),
    after: captureTimeline(row.id),
  })
  return ok({ row, change })
}

export function updateTimeline(
  actor: Actor,
  id: number,
  input: ServiceInput
): Result<Mutated<Timeline>> {
  const cur = selectTimeline().get(id)
  if (!cur) return fail('not_found', 404)

  const name = input.name !== undefined ? trimStr(input.name, 200).trim() : cur.name
  if (!name) return fail('name_required')
  const description =
    input.description !== undefined ? trimStr(input.description, 4000) : cur.description
  const start_date = input.start_date !== undefined ? input.start_date : cur.start_date
  const end_date = input.end_date !== undefined ? input.end_date : cur.end_date
  if (!isDate(start_date) || !isDate(end_date)) return fail('invalid_dates')
  if (start_date > end_date) return fail('end_before_start')
  // Une valeur fournie mais invalide est ignorée (on garde l'existante).
  const granularity =
    input.granularity !== undefined
      ? isGranularity(input.granularity)
        ? input.granularity
        : cur.granularity
      : cur.granularity
  const color =
    input.color !== undefined ? (isHexColor(input.color) ? input.color : cur.color) : cur.color

  const before = captureTimeline(id)
  const row = db.transaction(() => {
    db.prepare(
      `UPDATE timelines SET name=?, description=?, start_date=?, end_date=?, granularity=?, color=?, updated_at=? WHERE id=?`
    ).run(name, description, start_date, end_date, granularity, color, now(), id)
    touchProject(cur.project_id)
    return selectTimeline().get(id) as Timeline
  })()

  const change = recordChange({
    actor,
    op: 'update_timeline',
    summary: `Timeline « ${row.name} » modifiée (id ${row.id})`,
    before,
    after: captureTimeline(id),
  })
  return ok({ row, change })
}

export function deleteTimeline(actor: Actor, id: number): Result<Mutated<Timeline>> {
  const before = captureTimeline(id)
  const cur = before.timelines[0]
  if (!cur) return fail('not_found', 404)

  // Cascade sur les évènements : instantané complet en plus du journal.
  createSnapshot(`avant-delete_timeline-${id}`)
  db.transaction(() => {
    db.prepare('DELETE FROM timelines WHERE id=?').run(id)
    touchProject(cur.project_id)
  })()

  const change = recordChange({
    actor,
    op: 'delete_timeline',
    summary: `Timeline « ${cur.name} » supprimée (id ${id}, ${before.events.length} évènement(s))`,
    before,
    after: emptyRows(),
  })
  return ok({ row: cur, change })
}
