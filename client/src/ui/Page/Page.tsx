import type { ReactNode } from 'react'
import s from './Page.module.css'

export interface PageProps {
  children: ReactNode
}

/** Page défilante centrée (listes projets / timelines). */
export function Page({ children }: PageProps) {
  return (
    <div className={s.page}>
      <div className={s.inner}>{children}</div>
    </div>
  )
}

export interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Action principale, alignée à droite (bouton « Nouveau … »). */
  action?: ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className={s.head}>
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </header>
  )
}
