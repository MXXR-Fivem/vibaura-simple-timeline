import { useCallback, useEffect, useState } from 'react'

// Charge une entité unique via `fetcher` et distingue les cas d'échec :
//   status: 'loading' | 'ready' | 'missing' (404) | 'error' (réseau/5xx…)
// Un 404 => 'missing' (introuvable définitif) ; toute autre erreur => 'error'
// (transitoire, on propose de réessayer via reload()).
// `deps` gouverne le rechargement automatique (mêmes règles qu'un tableau de deps).
export function useEntity(fetcher, deps) {
  const [entity, setEntity] = useState(null)
  const [status, setStatus] = useState('loading')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => {
    setStatus('loading')
    return fetcher()
      .then((data) => {
        setEntity(data)
        setStatus('ready')
        return data
      })
      .catch((err) => {
        setStatus(err?.status === 404 ? 'missing' : 'error')
      })
  }, deps)

  useEffect(() => {
    load()
  }, [load])

  return { entity, status, reload: load, setEntity }
}
