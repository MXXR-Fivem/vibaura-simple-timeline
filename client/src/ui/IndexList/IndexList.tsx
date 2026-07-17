import type { ReactNode } from 'react'
import { IconChevronRight } from '../Icons/Icons'
import s from './IndexList.module.css'

export interface IndexListProps {
  children: ReactNode
}

/** Liste dense de lignes cliquables (projets, timelines). */
export function IndexList({ children }: IndexListProps) {
  return <div className={s.index}>{children}</div>
}

export interface IndexRowProps {
  /** Pastille de couleur devant le titre. */
  leading?: ReactNode
  title: ReactNode
  /** Déjà stylé par l'appelant (via `composes: subtitle`). */
  subtitle?: ReactNode
  /** Compteur à droite (« 3 évènements »). */
  meta?: ReactNode
  /** Boutons révélés au survol ; leurs clics ne doivent pas ouvrir la ligne. */
  actions?: ReactNode
  onClick: () => void
}

export function IndexRow({ leading, title, subtitle, meta, actions, onClick }: IndexRowProps) {
  return (
    <div className={s.row} onClick={onClick}>
      {leading}
      <div className={s.main}>
        <div className={s.title}>{title}</div>
        {subtitle}
      </div>
      {meta ? <div className={s.meta}>{meta}</div> : null}
      {actions ? (
        <div className={s.actions} onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      ) : null}
      <IconChevronRight className={s.chev} width={18} height={18} />
    </div>
  )
}
