import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { navigate, routes } from '../router.js'
import { dateInputToMs, MS_DAY, formatLong } from '../dates.js'
import Timeline from './Timeline.jsx'
import EventPopover from './EventPopover.jsx'
import { TimelineForm } from './TimelinesView.jsx'
import { IconChevronLeft, IconPlus, IconMinus, IconFit, IconEdit, IconClock } from './Icons.jsx'

export default function TimelineView({ projectId, timelineId }) {
  const [timeline, setTimeline] = useState(null)
  const [events, setEvents] = useState(null) // null = chargement
  const [eventsError, setEventsError] = useState('')
  const [projectName, setProjectName] = useState('')
  const [editor, setEditor] = useState(null) // null | { event, anchorX } | { prefillMs, anchorX }
  const [editingMeta, setEditingMeta] = useState(false)
  const [missing, setMissing] = useState(false)
  const [mode, setMode] = useState('single')
  const tlRef = useRef(null)

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
  const loadMeta = useCallback(() => {
    setMissing(false)
    return api.getTimeline(timelineId).then(setTimeline).catch(() => setMissing(true))
  }, [timelineId])

  useEffect(() => {
    loadMeta()
    loadEvents()
    api.getProject(projectId).then((p) => setProjectName(p.name)).catch(() => {})
  }, [loadMeta, loadEvents, projectId])

  const editorOpen = editor !== null || editingMeta
  useEffect(() => {
    if (editorOpen) return // polling en pause pendant l'édition
    const t = setInterval(loadEvents, 4000)
    return () => clearInterval(t)
  }, [editorOpen, loadEvents])

  function openAdd() {
    if (!timeline) return
    const startMs = dateInputToMs(timeline.start_date)
    const endMs = dateInputToMs(timeline.end_date) + MS_DAY
    const ms = Math.min(Math.max(Date.now(), startMs), endMs)
    setEditor({ prefillMs: ms, anchorX: window.innerWidth / 2 })
  }

  if (missing) {
    return (
      <div className="tl-page">
        <div className="tl-toolbar">
          <button className="link-back" onClick={() => navigate(routes.timelines(projectId))}>
            <IconChevronLeft width={16} height={16} /> Retour
          </button>
        </div>
        <div className="empty">
          <p>Timeline introuvable.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="tl-page">
      <div className="tl-toolbar">
        <div className="tl-toolbar-left">
          <button className="link-back" onClick={() => navigate(routes.timelines(projectId))}>
            <IconChevronLeft width={16} height={16} /> {projectName || 'Projet'}
          </button>
          {timeline && (
            <div className="tl-title">
              <span className="tl-title-dot" style={{ background: timeline.color }} />
              <h2>{timeline.name}</h2>
              <span className="tl-range">
                {formatLong(timeline.start_date)} → {formatLong(timeline.end_date)}
              </span>
              <button className="icon-btn sm" title="Paramètres" onClick={() => setEditingMeta(true)}>
                <IconEdit width={15} height={15} />
              </button>
            </div>
          )}
        </div>

        <div className="tl-toolbar-right">
          <div className="seg">
            <button className={'seg-btn' + (mode === 'single' ? ' active' : '')} onClick={() => setMode('single')}>
              Une ligne
            </button>
            <button className={'seg-btn' + (mode === 'lanes' ? ' active' : '')} onClick={() => setMode('lanes')}>
              Lanes
            </button>
          </div>
          <button className="btn ghost sm-btn" onClick={() => tlRef.current?.today()}>
            <IconClock width={15} height={15} /> Aujourd'hui
          </button>
          <div className="zoom-group">
            <button className="icon-btn" title="Dézoomer" onClick={() => tlRef.current?.zoomOut()}>
              <IconMinus />
            </button>
            <button className="icon-btn" title="Ajuster" onClick={() => tlRef.current?.fit()}>
              <IconFit />
            </button>
            <button className="icon-btn" title="Zoomer" onClick={() => tlRef.current?.zoomIn()}>
              <IconPlus />
            </button>
          </div>
          <button className="btn btn-primary" onClick={openAdd}>
            <IconPlus /> Évènement
          </button>
        </div>
      </div>

      <div className="tl-stage">
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

        {events === null && !eventsError && <div className="tl-overlay">Chargement…</div>}
        {eventsError && (
          <div className="tl-overlay error">
            {eventsError}{' '}
            <button className="btn ghost sm-btn" onClick={loadEvents}>
              Réessayer
            </button>
          </div>
        )}

        <div className="tl-hint">clic pour ajouter · glisser pour naviguer · molette pour zoomer</div>
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
            loadEvents()
          }}
          onDeleted={() => {
            setEditor(null)
            loadEvents()
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
            loadMeta()
          }}
        />
      )}
    </div>
  )
}
