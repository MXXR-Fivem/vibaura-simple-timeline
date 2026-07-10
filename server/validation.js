// Validation partagée par les routes (formes ISO, bornes calendaires, tailles).

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
export const GRANULARITIES = new Set(['day', 'week', 'month', 'quarter', 'year'])
export const KINDS = new Set(['point', 'period'])

// Valide la forme ET la validité calendaire (rejette 2024-02-30, 0000-01-01, etc.)
export function isDate(s) {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  if (y < 1970 || m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function isTime(s) {
  return typeof s === 'string' && HHMM.test(s)
}

export function trimStr(v, max) {
  return (typeof v === 'string' ? v : '').slice(0, max)
}

// Identifiant de route : entier strictement positif, sinon null.
export function parseId(raw) {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}
