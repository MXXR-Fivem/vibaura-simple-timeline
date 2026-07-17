import type { ReactNode } from 'react'
import s from './EmptyState.module.css'

export interface EmptyStateProps {
  /** Icône décorative, en enfant direct (ciblée par `.empty > svg`). */
  icon?: ReactNode
  message: ReactNode
  /** Bouton d'action ou de reprise (« Réessayer », « Créer … »). */
  action?: ReactNode
}

/** Liste vide, entité introuvable, ou échec de chargement. */
export function EmptyState({ icon, message, action }: EmptyStateProps) {
  return (
    <div className={s.empty}>
      {icon}
      <p>{message}</p>
      {action}
    </div>
  )
}
