import { useCallback, useEffect, useRef, useState } from 'react'
import type { TimelineEvent } from '@shared/types'
import { api } from '../../../api'
import { navigate, routes } from '../../../lib/router'
import { dateInputToMs, MS_DAY, formatLong } from '../../../lib/dates'
import type { Ms } from '../../../lib/dates'
import { cx } from '../../../lib/cx'
import { useEntity } from '../../../hooks/useEntity'
import { usePolling } from '../../../hooks/usePolling'
import { Timeline } from '../../../timeline/Timeline/Timeline'
import type { TimelineHandle } from '../../../timeline/Timeline/Timeline'
import { EventPopover } from '../../events/EventPopover/EventPopover'
import { TimelineForm } from '../TimelineForm/TimelineForm'
import { Button } from '../../../ui/Button/Button'
import { IconButton } from '../../../ui/IconButton/IconButton'
import { BackLink } from '../../../ui/BackLink/BackLink'
import { EmptyState } from '../../../ui/EmptyState/EmptyState'
import { SegmentedControl } from '../../../ui/SegmentedControl/SegmentedControl'
import { IconPlus, IconMinus, IconFit, IconEdit, IconClock } from '../../../ui/Icons/Icons'
import s from './TimelineView.module.css'

/** Disposition des évènements : une seule ligne, ou une lane par évènement. */
export type TimelineMode = 'single' | 'lanes'

/**
 * Cible du popover d'édition. `event` renseigné = édition d'un évènement
 * existant ; `prefillMs` renseigné = création à cette date. `anchorX` est la
 * position à l'écran autour de laquelle le popover se place.
 */
export type Editor = { event?: TimelineEvent; prefillMs?: Ms; anchorX: number }

const MODES: readonly { value: TimelineMode; label: string }[] = [
  { value: 'single', label: 'Une ligne' },
  { value: 'lanes', label: 'Lanes' },
]

export interface TimelineViewProps {
  projectId: number
  timelineId: number
}

export function TimelineView({ projectId, timelineId }: TimelineViewProps) {
  const tlEntity = useEntity(() => api.getTimeline(timelineId), [timelineId])
  const timeline = tlEntity.entity
  const [events, setEvents] = useState<TimelineEvent[] | null>(null) // null = chargement
  const [eventsError, setEventsError] = useState<string>('')
  const [projectName, setProjectName] = useState<string>('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [editingMeta, setEditingMeta] = useState(false)
  const [mode, setMode] = useState<TimelineMode>('single')
  const tlRef = useRef<TimelineHandle>(null)

  const loadEvents = useCallback(
    () =>
      api
        .listEvents(timelineId)
        .then((rows) => {
          setEvents(rows)
          setEventsError('')
        })
        .catch(() => setEventsError('Impossible de charger les évènements.')),
    [timelineId]
  )

  useEffect(() => {
    api
      .getProject(projectId)
      .then((p) => setProjectName(p.name))
      .catch(() => {})
  }, [projectId])

  // Polling des évènements toutes les 4 s, en pause pendant l'édition.
  const editorOpen = editor !== null || editingMeta
  usePolling(loadEvents, 4000, { enabled: !editorOpen })

  function openAdd() {
    if (!timeline) return
    const startMs = dateInputToMs(timeline.start_date)
    const endMs = dateInputToMs(timeline.end_date) + MS_DAY
    const ms = Math.min(Math.max(Date.now(), startMs), endMs)
    setEditor({ prefillMs: ms, anchorX: window.innerWidth / 2 })
  }

  if (tlEntity.status === 'missing' || tlEntity.status === 'error') {
    const isMissing = tlEntity.status === 'missing'
    return (
      <div className={s.page}>
        <div className={s.toolbar}>
          <BackLink onClick={() => navigate(routes.timelines(projectId))}>Retour</BackLink>
        </div>
        <EmptyState
          message={isMissing ? 'Timeline introuvable.' : 'Impossible de charger cette timeline.'}
          action={!isMissing && <Button onClick={() => void tlEntity.reload()}>Réessayer</Button>}
        />
      </div>
    )
  }

  return (
    <div className={s.page}>
      <div className={s.toolbar}>
        <div className={s.toolbarLeft}>
          <BackLink onClick={() => navigate(routes.timelines(projectId))}>{projectName || 'Projet'}</BackLink>
          {timeline && (
            <div className={s.title}>
              <span className={s.titleDot} style={{ background: timeline.color }} />
              <h2>{timeline.name}</h2>
              <span className={s.range}>
                {formatLong(timeline.start_date)} → {formatLong(timeline.end_date)}
              </span>
              <IconButton size="sm" title="Paramètres" onClick={() => setEditingMeta(true)}>
                <IconEdit width={15} height={15} />
              </IconButton>
            </div>
          )}
        </div>

        <div className={s.toolbarRight}>
          <SegmentedControl<TimelineMode> options={MODES} value={mode} onChange={setMode} />
          <Button size="sm" onClick={() => tlRef.current?.today()}>
            <IconClock width={15} height={15} /> Aujourd'hui
          </Button>
          <div className={s.zoomGroup}>
            <IconButton title="Dézoomer" onClick={() => tlRef.current?.zoomOut()}>
              <IconMinus />
            </IconButton>
            <IconButton title="Ajuster" onClick={() => tlRef.current?.fit()}>
              <IconFit />
            </IconButton>
            <IconButton title="Zoomer" onClick={() => tlRef.current?.zoomIn()}>
              <IconPlus />
            </IconButton>
          </div>
          <Button variant="primary" onClick={openAdd}>
            <IconPlus /> Évènement
          </Button>
        </div>
      </div>

      <div className={s.stage}>
        {timeline && (
          <Timeline
            ref={tlRef}
            timeline={timeline}
            events={events || []}
            mode={mode}
            popoverOpen={editor !== null}
            onClosePopover={() => setEditor(null)}
            onAddAt={(ms, anchorX) => setEditor({ prefillMs: ms, anchorX })}
            onEditEvent={(ev, anchorX) => setEditor({ event: ev, anchorX })}
          />
        )}

        {events === null && !eventsError && <div className={s.overlay}>Chargement…</div>}
        {eventsError && (
          <div className={cx(s.overlay, s.error)}>
            {eventsError}{' '}
            <Button size="sm" onClick={loadEvents}>
              Réessayer
            </Button>
          </div>
        )}

        <div className={s.hint}>clic pour ajouter · glisser pour naviguer · molette pour zoomer</div>
      </div>

      {editor && timeline && (
        <EventPopover
          timeline={timeline}
          event={editor.event || null}
          prefillMs={editor.prefillMs}
          anchorX={editor.anchorX}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            void loadEvents()
          }}
          onDeleted={() => {
            setEditor(null)
            void loadEvents()
          }}
        />
      )}

      {editingMeta && timeline && (
        <TimelineForm
          projectId={projectId}
          timeline={timeline}
          defaultColor={timeline.color}
          onClose={() => setEditingMeta(false)}
          onSaved={() => {
            setEditingMeta(false)
            void tlEntity.reload()
          }}
        />
      )}
    </div>
  )
}
