import type { ButtonHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'
import s from './IconButton.module.css'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'md' | 'sm'
  tone?: 'default' | 'danger'
}

// Bouton carré ne contenant qu'une icône. `title`/`aria-label` restent à la
// charge de l'appelant : le libellé accessible dépend de l'action.
export function IconButton({ size = 'md', tone = 'default', className, ...rest }: IconButtonProps) {
  return <button className={cx(s.iconBtn, size === 'sm' && s.sm, tone === 'danger' && s.danger, className)} {...rest} />
}
