import { useId, useState } from 'react'
import { api } from '../api.js'
import Modal, { ColorField } from './Modal.jsx'
import { PALETTE } from '../lib/colors.js'
import { todayISO } from '../lib/dates.js'

const GRANULARITIES = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'year', label: 'Année' },
]

function addYears(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y + n}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export default function TimelineForm({ projectId, timeline, defaultColor, onClose, onSaved }) {
  const uid = useId()
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
      setError("Échec de l'enregistrement.")
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
        <label htmlFor={`${uid}-name`}>Nom</label>
        <input
          id={`${uid}-name`}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Roadmap 2026"
        />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-desc`}>Description</label>
        <textarea
          id={`${uid}-desc`}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optionnel"
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${uid}-start`}>Début</label>
          <input id={`${uid}-start`} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-end`}>Fin</label>
          <input id={`${uid}-end`} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Graduation par défaut</label>
        <div className="seg" role="group" aria-label="Graduation par défaut">
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
