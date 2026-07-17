import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import s from './Swatch.module.css'

export interface SwatchProps {
  /** Couleur de fond de la pastille. */
  color: string
  selected: boolean
  onClick: () => void
  /** Variante « automatique » : contenu textuel centré au lieu d'un aplat nu. */
  auto?: boolean
  title?: string
  'aria-label'?: string
  children?: ReactNode
}

export function Swatch({
  color,
  selected,
  onClick,
  auto = false,
  title,
  'aria-label': ariaLabel,
  children,
}: SwatchProps) {
  return (
    <button
      type="button"
      className={cx(s.swatch, auto && s.auto, selected && s.selected)}
      style={{ background: color }}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={selected}
    >
      {children}
    </button>
  )
}
