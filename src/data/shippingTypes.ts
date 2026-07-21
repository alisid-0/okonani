import { collection, getDocs } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'
import type { PackageType, PostageMode, ShipClass } from '../lib/packaging'

export type ShippingType = {
  id: string
  name: string
  packageType: PackageType
  postageMode: PostageMode
  shipClass: ShipClass
  baseRateCents: number
  freeAboveSubtotalCents: number | null
  includedWeightOz: number
  overweightCentsPerOz: number
  maxWeightOz: number
  maxThicknessIn: number
  maxItems: number
  sortOrder: number
  active: boolean
}

/** Checkout fees / letter settings. Bubble mailer is priced live by Shippo at checkout. */
export const DEFAULT_SHIPPING_TYPES: Array<Omit<ShippingType, 'id'> & { id: string }> = [
  {
    id: 'letter',
    name: 'Untracked letter',
    packageType: 'envelope',
    postageMode: 'stamp',
    shipClass: 'letter',
    baseRateCents: 150,
    freeAboveSubtotalCents: null,
    includedWeightOz: 3,
    overweightCentsPerOz: 0,
    maxWeightOz: 3,
    maxThicknessIn: 0.25,
    maxItems: 10,
    sortOrder: 1,
    active: true,
  },
]

export function parseShippingType(id: string, data: Record<string, unknown>): ShippingType | null {
  if (typeof data.name !== 'string' || !data.name.trim()) return null

  const packageType =
    data.packageType === 'envelope' || data.packageType === 'bubble_mailer' || data.packageType === 'box'
      ? data.packageType
      : 'bubble_mailer'
  const postageMode = data.postageMode === 'stamp' ? 'stamp' : 'label'
  const shipClass =
    data.shipClass === 'letter' || data.shipClass === 'soft_pack' || data.shipClass === 'parcel'
      ? data.shipClass
      : packageType === 'envelope'
        ? 'letter'
        : packageType === 'box'
          ? 'parcel'
          : 'soft_pack'

  return {
    id,
    name: data.name.trim(),
    packageType,
    postageMode,
    shipClass,
    baseRateCents: Math.max(0, Math.round(Number(data.baseRateCents) || 0)),
    freeAboveSubtotalCents:
      typeof data.freeAboveSubtotalCents === 'number' && data.freeAboveSubtotalCents > 0
        ? Math.round(data.freeAboveSubtotalCents)
        : null,
    includedWeightOz: Math.max(0, Number(data.includedWeightOz) || 0),
    overweightCentsPerOz: Math.max(0, Math.round(Number(data.overweightCentsPerOz) || 0)),
    maxWeightOz: Math.max(0, Number(data.maxWeightOz) || 0),
    maxThicknessIn: Math.max(0, Number(data.maxThicknessIn) || 0),
    maxItems: Math.max(0, Math.round(Number(data.maxItems) || 0)),
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
    active: data.active !== false,
  }
}

export function useShippingTypes() {
  const [shippingTypes, setShippingTypes] = useState<ShippingType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false

    async function load() {
      try {
        const snapshot = await getDocs(collection(db, 'shippingTypes'))
        if (ignore) return
        const next = snapshot.docs
          .map((docSnap) => parseShippingType(docSnap.id, docSnap.data() as Record<string, unknown>))
          .filter((type): type is ShippingType => Boolean(type))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        setShippingTypes(next)
      } catch {
        if (!ignore) setShippingTypes([])
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    void load()
    return () => {
      ignore = true
    }
  }, [])

  return { shippingTypes, loading }
}
