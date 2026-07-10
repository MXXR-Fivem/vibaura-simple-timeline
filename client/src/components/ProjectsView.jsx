import { useCallback, useState } from 'react'
import { api } from '../api.js'
import { navigate, routes } from '../lib/router.js'
import { usePolling } from '../hooks/usePolling.js'
import ProjectForm from './ProjectForm.jsx'
import { IconPlus, IconEdit, IconTrash, IconFolder, IconChevronRight } from './Icons.jsx'

export default function ProjectsView() {
  const [projects, setProjects] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | project object

  const load = useCallback(() => api.listProjects().then(setProjects).catch(() => {}), [])
  usePolling(load, 8000)

  async function remove(p) {
    if (!window.confirm(`Supprimer le projet « ${p.name} » et toutes ses timelines ?`)) return
    await api.deleteProject(p.id)
    load()
  }

  return (
    <div className="page">
      <div className="page-inner">
        <header className="page-head">
          <div>
            <h1>Projets</h1>
            <p className="muted">Vos chantiers, chacun avec ses timelines.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <IconPlus /> Nouveau projet
          </button>
        </header>

        {projects === null ? (
          <div className="muted pad">Chargement…</div>
        ) : projects.length === 0 ? (
          <div className="empty">
            <IconFolder width={40} height={40} />
            <p>Aucun projet pour l'instant.</p>
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              <IconPlus /> Créer le premier projet
            </button>
          </div>
        ) : (
          <div className="index">
            {projects.map((p) => (
              <div key={p.id} className="row-item" onClick={() => navigate(routes.timelines(p.id))}>
                <div className="ri-main">
                  <div className="ri-title">{p.name}</div>
                  {p.description ? <div className="ri-desc">{p.description}</div> : null}
                </div>
                <div className="ri-meta">
                  {p.timeline_count} timeline{p.timeline_count > 1 ? 's' : ''}
                </div>
                <div className="ri-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="icon-btn sm" title="Modifier" onClick={() => setEditing(p)}>
                    <IconEdit width={15} height={15} />
                  </button>
                  <button className="icon-btn sm danger" title="Supprimer" onClick={() => remove(p)}>
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
        <ProjectForm
          project={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}
