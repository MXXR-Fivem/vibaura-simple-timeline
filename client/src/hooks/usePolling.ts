import { useEffect, useRef } from 'react'

interface PollingOptions {
  enabled?: boolean
}

// Appelle `fn` immédiatement puis toutes les `intervalMs` tant que `enabled`.
// `fn` est gardé dans une ref => en changer l'identité ne relance pas l'intervalle
// (utile quand le callback dépend de props/state qui bougent souvent).
export function usePolling(fn: () => void, intervalMs: number, { enabled = true }: PollingOptions = {}): void {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const tick = () => {
      if (alive) fnRef.current()
    }
    tick()
    const id = setInterval(tick, intervalMs)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [enabled, intervalMs])
}
