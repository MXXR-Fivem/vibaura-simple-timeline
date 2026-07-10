import { Router } from 'express'
import { db, now } from '../db/index.js'
import { trimStr, parseId } from '../validation.js'
import { bad } from './helpers.js'

export const projectsRouter = Router()

projectsRouter.get('/projects', (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM timelines t WHERE t.project_id = p.id) AS timeline_count
       FROM projects p ORDER BY p.updated_at DESC`
    )
    .all()
  res.json(rows)
})

projectsRouter.post('/projects', (req, res) => {
  const name = trimStr(req.body?.name, 200).trim()
  if (!name) return bad(res, 'name_required')
  const description = trimStr(req.body?.description, 4000)
  const ts = now()
  const info = db
    .prepare('INSERT INTO projects (name, description, created_at, updated_at) VALUES (?,?,?,?)')
    .run(name, description, ts, ts)
  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id=?').get(info.lastInsertRowid))
})

projectsRouter.get('/projects/:id', (req, res) => {
  const pid = parseId(req.params.id)
  if (!pid) return bad(res, 'invalid_id')
  const row = db.prepare('SELECT * FROM projects WHERE id=?').get(pid)
  if (!row) return bad(res, 'not_found', 404)
  res.json(row)
})

projectsRouter.patch('/projects/:id', (req, res) => {
  const pid = parseId(req.params.id)
  if (!pid) return bad(res, 'invalid_id')
  const cur = db.prepare('SELECT * FROM projects WHERE id=?').get(pid)
  if (!cur) return bad(res, 'not_found', 404)
  const name = req.body?.name !== undefined ? trimStr(req.body.name, 200).trim() : cur.name
  if (!name) return bad(res, 'name_required')
  const description =
    req.body?.description !== undefined ? trimStr(req.body.description, 4000) : cur.description
  db.prepare('UPDATE projects SET name=?, description=?, updated_at=? WHERE id=?').run(
    name,
    description,
    now(),
    pid
  )
  res.json(db.prepare('SELECT * FROM projects WHERE id=?').get(pid))
})

projectsRouter.delete('/projects/:id', (req, res) => {
  const pid = parseId(req.params.id)
  if (!pid) return bad(res, 'invalid_id')
  db.prepare('DELETE FROM projects WHERE id=?').run(pid)
  res.status(204).end()
})
