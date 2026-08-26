import { Fragment } from 'react'
import { formatPrice } from '../data/products'

const NUMERIC_FRAGMENT = /(\$?\d+(?:[.,]\d+)*)/g

function isNumericFragment(part: string): boolean {
  return /^\$?\d/.test(part)
}

/** Wrap digit runs (e.g. $50, 4.00, 3) in a legible UI font. */
export function ReadableNumbers({ text }: { text: string }) {
  const parts = text.split(NUMERIC_FRAGMENT)

  return (
    <>
      {parts.map((part, index) =>
        part ?
          isNumericFragment(part) ?
            <span key={index} className="tabular-num">
              {part}
            </span>
          : <Fragment key={index}>{part}</Fragment>
        : null,
      )}
    </>
  )
}

export function Price({ cents, className }: { cents: number; className?: string }) {
  return (
    <span className={className ? `tabular-num ${className}` : 'tabular-num'}>
      {formatPrice(cents)}
    </span>
  )
}
