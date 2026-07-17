import type { Timeline, TimelineEvent } from '@shared/types'
import { fmtDateFull } from '../../lib/dates'
import s from './EventHoverCard.module.css'

export interface EventHoverCardProps {
  ev: TimelineEvent
  /** Rectangle écran de l'évènement survolé : la card s'accroche dessus. */
  rect: DOMRect
  timeline: Timeline
}

// Card flottante au survol d'un évènement : au-dessus s'il y a la place, sinon en dessous.
export function EventHoverCard({ ev, rect, timeline }: EventHoverCardProps) {
  const color = ev.color || timeline.color
  const isBlock = !!ev.end_date
  const startLine = fmtDateFull(ev.start_date) + (ev.start_time ? ` · ${ev.start_time}` : '')
  const endLine = ev.end_date ? fmtDateFull(ev.end_date) + (ev.end_time ? ` · ${ev.end_time}` : '') : ''
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1024
  const left = Math.max(150, Math.min(rect.left + rect.width / 2, winW - 150))
  const above = rect.top > 150
  const style = above
    ? { left, top: rect.top - 10, transform: 'translate(-50%,-100%)' }
    : { left, top: rect.bottom + 10, transform: 'translate(-50%,0)' }
  return (
    <div className={s.card} style={style}>
      <div className={s.head}>
        <span className={s.dot} style={{ background: color }} />
        <span className={s.title}>{ev.title}</span>
      </div>
      <div className={s.date}>
        {startLine}
        {isBlock && (
          <>
            <span className={s.arrow}> → </span>
            {endLine}
          </>
        )}
      </div>
      {ev.description && <div className={s.note}>{ev.description}</div>}
    </div>
  )
}
