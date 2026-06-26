import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore'
import {
  parseProduct,
  type ProductMedia,
} from '../data/products'
import type { StoreCategory } from '../data/categories'
import { auth, db } from './firebase'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Sign in required')
  }

  const token = await user.getIdToken()
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'X-Firebase-Auth': token,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  const text = await res.text()
  let data: Record<string, unknown> = {}

  if (text.trim()) {
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new Error('Admin service returned an invalid response')
    }
  }

  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Request failed')
  }

  return data as T
}

export async function checkAdminAccess(): Promise<{ isAdmin: boolean; claimsUpdated?: boolean }> {
  return adminFetch('/api/admin/check-access', { method: 'GET' })
}

async function ensureAdminFirestoreAccess(): Promise<void> {
  const data = await checkAdminAccess()

  if (!data.isAdmin) {
    throw new Error('Admin access required')
  }

  if (auth.currentUser) {
    await auth.currentUser.getIdToken(true)
  }
}

export type AdminProduct = {
  id: string
  name: string
  description: string
  longDescription: string
  priceInCents: number
  active: boolean
  sortOrder: number
  category: string
  media: ProductMedia[]
  stripeProductId: string | null
  stripePriceId: string | null
  stripeSyncedAt: string | null
  updatedAt: string | null
}

function timestampToIso(value: unknown): string | null {
  if (value && typeof value === 'object' && 'toDate' in value) {
    return (value as Timestamp).toDate().toISOString()
  }

  return typeof value === 'string' ? value : null
}

function parseAdminProduct(id: string, data: Record<string, unknown>): AdminProduct | null {
  const product = parseProduct(id, data)
  if (!product) return null

  return {
    id: product.id,
    name: product.name,
    description: product.description ?? '',
    longDescription: product.longDescription ?? '',
    priceInCents: product.priceInCents,
    active: product.active !== false,
    sortOrder: product.sortOrder ?? 0,
    category: product.category ?? '',
    media: product.media,
    stripeProductId: typeof data.stripeProductId === 'string' ? data.stripeProductId : null,
    stripePriceId: typeof data.stripePriceId === 'string' ? data.stripePriceId : null,
    stripeSyncedAt: typeof data.stripeSyncedAt === 'string' ? data.stripeSyncedAt : null,
    updatedAt: timestampToIso(data.updatedAt),
  }
}

export async function listAdminProducts(): Promise<{ products: AdminProduct[] }> {
  const snapshot = await getDocs(collection(db, 'products'))
  const products = snapshot.docs
    .filter((productDoc) => productDoc.data().isDeleted !== true)
    .map((productDoc) => parseAdminProduct(productDoc.id, productDoc.data()))
    .filter((product): product is AdminProduct => product !== null)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.name.localeCompare(b.name)
    })

  return { products }
}

type StripeSyncResult = {
  stripeProductId: string
  stripePriceId: string
  stripeSyncedAt: string
}

export async function listAdminCategories(): Promise<StoreCategory[]> {
  const snapshot = await getDocs(collection(db, 'categories'))
  return snapshot.docs
    .map((docSnap) => {
      const data = docSnap.data()
      if (typeof data.name !== 'string') return null
      return {
        id: docSnap.id,
        name: data.name,
        description: typeof data.description === 'string' ? data.description : '',
        showOnHome: data.showOnHome === true,
        showInStore: data.showInStore !== false,
        homeProductLimit:
          typeof data.homeProductLimit === 'number' && data.homeProductLimit > 0 ?
            Math.min(24, Math.round(data.homeProductLimit))
          : 4,
        sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
        active: data.active !== false,
      } satisfies StoreCategory
    })
    .filter((category): category is StoreCategory => category !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

export async function saveAdminCategory(input: {
  id: string
  name: string
  description: string
  showOnHome: boolean
  showInStore: boolean
  homeProductLimit: number
  sortOrder: number
  active: boolean
}): Promise<void> {
  await ensureAdminFirestoreAccess()

  const categoryId = input.id.trim()
  if (!categoryId) throw new Error('Category id is required')

  await setDoc(
    doc(db, 'categories', categoryId),
    {
      name: input.name.trim(),
      description: input.description.trim(),
      showOnHome: input.showOnHome,
      showInStore: input.showInStore,
      homeProductLimit: Math.min(24, Math.max(1, Math.round(input.homeProductLimit))),
      sortOrder: input.sortOrder,
      active: input.active,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function deleteAdminCategory(categoryId: string): Promise<void> {
  await ensureAdminFirestoreAccess()
  await setDoc(
    doc(db, 'categories', categoryId),
    { active: false, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

export async function saveAdminProduct(input: {
  id?: string
  name: string
  description: string
  longDescription: string
  priceInCents: number
  active: boolean
  sortOrder: number
  category: string
  media: ProductMedia[]
}): Promise<{ product: AdminProduct }> {
  await ensureAdminFirestoreAccess()

  const productId = input.id?.trim() || doc(collection(db, 'products')).id
  const existingSnap = input.id ? await getDoc(doc(db, 'products', input.id)) : null
  const existing = existingSnap?.exists() ? existingSnap.data() : null

  const stripeFields = await adminFetch<StripeSyncResult>('/api/admin/products/save', {
    method: 'POST',
    body: JSON.stringify({
      id: productId,
      name: input.name,
      description: input.description,
      priceInCents: input.priceInCents,
      stripeProductId: existing?.stripeProductId,
      stripePriceId: existing?.stripePriceId,
      previousPriceInCents: existing?.priceInCents,
    }),
  })

  const payload = {
    name: input.name,
    description: input.description,
    longDescription: input.longDescription,
    priceInCents: input.priceInCents,
    active: input.active,
    sortOrder: input.sortOrder,
    category: input.category.trim(),
    media: input.media.filter((item) => item.url.trim()),
    isDeleted: false,
    stripeProductId: stripeFields.stripeProductId ?? existing?.stripeProductId ?? null,
    stripePriceId: stripeFields.stripePriceId ?? existing?.stripePriceId ?? null,
    stripeSyncedAt: stripeFields.stripeSyncedAt,
    updatedAt: serverTimestamp(),
    ...(existingSnap?.exists() ? {} : { createdAt: serverTimestamp() }),
  }

  await setDoc(doc(db, 'products', productId), payload, { merge: true })

  const savedSnap = await getDoc(doc(db, 'products', productId))
  const product = parseAdminProduct(productId, savedSnap.data() ?? payload)

  if (!product) {
    throw new Error('Could not save product')
  }

  return { product }
}

export async function deleteAdminProduct(
  id: string,
  stripePriceId: string | null,
  stripeProductId: string | null,
): Promise<{ ok: boolean }> {
  await ensureAdminFirestoreAccess()

  await adminFetch('/api/admin/products/delete', {
    method: 'POST',
    body: JSON.stringify({ stripePriceId, stripeProductId }),
  })

  await setDoc(
    doc(db, 'products', id),
    {
      active: false,
      isDeleted: true,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  return { ok: true }
}

export type AdminContactMessage = {
  id: string
  name: string
  email: string
  message: string
  createdAt: string | null
  read: boolean
}

function parseContactMessage(id: string, data: Record<string, unknown>): AdminContactMessage | null {
  if (typeof data.name !== 'string' || typeof data.email !== 'string' || typeof data.message !== 'string') {
    return null
  }

  let createdAt: string | null = null
  const rawCreatedAt = data.createdAt

  if (rawCreatedAt && typeof rawCreatedAt === 'object' && 'toDate' in rawCreatedAt) {
    createdAt = (rawCreatedAt as Timestamp).toDate().toISOString()
  }

  return {
    id,
    name: data.name.trim(),
    email: data.email.trim(),
    message: data.message.trim(),
    createdAt,
    read: data.read === true,
  }
}

export async function listAdminContactMessages(): Promise<AdminContactMessage[]> {
  await ensureAdminFirestoreAccess()

  const snapshot = await getDocs(
    query(collection(db, 'contactMessages'), orderBy('createdAt', 'desc')),
  )

  return snapshot.docs
    .map((docSnap) => parseContactMessage(docSnap.id, docSnap.data()))
    .filter((message): message is AdminContactMessage => message !== null)
}

export async function markContactMessageRead(id: string): Promise<void> {
  await ensureAdminFirestoreAccess()
  await setDoc(doc(db, 'contactMessages', id), { read: true }, { merge: true })
}

export async function deleteAdminContactMessage(id: string): Promise<void> {
  await ensureAdminFirestoreAccess()
  await deleteDoc(doc(db, 'contactMessages', id))
}
