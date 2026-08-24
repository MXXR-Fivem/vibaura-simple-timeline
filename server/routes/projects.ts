import { Router } from 'express'
import { parseId } from '../validation.js'
import { WEB_ACTOR } from '../backup.js'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from '../services/projects.js'
import { bad, readBody } from './helpers.js'

// Façade HTTP : parse l'URL, délègue au service, traduit le Result en statut.
export const projectsRouter = Router()

projectsRouter.get('/projects', (_req, res) => {
  res.json(listProjects())
})

projectsRouter.post('/projects', (req, res) => {
  const r = createProject(WEB_ACTOR, readBody(req))
  if (!r.ok) return bad(res, r.error, r.status)
  res.status(201).json(r.value.row)
})

projectsRouter.get('/projects/:id', (req, res) => {
  const pid = parseId(req.params.id)
  if (!pid) return bad(res, 'invalid_id')
  const r = getProject(pid)
  if (!r.ok) return bad(res, r.error, r.status)
  res.json(r.value)
})

projectsRouter.patch('/projects/:id', (req, res) => {
  const pid = parseId(req.params.id)
  if (!pid) return bad(res, 'invalid_id')
  const r = updateProject(WEB_ACTOR, pid, readBody(req))
  if (!r.ok) return bad(res, r.error, r.status)
  res.json(r.value.row)
})

projectsRouter.delete('/projects/:id', (req, res) => {
  const pid = parseId(req.params.id)
  if (!pid) return bad(res, 'invalid_id')
  const r = deleteProject(WEB_ACTOR, pid)
  // Supprimer ce qui n'existe plus reste un succès côté HTTP (idempotence).
  if (!r.ok && r.status !== 404) return bad(res, r.error, r.status)
  res.status(204).end()
})
