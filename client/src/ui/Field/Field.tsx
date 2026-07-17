import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import s from './Field.module.css'

export interface FieldProps {
  label: ReactNode
  /** Lie le label à un contrôle natif (input/textarea). */
  htmlFor?: string
  /** Pour un groupe non natif (palette de couleurs) référencé par aria-labelledby. */
  labelId?: string
  className?: string
  children: ReactNode
}

// Étiquette + contrôle empilés. Le contrôle est passé en children pour que le
// champ ne présume pas de sa nature (input, textarea, groupe de boutons...).
export function Field({ label, htmlFor, labelId, className, children }: FieldProps) {
  return (
    <div className={cx(s.field, className)}>
      <label htmlFor={htmlFor} id={labelId}>
        {label}
      </label>
      {children}
    </div>
  )
}
