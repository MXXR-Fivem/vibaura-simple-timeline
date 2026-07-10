import { useCallback, useState } from 'react'
import { api } from '../api.js'
import { navigate, routes } from '../lib/router.js'
import { useEntity } from '../hooks/useEntity.js'
import { usePolling } from '../hooks/usePolling.js'
import { colorForIndex } from '../lib/colors.js'
import { formatLong } from '../lib/dates.js'
import TimelineForm from './TimelineForm.jsx'
import { IconPlus, IconEdit, IconTrash, IconChevronLeft, IconChevronRight, IconCalendar } from './Icons.jsx'

export default function TimelinesView({ projectId }) {
  const project = useEntity(() => api.getProject(projectId), [projectId])
  const [timelines, setTimelines] = useState(null)
  const [editing, setEditing] = useState(null)

  const loadTimelines = useCallback(
    () => api.listTimelines(projectId).then(setTimelines).catch(() => {}),
    [projectId]
  )
  usePolling(loadTimelines, 8000)

  async function remove(tl) {
    if (!window.confirm(`Supprimer la timeline « ${tl.name} » et ses évènements ?`)) return
    await api.deleteTimeline(tl.id)
    loadTimelines()
  }

  const BackLink = (
    <button className="link-back" onClick={() => navigate(routes.projects())}>
      <IconChevronLeft width={16} height={16} /> Projets
    </button>
  )

  if (project.status === 'missing') {
    return (
      <div className="page">
        <div className="page-inner">
          {BackLink}
          <div className="empty">
            <p>Projet introuvable.</p>
          </div>
        </div>
      </div>
    )
  }

  if (project.status === 'error') {
    return (
      <div className="page">
        <div className="page-inner">
          {BackLink}
          <div className="empty">
            <p>Impossible de charger ce projet.</p>
            <button className="btn" onClick={() => project.reload()}>
              Réessayer
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-inner">
        {BackLink}

        <header className="page-head">
          <div>
            <h1>{project.entity?.name || '…'}</h1>
            {project.entity?.description ? <p className="muted">{project.entity.description}</p> : null}
          </div>
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <IconPlus /> Nouvelle timeline
          </button>
        </header>

        {timelines === null ? (
          <div className="muted pad">Chargement…</div>
        ) : timelines.length === 0 ? (
          <div className="empty">
            <IconCalendar width={40} height={40} />
            <p>Aucune timeline dans ce projet.</p>
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              <IconPlus /> Créer une timeline
            </button>
          </div>
        ) : (
          <div className="index">
            {timelines.map((tl) => (
              <div
                key={tl.id}
                className="row-item"
                onClick={() => navigate(routes.timeline(projectId, tl.id))}
              >
                <span className="ri-dot" style={{ background: tl.color }} />
                <div className="ri-main">
                  <div className="ri-title">{tl.name}</div>
                  <div className="ri-sub">
                    {formatLong(tl.start_date)} <span className="ri-arrow">→</span> {formatLong(tl.end_date)}
                  </div>
                </div>
                <div className="ri-meta">
                  {tl.event_count} évènement{tl.event_count > 1 ? 's' : ''}
                </div>
                <div className="ri-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="icon-btn sm" title="Modifier" onClick={() => setEditing(tl)}>
                    <IconEdit width={15} height={15} />
                  </button>
                  <button className="icon-btn sm danger" title="Supprimer" onClick={() => remove(tl)}>
                    <IconTrash width={15} height={15} />
                  </button>
                </div>
                <IconChevronRight className="ri-chev" width={18} height={18} />
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <TimelineForm
          projectId={projectId}
          timeline={editing === 'new' ? null : editing}
          defaultColor={colorForIndex(timelines?.length || 0)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            loadTimelines()
          }}
        />
      )}
    </div>
  )
}
