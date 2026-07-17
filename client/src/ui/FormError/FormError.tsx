import type { ReactNode } from 'react'
import s from './FormError.module.css'

export interface FormErrorProps {
  children: ReactNode
}

/** Message d'échec d'un formulaire. `role="alert"` : annoncé dès son apparition. */
export function FormError({ children }: FormErrorProps) {
  return (
    <div className={s.formError} role="alert">
      {children}
    </div>
  )
}
