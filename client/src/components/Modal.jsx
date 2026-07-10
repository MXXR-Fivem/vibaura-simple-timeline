import { useEffect, useId, useRef } from 'react'
import { IconX } from './Icons.jsx'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export default function Modal({ title, onClose, children, footer, width = 480 }) {
  const modalRef = useRef(null)
  const returnFocusRef = useRef(null)

  useEffect(() => {
    returnFocusRef.current = document.activeElement
    const first = modalRef.current?.querySelector(FOCUSABLE)
    if (first && !modalRef.current.contains(document.activeElement)) first.focus()
    return () => {
      returnFocusRef.current?.focus?.()
    }
  }, [])

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const nodes = modalRef.current?.querySelectorAll(FOCUSABLE)
    if (!nodes || nodes.length === 0) return
    const list = [...nodes].filter((n) => !n.disabled && n.offsetParent !== null)
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
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <IconX />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function ColorField({ palette, value, onChange, label = 'Couleur' }) {
  const labelId = useId()
  return (
    <div className="field">
      <label id={labelId}>{label}</label>
      <div className="swatches" role="group" aria-labelledby={labelId}>
        {palette.map((c) => (
          <button
            key={c}
            type="button"
            className={'swatch' + (value === c ? ' selected' : '')}
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={c}
          />
        ))}
      </div>
    </div>
  )
}
