import { useEffect, useState } from 'react'

// Mini routeur par hash, sans dépendance.
//   #/                       -> projets
//   #/p/:projectId           -> timelines d'un projet
//   #/p/:projectId/t/:tid    -> une timeline
export function parseHash(hash) {
  const parts = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'p' && parts[1]) {
    const projectId = Number(parts[1])
    if (parts[2] === 't' && parts[3]) {
      return { name: 'timeline', projectId, timelineId: Number(parts[3]) }
    }
    return { name: 'timelines', projectId }
  }
  return { name: 'projects' }
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function navigate(hash) {
  if (window.location.hash === hash) {
    // force un re-render même si le hash ne change pas
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = hash
  }
}

export const routes = {
  projects: () => '#/',
  timelines: (projectId) => `#/p/${projectId}`,
  timeline: (projectId, timelineId) => `#/p/${projectId}/t/${timelineId}`,
}
