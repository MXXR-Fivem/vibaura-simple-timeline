import { cx } from '../../lib/cx'
import s from './SegmentedControl.module.css'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Renseigné quand le groupe a besoin d'être nommé (role="group"). */
  role?: string
  'aria-label'?: string
}

// Choix exclusif parmi quelques options courtes (granularité, mode d'affichage).
// Générique sur T : `value`/`onChange` restent liés au littéral d'union de l'appelant.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  role,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div className={s.seg} role={role} aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cx(s.segBtn, value === o.value && s.active)}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
