import { useId } from 'react'
import type { HexColor } from '@shared/types'
import { Field } from '../Field/Field'
import { Swatch } from '../Swatch/Swatch'
import s from './ColorField.module.css'

export interface ColorFieldProps {
  palette: readonly HexColor[]
  value: HexColor
  onChange: (color: HexColor) => void
  label?: string
}

/** Champ de formulaire : choix d'une couleur dans une palette fixe. */
export function ColorField({ palette, value, onChange, label = 'Couleur' }: ColorFieldProps) {
  const labelId = useId()
  return (
    <Field label={label} labelId={labelId}>
      <div className={s.swatches} role="group" aria-labelledby={labelId}>
        {palette.map((c) => (
          <Swatch key={c} color={c} selected={value === c} onClick={() => onChange(c)} aria-label={c} />
        ))}
      </div>
    </Field>
  )
}
