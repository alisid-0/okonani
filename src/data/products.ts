import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'

export type ProductMedia = {
  url: string
  type: 'image' | 'video'
  alt?: string
  /** Admin-only: uncropped original kept for re-cropping; not shown on the storefront */
  sourceUrl?: string
}

export type ProductReview = {
  id: string
  author: string
  rating: number
  body: string
  createdAt: string | null
}

export type Product = {
  id: string
  name: string
  description?: string
  longDescription?: string
  priceInCents: number
  active?: boolean
  isDeleted?: boolean
  sortOrder?: number
  createdAt?: string | null
  category?: string
  stripePriceId?: string
  media: ProductMedia[]
  productTypeId?: string
  shipClass?: 'letter' | 'soft_pack' | 'parcel'
  weightOz?: number
  thicknessIn?: number
  maxLetterQty?: number
}

export function formatPrice(priceInCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(priceInCents / 100)
}

export function getProductCover(product: Pick<Product, 'media'>): string | null {
  const image = product.media.find((item) => item.type === 'image' && item.url.trim())
  return image?.url ?? null
}

export function averageRating(reviews: ProductReview[]): number | null {
  if (reviews.length === 0) return null
  const sum = reviews.reduce((total, review) => total + review.rating, 0)
  return sum / reviews.length
}

function parseMedia(data: unknown): ProductMedia[] {
  if (!Array.isArray(data)) return []

  const media: ProductMedia[] = []

  for (const item of data) {
    if (typeof item === 'string') {
      const url = item.trim()
      if (url) media.push({ url, type: 'image' })
      continue
    }

    if (!item || typeof item !== 'object') continue

    const record = item as Record<string, unknown>
    const url = typeof record.url === 'string' ? record.url.trim() : ''
    const type = record.type === 'video' ? 'video' : record.type === 'image' ? 'image' : url ? 'image' : null

    if (!url || !type) continue

    const parsed: ProductMedia = { url, type }
    if (typeof record.alt === 'string' && record.alt.trim()) parsed.alt = record.alt.trim()
    if (typeof record.sourceUrl === 'string' && record.sourceUrl.trim()) {
      parsed.sourceUrl = record.sourceUrl.trim()
    }

    media.push(parsed)
  }

  return media
}

function timestampToIso(value: unknown): string | null {
  if (value && typeof value === 'object' && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().toISOString()
  }

  return typeof value === 'string' ? value : null
}

export function parseProduct(id: string, data: Record<string, unknown>): Product | null {
  if (typeof data.name !== 'string' || typeof data.priceInCents !== 'number') {
    return null
  }

  return {
    id,
    name: data.name,
    description: typeof data.description === 'string' ? data.description : undefined,
    longDescription: typeof data.longDescription === 'string' ? data.longDescription : undefined,
    priceInCents: data.priceInCents,
    active: typeof data.active === 'boolean' ? data.active : undefined,
    isDeleted: data.isDeleted === true,
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : undefined,
    createdAt: timestampToIso(data.createdAt),
    category: typeof data.category === 'string' ? data.category : '',
    stripePriceId: typeof data.stripePriceId === 'string' ? data.stripePriceId : undefined,
    media: parseMedia(data.media),
    productTypeId: typeof data.productTypeId === 'string' ? data.productTypeId : undefined,
    shipClass:
      data.shipClass === 'letter' || data.shipClass === 'soft_pack' || data.shipClass === 'parcel'
        ? data.shipClass
        : 'soft_pack',
    weightOz: typeof data.weightOz === 'number' ? data.weightOz : undefined,
    thicknessIn: typeof data.thicknessIn === 'number' ? data.thicknessIn : undefined,
    maxLetterQty: typeof data.maxLetterQty === 'number' ? data.maxLetterQty : undefined,
  }
}

export function parseReview(id: string, data: Record<string, unknown>): ProductReview | null {
  if (typeof data.author !== 'string' || typeof data.body !== 'string') return null

  const rating = Number(data.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null

  return {
    id,
    author: data.author,
    rating,
    body: data.body,
    createdAt: timestampToIso(data.createdAt),
  }
}

function createdAtMs(product: Pick<Product, 'createdAt'>): number {
  if (!product.createdAt) return Number.MAX_SAFE_INTEGER
  const parsed = Date.parse(product.createdAt)
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

function sortProducts(products: Product[]): Product[] {
  return products.sort((a, b) => {
    const sortA = a.sortOrder ?? Number.MAX_SAFE_INTEGER
    const sortB = b.sortOrder ?? Number.MAX_SAFE_INTEGER

    if (sortA !== sortB) return sortA - sortB

    const createdA = createdAtMs(a)
    const createdB = createdAtMs(b)

    if (createdA !== createdB) return createdA - createdB

    return a.id.localeCompare(b.id)
  })
}

function isVisibleProduct(product: Product | null): product is Product {
  return product !== null && product.active !== false && product.isDeleted !== true
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    async function loadProducts() {
      try {
        const snapshot = await getDocs(collection(db, 'products'))
        const nextProducts = sortProducts(
          snapshot.docs
            .map((productDoc) => parseProduct(productDoc.id, productDoc.data()))
            .filter(isVisibleProduct),
        )

        if (!ignore) {
          setProducts(nextProducts)
          setError(null)
        }
      } catch {
        if (!ignore) setError('Could not load products.')
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    loadProducts()

    return () => {
      ignore = true
    }
  }, [])

  return { products, loading, error }
}

export function useProduct(productId: string | undefined) {
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    async function loadProduct() {
      if (!productId) {
        setProduct(null)
        setLoading(false)
        setError('Product not found.')
        return
      }

      setLoading(true)
      setError(null)

      try {
        const snapshot = await getDoc(doc(db, 'products', productId))
        const nextProduct = snapshot.exists() ?
          parseProduct(snapshot.id, snapshot.data())
        : null

        if (!ignore) {
          if (!isVisibleProduct(nextProduct)) {
            setProduct(null)
            setError('Product not found.')
          } else {
            setProduct(nextProduct)
          }
        }
      } catch {
        if (!ignore) {
          setProduct(null)
          setError('Could not load product.')
        }
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    loadProduct()

    return () => {
      ignore = true
    }
  }, [productId])

  return { product, loading, error }
}

export function useProductReviews(productId: string | undefined, refreshKey = 0) {
  const [reviews, setReviews] = useState<ProductReview[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false

    async function loadReviews() {
      if (!productId) {
        setReviews([])
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        const snapshot = await getDocs(
          query(collection(db, 'products', productId, 'reviews'), orderBy('createdAt', 'desc')),
        )

        if (!ignore) {
          setReviews(
            snapshot.docs
              .map((reviewDoc) => parseReview(reviewDoc.id, reviewDoc.data()))
              .filter((review): review is ProductReview => review !== null),
          )
        }
      } catch {
        if (!ignore) setReviews([])
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    loadReviews()

    return () => {
      ignore = true
    }
  }, [productId, refreshKey])

  return { reviews, loading }
}
