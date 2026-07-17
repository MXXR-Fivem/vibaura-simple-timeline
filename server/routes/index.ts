import { Router } from 'express'
import { projectsRouter } from './projects.js'
import { timelinesRouter } from './timelines.js'
import { eventsRouter } from './events.js'

// Router API protégé (monté derrière requireAuth) : compose les 3 ressources.
export const apiRouter = Router()
apiRouter.use(projectsRouter)
apiRouter.use(timelinesRouter)
apiRouter.use(eventsRouter)
