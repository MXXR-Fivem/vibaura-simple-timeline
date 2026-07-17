// Rendu canvas de la frise : graduations adaptatives, ombrage hors-plage, règle,
// marqueur « aujourd'hui » et guide de survol. Fonctions pures (aucun état React) :
// la seule entrée est le contexte 2D + les projections xOf/tOf fournies par le composant.
import { MS_DAY, MONTHS, fmtDateShort } from '../lib/dates'

const MONO = "ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,monospace"

/** Projections temps <-> pixel fournies par le composant (pan/zoom courants). */
export type Projection = { xOf: (t: number) => number; tOf: (x: number) => number }

/** Échelle des graduations, choisie d'après le zoom (px/jour). */
export type ScaleMode = 'day' | 'month' | 'year'

/** Importance d'une graduation : pilote sa taille, sa couleur et son libellé. */
export type TickLevel = 'minor' | 'week' | 'month' | 'year'

export interface Tick {
  t: number
  level: TickLevel
  d: Date
}

export interface DrawSceneOptions extends Projection {
  w: number
  h: number
  ppd: number
  mode: 'single' | 'lanes'
  startMs: number
  endMs: number
  hoverX: number | null
}

/** Callback d'itération calendaire : instant + date correspondante. */
type StepCb = (t: number, d: Date) => void

// rgba à partir d'un hex #rrggbb (fond translucide des blocs).
export function tint(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

// ---------- itération calendaire ----------
function eachDay(t0: number, t1: number, cb: StepCb): void {
  const d = new Date(t0)
  d.setHours(0, 0, 0, 0)
  while (d.getTime() <= t1) {
    cb(d.getTime(), new Date(d))
    d.setDate(d.getDate() + 1)
  }
}
function eachMonth(t0: number, t1: number, cb: StepCb): void {
  const d = new Date(t0)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  while (d.getTime() <= t1) {
    cb(d.getTime(), new Date(d))
    d.setMonth(d.getMonth() + 1)
  }
}
function eachYear(t0: number, t1: number, cb: StepCb): void {
  let y = new Date(t0).getFullYear()
  let d = new Date(y, 0, 1)
  while (d.getTime() <= t1) {
    cb(d.getTime(), new Date(d))
    y++
    d = new Date(y, 0, 1)
  }
}

function scaleMode(ppd: number): ScaleMode {
  if (ppd >= 14) return 'day'
  if (ppd >= 2.2) return 'month'
  return 'year'
}

// Graduations visibles pour l'intervalle [t0, t1] au zoom `ppd` (px/jour).
export function computeTicks(t0: number, t1: number, ppd: number): { sm: ScaleMode; out: Tick[] } {
  const sm = scaleMode(ppd)
  const out: Tick[] = []
  if (sm === 'day') {
    eachDay(t0, t1, (t, d) => {
      let level: TickLevel = 'minor'
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

// ---------- scène complète ----------
export function drawScene(
  ctx: CanvasRenderingContext2D,
  { w, h, ppd, mode, startMs, endMs, hoverX, xOf, tOf }: DrawSceneOptions
): void {
  if (!w || !h) return
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

  const rulerY = 48

  // ligne centrale (mode single)
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
  if (hoverX != null) drawHover(ctx, hoverX, h, tOf)
}

// ---------- primitives ----------
function tickMark(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color: string): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(Math.round(x) + 0.5, y)
  ctx.lineTo(Math.round(x) + 0.5, y + h)
  ctx.stroke()
}
function txt(ctx: CanvasRenderingContext2D, x: number, y: number, s: string, alpha: number): void {
  ctx.fillStyle = `rgba(232,232,237,${alpha})`
  ctx.fillText(s, x, y)
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
function drawPill(ctx: CanvasRenderingContext2D, x: number, y: number, s: string): void {
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
function drawRuler(
  ctx: CanvasRenderingContext2D,
  baseY: number,
  sm: ScaleMode,
  out: readonly Tick[],
  ppd: number,
  xOf: (t: number) => number
): void {
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
function drawToday(ctx: CanvasRenderingContext2D, w: number, h: number, xOf: (t: number) => number): void {
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
  drawPill(ctx, x, 26, 'auj.')
}
function drawHover(ctx: CanvasRenderingContext2D, hx: number, h: number, tOf: (x: number) => number): void {
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
