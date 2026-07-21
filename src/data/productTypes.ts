import { collection, getDocs } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'
import { parseOptionGroups, type ProductOptionGroup } from './productOptions'

export type ProductType = {
  id: string
  name: string
  description: string
  defaultPriceCents: number
  shippingTypeId: string
  /** Stickers/sheets: count toward the ≤10 untracked letter option. */
  shipsAsLetter: boolean
  maxLetterQty: number
  /** Default option groups (color, pairings, etc.) inherited by products of this type. */
  optionGroups: ProductOptionGroup[]
  sortOrder: number
  active: boolean
}

/** Built-in starters — admin can edit after installing. */
export const DEFAULT_PRODUCT_TYPES: Array<Omit<ProductType, 'id'> & { id: string }> = [
  {
    id: 'sticker',
    name: 'Sticker',
    description: 'Flat stickers — untracked letter when total letter items ≤ 10.',
    defaultPriceCents: 300,
    shippingTypeId: 'letter',
    shipsAsLetter: true,
    maxLetterQty: 10,
    optionGroups: [],
    sortOrder: 1,
    active: true,
  },
  {
    id: 'sheet',
    name: 'Sheet',
    description: 'Sticker sheets — untracked letter when total letter items ≤ 10.',
    defaultPriceCents: 800,
    shippingTypeId: 'letter',
    shipsAsLetter: true,
    maxLetterQty: 10,
    optionGroups: [],
    sortOrder: 2,
    active: true,
  },
  {
    id: 'charm',
    name: 'Charm',
    description: 'Ships in a bubble mailer (Shippo rates).',
    defaultPriceCents: 1200,
    shippingTypeId: 'bubble-mailer',
    shipsAsLetter: false,
    maxLetterQty: 0,
    optionGroups: [],
    sortOrder: 3,
    active: true,
  },
]

export function parseProductType(id: string, data: Record<string, unknown>): ProductType | null {
  if (typeof data.name !== 'string' || !data.name.trim()) return null

  const shippingTypeId = typeof data.shippingTypeId === 'string' ? data.shippingTypeId : ''
  const shipsAsLetter =
    data.shipsAsLetter === true ||
    (data.shipsAsLetter !== false &&
      (shippingTypeId === 'letter' ||
        (typeof data.maxLetterQty === 'number' && data.maxLetterQty > 0)))

  return {
    id,
    name: data.name.trim(),
    description: typeof data.description === 'string' ? data.description : '',
    defaultPriceCents: Math.max(0, Math.round(Number(data.defaultPriceCents) || 0)),
    shippingTypeId,
    shipsAsLetter,
    maxLetterQty: Math.max(0, Math.round(Number(data.maxLetterQty) || 0)),
    optionGroups: parseOptionGroups(data.optionGroups),
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
    active: data.active !== false,
  }
}

function sortProductTypes(types: ProductType[]): ProductType[] {
  return [...types].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.name.localeCompare(b.name)
  })
}

export function useProductTypes() {
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false

    async function load() {
      try {
        const snapshot = await getDocs(collection(db, 'productTypes'))
        if (ignore) return
        const parsed = snapshot.docs
          .map((docSnap) => parseProductType(docSnap.id, docSnap.data()))
          .filter((item): item is ProductType => item !== null)
        setProductTypes(sortProductTypes(parsed))
      } catch {
        if (!ignore) setProductTypes([])
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    void load()
    return () => {
      ignore = true
    }
  }, [])

  return { productTypes, loading }
}

export function getProductTypeById(
  types: ProductType[],
  id: string | undefined | null,
): ProductType | null {
  if (!id) return null
  return types.find((type) => type.id === id) ?? null
}
