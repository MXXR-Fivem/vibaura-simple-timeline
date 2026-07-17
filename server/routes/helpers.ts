import type { Request, Response } from 'express'
import { db, now } from '../db/index.js'
import type { ErrorResponse } from '../../shared/types.js'

/** Corps de requête JSON non encore validé. */
export type RequestBody = Record<string, unknown>

// `express.json()` pose {} pour un corps vide, mais un client peut poster
// n'importe quoi (tableau, littéral) : on ramène tout à un objet indexable.
export function readBody(req: Request): RequestBody {
  const raw: unknown = req.body
  return typeof raw === 'object' && raw !== null ? (raw as RequestBody) : {}
}

export function bad(res: Response, msg: string, code = 400): Response {
  const body: ErrorResponse = { error: msg }
  return res.status(code).json(body)
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
