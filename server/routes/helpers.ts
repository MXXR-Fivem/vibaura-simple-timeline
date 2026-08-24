import type { Request, Response } from 'express'
import type { ServiceInput } from '../services/base.js'
import type { ErrorResponse } from '../../shared/types.js'

// `express.json()` pose {} pour un corps vide, mais un client peut poster
// n'importe quoi (tableau, littéral) : on ramène tout à un objet indexable.
export function readBody(req: Request): ServiceInput {
  const raw: unknown = req.body
  return typeof raw === 'object' && raw !== null ? (raw as ServiceInput) : {}
}

export function bad(res: Response, msg: string, code = 400): Response {
  const body: ErrorResponse = { error: msg }
  return res.status(code).json(body)
}
