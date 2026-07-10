import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { PALETTE } from '../lib/colors.js'
import { toDateInput, addDaysISO, daysBetweenISO } from '../lib/dates.js'
import { IconTrash } from './Icons.jsx'

const W = 300

export default function EventPopover({ timeline, event, prefillMs, anchorX, onClose, onSaved, onDeleted }) {
  const isNew = !event
  const baseDate = event?.start_date || (prefillMs != null ? toDateInput(prefillMs) : timeline.start_date)
  const [title, setTitle] = useState(event?.title || '')
  const [startDate, setStartDate] = useState(baseDate)
  const [startTime, setStartTime] = useState(event?.start_time || '')
  const [endDate, setEndDate] = useState(event?.end_date || baseDate)
  const [endTime, setEndTime] = useState(event?.end_time || '')
  const [description, setDescription] = useState(event?.description || '')
  const [color, setColor] = useState(event?.color || null)
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

  // Changer le début décale la fin de la même durée (et jamais avant le début).
  function changeStart(nd) {
    const delta = daysBetweenISO(startDate, nd)
    let ne = addDaysISO(endDate, delta)
    if (ne < nd) ne = nd
    setStartDate(nd)
    setEndDate(ne)
  }
  function changeEnd(nd) {
    setEndDate(nd < startDate ? startDate : nd)
  }

  // Type déduit : bloc si ça déborde sur un autre jour, sinon jalon.
  const isBlock = endDate > startDate
  const span = daysBetweenISO(startDate, endDate) + 1

  async function save() {
    setBusy(true)
    try {
      const data = {
        title: title.trim() || 'Sans titre',
        description,
        kind: isBlock ? 'period' : 'point',
        start_date: startDate,
        start_time: startTime || null,
        end_date: isBlock ? endDate : null,
        end_time: isBlock ? endTime || null : null,
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
      <div
        className="popover"
        style={{ left, top: 92, width: W }}
        role="dialog"
        aria-label="Évènement"
        onPointerDown={(e) => e.stopPropagation()}
      >
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
            <span>Début</span>
            <input type="date" value={startDate} onChange={(e) => changeStart(e.target.value)} />
          </label>
          <label className="fld">
            <span>Heure</span>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <label className="fld">
            <span>Fin</span>
            <input type="date" value={endDate} min={startDate} onChange={(e) => changeEnd(e.target.value)} />
          </label>
          <label className="fld">
            <span>Heure</span>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
        </div>
        <div className="pop-kind">{isBlock ? `Bloc · ${span} jours` : 'Jalon (un jour)'}</div>

        <label className="fld" style={{ marginTop: 12 }}>
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
