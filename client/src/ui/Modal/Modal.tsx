import { useEffect, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { IconButton } from '../IconButton/IconButton'
import { IconX } from '../Icons/Icons'
import s from './Modal.module.css'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** Boutons du pied (« Annuler » / « Enregistrer »). */
  footer?: ReactNode
  width?: number
}

// Dialogue modal : piège le focus, rend Échap et le clic sur le fond équivalents
// à Fermer, et restitue le focus à l'élément d'origine en se démontant.
export function Modal({ title, onClose, children, footer, width = 480 }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null
    const first = modalRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    if (first && !modalRef.current?.contains(document.activeElement)) first.focus()
    return () => {
      returnFocusRef.current?.focus?.()
    }
  }, [])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const nodes = modalRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (!nodes || nodes.length === 0) return
    // offsetParent === null => élément masqué : on ne lui donne pas le focus.
    const list = [...nodes].filter((n) => !(n as HTMLButtonElement).disabled && n.offsetParent !== null)
    if (list.length === 0) return
    const first = list[0]
    const last = list[list.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className={s.overlay} onMouseDown={onClose}>
      <div
        className={s.modal}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className={s.head}>
          <h2>{title}</h2>
          <IconButton onClick={onClose} aria-label="Fermer">
            <IconX />
          </IconButton>
        </div>
        <div className={s.body}>{children}</div>
        {footer && <div className={s.foot}>{footer}</div>}
      </div>
    </div>
  )
}
