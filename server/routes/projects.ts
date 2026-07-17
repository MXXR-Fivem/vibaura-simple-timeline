import { Router } from 'express'
import { db, now } from '../db/index.js'
import { trimStr, parseId } from '../validation.js'
import { bad, readBody } from './helpers.js'
import type { Project, ProjectListItem } from '../../shared/types.js'

export const projectsRouter = Router()

const selectProject = () => db.prepare<[number | bigint], Project>('SELECT * FROM projects WHERE id=?')

projectsRouter.get('/projects', (_req, res) => {
  const rows = db
    .prepare<[], ProjectListItem>(
      `SELECT p.*, (SELECT COUNT(*) FROM timelines t WHERE t.project_id = p.id) AS timeline_count
       FROM projects p ORDER BY p.updated_at DESC`
    )
    .all()
  res.json(rows)
})

projectsRouter.post('/projects', (req, res) => {
  const b = readBody(req)
  const name = trimStr(b.name, 200).trim()
  if (!name) return bad(res, 'name_required')
  const description = trimStr(b.description, 4000)
  const ts = now()
  const info = db
    .prepare('INSERT INTO projects (name, description, created_at, updated_at) VALUES (?,?,?,?)')
    .run(name, description, ts, ts)
  res.status(201).json(selectProject().get(info.lastInsertRowid))
})

projectsRouter.get('/projects/:id', (req, res) => {
  const pid = parseId(req.params.id)
  if (!pid) return bad(res, 'invalid_id')
  const row = selectProject().get(pid)
  if (!row) return bad(res, 'not_found', 404)
  res.json(row)
})

projectsRouter.patch('/projects/:id', (req, res) => {
  const pid = parseId(req.params.id)
  if (!pid) return bad(res, 'invalid_id')
  const cur = selectProject().get(pid)
  if (!cur) return bad(res, 'not_found', 404)
  const b = readBody(req)
  const name = b.name !== undefined ? trimStr(b.name, 200).trim() : cur.name
  if (!name) return bad(res, 'name_required')
  const description = b.description !== undefined ? trimStr(b.description, 4000) : cur.description
  db.prepare('UPDATE projects SET name=?, description=?, updated_at=? WHERE id=?').run(
    name,
    description,
    now(),
    pid
  )
  res.json(selectProject().get(pid))
})

projectsRouter.delete('/projects/:id', (req, res) => {
  const pid = parseId(req.params.id)
  if (!pid) return bad(res, 'invalid_id')
  db.prepare('DELETE FROM projects WHERE id=?').run(pid)
  res.status(204).end()
})
