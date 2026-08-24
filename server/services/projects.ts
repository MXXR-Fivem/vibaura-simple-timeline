import { db, now } from '../db/index.js'
import { trimStr } from '../validation.js'
import { captureProject, createSnapshot, emptyRows, recordChange } from '../backup.js'
import type { Actor } from '../backup.js'
import { fail, ok } from './base.js'
import type { Mutated, Result, ServiceInput } from './base.js'
import type { Project, ProjectListItem } from '../../shared/types.js'

const selectProject = () =>
  db.prepare<[number | bigint], Project>('SELECT * FROM projects WHERE id=?')

export function listProjects(): ProjectListItem[] {
  return db
    .prepare<[], ProjectListItem>(
      `SELECT p.*, (SELECT COUNT(*) FROM timelines t WHERE t.project_id = p.id) AS timeline_count
       FROM projects p ORDER BY p.updated_at DESC`
    )
    .all()
}

export function getProject(id: number): Result<Project> {
  const row = selectProject().get(id)
  return row ? ok(row) : fail('not_found', 404)
}

export function createProject(actor: Actor, input: ServiceInput): Result<Mutated<Project>> {
  const name = trimStr(input.name, 200).trim()
  if (!name) return fail('name_required')
  const description = trimStr(input.description, 4000)

  const ts = now()
  const info = db
    .prepare('INSERT INTO projects (name, description, created_at, updated_at) VALUES (?,?,?,?)')
    .run(name, description, ts, ts)
  const row = selectProject().get(info.lastInsertRowid) as Project

  const change = recordChange({
    actor,
    op: 'create_project',
    summary: `Projet « ${row.name} » créé (id ${row.id})`,
    before: emptyRows(),
    after: captureProject(row.id),
  })
  return ok({ row, change })
}

export function updateProject(
  actor: Actor,
  id: number,
  input: ServiceInput
): Result<Mutated<Project>> {
  const cur = selectProject().get(id)
  if (!cur) return fail('not_found', 404)
  const name = input.name !== undefined ? trimStr(input.name, 200).trim() : cur.name
  if (!name) return fail('name_required')
  const description =
    input.description !== undefined ? trimStr(input.description, 4000) : cur.description

  const before = captureProject(id)
  db.prepare('UPDATE projects SET name=?, description=?, updated_at=? WHERE id=?').run(
    name,
    description,
    now(),
    id
  )
  const row = selectProject().get(id) as Project

  const change = recordChange({
    actor,
    op: 'update_project',
    summary: `Projet « ${row.name} » modifié (id ${row.id})`,
    before,
    after: captureProject(id),
  })
  return ok({ row, change })
}

export function deleteProject(actor: Actor, id: number): Result<Mutated<Project>> {
  const before = captureProject(id)
  const cur = before.projects[0]
  if (!cur) return fail('not_found', 404)

  // Suppression en cascade (timelines + évènements) : instantané complet avant,
  // en plus de l'entrée de journal qui suffit à un rollback ciblé.
  createSnapshot(`avant-delete_project-${id}`)
  db.prepare('DELETE FROM projects WHERE id=?').run(id)

  const change = recordChange({
    actor,
    op: 'delete_project',
    summary: `Projet « ${cur.name} » supprimé (id ${id}, ${before.timelines.length} timeline(s), ${before.events.length} évènement(s))`,
    before,
    after: emptyRows(),
  })
  return ok({ row: cur, change })
}
