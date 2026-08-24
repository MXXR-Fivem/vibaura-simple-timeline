import { Router } from 'express'
import { parseId } from '../validation.js'
import { WEB_ACTOR } from '../backup.js'
import { createEvent, deleteEvent, listEvents, updateEvent } from '../services/events.js'
import { bad, readBody } from './helpers.js'

export const eventsRouter = Router()

eventsRouter.get('/timelines/:id/events', (req, res) => {
  const tid = parseId(req.params.id)
  if (!tid) return bad(res, 'invalid_id')
  res.json(listEvents(tid))
})

eventsRouter.post('/timelines/:id/events', (req, res) => {
  const tid = parseId(req.params.id)
  if (!tid) return bad(res, 'invalid_id')
  const r = createEvent(WEB_ACTOR, tid, readBody(req))
  if (!r.ok) return bad(res, r.error, r.status)
  res.status(201).json(r.value.row)
})

eventsRouter.patch('/events/:id', (req, res) => {
  const eid = parseId(req.params.id)
  if (!eid) return bad(res, 'invalid_id')
  const r = updateEvent(WEB_ACTOR, eid, readBody(req))
  if (!r.ok) return bad(res, r.error, r.status)
  res.json(r.value.row)
})

eventsRouter.delete('/events/:id', (req, res) => {
  const eid = parseId(req.params.id)
  if (!eid) return bad(res, 'invalid_id')
  const r = deleteEvent(WEB_ACTOR, eid)
  if (!r.ok && r.status !== 404) return bad(res, r.error, r.status)
  res.status(204).end()
})
