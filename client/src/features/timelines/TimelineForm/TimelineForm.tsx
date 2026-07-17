import { useId, useState } from 'react'
import type { Granularity, HexColor, IsoDate, Timeline, TimelineInput } from '@shared/types'
import { api } from '../../../api'
import { PALETTE } from '../../../lib/colors'
import { todayISO } from '../../../lib/dates'
import { Button } from '../../../ui/Button/Button'
import { ColorField } from '../../../ui/ColorField/ColorField'
import { Field } from '../../../ui/Field/Field'
import { FormError } from '../../../ui/FormError/FormError'
import { Modal } from '../../../ui/Modal/Modal'
import { SegmentedControl } from '../../../ui/SegmentedControl/SegmentedControl'
import s from './TimelineForm.module.css'

const GRANULARITIES: readonly { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'year', label: 'Année' },
]

function addYears(iso: IsoDate, n: number): IsoDate {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y + n}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export interface TimelineFormProps {
  projectId: number
  /** null => création. */
  timeline: Timeline | null
  /** Couleur proposée à la création, dérivée du rang dans la liste. */
  defaultColor: HexColor
  onClose: () => void
  onSaved: () => void
}

export function TimelineForm({ projectId, timeline, defaultColor, onClose, onSaved }: TimelineFormProps) {
  const uid = useId()
  const today = todayISO()
  const [name, setName] = useState(timeline?.name || '')
  const [description, setDescription] = useState(timeline?.description || '')
  const [start, setStart] = useState<IsoDate>(timeline?.start_date || today)
  const [end, setEnd] = useState<IsoDate>(timeline?.end_date || addYears(today, 1))
  const [granularity, setGranularity] = useState<Granularity>(timeline?.granularity || 'month')
  const [color, setColor] = useState<HexColor>(timeline?.color || defaultColor)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) {
      setError('Le nom est requis.')
      return
    }
    if (!start || !end) {
      setError('Dates requises.')
      return
    }
    if (start > end) {
      setError('La date de fin doit être après le début.')
      return
    }
    setBusy(true)
    try {
      const data: TimelineInput = {
        name: name.trim(),
        description,
        start_date: start,
        end_date: end,
        granularity,
        color,
      }
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
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <Field label="Nom" htmlFor={`${uid}-name`}>
        <input
          id={`${uid}-name`}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Roadmap 2026"
        />
      </Field>
      <Field label="Description" htmlFor={`${uid}-desc`}>
        <textarea
          id={`${uid}-desc`}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optionnel"
        />
      </Field>
      <div className={s.fieldRow}>
        <Field label="Début" htmlFor={`${uid}-start`}>
          <input id={`${uid}-start`} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Fin" htmlFor={`${uid}-end`}>
          <input id={`${uid}-end`} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Field label="Graduation par défaut">
        <SegmentedControl<Granularity>
          options={GRANULARITIES}
          value={granularity}
          onChange={setGranularity}
          role="group"
          aria-label="Graduation par défaut"
        />
        <p className={s.hint}>La graduation s'adapte automatiquement au zoom sur la frise.</p>
      </Field>
      <ColorField palette={PALETTE} value={color} onChange={setColor} />
      {error && <FormError>{error}</FormError>}
    </Modal>
  )
}
