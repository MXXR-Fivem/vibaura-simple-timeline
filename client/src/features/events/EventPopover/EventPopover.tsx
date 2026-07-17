import { useEffect, useRef, useState } from 'react'
import type { EventInput, HexColor, IsoDate, Timeline, TimelineEvent } from '@shared/types'
import { api } from '../../../api'
import { PALETTE } from '../../../lib/colors'
import { cx } from '../../../lib/cx'
import { addDaysISO, daysBetweenISO, toDateInput } from '../../../lib/dates'
import { FormError } from '../../../ui/FormError/FormError'
import { IconTrash } from '../../../ui/Icons/Icons'
import { Swatch } from '../../../ui/Swatch/Swatch'
import s from './EventPopover.module.css'

/**
 * Largeur de la boîte. 340 et non 300 : en édition, la rangée d'actions
 * (Supprimer + Annuler + Enregistrer + 3 gouttières) réclame 302px de
 * min-content, que 300 - 28 de padding - 2 de bordure = 270px ne pouvait pas
 * tenir — Enregistrer sortait alors du popover.
 */
const W = 340

export interface EventPopoverProps {
  timeline: Timeline
  event: TimelineEvent | null
  prefillMs?: number
  anchorX: number
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}

export function EventPopover({
  timeline,
  event,
  prefillMs,
  anchorX,
  onClose,
  onSaved,
  onDeleted,
}: EventPopoverProps) {
  const isNew = !event
  const baseDate: IsoDate =
    event?.start_date || (prefillMs != null ? toDateInput(prefillMs) : timeline.start_date)
  const [title, setTitle] = useState(event?.title || '')
  const [startDate, setStartDate] = useState(baseDate)
  const [startTime, setStartTime] = useState(event?.start_time || '')
  const [endDate, setEndDate] = useState(event?.end_date || baseDate)
  const [endTime, setEndTime] = useState(event?.end_time || '')
  const [description, setDescription] = useState(event?.description || '')
  const [color, setColor] = useState<HexColor | null>(event?.color ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Changer le début décale la fin de la même durée (et jamais avant le début).
  function changeStart(nd: IsoDate) {
    const delta = daysBetweenISO(startDate, nd)
    let ne = addDaysISO(endDate, delta)
    if (ne < nd) ne = nd
    setStartDate(nd)
    setEndDate(ne)
  }
  function changeEnd(nd: IsoDate) {
    setEndDate(nd < startDate ? startDate : nd)
  }

  // Type déduit : bloc si ça déborde sur un autre jour, sinon jalon.
  const isBlock = endDate > startDate
  const span = daysBetweenISO(startDate, endDate) + 1

  async function save() {
    setBusy(true)
    try {
      const data: EventInput = {
        title: title.trim() || 'Sans titre',
        description,
        kind: isBlock ? 'period' : 'point',
        start_date: startDate,
        start_time: startTime || null,
        end_date: isBlock ? endDate : null,
        end_time: isBlock ? endTime || null : null,
        color,
      }
      if (event) await api.updateEvent(event.id, data)
      else await api.createEvent(timeline.id, data)
      onSaved()
    } catch {
      setError("Échec de l'enregistrement.")
      setBusy(false)
    }
  }
  async function remove() {
    if (!event) return
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
  const left = Math.max(12, Math.min(anchorX - W / 2, winW - W - 12))

  return (
    <>
      <div className={s.scrim} onPointerDown={onClose} />
      <div
        className={s.popover}
        style={{ left, width: W }}
        role="dialog"
        aria-label="Évènement"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className={s.body}>
          <input
            ref={titleRef}
            className={s.title}
            type="text"
            value={title}
            placeholder="Titre de l'évènement"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
          />

          <div className={s.row}>
            <label className={s.fld}>
              <span>Début</span>
              <input type="date" value={startDate} onChange={(e) => changeStart(e.target.value)} />
            </label>
            <label className={s.fld}>
              <span>Heure</span>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
          </div>
          <div className={s.row}>
            <label className={s.fld}>
              <span>Fin</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => changeEnd(e.target.value)}
              />
            </label>
            <label className={s.fld}>
              <span>Heure</span>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
          </div>
          <div className={s.kind}>{isBlock ? `Bloc · ${span} jours` : 'Jalon (un jour)'}</div>

          <label className={s.fld} style={{ marginTop: 12 }}>
            <span>Note</span>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optionnel"
            />
          </label>

          <div className={s.swatches}>
            <Swatch
              color={timeline.color}
              selected={color === null}
              auto
              onClick={() => setColor(null)}
              title="Couleur de la timeline"
            >
              A
            </Swatch>
            {PALETTE.map((c) => (
              <Swatch
                key={c}
                color={c}
                selected={color === c}
                onClick={() => setColor(c)}
                aria-label={c}
              />
            ))}
          </div>

          {error && <FormError>{error}</FormError>}
        </div>

        <div className={s.actions}>
          {!isNew && (
            <button className={cx(s.danger, s.delete)} type="button" onClick={remove} disabled={busy}>
              <IconTrash width={14} height={14} /> Supprimer
            </button>
          )}
          <button className={s.ghost} type="button" onClick={onClose}>
            Annuler
          </button>
          <button className={s.primary} type="button" onClick={save} disabled={busy}>
            {busy ? '…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </>
  )
}
