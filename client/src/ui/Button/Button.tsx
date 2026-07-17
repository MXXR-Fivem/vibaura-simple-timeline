import type { ButtonHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'
import s from './Button.module.css'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary'
  size?: 'md' | 'sm'
  /** Pleine largeur (bouton de soumission d'un formulaire). */
  block?: boolean
}

// `type` n'a volontairement pas de valeur par défaut : le bouton de connexion vit
// dans un <form> et doit rester un submit natif.
export function Button({ variant = 'default', size = 'md', block = false, className, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(s.btn, variant === 'primary' && s.primary, size === 'sm' && s.sm, block && s.block, className)}
      {...rest}
    />
  )
}
