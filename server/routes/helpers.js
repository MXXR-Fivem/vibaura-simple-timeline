import { db, now } from '../db/index.js'

export function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg })
}

// Bump du parent (updated_at) pour que les listes trient par activité récente.
// Fonctions « nues » (pas de transaction propre) : à appeler dans la transaction
// de l'opération englobante pour rester atomique avec elle.
export function touchTimeline(tid) {
  db.prepare('UPDATE timelines SET updated_at=? WHERE id=?').run(now(), tid)
  const row = db.prepare('SELECT project_id FROM timelines WHERE id=?').get(tid)
  if (row) db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(now(), row.project_id)
}

export function touchProject(pid) {
  db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(now(), pid)
}
