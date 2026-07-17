import s from './Loading.module.css'

export interface LoadingProps {
  children?: string
}

/** Indicateur de chargement en ligne, à la place d'une liste. */
export function Loading({ children = 'Chargement…' }: LoadingProps) {
  return <div className={s.loading}>{children}</div>
}
