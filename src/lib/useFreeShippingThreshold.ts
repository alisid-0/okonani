import { useMemo } from 'react'
import { useShippingTypes } from '../data/shippingTypes'
import { DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS, resolveFreeShippingThresholdCents } from './freeShipping'

function thresholdFromShippingTypes(
  shippingTypes: Array<{ freeAboveSubtotalCents: number | null; active: boolean }>,
): number {
  const thresholds = shippingTypes
    .filter(
      (type) =>
        type.active &&
        typeof type.freeAboveSubtotalCents === 'number' &&
        type.freeAboveSubtotalCents > 0,
    )
    .map((type) => type.freeAboveSubtotalCents as number)

  if (thresholds.length === 0) return DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS
  return Math.min(...thresholds)
}

export function useFreeShippingThresholdCents(): number {
  const { shippingTypes } = useShippingTypes()

  return useMemo(
    () =>
      shippingTypes.length > 0
        ? thresholdFromShippingTypes(shippingTypes)
        : DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS,
    [shippingTypes],
  )
}

export function useFreeShippingThresholdFromLetterType(): number {
  const { shippingTypes } = useShippingTypes()

  return useMemo(() => {
    const letter =
      shippingTypes.find((type) => type.id === 'letter') ||
      shippingTypes.find((type) => type.packageType === 'envelope') ||
      null
    return resolveFreeShippingThresholdCents(letter?.freeAboveSubtotalCents)
  }, [shippingTypes])
}
