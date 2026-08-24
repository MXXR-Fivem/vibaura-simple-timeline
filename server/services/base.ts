// Socle de la couche service : le type de retour commun et les « touch » de
// parents. Les services portent TOUTE la logique d'écriture (validation,
// transaction, journalisation) ; les routes HTTP et les outils MCP ne sont que
// deux façades au-dessus, ce qui garantit qu'un agent ne peut pas contourner une
// règle appliquée à l'UI.
import { db, now } from '../db/index.js'
import type { Change } from '../backup.js'

/** Corps de requête / arguments d'outil, non encore validés. */
export type ServiceInput = Record<string, unknown>

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; status: number }

/** Une écriture réussie : la ligne obtenue et l'entrée de journal qui la défait. */
export interface Mutated<T> {
  row: T
  /** `null` si le journal n'a pas pu être écrit (disque) — l'écriture, elle, a bien eu lieu. */
  change: Change | null
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function fail<T>(error: string, status = 400): Result<T> {
  return { ok: false, error, status }
}

// Bump du parent (updated_at) pour que les listes trient par activité récente.
// Fonctions « nues » (pas de transaction propre) : à appeler dans la transaction
// de l'opération englobante pour rester atomique avec elle.
export function touchTimeline(tid: number): void {
  db.prepare('UPDATE timelines SET updated_at=? WHERE id=?').run(now(), tid)
  const row = db
    .prepare<[number], { project_id: number }>('SELECT project_id FROM timelines WHERE id=?')
    .get(tid)
  if (row) db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(now(), row.project_id)
}

export function touchProject(pid: number): void {
  db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(now(), pid)
}
