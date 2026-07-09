import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { navigate, routes } from '../router.js'
import Modal, { ColorField } from './Modal.jsx'
import { PALETTE, colorForIndex } from '../colors.js'
import { formatLong, todayISO } from '../dates.js'
import { IconPlus, IconEdit, IconTrash, IconChevronLeft, IconCalendar } from './Icons.jsx'

const GRANULARITIES = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'year', label: 'Année' },
]

export default function TimelinesView({ projectId }) {
  const [project, setProject] = useState(null)
  const [timelines, setTimelines] = useState(null)
  const [editing, setEditing] = useState(null)
  const [missing, setMissing] = useState(false)

  const load = useCallback(() => {
    setMissing(false)
    api.getProject(projectId).then(setProject).catch(() => setMissing(true))
    api.listTimelines(projectId).then(setTimelines).catch(() => {})
  }, [projectId])

  useEffect(() => {
    load()
    const t = setInterval(() => api.listTimelines(projectId).then(setTimelines).catch(() => {}), 8000)
    return () => clearInterval(t)
  }, [load, projectId])

  async function remove(tl) {
    if (!window.confirm(`Supprimer la timeline « ${tl.name} » et ses événements ?`)) return
    await api.deleteTimeline(tl.id)
    load()
  }

  if (missing) {
    return (
      <div className="page">
        <button className="link-back" onClick={() => navigate(routes.projects())}>
          <IconChevronLeft width={16} height={16} /> Projets
        </button>
        <div className="empty">
          <p>Projet introuvable.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <button className="link-back" onClick={() => navigate(routes.projects())}>
        <IconChevronLeft width={16} height={16} /> Projets
      </button>

      <div className="page-head">
        <div>
          <h1>{project?.name || '…'}</h1>
          {project?.description ? <p className="muted">{project.description}</p> : null}
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <IconPlus /> Nouvelle timeline
        </button>
      </div>

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
        <div className="card-grid">
          {timelines.map((tl) => (
            <div
              key={tl.id}
              className="card timeline-card"
              onClick={() => navigate(routes.timeline(projectId, tl.id))}
            >
              <span className="tl-stripe" style={{ background: tl.color }} />
              <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn sm" title="Modifier" onClick={() => setEditing(tl)}>
                  <IconEdit width={15} height={15} />
                </button>
                <button className="icon-btn sm danger" title="Supprimer" onClick={() => remove(tl)}>
                  <IconTrash width={15} height={15} />
                </button>
              </div>
              <h3>{tl.name}</h3>
              <div className="card-desc muted">
                {formatLong(tl.start_date)} → {formatLong(tl.end_date)}
              </div>
              <div className="card-foot muted">
                {tl.event_count} évènement{tl.event_count > 1 ? 's' : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TimelineForm
          projectId={projectId}
          timeline={editing === 'new' ? null : editing}
          defaultColor={colorForIndex(timelines?.length || 0)}
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

export function TimelineForm({ projectId, timeline, defaultColor, onClose, onSaved }) {
  const today = todayISO()
  const [name, setName] = useState(timeline?.name || '')
  const [description, setDescription] = useState(timeline?.description || '')
  const [start, setStart] = useState(timeline?.start_date || today)
  const [end, setEnd] = useState(timeline?.end_date || addYears(today, 1))
  const [granularity, setGranularity] = useState(timeline?.granularity || 'month')
  const [color, setColor] = useState(timeline?.color || defaultColor)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) return setError('Le nom est requis.')
    if (!start || !end) return setError('Dates requises.')
    if (start > end) return setError('La date de fin doit être après le début.')
    setBusy(true)
    try {
      const data = { name: name.trim(), description, start_date: start, end_date: end, granularity, color }
      if (timeline) await api.updateTimeline(timeline.id, data)
      else await api.createTimeline(projectId, data)
      onSaved()
    } catch {
      setError('Échec de l\'enregistrement.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title={timeline ? 'Modifier la timeline' : 'Nouvelle timeline'}
      width={520}
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
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Roadmap 2026" />
      </div>
      <div className="field">
        <label>Description</label>
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optionnel" />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Début</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label>Fin</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Graduation par défaut</label>
        <div className="seg">
          {GRANULARITIES.map((g) => (
            <button
              key={g.value}
              type="button"
              className={'seg-btn' + (granularity === g.value ? ' active' : '')}
              onClick={() => setGranularity(g.value)}
            >
              {g.label}
            </button>
          ))}
        </div>
        <p className="hint">La graduation s'adapte automatiquement au zoom sur la frise.</p>
      </div>
      <ColorField palette={PALETTE} value={color} onChange={setColor} />
      {error && <div className="form-error">{error}</div>}
    </Modal>
  )
}

function addYears(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y + n}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
