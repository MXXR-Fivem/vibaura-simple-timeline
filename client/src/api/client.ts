// Transport HTTP autour de fetch. Même origine => cookies de session envoyés.
// Les points d'entrée métier sont dans ./index.ts.
import type { ErrorResponse } from '@shared/types'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}

/** Émis quand l'API renvoie 401 : App remet l'utilisateur sur l'écran de login. */
export const UNAUTHORIZED_EVENT = 'app:unauthorized'

declare global {
  interface WindowEventMap {
    [UNAUTHORIZED_EVENT]: CustomEvent<void>
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

interface RequestOptions {
  /** Ne pas déclencher UNAUTHORIZED_EVENT sur 401 (login / vérification de session). */
  silent401?: boolean
}

export async function req<T>(
  method: Method,
  url: string,
  body?: unknown,
  { silent401 = false }: RequestOptions = {}
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })
  if (res.status === 401 && !silent401) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
  }
  if (!res.ok) {
    let msg = res.statusText
    try {
      const j: unknown = await res.json()
      const err = (j as Partial<ErrorResponse> | null)?.error
      if (typeof err === 'string') msg = err
    } catch {
      /* pas de corps JSON */
    }
    throw new ApiError(msg, res.status)
  }
  if (res.status === 204) return null as T
  return (await res.json()) as T
}
