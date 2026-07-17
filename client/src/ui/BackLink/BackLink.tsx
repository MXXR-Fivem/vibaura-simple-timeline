import type { ReactNode } from 'react'
import { IconChevronLeft } from '../Icons/Icons'
import s from './BackLink.module.css'

export interface BackLinkProps {
  onClick: () => void
  children: ReactNode
}

/** Retour au niveau parent. Le chevron fait partie du composant. */
export function BackLink({ onClick, children }: BackLinkProps) {
  return (
    <button className={s.backLink} onClick={onClick}>
      <IconChevronLeft width={16} height={16} /> {children}
    </button>
  )
}
