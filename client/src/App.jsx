import { useEffect, useState } from 'react'
import { api } from './api.js'
import { useHashRoute, navigate, routes } from './router.js'
import Login from './components/Login.jsx'
import ProjectsView from './components/ProjectsView.jsx'
import TimelinesView from './components/TimelinesView.jsx'
import TimelineView from './components/TimelineView.jsx'
import { IconLogout } from './components/Icons.jsx'

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = chargement, null = déconnecté
  const route = useHashRoute()

  useEffect(() => {
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
  }, [])

  useEffect(() => {
    const onUnauth = () => setUser(null)
    window.addEventListener('app:unauthorized', onUnauth)
    return () => window.removeEventListener('app:unauthorized', onUnauth)
  }, [])

  async function logout() {
    try {
      await api.logout()
    } catch {
      /* ignore */
    }
    setUser(null)
    navigate(routes.projects())
  }

  if (user === undefined) return <div className="loading-screen">Chargement…</div>
  if (!user) return <Login onLogin={setUser} />

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => navigate(routes.projects())}>
          <span className="dot" />
          Timeline
        </button>
        <div className="topbar-right">
          <span className="user-chip">{user}</span>
          <button className="icon-btn" title="Se déconnecter" onClick={logout}>
            <IconLogout />
          </button>
        </div>
      </header>

      <main className="app-main">
        {route.name === 'projects' && <ProjectsView />}
        {route.name === 'timelines' && <TimelinesView key={route.projectId} projectId={route.projectId} />}
        {route.name === 'timeline' && (
          <TimelineView
            key={route.timelineId}
            projectId={route.projectId}
            timelineId={route.timelineId}
          />
        )}
      </main>
    </div>
  )
}
