import { useCallback, useEffect, useState } from 'react'
import type { DependencyList, Dispatch, SetStateAction } from 'react'
import { isApiError } from '../api/client'

/**
 * - `loading` : requête en vol
 * - `ready`   : entité chargée
 * - `missing` : 404, introuvable définitivement (pas de bouton « Réessayer »)
 * - `error`   : réseau/5xx, transitoire (on propose de réessayer)
 */
export type EntityStatus = 'loading' | 'ready' | 'missing' | 'error'

export interface EntityState<T> {
  entity: T | null
  status: EntityStatus
  reload: () => Promise<T | undefined>
  setEntity: Dispatch<SetStateAction<T | null>>
}

// Charge une entité unique via `fetcher` et distingue les cas d'échec.
// `deps` gouverne le rechargement automatique (mêmes règles qu'un tableau de deps).
export function useEntity<T>(fetcher: () => Promise<T>, deps: DependencyList): EntityState<T> {
  const [entity, setEntity] = useState<T | null>(null)
  const [status, setStatus] = useState<EntityStatus>('loading')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => {
    setStatus('loading')
    return fetcher()
      .then((data) => {
        setEntity(data)
        setStatus('ready')
        return data
      })
      .catch((err: unknown) => {
        setStatus(isApiError(err) && err.status === 404 ? 'missing' : 'error')
        return undefined
      })
  }, deps)

  useEffect(() => {
    void load()
  }, [load])

  return { entity, status, reload: load, setEntity }
}
