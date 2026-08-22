import { useEffect, type ReactNode } from 'react'
import { uiClick } from '../lib/uiSounds'

type AdminModalProps = {
  title: string
  description?: string
  open: boolean
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  /** Extra-wide dialog for shopper previews */
  preview?: boolean
}

export default function AdminModal({
  title,
  description,
  open,
  onClose,
  children,
  footer,
  wide = false,
  preview = false,
}: AdminModalProps) {
  function closeWithSound() {
    uiClick('soft')
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeWithSound()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sound only on escape while open
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={closeWithSound}>
      <div
        className={`admin-modal ${wide ? 'is-wide' : ''} ${preview ? 'is-preview' : ''}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-modal-header">
          <div>
            <h2 id="admin-modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={closeWithSound}>
            Close
          </button>
        </header>
        <div className="admin-modal-body">{children}</div>
        {footer && <footer className="admin-modal-footer">{footer}</footer>}
      </div>
    </div>
  )
}
