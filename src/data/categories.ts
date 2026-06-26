import { collection, getDocs } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'

export type StoreCategory = {
  id: string
  name: string
  description: string
  showOnHome: boolean
  showInStore: boolean
  homeProductLimit: number
  sortOrder: number
  active: boolean
}

export const FALLBACK_CATEGORIES: StoreCategory[] = [
  {
    id: 'new-arrivals',
    name: 'New arrivals',
    description: 'Fresh drops and just-added pieces',
    showOnHome: true,
    showInStore: true,
    homeProductLimit: 4,
    sortOrder: 0,
    active: true,
  },
  {
    id: 'best-sellers',
    name: 'Best sellers',
    description: 'Customer favorites and top picks',
    showOnHome: true,
    showInStore: true,
    homeProductLimit: 4,
    sortOrder: 1,
    active: true,
  },
]

function parseCategory(id: string, data: Record<string, unknown>): StoreCategory | null {
  if (typeof data.name !== 'string' || !data.name.trim()) return null

  return {
    id,
    name: data.name.trim(),
    description: typeof data.description === 'string' ? data.description : '',
    showOnHome: data.showOnHome === true,
    showInStore: data.showInStore !== false,
    homeProductLimit:
      typeof data.homeProductLimit === 'number' && data.homeProductLimit > 0 ?
        Math.min(24, Math.round(data.homeProductLimit))
      : 4,
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
    active: data.active !== false,
  }
}

function sortCategories(categories: StoreCategory[]): StoreCategory[] {
  return categories.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.name.localeCompare(b.name)
  })
}

export function useCategories() {
  const [categories, setCategories] = useState<StoreCategory[]>(FALLBACK_CATEGORIES)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false

    async function loadCategories() {
      try {
        const snapshot = await getDocs(collection(db, 'categories'))
        const loaded = sortCategories(
          snapshot.docs
            .map((docSnap) => parseCategory(docSnap.id, docSnap.data()))
            .filter((category): category is StoreCategory => category !== null && category.active),
        )

        if (!ignore) {
          setCategories(loaded.length > 0 ? loaded : FALLBACK_CATEGORIES)
        }
      } catch {
        if (!ignore) setCategories(FALLBACK_CATEGORIES)
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    loadCategories()

    return () => {
      ignore = true
    }
  }, [])

  return { categories, loading }
}

export function getCategoryById(
  categories: StoreCategory[],
  categoryId: string | undefined,
): StoreCategory | undefined {
  if (!categoryId) return undefined
  return categories.find((category) => category.id === categoryId)
}

export function getCategoryName(categories: StoreCategory[], categoryId: string | undefined): string {
  if (!categoryId) return ''
  return getCategoryById(categories, categoryId)?.name ?? ''
}

export function storeFilterCategories(categories: StoreCategory[]): StoreCategory[] {
  return categories.filter((category) => category.showInStore)
}

export function homeCategories(categories: StoreCategory[]): StoreCategory[] {
  return sortCategories(categories.filter((category) => category.showOnHome))
}
