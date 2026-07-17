// Validation partagée par les routes (formes ISO, bornes calendaires, tailles).
// Chaque fonction est un prédicat de type : une fois passée, la valeur `unknown`
// venant du corps de requête est utilisable telle quelle par le reste du code.
import { EVENT_KINDS, GRANULARITIES } from '../shared/types.js'
import type { EventKind, Granularity, HexColor, IsoDate, IsoTime } from '../shared/types.js'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Valide la forme ET la validité calendaire (rejette 2024-02-30, 0000-01-01, etc.) */
export function isDate(s: unknown): s is IsoDate {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number) as [number, number, number]
  if (y < 1970 || m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function isTime(s: unknown): s is IsoTime {
  return typeof s === 'string' && HHMM.test(s)
}

export function isHexColor(s: unknown): s is HexColor {
  return typeof s === 'string' && HEX_COLOR.test(s)
}

export function isGranularity(s: unknown): s is Granularity {
  return typeof s === 'string' && (GRANULARITIES as readonly string[]).includes(s)
}

export function isEventKind(s: unknown): s is EventKind {
  return typeof s === 'string' && (EVENT_KINDS as readonly string[]).includes(s)
}

export function trimStr(v: unknown, max: number): string {
  return (typeof v === 'string' ? v : '').slice(0, max)
}

/** Identifiant de route : entier strictement positif, sinon null. */
export function parseId(raw: unknown): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}
