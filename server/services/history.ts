// Historique et sauvegardes exposés aux agents : lister ce qui a été écrit,
// défaire une écriture, gérer les instantanés complets.
import {
  applyRollback,
  captureKeys,
  createSnapshot,
  detectDrift,
  findChange,
  listSnapshots,
  readChanges,
  recordChange,
  restoreSnapshot,
  rowKeys,
} from '../backup.js'
import type { Actor, Change, SnapshotMeta } from '../backup.js'
import { fail, ok } from './base.js'
import type { Result } from './base.js'

/** Vue allégée d'une entrée de journal : sans les lignes, illisibles pour un agent. */
export interface ChangeSummary {
  id: string
  at: string
  actor: string
  op: string
  summary: string
}

function summarize(c: Change): ChangeSummary {
  return {
    id: c.id,
    at: c.at,
    actor: `${c.actor.origin}:${c.actor.name}`,
    op: c.op,
    summary: c.summary,
  }
}

export function listChanges(limit: number): ChangeSummary[] {
  return readChanges(limit).map(summarize)
}

export interface RollbackReport {
  undone: ChangeSummary
  /** Entrée de journal créée par le rollback : la passer à `rollback` le refait. */
  change_id: string | null
  forced: boolean
  drift: string[]
}

/**
 * Défait une écriture. `changeId` vide = la plus récente.
 *
 * Si les lignes concernées ont bougé depuis (l'UI ou un autre agent est passé
 * dessus), on refuse : défaire écraserait ce travail. `force` passe outre.
 */
export function rollback(
  actor: Actor,
  changeId: string | null,
  force: boolean
): Result<RollbackReport> {
  const target = changeId ? findChange(changeId) : (readChanges(1)[0] ?? null)
  if (!target) return fail(changeId ? 'change_not_found' : 'no_change_to_undo', 404)

  const drift = detectDrift(target)
  if (drift.length > 0 && !force) {
    return fail(`drift:${drift.join(',')}`, 409)
  }

  const keys = [...new Set([...rowKeys(target.before), ...rowKeys(target.after)])]
  const before = captureKeys(keys)
  applyRollback(target)
  const after = captureKeys(keys)

  const change = recordChange({
    actor,
    op: 'rollback',
    // Défaire un rollback ne recopie pas son résumé : la chaîne s'empilerait.
    summary:
      target.op === 'rollback'
        ? `Rollback de ${target.id} (rollback)`
        : `Rollback de ${target.id} (${target.op}) : ${target.summary}`,
    before,
    after,
  })
  return ok({ undone: summarize(target), change_id: change?.id ?? null, forced: drift.length > 0, drift })
}

export function listBackups(): SnapshotMeta[] {
  return listSnapshots()
}

export function createBackup(label: string): SnapshotMeta {
  return createSnapshot(label || 'manuel')
}

/** Remplace toute la base par l'instantané. Un instantané de l'état courant est pris avant. */
export function restoreBackup(
  actor: Actor,
  id: string
): Result<{ restored: string; safety_backup: string; counts: SnapshotMeta['counts'] }> {
  const safety = createSnapshot(`avant-restore-${actor.name}`)
  const r = restoreSnapshot(id)
  if (!r.ok) return fail(r.error, 404)
  return ok({ restored: id, safety_backup: safety.id, counts: r.counts })
}
