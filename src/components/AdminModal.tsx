import { useEffect, type ReactNode } from 'react'

type AdminModalProps = {
  title: string
  description?: string
  open: boolean
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

export default function AdminModal({
  title,
  description,
  open,
  onClose,
  children,
  footer,
  wide = false,
}: AdminModalProps) {
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`admin-modal ${wide ? 'is-wide' : ''}`}
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
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="admin-modal-body">{children}</div>
        {footer && <footer className="admin-modal-footer">{footer}</footer>}
      </div>
    </div>
  )
}
