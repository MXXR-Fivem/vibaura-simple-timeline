import { useEffect, useState } from 'react'
import { api } from './api'
import { UNAUTHORIZED_EVENT } from './api/client'
import { useHashRoute, navigate, routes } from './lib/router'
import { LoginScreen } from './features/auth/LoginScreen/LoginScreen'
import { ProjectsView } from './features/projects/ProjectsView/ProjectsView'
import { TimelinesView } from './features/timelines/TimelinesView/TimelinesView'
import { TimelineView } from './features/timelines/TimelineView/TimelineView'
import { IconLogout } from './ui/Icons/Icons'
import { IconButton } from './ui/IconButton/IconButton'
import s from './App.module.css'

export function App() {
  // undefined = chargement, null = déconnecté
  const [user, setUser] = useState<string | null | undefined>(undefined)
  const route = useHashRoute()

  useEffect(() => {
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
  }, [])

  useEffect(() => {
    const onUnauth = () => setUser(null)
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauth)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauth)
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

  if (user === undefined) return <div className={s.loadingScreen}>Chargement…</div>
  if (!user) return <LoginScreen onLogin={setUser} />

  return (
    <div className={s.app}>
      <header className={s.topbar}>
        <button className={s.brand} onClick={() => navigate(routes.projects())}>
          <span className={s.dot} />
          Timeline
        </button>
        <div className={s.topbarRight}>
          <span className={s.userChip}>{user}</span>
          <IconButton title="Se déconnecter" onClick={logout}>
            <IconLogout />
          </IconButton>
        </div>
      </header>

      <main className={s.appMain}>
        {route.name === 'projects' && <ProjectsView />}
        {route.name === 'timelines' && <TimelinesView key={route.projectId} projectId={route.projectId} />}
        {route.name === 'timeline' && (
          <TimelineView key={route.timelineId} projectId={route.projectId} timelineId={route.timelineId} />
        )}
      </main>
    </div>
  )
}
