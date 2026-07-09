import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { PALETTE } from '../colors.js'
import { toDateInput, clampISO } from '../dates.js'
import { IconTrash } from './Icons.jsx'

const W = 300

export default function EventPopover({ timeline, event, prefillMs, anchorX, onClose, onSaved, onDeleted }) {
  const isNew = !event
  const baseDate = event?.start_date || (prefillMs != null ? toDateInput(prefillMs) : timeline.start_date)
  const [title, setTitle] = useState(event?.title || '')
  const [date, setDate] = useState(baseDate)
  const [time, setTime] = useState(event?.start_time || '')
  const [block, setBlock] = useState(!!event?.end_date)
  const [end, setEnd] = useState(event?.end_date || baseDate)
  const [description, setDescription] = useState(event?.description || '')
  const [color, setColor] = useState(event?.color || null) // null = couleur de la timeline
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const titleRef = useRef(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    if (!date) return setError('Date requise.')
    if (block && end < date) return setError('La fin doit être après le début.')
    setBusy(true)
    try {
      const data = {
        title: title.trim() || 'Sans titre',
        description,
        kind: block ? 'period' : 'point',
        start_date: date,
        start_time: time || null,
        end_date: block ? end : null,
        color,
      }
      if (isNew) await api.createEvent(timeline.id, data)
      else await api.updateEvent(event.id, data)
      onSaved()
    } catch {
      setError("Échec de l'enregistrement.")
      setBusy(false)
    }
  }
  async function remove() {
    setBusy(true)
    try {
      await api.deleteEvent(event.id)
      onDeleted()
    } catch {
      setError('Échec de la suppression.')
      setBusy(false)
    }
  }

  const winW = typeof window !== 'undefined' ? window.innerWidth : 1024
  const left = Math.max(12, Math.min((anchorX ?? winW / 2) - W / 2, winW - W - 12))

  return (
    <>
      <div className="pop-scrim" onPointerDown={onClose} />
      <div className="popover" style={{ left, top: 92, width: W }} role="dialog" aria-label="Évènement" onPointerDown={(e) => e.stopPropagation()}>
        <input
          ref={titleRef}
          className="pop-title"
          type="text"
          value={title}
          placeholder="Titre de l'évènement"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
        />
        <div className="row">
          <label className="fld">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="fld">
            <span>Heure</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>

        <label className="check">
          <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} /> Bloc sur plusieurs jours
        </label>
        {block && (
          <label className="fld" style={{ marginTop: 10 }}>
            <span>Fin</span>
            <input type="date" value={end} min={date} onChange={(e) => setEnd(e.target.value)} />
          </label>
        )}

        <label className="fld" style={{ marginTop: 10 }}>
          <span>Note</span>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optionnel" />
        </label>

        <div className="pop-swatches">
          <button
            type="button"
            className={'swatch auto' + (color === null ? ' selected' : '')}
            style={{ background: timeline.color }}
            title="Couleur de la timeline"
            onClick={() => setColor(null)}
          >
            A
          </button>
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={'swatch' + (color === c ? ' selected' : '')}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="actions">
          {!isNew && (
            <button className="danger" type="button" onClick={remove} disabled={busy}>
              <IconTrash width={14} height={14} /> Supprimer
            </button>
          )}
          <span className="spacer" />
          <button className="ghost" type="button" onClick={onClose}>
            Annuler
          </button>
          <button className="primary" type="button" onClick={save} disabled={busy}>
            {busy ? '…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </>
  )
}
