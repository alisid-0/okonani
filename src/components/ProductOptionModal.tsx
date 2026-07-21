import { useEffect, useRef, useState } from 'react'
import type { ProductOptionGroup } from '../data/productOptions'
import {
  buildSelectedOptions,
  unitPriceWithOptions,
  validateSelectedOptions,
  type SelectedProductOption,
} from '../data/productOptions'
import { formatPrice } from '../data/products'

const EMPTY_SELECTION: Record<string, string> = {}

type ProductOptionModalProps = {
  open: boolean
  productName: string
  basePriceCents: number
  groups: ProductOptionGroup[]
  initialSelectedByGroupId?: Record<string, string>
  onClose: () => void
  onConfirm: (selected: SelectedProductOption[]) => void
}

export default function ProductOptionModal({
  open,
  productName,
  basePriceCents,
  groups,
  initialSelectedByGroupId = EMPTY_SELECTION,
  onClose,
  onConfirm,
}: ProductOptionModalProps) {
  const [selectedByGroupId, setSelectedByGroupId] = useState<Record<string, string>>(EMPTY_SELECTION)
  const [error, setError] = useState<string | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    setSelectedByGroupId(initialSelectedByGroupId)
    setError(null)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
    // Only re-seed selection when the modal opens — not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: open edge only
  }, [open])

  if (!open) return null

  const selected = buildSelectedOptions(groups, selectedByGroupId)
  const totalCents = unitPriceWithOptions(basePriceCents, selected)

  function selectChoice(groupId: string, choiceId: string) {
    setSelectedByGroupId((prev) => ({ ...prev, [groupId]: choiceId }))
    setError(null)
  }

  function handleConfirm() {
    const validationError = validateSelectedOptions(groups, selectedByGroupId)
    if (validationError) {
      setError(validationError)
      return
    }
    onConfirm(selected)
  }

  return (
    <div
      className="product-option-modal-backdrop"
      role="presentation"
      onClick={() => onCloseRef.current()}
    >
      <div
        className="product-option-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-option-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="product-option-modal-header">
          <div>
            <p className="product-option-modal-eyebrow">Choose options</p>
            <h2 id="product-option-modal-title">{productName}</h2>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCloseRef.current()}>
            Close
          </button>
        </header>

        <div className="product-option-modal-body">
          {groups.map((group) => (
            <fieldset key={group.id} className="product-option-group">
              <legend>
                {group.name}
                {group.required ? '' : ' (optional)'}
              </legend>
              <div
                className="product-option-choices product-option-choices-tiles"
                role="radiogroup"
                aria-label={group.name}
              >
                {group.choices.map((choice) => {
                  const checked = selectedByGroupId[group.id] === choice.id
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      className={`product-option-tile ${checked ? 'is-selected' : ''} ${choice.imageUrl ? 'has-image' : ''}`}
                      onClick={() => selectChoice(group.id, choice.id)}
                    >
                      {choice.imageUrl ?
                        <img
                          src={choice.imageUrl}
                          alt=""
                          className="product-option-tile-image"
                          draggable={false}
                          onContextMenu={(event) => event.preventDefault()}
                        />
                      : null}
                      <span className="product-option-tile-copy">
                        <span className="product-option-tile-label">{choice.label}</span>
                        {choice.priceDeltaCents !== 0 && (
                          <span className="product-option-delta">
                            {choice.priceDeltaCents > 0 ? '+' : ''}
                            {formatPrice(choice.priceDeltaCents)}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </div>

        {error && <p className="form-error product-option-modal-error">{error}</p>}

        <footer className="product-option-modal-footer">
          <p className="product-option-modal-total">{formatPrice(totalCents)}</p>
          <button type="button" className="btn btn-primary" onClick={handleConfirm}>
            Add to cart
          </button>
        </footer>
      </div>
    </div>
  )
}
