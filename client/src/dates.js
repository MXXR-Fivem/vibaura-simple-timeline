// Deux familles d'utilitaires :
//  - UTC (parseISO/formatLong) pour des libellés de jour stables dans les listes ;
//  - LOCAL (dateInputToMs, eventStartMs...) pour positionner la frise à l'heure murale
//    saisie par l'utilisateur (comme le prototype d'origine).

export const DAY = 86400000
export const MS_DAY = DAY

export const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
export const DOWS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']

function pad(n) {
  return String(n).padStart(2, '0')
}

// ---------- UTC (listes) ----------
export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
export function toISO(ms) {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
export function clampISO(iso, minIso, maxIso) {
  if (iso < minIso) return minIso
  if (iso > maxIso) return maxIso
  return iso
}
export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const fmtLong = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
export function formatLong(iso) {
  return fmtLong.format(new Date(parseISO(iso)))
}

// ---------- LOCAL (frise) ----------
export function startOfDay(ms) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
// "YYYY-MM-DD" -> minuit LOCAL en ms
export function dateInputToMs(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}
// ms -> "YYYY-MM-DD" (local)
export function toDateInput(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
// ms -> "HH:MM" (local)
export function toTimeInput(ms) {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
// Position (ms) du début d'un évènement, heure comprise si présente.
export function eventStartMs(ev) {
  const base = dateInputToMs(ev.start_date)
  if (ev.start_time) {
    const [h, mi] = ev.start_time.split(':').map(Number)
    return base + (h * 60 + mi) * 60000
  }
  return base
}
// Fin (ms) d'un bloc : heure de fin si présente, sinon fin de la journée de fin. null si point.
export function eventEndMs(ev) {
  if (!ev.end_date) return null
  const base = dateInputToMs(ev.end_date)
  if (ev.end_time) {
    const [h, mi] = ev.end_time.split(':').map(Number)
    return base + (h * 60 + mi) * 60000
  }
  return base + MS_DAY
}
// "lun. 12 mars"
export function fmtDateShort(ms) {
  const d = new Date(ms)
  return `${DOWS[d.getDay()]}. ${d.getDate()} ${MONTHS[d.getMonth()]}`
}
// "lun. 12 mars 2026" à partir d'une date ISO
export function fmtDateFull(iso) {
  const d = new Date(dateInputToMs(iso))
  return `${DOWS[d.getDay()]}. ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
export function addDaysISO(iso, n) {
  return toDateInput(dateInputToMs(iso) + n * MS_DAY)
}
export function daysBetweenISO(a, b) {
  return Math.round((dateInputToMs(b) - dateInputToMs(a)) / MS_DAY)
}
