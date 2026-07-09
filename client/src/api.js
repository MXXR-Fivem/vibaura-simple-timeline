// Petit client HTTP autour de fetch. Même origine => cookies de session envoyés.

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function req(method, url, body, { silent401 = false } = {}) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })
  if (res.status === 401 && !silent401) {
    window.dispatchEvent(new CustomEvent('app:unauthorized'))
  }
  if (!res.ok) {
    let msg = res.statusText
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch {
      /* pas de corps JSON */
    }
    throw new ApiError(msg, res.status)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  // auth
  me: () => req('GET', '/api/me', undefined, { silent401: true }),
  login: (username, password) => req('POST', '/api/login', { username, password }, { silent401: true }),
  logout: () => req('POST', '/api/logout'),

  // projects
  listProjects: () => req('GET', '/api/projects'),
  createProject: (data) => req('POST', '/api/projects', data),
  updateProject: (id, data) => req('PATCH', `/api/projects/${id}`, data),
  deleteProject: (id) => req('DELETE', `/api/projects/${id}`),
  getProject: (id) => req('GET', `/api/projects/${id}`),

  // timelines
  listTimelines: (projectId) => req('GET', `/api/projects/${projectId}/timelines`),
  createTimeline: (projectId, data) => req('POST', `/api/projects/${projectId}/timelines`, data),
  getTimeline: (id) => req('GET', `/api/timelines/${id}`),
  updateTimeline: (id, data) => req('PATCH', `/api/timelines/${id}`, data),
  deleteTimeline: (id) => req('DELETE', `/api/timelines/${id}`),

  // events
  listEvents: (timelineId) => req('GET', `/api/timelines/${timelineId}/events`),
  createEvent: (timelineId, data) => req('POST', `/api/timelines/${timelineId}/events`, data),
  updateEvent: (id, data) => req('PATCH', `/api/events/${id}`, data),
  deleteEvent: (id) => req('DELETE', `/api/events/${id}`),
}
