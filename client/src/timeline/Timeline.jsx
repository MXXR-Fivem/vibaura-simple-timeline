import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { MS_DAY, dateInputToMs, toTimeInput, fmtDateFull } from '../lib/dates.js'
import { drawScene, tint } from './canvas.js'
import { buildItems, layoutSingle, layoutLanes } from './layout.js'

const MIN_PX = 0.02
const MAX_PX = 420

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}

// Frise zoomable/pannable. Le pan/zoom vit dans des refs (pas de re-render pendant
// le drag) ; le canvas dessine le décor, les évènements sont des nœuds DOM positionnés.
const Timeline = forwardRef(function Timeline(
  { timeline, events, mode, popoverOpen, onAddAt, onEditEvent, onClosePopover },
  ref
) {
  const appRef = useRef(null)
  const canvasRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [, setFrame] = useState(0)
  const [hovered, setHovered] = useState(null) // { ev, rect } pour la card au survol

  // vue impérative (pan/zoom dans des refs)
  const originTimeRef = useRef(dateInputToMs(timeline.start_date))
  const originXRef = useRef(0)
  const ppdRef = useRef(40)
  const hoverRef = useRef(null)
  const rafRef = useRef(0)
  const sigRef = useRef('')

  // gestes
  const pointers = useRef(new Map())
  const dragRef = useRef(null)
  const pinchRef = useRef(null)
  const suppressClickRef = useRef(false)

  const startMs = dateInputToMs(timeline.start_date)
  const endMs = dateInputToMs(timeline.end_date) + MS_DAY // fin de journée incluse

  const xOf = useCallback(
    (t) => originXRef.current + ((t - originTimeRef.current) / MS_DAY) * ppdRef.current,
    []
  )
  const tOf = useCallback(
    (x) => originTimeRef.current + ((x - originXRef.current) / ppdRef.current) * MS_DAY,
    []
  )

  // ---------- dessin canvas ----------
  const draw = useCallback(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    drawScene(cvs.getContext('2d'), {
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
    (cx, factor) => {
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
    cvs.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0)
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
    const onWheel = (e) => {
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
  function localX(e) {
    return e.clientX - appRef.current.getBoundingClientRect().left
  }
  function onPointerDown(e) {
    if (popoverOpen) {
      onClosePopover?.()
      suppressClickRef.current = true
      return
    }
    setHovered(null)
    appRef.current.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      dragRef.current = { startX: e.clientX, startY: e.clientY, lastX: e.clientX, moved: false }
    } else if (pointers.current.size === 2) {
      dragRef.current = null
      const p = [...pointers.current.values()]
      pinchRef.current = { dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) }
    }
  }
  function onPointerMove(e) {
    const pt = pointers.current.get(e.pointerId)
    if (pt) {
      pt.x = e.clientX
      pt.y = e.clientY
    }
    if (pointers.current.size >= 2 && pinchRef.current) {
      const p = [...pointers.current.values()]
      const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)
      if (pinchRef.current.dist > 0) {
        const rect = appRef.current.getBoundingClientRect()
        const midX = (p[0].x + p[1].x) / 2 - rect.left
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
  function onPointerUp(e) {
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
  function onPointerLeave() {
    hoverRef.current = null
    setHovered(null)
    scheduleDraw()
  }

  // ---------- layout des évènements ----------
  const centerY = size.h / 2
  const items = buildItems(events, { xOf, viewW: size.w, timelineColor: timeline.color })
  if (mode === 'single') layoutSingle(items)
  else layoutLanes(items, { viewH: size.h })

  function renderItem(it) {
    const stop = (e) => e.stopPropagation()
    const edit = (e) => {
      e.stopPropagation()
      onEditEvent(it.ev, e.clientX)
    }
    const hov = {
      onMouseEnter: (e) => setHovered({ ev: it.ev, rect: e.currentTarget.getBoundingClientRect() }),
      onMouseLeave: () => setHovered(null),
    }
    const time = it.ev.start_time ? toTimeInput(it.s) : null

    if (mode === 'single') {
      const side = it.side || 'above'
      if (it.isBlock) {
        const w = Math.max(6, it.x2 - it.x)
        const BLK_H = 22
        const off = 22 + it.row * 30
        const barTop = side === 'above' ? centerY - off - BLK_H : centerY + off
        return (
          <div
            key={it.ev.id}
            className={'blk ' + side}
            style={{ left: it.x, top: barTop, width: w, height: BLK_H }}
            onPointerDown={stop}
            onClick={edit}
            {...hov}
          >
            <span className="blk-stem" style={side === 'above' ? { top: BLK_H, height: off } : { top: -off, height: off }} />
            <span className="blk-fill" style={{ background: tint(it.color, 0.16), borderColor: it.color }} />
            <span className="blk-lbl">{it.ev.title}</span>
          </div>
        )
      }
      const off = 22 + it.row * 24
      return (
        <div key={it.ev.id} className={'pt ' + side} style={{ left: it.x, top: centerY }} onPointerDown={stop} onClick={edit} {...hov}>
          <span className="stem" style={side === 'above' ? { bottom: 6, height: off - 8 } : { top: 6, height: off - 8 }} />
          <span className="dot" style={{ background: it.color }} />
          <span className="lbl" style={side === 'above' ? { bottom: off } : { top: off }}>
            {it.ev.title}
            {time && <span className="lbl-time"> {time}</span>}
          </span>
        </div>
      )
    }
    // lanes
    if (it.isBlock) {
      const w = Math.max(6, it.x2 - it.x)
      return (
        <div key={it.ev.id} className="blk lane" style={{ left: it.x, top: it.laneY, width: w }} onPointerDown={stop} onClick={edit} {...hov}>
          <span className="blk-fill" style={{ background: tint(it.color, 0.18), borderColor: it.color }} />
          <span className="blk-lbl">{it.ev.title}</span>
        </div>
      )
    }
    return (
      <div key={it.ev.id} className="pt lane" style={{ left: it.x, top: it.laneY }} onPointerDown={stop} onClick={edit} {...hov}>
        <span className="dot" style={{ background: it.color }} />
        <span className="lbl-right">
          {it.ev.title}
          {time && <span className="lbl-time"> {time}</span>}
        </span>
      </div>
    )
  }

  return (
    <div
      className="tl-app"
      ref={appRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
    >
      <canvas className="tl-grid" ref={canvasRef} />
      <div className="tl-events">{items.map(renderItem)}</div>
      {hovered && <EventHoverCard ev={hovered.ev} rect={hovered.rect} timeline={timeline} />}
    </div>
  )
})

function EventHoverCard({ ev, rect, timeline }) {
  const color = ev.color || timeline.color
  const isBlock = !!ev.end_date
  const startLine = fmtDateFull(ev.start_date) + (ev.start_time ? ` · ${ev.start_time}` : '')
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1024
  const left = Math.max(150, Math.min(rect.left + rect.width / 2, winW - 150))
  const above = rect.top > 150
  const style = above
    ? { left, top: rect.top - 10, transform: 'translate(-50%,-100%)' }
    : { left, top: rect.bottom + 10, transform: 'translate(-50%,0)' }
  return (
    <div className="ev-hovercard" style={style}>
      <div className="ehc-head">
        <span className="ehc-dot" style={{ background: color }} />
        <span className="ehc-title">{ev.title}</span>
      </div>
      <div className="ehc-date">
        {startLine}
        {isBlock && (
          <>
            <span className="ehc-arrow"> → </span>
            {fmtDateFull(ev.end_date) + (ev.end_time ? ` · ${ev.end_time}` : '')}
          </>
        )}
      </div>
      {ev.description && <div className="ehc-note">{ev.description}</div>}
    </div>
  )
}

export default Timeline
