import { Router } from 'express'
import { parseId } from '../validation.js'
import { WEB_ACTOR } from '../backup.js'
import {
  createTimeline,
  deleteTimeline,
  getTimeline,
  listTimelines,
  updateTimeline,
} from '../services/timelines.js'
import { bad, readBody } from './helpers.js'

export const timelinesRouter = Router()

timelinesRouter.get('/projects/:id/timelines', (req, res) => {
  const pid = parseId(req.params.id)
  if (!pid) return bad(res, 'invalid_id')
  res.json(listTimelines(pid))
})

timelinesRouter.post('/projects/:id/timelines', (req, res) => {
  const pid = parseId(req.params.id)
  if (!pid) return bad(res, 'invalid_id')
  const r = createTimeline(WEB_ACTOR, pid, readBody(req))
  if (!r.ok) return bad(res, r.error, r.status)
  res.status(201).json(r.value.row)
})

timelinesRouter.get('/timelines/:id', (req, res) => {
  const tid = parseId(req.params.id)
  if (!tid) return bad(res, 'invalid_id')
  const r = getTimeline(tid)
  if (!r.ok) return bad(res, r.error, r.status)
  res.json(r.value)
})

timelinesRouter.patch('/timelines/:id', (req, res) => {
  const tid = parseId(req.params.id)
  if (!tid) return bad(res, 'invalid_id')
  const r = updateTimeline(WEB_ACTOR, tid, readBody(req))
  if (!r.ok) return bad(res, r.error, r.status)
  res.json(r.value.row)
})

timelinesRouter.delete('/timelines/:id', (req, res) => {
  const tid = parseId(req.params.id)
  if (!tid) return bad(res, 'invalid_id')
  const r = deleteTimeline(WEB_ACTOR, tid)
  if (!r.ok && r.status !== 404) return bad(res, r.error, r.status)
  res.status(204).end()
})
