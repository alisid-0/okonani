/** Default free-shipping threshold (matches admin shipping settings). */
export const DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS = 5000

export function resolveFreeShippingThresholdCents(
  freeAboveSubtotalCents: number | null | undefined,
): number {
  return typeof freeAboveSubtotalCents === 'number' && freeAboveSubtotalCents > 0
    ? freeAboveSubtotalCents
    : DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS
}

export function qualifiesForFreeShipping(
  subtotalCents: number,
  thresholdCents = DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS,
): boolean {
  return subtotalCents >= thresholdCents
}

export function amountUntilFreeShipping(
  subtotalCents: number,
  thresholdCents = DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS,
): number {
  return Math.max(0, thresholdCents - subtotalCents)
}

export const FREE_SHIPPING_BANNER_MESSAGE = 'Free shipping on orders over $50'

export function freeShippingBannerAmount(thresholdCents: number): string {
  const dollars = thresholdCents / 100
  const formatted =
    dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2).replace(/\.00$/, '')}`
  return `${formatted}!`
}

export function freeShippingBannerMessage(thresholdCents: number): string {
  return `free shipping on orders over ${freeShippingBannerAmount(thresholdCents)}`
}

/** @deprecated use DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS */
export const FREE_SHIPPING_THRESHOLD_CENTS = DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS
