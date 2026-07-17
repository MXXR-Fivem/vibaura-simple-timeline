// Deux familles d'utilitaires :
//  - UTC (parseISO/formatLong) pour des libellés de jour stables dans les listes ;
//  - LOCAL (dateInputToMs, eventStartMs...) pour positionner la frise à l'heure murale
//    saisie par l'utilisateur (comme le prototype d'origine).
import type { IsoDate, IsoTime, TimelineEvent } from '@shared/types'

/** Millisecondes epoch. */
export type Ms = number

export const MS_DAY = 86400000

export const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const DOWS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// Une date ISO valide a toujours 3 segments ; une entrée malformée produit des
// NaN qui se propagent, exactement comme avant le typage.
function isoParts(iso: IsoDate): [number, number, number] {
  const [y, m, d] = iso.split('-')
  return [Number(y), Number(m), Number(d)]
}

function hhmmParts(time: IsoTime): [number, number] {
  const [h, mi] = time.split(':')
  return [Number(h), Number(mi)]
}

// ---------- UTC (listes) ----------
function parseISO(iso: IsoDate): Ms {
  const [y, m, d] = isoParts(iso)
  return Date.UTC(y, m - 1, d)
}
export function todayISO(): IsoDate {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const fmtLong = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
export function formatLong(iso: IsoDate): string {
  return fmtLong.format(new Date(parseISO(iso)))
}

// ---------- LOCAL (frise) ----------
/** "YYYY-MM-DD" -> minuit LOCAL en ms */
export function dateInputToMs(iso: IsoDate): Ms {
  const [y, m, d] = isoParts(iso)
  return new Date(y, m - 1, d).getTime()
}
/** ms -> "YYYY-MM-DD" (local) */
export function toDateInput(ms: Ms): IsoDate {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
/** ms -> "HH:MM" (local) */
export function toTimeInput(ms: Ms): IsoTime {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
/** Position (ms) du début d'un évènement, heure comprise si présente. */
export function eventStartMs(ev: TimelineEvent): Ms {
  const base = dateInputToMs(ev.start_date)
  if (ev.start_time) {
    const [h, mi] = hhmmParts(ev.start_time)
    return base + (h * 60 + mi) * 60000
  }
  return base
}
/** Fin (ms) d'un bloc : heure de fin si présente, sinon fin de la journée de fin. null si point. */
export function eventEndMs(ev: TimelineEvent): Ms | null {
  if (!ev.end_date) return null
  const base = dateInputToMs(ev.end_date)
  if (ev.end_time) {
    const [h, mi] = hhmmParts(ev.end_time)
    return base + (h * 60 + mi) * 60000
  }
  return base + MS_DAY
}
/** "lun. 12 mars" */
export function fmtDateShort(ms: Ms): string {
  const d = new Date(ms)
  return `${DOWS[d.getDay()]}. ${d.getDate()} ${MONTHS[d.getMonth()]}`
}
/** "lun. 12 mars 2026" à partir d'une date ISO */
export function fmtDateFull(iso: IsoDate): string {
  const d = new Date(dateInputToMs(iso))
  return `${DOWS[d.getDay()]}. ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
export function addDaysISO(iso: IsoDate, n: number): IsoDate {
  return toDateInput(dateInputToMs(iso) + n * MS_DAY)
}
export function daysBetweenISO(a: IsoDate, b: IsoDate): number {
  return Math.round((dateInputToMs(b) - dateInputToMs(a)) / MS_DAY)
}
