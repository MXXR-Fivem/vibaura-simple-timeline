// Placement des évènements sur la frise (maths pures, sans DOM/React).
// Le composant fournit la projection `xOf` (temps -> pixel) ; ces fonctions
// calculent positions et anti-chevauchement, puis le composant fait le rendu JSX.
import { eventStartMs, eventEndMs } from '../lib/dates.js'

// Transforme les évènements bruts en items positionnés, filtrés au viewport (marge 220px).
export function buildItems(events, { xOf, viewW, timelineColor }) {
  return events
    .map((ev) => {
      const s = eventStartMs(ev)
      const isBlock = !!ev.end_date
      const e = isBlock ? eventEndMs(ev) : s
      return { ev, s, e, isBlock, x: xOf(s), x2: xOf(e), color: ev.color || timelineColor }
    })
    .filter((it) => it.x2 > -220 && it.x < viewW + 220)
}

// Mode « une ligne » : répartit au-dessus ET en-dessous de la ligne (jamais dessus),
// en empilant sur des rangées quand ça se chevauche. Mute it.side / it.row.
export function layoutSingle(items) {
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
}

// Mode « lanes » : rangées horizontales compactes en haut si peu d'events,
// réparties sur la hauteur quand c'est dense. Mute it.lane / it.laneY.
export function layoutLanes(items, { viewH }) {
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
  const bottom = Math.max(top + 40, viewH - 60)
  const rowH = Math.min((bottom - top) / laneCount, 60)
  for (const it of items) it.laneY = top + rowH * (it.lane + 0.5)
}
