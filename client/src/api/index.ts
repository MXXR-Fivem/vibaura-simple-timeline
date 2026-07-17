import { req } from './client'
import type {
  EventInput,
  EventPatch,
  LogoutResponse,
  Project,
  ProjectInput,
  ProjectListItem,
  ProjectPatch,
  SessionResponse,
  Timeline,
  TimelineEvent,
  TimelineInput,
  TimelineListItem,
  TimelinePatch,
} from '@shared/types'

// Surface de l'API, typée par le contrat partagé avec le serveur (shared/types.ts).
// Toute divergence client/serveur devient une erreur de compilation.
export const api = {
  // auth
  me: () => req<SessionResponse>('GET', '/api/me', undefined, { silent401: true }),
  login: (username: string, password: string) =>
    req<SessionResponse>('POST', '/api/login', { username, password }, { silent401: true }),
  logout: () => req<LogoutResponse>('POST', '/api/logout'),

  // projects
  listProjects: () => req<ProjectListItem[]>('GET', '/api/projects'),
  createProject: (data: ProjectInput) => req<Project>('POST', '/api/projects', data),
  updateProject: (id: number, data: ProjectPatch) => req<Project>('PATCH', `/api/projects/${id}`, data),
  deleteProject: (id: number) => req<null>('DELETE', `/api/projects/${id}`),
  getProject: (id: number) => req<Project>('GET', `/api/projects/${id}`),

  // timelines
  listTimelines: (projectId: number) => req<TimelineListItem[]>('GET', `/api/projects/${projectId}/timelines`),
  createTimeline: (projectId: number, data: TimelineInput) =>
    req<Timeline>('POST', `/api/projects/${projectId}/timelines`, data),
  getTimeline: (id: number) => req<Timeline>('GET', `/api/timelines/${id}`),
  updateTimeline: (id: number, data: TimelinePatch) => req<Timeline>('PATCH', `/api/timelines/${id}`, data),
  deleteTimeline: (id: number) => req<null>('DELETE', `/api/timelines/${id}`),

  // events
  listEvents: (timelineId: number) => req<TimelineEvent[]>('GET', `/api/timelines/${timelineId}/events`),
  createEvent: (timelineId: number, data: EventInput) =>
    req<TimelineEvent>('POST', `/api/timelines/${timelineId}/events`, data),
  updateEvent: (id: number, data: EventPatch) => req<TimelineEvent>('PATCH', `/api/events/${id}`, data),
  deleteEvent: (id: number) => req<null>('DELETE', `/api/events/${id}`),
}
