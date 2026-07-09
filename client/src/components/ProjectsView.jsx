import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { navigate, routes } from '../router.js'
import Modal from './Modal.jsx'
import { IconPlus, IconEdit, IconTrash, IconFolder } from './Icons.jsx'

export default function ProjectsView() {
  const [projects, setProjects] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | project object

  const load = useCallback(() => {
    return api.listProjects().then(setProjects).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])

  async function remove(p) {
    if (!window.confirm(`Supprimer le projet « ${p.name} » et toutes ses timelines ?`)) return
    await api.deleteProject(p.id)
    load()
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Projets</h1>
          <p className="muted">Regroupe tes timelines par projet.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <IconPlus /> Nouveau projet
        </button>
      </div>

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
        <div className="card-grid">
          {projects.map((p) => (
            <div key={p.id} className="card project-card" onClick={() => navigate(routes.timelines(p.id))}>
              <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn sm" title="Modifier" onClick={() => setEditing(p)}>
                  <IconEdit width={15} height={15} />
                </button>
                <button className="icon-btn sm danger" title="Supprimer" onClick={() => remove(p)}>
                  <IconTrash width={15} height={15} />
                </button>
              </div>
              <h3>{p.name}</h3>
              {p.description ? <p className="card-desc">{p.description}</p> : <p className="card-desc muted">—</p>}
              <div className="card-foot muted">
                {p.timeline_count} timeline{p.timeline_count > 1 ? 's' : ''}
              </div>
            </div>
          ))}
        </div>
      )}

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

function ProjectForm({ project, onClose, onSaved }) {
  const [name, setName] = useState(project?.name || '')
  const [description, setDescription] = useState(project?.description || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) {
      setError('Le nom est requis.')
      return
    }
    setBusy(true)
    try {
      const data = { name: name.trim(), description }
      if (project) await api.updateProject(project.id, data)
      else await api.createProject(data)
      onSaved()
    } catch {
      setError('Échec de l\'enregistrement.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title={project ? 'Modifier le projet' : 'Nouveau projet'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Nom</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Refonte site" />
      </div>
      <div className="field">
        <label>Description</label>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optionnel"
        />
      </div>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  )
}
