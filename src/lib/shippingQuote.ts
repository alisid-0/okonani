import type { ProductType } from '../data/productTypes'
import { PACKAGE_DIMS, type PackagingSuggestion, type ShipClass } from './packaging'

export type QuoteLineProduct = {
  name?: string
  productTypeId?: string | null
  shipClass?: string | null
}

export type LetterShippingSettings = {
  letterFlatFeeCents: number
  letterMaxItems: number
}

export type ShippingQuote = {
  amountCents: number
  displayName: string
  free: boolean
  packaging: PackagingSuggestion
  shippingTypeId: string | null
  overweightOz: number
  overweightCents: number
  reason: string
}

export const DEFAULT_LETTER_SETTINGS: LetterShippingSettings = {
  letterFlatFeeCents: 150,
  letterMaxItems: 10,
}

function isLetterEligible(
  product: QuoteLineProduct,
  productTypes: ProductType[],
): boolean {
  const productType = product.productTypeId
    ? productTypes.find((type) => type.id === product.productTypeId)
    : null

  if (productType) {
    if (productType.shipsAsLetter === true) return true
    if (productType.shipsAsLetter === false) return false
    if (productType.shippingTypeId === 'letter') return true
  }

  return product.shipClass === 'letter'
}

/**
 * Stickers/sheets (letter-eligible): ≤ letterMaxItems → flat letter fee.
 * Anything else or over the limit → bubble mailer (Shippo prices at checkout).
 */
export function decidePackaging(
  lines: Array<{ quantity: number; product: QuoteLineProduct }>,
  productTypes: ProductType[],
  letterMaxItems = 10,
): PackagingSuggestion {
  const safeLines = lines.filter((line) => line && line.quantity > 0)

  if (safeLines.length === 0) {
    return {
      packageType: 'bubble_mailer',
      postageMode: 'label',
      reason: 'No items — default to bubble mailer.',
      dims: PACKAGE_DIMS.bubble_mailer,
      weightOz: 1,
      shipClasses: [],
    }
  }

  let totalQty = 0
  let allLetter = true
  const shipClasses = new Set<ShipClass>()

  for (const line of safeLines) {
    const qty = Math.max(1, Math.round(Number(line.quantity) || 1))
    totalQty += qty
    const letter = isLetterEligible(line.product, productTypes)
    shipClasses.add(letter ? 'letter' : 'soft_pack')
    if (!letter) allLetter = false
  }

  const maxItems = letterMaxItems > 0 ? letterMaxItems : 10

  if (allLetter && totalQty <= maxItems) {
    return {
      packageType: 'envelope',
      postageMode: 'stamp',
      reason: `${totalQty} letter item${totalQty === 1 ? '' : 's'} (max ${maxItems}) — flat letter rate.`,
      dims: PACKAGE_DIMS.envelope,
      weightOz: 1,
      shipClasses: [...shipClasses],
    }
  }

  return {
    packageType: 'bubble_mailer',
    postageMode: 'label',
    reason: allLetter
      ? `More than ${maxItems} letter items — upgrade to bubble mailer (live Shippo rates).`
      : 'Order includes non-letter items — bubble mailer (live Shippo rates).',
    dims: PACKAGE_DIMS.bubble_mailer,
    weightOz: Math.max(1, totalQty * 0.15),
    shipClasses: [...shipClasses],
  }
}

export function quoteShipping(input: {
  lines: Array<{ quantity: number; product: QuoteLineProduct }>
  productTypes: ProductType[]
  letterSettings?: LetterShippingSettings
}): ShippingQuote {
  const settings = input.letterSettings ?? DEFAULT_LETTER_SETTINGS
  const packaging = decidePackaging(
    input.lines,
    input.productTypes,
    settings.letterMaxItems,
  )

  if (packaging.packageType === 'envelope' && packaging.postageMode === 'stamp') {
    return {
      amountCents: Math.max(0, settings.letterFlatFeeCents),
      displayName: 'Untracked letter',
      free: settings.letterFlatFeeCents <= 0,
      packaging,
      shippingTypeId: 'letter',
      overweightOz: 0,
      overweightCents: 0,
      reason: packaging.reason,
    }
  }

  // Bubble mailer: customer price comes from Shippo at checkout, not the site.
  return {
    amountCents: 0,
    displayName: 'Bubble mailer',
    free: false,
    packaging,
    shippingTypeId: null,
    overweightOz: 0,
    overweightCents: 0,
    reason: packaging.reason,
  }
}
