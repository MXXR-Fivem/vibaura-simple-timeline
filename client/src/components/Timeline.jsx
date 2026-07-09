import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {
  MS_DAY,
  MONTHS,
  dateInputToMs,
  eventStartMs,
  eventEndMs,
  toTimeInput,
  fmtDateShort,
  fmtDateFull,
} from '../dates.js'

const MIN_PX = 0.02
const MAX_PX = 420
const MONO = "ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,monospace"

// ---------- helpers (module scope) ----------
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}
function tint(hex, a) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}
function eachDay(t0, t1, cb) {
  const d = new Date(t0)
  d.setHours(0, 0, 0, 0)
  while (d.getTime() <= t1) {
    cb(d.getTime(), new Date(d))
    d.setDate(d.getDate() + 1)
  }
}
function eachMonth(t0, t1, cb) {
  const d = new Date(t0)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  while (d.getTime() <= t1) {
    cb(d.getTime(), new Date(d))
    d.setMonth(d.getMonth() + 1)
  }
}
function eachYear(t0, t1, cb) {
  let y = new Date(t0).getFullYear()
  let d = new Date(y, 0, 1)
  while (d.getTime() <= t1) {
    cb(d.getTime(), new Date(d))
    y++
    d = new Date(y, 0, 1)
  }
}
function scaleMode(ppd) {
  if (ppd >= 14) return 'day'
  if (ppd >= 2.2) return 'month'
  return 'year'
}
function computeTicks(t0, t1, ppd) {
  const sm = scaleMode(ppd)
  const out = []
  if (sm === 'day') {
    eachDay(t0, t1, (t, d) => {
      let level = 'minor'
      if (d.getDate() === 1) level = 'month'
      else if (d.getDay() === 1) level = 'week'
      out.push({ t, level, d })
    })
  } else if (sm === 'month') {
    eachMonth(t0, t1, (t, d) => out.push({ t, level: d.getMonth() === 0 ? 'year' : 'month', d }))
  } else {
    eachYear(t0, t1, (t, d) => out.push({ t, level: 'year', d }))
  }
  return { sm, out }
}

const Timeline = forwardRef(function Timeline(
  { timeline, events, mode, popoverOpen, onAddAt, onEditEvent, onClosePopover },
  ref
) {
  const appRef = useRef(null)
  const canvasRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [, setFrame] = useState(0)
  const [hovered, setHovered] = useState(null) // { ev, rect } pour la card au survol

  // vue impérative (pan/zoom dans des refs => pas de re-render pendant le drag)
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
    const ctx = cvs.getContext('2d')
    const { w, h } = size
    if (!w || !h) return
    const ppd = ppdRef.current
    ctx.clearRect(0, 0, w, h)

    const t0 = tOf(0) - MS_DAY
    const t1 = tOf(w) + MS_DAY
    const { sm, out } = computeTicks(t0, t1, ppd)

    // gridlines verticales
    for (const k of out) {
      if (sm === 'day' && k.level === 'minor') continue
      const strong = k.level === 'month' || k.level === 'year'
      const x = Math.round(xOf(k.t)) + 0.5
      ctx.strokeStyle = strong ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.045)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }

    // ombrage hors de la plage [start, end]
    const xs = xOf(startMs)
    const xe = xOf(endMs)
    ctx.fillStyle = 'rgba(0,0,0,0.34)'
    if (xs > 0) ctx.fillRect(0, 0, Math.min(xs, w), h)
    if (xe < w) ctx.fillRect(Math.max(xe, 0), 0, w - Math.max(xe, 0), h)
    // bornes
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.setLineDash([2, 4])
    for (const bx of [xs, xe]) {
      if (bx >= 0 && bx <= w) {
        ctx.beginPath()
        ctx.moveTo(Math.round(bx) + 0.5, 0)
        ctx.lineTo(Math.round(bx) + 0.5, h)
        ctx.stroke()
      }
    }
    ctx.setLineDash([])

    // règle toujours en haut (évite la collision avec les événements sous la ligne)
    const rulerY = 48

    // ligne centrale (mode single) au milieu de l'écran
    if (mode === 'single') {
      const centerLineY = Math.round(h * 0.5)
      ctx.strokeStyle = 'rgba(244,244,246,0.92)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, centerLineY + 0.5)
      ctx.lineTo(w, centerLineY + 0.5)
      ctx.stroke()
    }

    drawRuler(ctx, rulerY, sm, out, ppd, xOf)
    drawToday(ctx, w, h, xOf)
    if (hoverRef.current != null) drawHover(ctx, hoverRef.current, h, tOf)
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
  const ppd = ppdRef.current
  const centerY = size.h / 2
  const items = events
    .map((ev) => {
      const s = eventStartMs(ev)
      const isBlock = !!ev.end_date
      const e = isBlock ? eventEndMs(ev) : s
      return { ev, s, e, isBlock, x: xOf(s), x2: xOf(e), color: ev.color || timeline.color }
    })
    .filter((it) => it.x2 > -220 && it.x < size.w + 220)

  if (mode === 'single') {
    // événements répartis au-dessus ET en-dessous de la ligne (jamais dessus)
    const gap = 12
    const above = []
    const below = []
    const sorted = [...items].sort((a, b) => a.s - b.s)
    sorted.forEach((it, i) => {
      const w = it.isBlock
        ? Math.max(60, it.x2 - it.x)
        : Math.max(80, 26 + it.ev.title.length * 6.4 + (it.ev.start_time ? 34 : 0))
      const left = it.isBlock ? it.x : it.x - w / 2
      const right = it.isBlock ? Math.max(it.x2, it.x + w) : it.x + w / 2
      const side = i % 2 === 0 ? 'above' : 'below'
      const lanes = side === 'above' ? above : below
      let r = lanes.findIndex((end) => left >= end + gap)
      if (r === -1) {
        r = lanes.length
        lanes.push(right)
      } else lanes[r] = right
      it.side = side
      it.row = r
    })
  } else {
    const gap = 8
    const laneEnds = []
    for (const it of [...items].sort((a, b) => a.s - b.s)) {
      const w = it.isBlock ? Math.max(60, it.x2 - it.x) : 156
      let r = laneEnds.findIndex((end) => it.x >= end + gap)
      if (r === -1) {
        r = laneEnds.length
        laneEnds.push(it.x + w)
      } else laneEnds[r] = it.x + w
      it.lane = r
    }
    const laneCount = Math.max(1, laneEnds.length)
    const top = 84
    const bottom = Math.max(top + 40, size.h - 60)
    // rangées compactes en haut si peu d'events, réparties si denses
    const rowH = Math.min((bottom - top) / laneCount, 60)
    for (const it of items) it.laneY = top + rowH * (it.lane + 0.5)
  }

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

// ---------- canvas primitives ----------
function tickMark(ctx, x, y, h, color) {
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(Math.round(x) + 0.5, y)
  ctx.lineTo(Math.round(x) + 0.5, y + h)
  ctx.stroke()
}
function txt(ctx, x, y, s, alpha) {
  ctx.fillStyle = `rgba(232,232,237,${alpha})`
  ctx.fillText(s, x, y)
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
function drawPill(ctx, x, y, s) {
  ctx.font = '10px ' + MONO
  const w = ctx.measureText(s).width + 14
  const h = 18
  roundRect(ctx, Math.round(x - w / 2), Math.round(y - h / 2), w, h, 9)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fill()
  ctx.fillStyle = '#0a0a0c'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(s, x, y + 0.5)
}
function drawRuler(ctx, baseY, sm, out, ppd, xOf) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.font = '11px ' + MONO
  for (const k of out) {
    const x = xOf(k.t)
    const d = k.d
    if (sm === 'day') {
      if (k.level === 'month') {
        tickMark(ctx, x, baseY, 16, 'rgba(255,255,255,0.5)')
        txt(ctx, x, baseY + 20, ppd >= 45 ? MONTHS[d.getMonth()] + ' ' + d.getDate() : MONTHS[d.getMonth()], 0.85)
      } else if (k.level === 'week') {
        tickMark(ctx, x, baseY, 11, 'rgba(255,255,255,0.28)')
        txt(ctx, x, baseY + 15, '' + d.getDate(), 0.5)
      } else {
        tickMark(ctx, x, baseY, 6, 'rgba(255,255,255,0.13)')
        if (ppd >= 45) txt(ctx, x, baseY + 10, '' + d.getDate(), 0.5)
      }
    } else if (sm === 'month') {
      if (k.level === 'year') {
        tickMark(ctx, x, baseY, 16, 'rgba(255,255,255,0.5)')
        txt(ctx, x, baseY + 20, '' + d.getFullYear(), 0.85)
      } else {
        tickMark(ctx, x, baseY, 10, 'rgba(255,255,255,0.2)')
        txt(ctx, x, baseY + 14, MONTHS[d.getMonth()], 0.5)
      }
    } else {
      tickMark(ctx, x, baseY, 14, 'rgba(255,255,255,0.45)')
      txt(ctx, x, baseY + 18, '' + d.getFullYear(), 0.8)
    }
  }
}
function drawToday(ctx, w, h, xOf) {
  const x = xOf(Date.now())
  if (x < -4 || x > w + 4) return
  ctx.setLineDash([3, 5])
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(Math.round(x) + 0.5, 44)
  ctx.lineTo(Math.round(x) + 0.5, h - 44)
  ctx.stroke()
  ctx.setLineDash([])
  drawPill(ctx, x, 26, "auj.")
}
function drawHover(ctx, hx, h, tOf) {
  ctx.setLineDash([2, 4])
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(Math.round(hx) + 0.5, 44)
  ctx.lineTo(Math.round(hx) + 0.5, h - 44)
  ctx.stroke()
  ctx.setLineDash([])
  drawPill(ctx, hx, h - 26, fmtDateShort(tOf(hx)))
}

export default Timeline
