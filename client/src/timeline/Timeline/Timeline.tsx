import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import type { Timeline as TimelineModel, TimelineEvent } from '@shared/types'
import { MS_DAY, dateInputToMs, toTimeInput } from '../../lib/dates'
import { cx } from '../../lib/cx'
import { drawScene, tint } from '../canvas'
import { buildItems, layoutSingle, layoutLanes } from '../layout'
import type { LayoutItem } from '../layout'
import { EventHoverCard } from '../EventHoverCard/EventHoverCard'
import s from './Timeline.module.css'

const MIN_PX = 0.02
const MAX_PX = 420

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

/** Commandes de vue exposées au parent (barre d'outils). */
export interface TimelineHandle {
  zoomIn(): void
  zoomOut(): void
  fit(): void
  today(): void
}

export interface TimelineProps {
  timeline: TimelineModel
  events: readonly TimelineEvent[]
  mode: 'single' | 'lanes'
  popoverOpen: boolean
  /** Clic sur le vide : demande la création d'un évènement à cette date. */
  onAddAt: (ms: number, anchorX: number) => void
  onEditEvent: (ev: TimelineEvent, anchorX: number) => void
  onClosePopover?: () => void
}

// Frise zoomable/pannable. Le pan/zoom vit dans des refs (pas de re-render pendant
// le drag) ; le canvas dessine le décor, les évènements sont des nœuds DOM positionnés.
export const Timeline = forwardRef<TimelineHandle, TimelineProps>(function Timeline(
  { timeline, events, mode, popoverOpen, onAddAt, onEditEvent, onClosePopover },
  ref
) {
  const appRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [, setFrame] = useState(0)
  const [hovered, setHovered] = useState<{ ev: TimelineEvent; rect: DOMRect } | null>(null) // { ev, rect } pour la card au survol

  // vue impérative (pan/zoom dans des refs)
  const originTimeRef = useRef<number>(dateInputToMs(timeline.start_date))
  const originXRef = useRef<number>(0)
  const ppdRef = useRef<number>(40)
  const hoverRef = useRef<number | null>(null)
  const rafRef = useRef<number>(0)
  const sigRef = useRef<string>('')

  // gestes
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const dragRef = useRef<{ startX: number; startY: number; lastX: number; moved: boolean } | null>(null)
  const pinchRef = useRef<{ dist: number } | null>(null)
  const suppressClickRef = useRef(false)

  const startMs = dateInputToMs(timeline.start_date)
  const endMs = dateInputToMs(timeline.end_date) + MS_DAY // fin de journée incluse

  const xOf = useCallback(
    (t: number) => originXRef.current + ((t - originTimeRef.current) / MS_DAY) * ppdRef.current,
    []
  )
  const tOf = useCallback(
    (x: number) => originTimeRef.current + ((x - originXRef.current) / ppdRef.current) * MS_DAY,
    []
  )

  // ---------- dessin canvas ----------
  const draw = useCallback(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return
    drawScene(ctx, {
      w: size.w,
      h: size.h,
      ppd: ppdRef.current,
      mode,
      startMs,
      endMs,
      hoverX: hoverRef.current,
      xOf,
      tOf,
    })
  }, [size, mode, startMs, endMs, xOf, tOf])

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      draw()
      setFrame((f) => f + 1) // repositionne les évènements (DOM)
    })
  }, [draw])

  // ---------- vue : fit / zoom / pan ----------
  const fit = useCallback(() => {
    const { w } = size
    if (!w) return
    const total = Math.max((endMs - startMs) / MS_DAY, 1)
    const pad = 0.06
    ppdRef.current = clamp((w * (1 - 2 * pad)) / total, MIN_PX, MAX_PX)
    originTimeRef.current = startMs
    originXRef.current = w * pad
    scheduleDraw()
  }, [size, startMs, endMs, scheduleDraw])

  const zoomAt = useCallback(
    (cx: number, factor: number) => {
      const t = tOf(cx)
      ppdRef.current = clamp(ppdRef.current * factor, MIN_PX, MAX_PX)
      originXRef.current = cx - ((t - originTimeRef.current) / MS_DAY) * ppdRef.current
      scheduleDraw()
    },
    [tOf, scheduleDraw]
  )

  const goToday = useCallback(() => {
    const { w } = size
    if (!w) return
    originXRef.current = w / 2 - ((Date.now() - originTimeRef.current) / MS_DAY) * ppdRef.current
    scheduleDraw()
  }, [size, scheduleDraw])

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => zoomAt(size.w / 2, 1.3),
      zoomOut: () => zoomAt(size.w / 2, 0.77),
      fit,
      today: goToday,
    }),
    [zoomAt, fit, goToday, size.w]
  )

  // mesure + DPR
  useLayoutEffect(() => {
    const el = appRef.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const cvs = canvasRef.current
    if (!cvs || !size.w || !size.h) return
    const dpr = window.devicePixelRatio || 1
    cvs.width = Math.round(size.w * dpr)
    cvs.height = Math.round(size.h * dpr)
    cvs.style.width = size.w + 'px'
    cvs.style.height = size.h + 'px'
    const ctx = cvs.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw()
  }, [size, draw])

  // fit au montage et quand la timeline / sa plage changent (pas sur simple resize)
  useEffect(() => {
    const sig = `${timeline.id}:${timeline.start_date}:${timeline.end_date}`
    if (size.w > 0 && sigRef.current !== sig) {
      sigRef.current = sig
      fit()
    }
  }, [timeline.id, timeline.start_date, timeline.end_date, size.w, fit])

  // redraw quand mode / events changent
  useEffect(() => {
    scheduleDraw()
  }, [mode, events, scheduleDraw])

  // molette (non-passif pour preventDefault)
  useEffect(() => {
    const el = appRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const lx = e.clientX - rect.left
      if (e.ctrlKey || e.metaKey) zoomAt(lx, e.deltaY < 0 ? 1.1 : 0.9)
      else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        originXRef.current -= e.deltaX
        scheduleDraw()
      } else zoomAt(lx, e.deltaY < 0 ? 1.08 : 0.926)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, scheduleDraw])

  // ---------- gestes pointeur ----------
  function localX(e: PointerEvent<HTMLDivElement>): number {
    const el = appRef.current
    return e.clientX - (el ? el.getBoundingClientRect().left : 0)
  }
  function onPointerDown(e: PointerEvent<HTMLDivElement>): void {
    if (popoverOpen) {
      onClosePopover?.()
      suppressClickRef.current = true
      return
    }
    setHovered(null)
    appRef.current?.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      dragRef.current = { startX: e.clientX, startY: e.clientY, lastX: e.clientX, moved: false }
    } else if (pointers.current.size === 2) {
      dragRef.current = null
      const p = [...pointers.current.values()]
      pinchRef.current = { dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) }
    }
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>): void {
    const pt = pointers.current.get(e.pointerId)
    if (pt) {
      pt.x = e.clientX
      pt.y = e.clientY
    }
    if (pointers.current.size >= 2 && pinchRef.current) {
      const p = [...pointers.current.values()]
      const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)
      if (pinchRef.current.dist > 0) {
        const rect = appRef.current?.getBoundingClientRect()
        const midX = (p[0].x + p[1].x) / 2 - (rect ? rect.left : 0)
        zoomAt(midX, dist / pinchRef.current.dist)
      }
      pinchRef.current.dist = dist
      return
    }
    const d = dragRef.current
    if (d) {
      const dx = e.clientX - d.lastX
      d.lastX = e.clientX
      if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 6) d.moved = true
      if (d.moved) {
        originXRef.current += dx
        scheduleDraw()
      }
    }
    hoverRef.current = localX(e)
    scheduleDraw()
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>): void {
    const d = dragRef.current
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchRef.current = null
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      dragRef.current = null
      return
    }
    if (d && !d.moved && pointers.current.size === 0) {
      onAddAt(tOf(localX(e)), e.clientX)
    }
    if (pointers.current.size === 0) dragRef.current = null
  }
  function onPointerLeave(): void {
    hoverRef.current = null
    setHovered(null)
    scheduleDraw()
  }

  // ---------- layout des évènements ----------
  const centerY = size.h / 2
  const items = buildItems(events, { xOf, viewW: size.w, timelineColor: timeline.color })
  if (mode === 'single') layoutSingle(items)
  else layoutLanes(items, { viewH: size.h })

  function renderItem(it: LayoutItem) {
    const stop = (e: PointerEvent<HTMLDivElement>) => e.stopPropagation()
    const edit = (e: MouseEvent<HTMLDivElement>) => {
      e.stopPropagation()
      onEditEvent(it.ev, e.clientX)
    }
    const hov = {
      onMouseEnter: (e: MouseEvent<HTMLDivElement>) =>
        setHovered({ ev: it.ev, rect: e.currentTarget.getBoundingClientRect() }),
      onMouseLeave: () => setHovered(null),
    }
    const time = it.ev.start_time ? toTimeInput(it.s) : null

    if (mode === 'single') {
      const side = it.side || 'above'
      if (it.isBlock) {
        const w = Math.max(6, it.x2 - it.x)
        const BLK_H = 22
        const off = 22 + (it.row ?? 0) * 30
        const barTop = side === 'above' ? centerY - off - BLK_H : centerY + off
        return (
          <div
            key={it.ev.id}
            className={s.blk}
            style={{ left: it.x, top: barTop, width: w, height: BLK_H }}
            onPointerDown={stop}
            onClick={edit}
            {...hov}
          >
            <span
              className={s.blkStem}
              style={side === 'above' ? { top: BLK_H, height: off } : { top: -off, height: off }}
            />
            <span className={s.blkFill} style={{ background: tint(it.color, 0.16), borderColor: it.color }} />
            <span className={s.blkLbl}>{it.ev.title}</span>
          </div>
        )
      }
      const off = 22 + (it.row ?? 0) * 24
      return (
        <div key={it.ev.id} className={s.pt} style={{ left: it.x, top: centerY }} onPointerDown={stop} onClick={edit} {...hov}>
          <span className={s.stem} style={side === 'above' ? { bottom: 6, height: off - 8 } : { top: 6, height: off - 8 }} />
          <span className={s.dot} style={{ background: it.color }} />
          <span className={s.lbl} style={side === 'above' ? { bottom: off } : { top: off }}>
            {it.ev.title}
            {time && <span className={s.lblTime}> {time}</span>}
          </span>
        </div>
      )
    }
    // lanes
    if (it.isBlock) {
      const w = Math.max(6, it.x2 - it.x)
      return (
        <div key={it.ev.id} className={cx(s.blk, s.lane)} style={{ left: it.x, top: it.laneY, width: w }} onPointerDown={stop} onClick={edit} {...hov}>
          <span className={s.blkFill} style={{ background: tint(it.color, 0.18), borderColor: it.color }} />
          <span className={s.blkLbl}>{it.ev.title}</span>
        </div>
      )
    }
    return (
      <div key={it.ev.id} className={cx(s.pt, s.lane)} style={{ left: it.x, top: it.laneY }} onPointerDown={stop} onClick={edit} {...hov}>
        <span className={s.dot} style={{ background: it.color }} />
        <span className={s.lblRight}>
          {it.ev.title}
          {time && <span className={s.lblTime}> {time}</span>}
        </span>
      </div>
    )
  }

  return (
    <div
      className={s.app}
      ref={appRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
    >
      <canvas className={s.grid} ref={canvasRef} />
      <div className={s.events}>{items.map(renderItem)}</div>
      {hovered && <EventHoverCard ev={hovered.ev} rect={hovered.rect} timeline={timeline} />}
    </div>
  )
})
