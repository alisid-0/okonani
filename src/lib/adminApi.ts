import {
  collection,
  deleteDoc,
  deleteField,
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
import {
  DEFAULT_SITE_SETTINGS,
  parseSiteSettings,
  SITE_SETTINGS_DOC,
  type SiteSettings,
} from '../data/siteSettings'
import type { StoreCategory } from '../data/categories'
import {
  parseProductType,
  DEFAULT_PRODUCT_TYPES,
  type ProductType,
} from '../data/productTypes'
import {
  serializeOptionGroups,
  type ProductOptionGroup,
  type ProductOptionsMode,
} from '../data/productOptions'
import {
  parseShippingType,
  DEFAULT_SHIPPING_TYPES,
  type ShippingType,
} from '../data/shippingTypes'
import { auth, db } from './firebase'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

function serializeMedia(media: ProductMedia[]): ProductMedia[] {
  return media
    .filter((item) => item.url.trim())
    .map((item) => {
      const next: ProductMedia = {
        id: item.id?.trim() || `media-${Math.random().toString(36).slice(2, 10)}`,
        url: item.url.trim(),
        type: item.type === 'video' ? 'video' : 'image',
      }

      if (item.alt?.trim()) next.alt = item.alt.trim()
      if (item.sourceUrl?.trim()) next.sourceUrl = item.sourceUrl.trim()

      return next
    })
}

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
    const detail =
      typeof data.error === 'string'
        ? data.error
        : typeof data.message === 'string'
          ? data.message
          : `Request failed (${res.status})`
    console.error(`[adminApi] ${path} → ${res.status}`, data)
    throw new Error(detail)
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
  createdAt: string | null
  category: string
  media: ProductMedia[]
  productTypeId: string
  shipClass: 'letter' | 'soft_pack' | 'parcel'
  weightOz: number
  thicknessIn: number
  maxLetterQty: number
  trackStock: boolean
  stockQuantity: number
  optionsMode: ProductOptionsMode
  optionGroups: ProductOptionGroup[]
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

function compareAdminProducts(a: AdminProduct, b: AdminProduct): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder

  const createdA = a.createdAt ? Date.parse(a.createdAt) : Number.MAX_SAFE_INTEGER
  const createdB = b.createdAt ? Date.parse(b.createdAt) : Number.MAX_SAFE_INTEGER

  if (createdA !== createdB) return createdA - createdB

  return 0
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
    createdAt: product.createdAt ?? null,
    category: product.category ?? '',
    media: product.media,
    productTypeId: product.productTypeId ?? '',
    shipClass: product.shipClass ?? 'soft_pack',
    weightOz: product.weightOz ?? (product.shipClass === 'letter' ? 0.1 : product.shipClass === 'parcel' ? 4 : 1),
    thicknessIn:
      product.thicknessIn ?? (product.shipClass === 'letter' ? 0.02 : product.shipClass === 'parcel' ? 2 : 0.5),
    maxLetterQty: product.maxLetterQty ?? (product.shipClass === 'letter' ? 10 : 0),
    trackStock: product.trackStock === true,
    stockQuantity: typeof product.stockQuantity === 'number' ? product.stockQuantity : 0,
    optionsMode: product.optionsMode ?? 'inherit',
    optionGroups: product.optionGroups ?? [],
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
    .sort(compareAdminProducts)

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
    .filter((category): category is StoreCategory => category !== null && category.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
}

export async function updateProductSortOrders(orderedIds: string[]): Promise<void> {
  await ensureAdminFirestoreAccess()

  await Promise.all(
    orderedIds.map((id, index) =>
      setDoc(
        doc(db, 'products', id),
        { sortOrder: index + 1, updatedAt: serverTimestamp() },
        { merge: true },
      ),
    ),
  )
}

export async function updateCategorySortOrders(orderedIds: string[]): Promise<void> {
  await ensureAdminFirestoreAccess()

  await Promise.all(
    orderedIds.map((id, index) =>
      setDoc(
        doc(db, 'categories', id),
        { sortOrder: index + 1, updatedAt: serverTimestamp() },
        { merge: true },
      ),
    ),
  )
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

  const existingSnap = await getDoc(doc(db, 'categories', categoryId))
  let sortOrder = input.sortOrder

  if (!existingSnap.exists()) {
    const allSnap = await getDocs(collection(db, 'categories'))
    const maxSort = allSnap.docs.reduce(
      (max, docSnap) =>
        Math.max(max, typeof docSnap.data().sortOrder === 'number' ? docSnap.data().sortOrder : 0),
      0,
    )
    sortOrder = maxSort + 1
  }

  await setDoc(
    doc(db, 'categories', categoryId),
    {
      name: input.name.trim(),
      description: input.description.trim(),
      showOnHome: input.showOnHome,
      showInStore: input.showInStore,
      homeProductLimit: Math.min(24, Math.max(1, Math.round(input.homeProductLimit))),
      sortOrder,
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

  const productsSnap = await getDocs(collection(db, 'products'))
  await Promise.all(
    productsSnap.docs
      .filter((productDoc) => productDoc.data().category === categoryId)
      .map((productDoc) =>
        setDoc(
          doc(db, 'products', productDoc.id),
          { category: '', updatedAt: serverTimestamp() },
          { merge: true },
        ),
      ),
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
  productTypeId?: string
  shipClass: 'letter' | 'soft_pack' | 'parcel'
  weightOz: number
  thicknessIn: number
  maxLetterQty: number
  trackStock?: boolean
  stockQuantity?: number
  optionsMode?: ProductOptionsMode
  optionGroups?: ProductOptionGroup[]
}): Promise<{ product: AdminProduct }> {
  await ensureAdminFirestoreAccess()

  const productId = input.id?.trim() || doc(collection(db, 'products')).id
  const existingSnap = input.id ? await getDoc(doc(db, 'products', input.id)) : null
  const existing = existingSnap?.exists() ? existingSnap.data() : null
  const isNew = !existingSnap?.exists()

  let sortOrder = input.sortOrder
  if (isNew) {
    const allSnap = await getDocs(collection(db, 'products'))
    const activeDocs = allSnap.docs.filter((productDoc) => productDoc.data().isDeleted !== true)
    const minSort = activeDocs.reduce(
      (min, productDoc) =>
        Math.min(min, typeof productDoc.data().sortOrder === 'number' ? productDoc.data().sortOrder : 0),
      Number.POSITIVE_INFINITY,
    )
    sortOrder = Number.isFinite(minSort) ? minSort - 1 : 1
  } else if (typeof existing?.sortOrder === 'number') {
    sortOrder = existing.sortOrder
  }

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
    sortOrder,
    category: input.category.trim(),
    media: serializeMedia(input.media),
    productTypeId: (input.productTypeId ?? '').trim(),
    shipClass: input.shipClass,
    weightOz: Math.max(0.01, Number(input.weightOz) || 0.1),
    thicknessIn: Math.max(0, Number(input.thicknessIn) || 0),
    maxLetterQty: Math.max(0, Math.round(Number(input.maxLetterQty) || 0)),
    trackStock: input.trackStock === true,
    stockQuantity: Math.max(0, Math.floor(Number(input.stockQuantity) || 0)),
    optionsMode: input.optionsMode ?? 'inherit',
    optionGroups:
      (input.optionsMode ?? 'inherit') === 'custom'
        ? serializeOptionGroups(input.optionGroups ?? [])
        : [],
    isDeleted: false,
    stripeProductId: stripeFields.stripeProductId ?? existing?.stripeProductId ?? null,
    stripePriceId: stripeFields.stripePriceId ?? existing?.stripePriceId ?? null,
    stripeSyncedAt: stripeFields.stripeSyncedAt,
    updatedAt: serverTimestamp(),
    ...(isNew ? { createdAt: serverTimestamp() } : {}),
  }

  await setDoc(doc(db, 'products', productId), payload, { merge: true })

  const savedSnap = await getDoc(doc(db, 'products', productId))
  const product = parseAdminProduct(productId, savedSnap.data() ?? payload)

  if (!product) {
    throw new Error('Could not save product')
  }

  return { product }
}

export async function batchUpdateAdminProducts(
  productIds: string[],
  patch: {
    productTypeId?: string
    category?: string
    active?: boolean
    shipClass?: 'letter' | 'soft_pack' | 'parcel'
    weightOz?: number
    thicknessIn?: number
    maxLetterQty?: number
    applyProductTypeDefaults?: boolean
  },
  helpers?: {
    productTypes?: ProductType[]
    shippingTypes?: ShippingType[]
  },
): Promise<{ updated: number }> {
  await ensureAdminFirestoreAccess()

  const ids = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) return { updated: 0 }

  const productType =
    patch.productTypeId && helpers?.productTypes
      ? helpers.productTypes.find((type) => type.id === patch.productTypeId)
      : null
  const shippingType =
    productType?.shippingTypeId && helpers?.shippingTypes
      ? helpers.shippingTypes.find((type) => type.id === productType.shippingTypeId)
      : null

  await Promise.all(
    ids.map(async (productId) => {
      const updates: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      }

      if (typeof patch.productTypeId === 'string') {
        updates.productTypeId = patch.productTypeId.trim()
      }
      if (typeof patch.category === 'string') {
        updates.category = patch.category.trim()
      }
      if (typeof patch.active === 'boolean') {
        updates.active = patch.active
      }
      if (patch.shipClass) {
        updates.shipClass = patch.shipClass
      }
      if (typeof patch.weightOz === 'number') {
        updates.weightOz = Math.max(0.01, patch.weightOz)
      }
      if (typeof patch.thicknessIn === 'number') {
        updates.thicknessIn = Math.max(0, patch.thicknessIn)
      }
      if (typeof patch.maxLetterQty === 'number') {
        updates.maxLetterQty = Math.max(0, Math.round(patch.maxLetterQty))
      }

      if (patch.applyProductTypeDefaults && productType) {
        updates.productTypeId = productType.id
        updates.maxLetterQty = productType.maxLetterQty
        if (shippingType) {
          updates.shipClass = shippingType.shipClass
          updates.weightOz =
            shippingType.shipClass === 'letter' ? 0.1 : shippingType.shipClass === 'parcel' ? 4 : 1
          updates.thicknessIn =
            shippingType.shipClass === 'letter' ? 0.02 : shippingType.shipClass === 'parcel' ? 2 : 0.5
        }
      }

      await setDoc(doc(db, 'products', productId), updates, { merge: true })
    }),
  )

  return { updated: ids.length }
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

export async function listAdminShippingTypes(): Promise<ShippingType[]> {
  const snapshot = await getDocs(collection(db, 'shippingTypes'))
  return snapshot.docs
    .map((docSnap) => parseShippingType(docSnap.id, docSnap.data()))
    .filter((item): item is ShippingType => item !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

export async function saveAdminShippingType(input: Omit<ShippingType, 'active'> & { active?: boolean }): Promise<ShippingType> {
  await ensureAdminFirestoreAccess()

  const id = input.id.trim()
  if (!id) throw new Error('Shipping type id is required')

  const existingSnap = await getDoc(doc(db, 'shippingTypes', id))
  const isNew = !existingSnap.exists()
  let sortOrder = input.sortOrder
  if (isNew && (!Number.isFinite(sortOrder) || sortOrder === 0)) {
    const all = await listAdminShippingTypes()
    const maxSort = all.reduce((max, type) => Math.max(max, type.sortOrder), 0)
    sortOrder = maxSort + 1
  }

  const payload = {
    name: input.name.trim(),
    packageType: input.packageType,
    postageMode: input.postageMode,
    shipClass: input.shipClass,
    baseRateCents: Math.max(0, Math.round(input.baseRateCents)),
    freeAboveSubtotalCents: input.freeAboveSubtotalCents,
    includedWeightOz: Math.max(0, input.includedWeightOz),
    overweightCentsPerOz: Math.max(0, Math.round(input.overweightCentsPerOz)),
    maxWeightOz: Math.max(0, input.maxWeightOz),
    maxThicknessIn: Math.max(0, input.maxThicknessIn),
    maxItems: Math.max(0, Math.round(input.maxItems)),
    sortOrder,
    active: input.active !== false,
    updatedAt: serverTimestamp(),
    ...(isNew ? { createdAt: serverTimestamp() } : {}),
  }

  await setDoc(doc(db, 'shippingTypes', id), payload, { merge: true })
  const parsed = parseShippingType(id, payload)
  if (!parsed) throw new Error('Could not save shipping type')
  return parsed
}

export async function deleteAdminShippingType(id: string): Promise<void> {
  await ensureAdminFirestoreAccess()
  await deleteDoc(doc(db, 'shippingTypes', id))
}

export async function installDefaultShippingTypes(): Promise<ShippingType[]> {
  const existing = await listAdminShippingTypes()
  if (existing.length > 0) return existing

  const created: ShippingType[] = []
  for (const defaults of DEFAULT_SHIPPING_TYPES) {
    const { id, ...rest } = defaults
    created.push(await saveAdminShippingType({ id, ...rest }))
  }
  return created
}

export async function listAdminProductTypes(): Promise<ProductType[]> {
  const snapshot = await getDocs(collection(db, 'productTypes'))
  return snapshot.docs
    .map((docSnap) => parseProductType(docSnap.id, docSnap.data()))
    .filter((item): item is ProductType => item !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

export async function saveAdminProductType(input: ProductType): Promise<ProductType> {
  await ensureAdminFirestoreAccess()

  const id = input.id.trim()
  if (!id) throw new Error('Product type id is required')

  const existingSnap = await getDoc(doc(db, 'productTypes', id))
  const isNew = !existingSnap.exists()
  let sortOrder = input.sortOrder
  if (isNew && (!Number.isFinite(sortOrder) || sortOrder === 0)) {
    const all = await listAdminProductTypes()
    const maxSort = all.reduce((max, type) => Math.max(max, type.sortOrder), 0)
    sortOrder = maxSort + 1
  }

  const payload = {
    name: input.name.trim(),
    description: input.description.trim(),
    defaultPriceCents: Math.max(0, Math.round(input.defaultPriceCents)),
    shippingTypeId: input.shippingTypeId.trim(),
    shipsAsLetter: input.shipsAsLetter === true,
    maxLetterQty: Math.max(0, Math.round(input.maxLetterQty)),
    optionGroups: serializeOptionGroups(input.optionGroups ?? []),
    sortOrder,
    active: input.active !== false,
    updatedAt: serverTimestamp(),
    ...(isNew ? { createdAt: serverTimestamp() } : {}),
  }

  await setDoc(doc(db, 'productTypes', id), payload, { merge: true })
  const parsed = parseProductType(id, payload)
  if (!parsed) throw new Error('Could not save product type')
  return parsed
}

export async function deleteAdminProductType(id: string): Promise<void> {
  await ensureAdminFirestoreAccess()
  await deleteDoc(doc(db, 'productTypes', id))

  const productsSnap = await getDocs(collection(db, 'products'))
  await Promise.all(
    productsSnap.docs
      .filter((productDoc) => productDoc.data().productTypeId === id)
      .map((productDoc) =>
        setDoc(
          doc(db, 'products', productDoc.id),
          { productTypeId: '', updatedAt: serverTimestamp() },
          { merge: true },
        ),
      ),
  )
}

export async function installDefaultProductTypes(): Promise<ProductType[]> {
  const existing = await listAdminProductTypes()
  if (existing.length > 0) return existing

  await installDefaultShippingTypes()

  const created: ProductType[] = []
  for (const defaults of DEFAULT_PRODUCT_TYPES) {
    created.push(await saveAdminProductType(defaults))
  }
  return created
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

export async function deleteAdminProductReview(
  productId: string,
  reviewUserId: string,
): Promise<void> {
  await ensureAdminFirestoreAccess()
  await deleteDoc(doc(db, 'products', productId, 'reviews', reviewUserId))
}

export async function getSiteSettings(): Promise<SiteSettings> {
  await ensureAdminFirestoreAccess()
  const snapshot = await getDoc(doc(db, SITE_SETTINGS_DOC))
  return parseSiteSettings(snapshot.data())
}

export async function saveSiteSettings(settings: SiteSettings): Promise<void> {
  await ensureAdminFirestoreAccess()

  const offlineMessage = settings.offlineMessage.trim() || DEFAULT_SITE_SETTINGS.offlineMessage
  const shoppingPausedTitle =
    settings.shoppingPausedTitle.trim() || DEFAULT_SITE_SETTINGS.shoppingPausedTitle
  const shoppingPausedMessage =
    settings.shoppingPausedMessage.trim() || DEFAULT_SITE_SETTINGS.shoppingPausedMessage
  const home = settings.home ?? DEFAULT_SITE_SETTINGS.home

  await setDoc(
    doc(db, SITE_SETTINGS_DOC),
    {
      pages: settings.pages,
      siteOffline: settings.siteOffline,
      offlineMessage,
      shoppingPaused: settings.shoppingPaused === true,
      shoppingPausedTitle,
      shoppingPausedMessage,
      home: {
        collectionsEnabled: home.collectionsEnabled === true,
        collectionsTitle: home.collectionsTitle.trim() || DEFAULT_SITE_SETTINGS.home.collectionsTitle,
        collectionsLead: home.collectionsLead.trim(),
        collections: (home.collections ?? [])
          .filter((item) => item.productTypeId.trim())
          .map((item, index) => ({
            productTypeId: item.productTypeId.trim(),
            label: item.label.trim(),
            imageUrl: item.imageUrl.trim(),
            sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : index,
          })),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export type AdminOrderItem = {
  productId: string | null
  name: string
  quantity: number
  unitAmountCents: number
  amountCents: number
  productTypeId: string
  shipClass: 'letter' | 'soft_pack' | 'parcel'
  weightOz: number | null
  thicknessIn: number | null
  maxLetterQty: number | null
  selectedOptions: Array<{
    groupName: string
    choiceLabel: string
    priceDeltaCents?: number
  }>
}

export type AdminOrderAddress = {
  name: string
  phone: string
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
  country: string
}

export type AdminOrder = {
  id: string
  email: string | null
  customerName: string | null
  phone: string | null
  userId: string | null
  paymentStatus: string
  amountTotal: number
  items: AdminOrderItem[]
  shippingAddress: AdminOrderAddress | null
  shippingAmountCents: number
  shippingRateName: string
  fulfillmentStatus: 'unfulfilled' | 'fulfilled' | 'cancelled'
  packageType: 'envelope' | 'bubble_mailer' | 'box'
  postageMode: 'stamp' | 'label'
  packagingSuggestion: {
    packageType: string
    postageMode: string
    reason: string
    weightOz: number
  } | null
  labelUrl: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  carrier: string | null
  trackingStatus: string | null
  trackingStatusDetail: string | null
  createdAt: string | null
  shippedAt: string | null
  deliveredAt: string | null
}

function parseOrderAddress(data: unknown): AdminOrderAddress | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  return {
    name: typeof record.name === 'string' ? record.name : '',
    phone: typeof record.phone === 'string' ? record.phone : '',
    line1: typeof record.line1 === 'string' ? record.line1 : '',
    line2: typeof record.line2 === 'string' ? record.line2 : '',
    city: typeof record.city === 'string' ? record.city : '',
    state: typeof record.state === 'string' ? record.state : '',
    postalCode: typeof record.postalCode === 'string' ? record.postalCode : '',
    country: typeof record.country === 'string' ? record.country : '',
  }
}

function parseOrderSelectedOptions(
  value: unknown,
): Array<{ groupName: string; choiceLabel: string; priceDeltaCents?: number }> {
  if (!Array.isArray(value)) return []
  const options: Array<{ groupName: string; choiceLabel: string; priceDeltaCents?: number }> = []
  for (const option of value) {
    if (!option || typeof option !== 'object') continue
    const opt = option as Record<string, unknown>
    if (typeof opt.groupName !== 'string' || typeof opt.choiceLabel !== 'string') continue
    options.push({
      groupName: opt.groupName,
      choiceLabel: opt.choiceLabel,
      ...(typeof opt.priceDeltaCents === 'number' ? { priceDeltaCents: opt.priceDeltaCents } : {}),
    })
  }
  return options
}

function parseAdminOrder(id: string, data: Record<string, unknown>): AdminOrder | null {
  const itemsRaw = Array.isArray(data.items) ? data.items : []
  const items: AdminOrderItem[] = itemsRaw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      return {
        productId: typeof record.productId === 'string' ? record.productId : null,
        name: typeof record.name === 'string' ? record.name : 'Item',
        quantity: typeof record.quantity === 'number' ? record.quantity : 1,
        unitAmountCents: typeof record.unitAmountCents === 'number' ? record.unitAmountCents : 0,
        amountCents: typeof record.amountCents === 'number' ? record.amountCents : 0,
        productTypeId: typeof record.productTypeId === 'string' ? record.productTypeId : '',
        shipClass:
          record.shipClass === 'letter' || record.shipClass === 'parcel' ? record.shipClass : 'soft_pack',
        weightOz: typeof record.weightOz === 'number' ? record.weightOz : null,
        thicknessIn: typeof record.thicknessIn === 'number' ? record.thicknessIn : null,
        maxLetterQty: typeof record.maxLetterQty === 'number' ? record.maxLetterQty : null,
        selectedOptions: parseOrderSelectedOptions(record.selectedOptions),
      } satisfies AdminOrderItem
    })
    .filter((item): item is AdminOrderItem => item !== null)

  const suggestion =
    data.packagingSuggestion && typeof data.packagingSuggestion === 'object'
      ? (data.packagingSuggestion as Record<string, unknown>)
      : null

  return {
    id,
    email: typeof data.email === 'string' ? data.email : null,
    customerName: typeof data.customerName === 'string' ? data.customerName : null,
    phone: typeof data.phone === 'string' ? data.phone : null,
    userId: typeof data.userId === 'string' ? data.userId : null,
    paymentStatus: typeof data.paymentStatus === 'string' ? data.paymentStatus : 'unknown',
    amountTotal: typeof data.amountTotal === 'number' ? data.amountTotal : 0,
    items,
    shippingAddress: parseOrderAddress(data.shippingAddress),
    shippingAmountCents: typeof data.shippingAmountCents === 'number' ? data.shippingAmountCents : 0,
    shippingRateName: typeof data.shippingRateName === 'string' ? data.shippingRateName : 'Shipping',
    fulfillmentStatus:
      data.fulfillmentStatus === 'fulfilled' || data.fulfillmentStatus === 'cancelled'
        ? data.fulfillmentStatus
        : 'unfulfilled',
    packageType:
      data.packageType === 'envelope' || data.packageType === 'box' ? data.packageType : 'bubble_mailer',
    postageMode: data.postageMode === 'stamp' ? 'stamp' : 'label',
    packagingSuggestion: suggestion
      ? {
          packageType: typeof suggestion.packageType === 'string' ? suggestion.packageType : 'bubble_mailer',
          postageMode: typeof suggestion.postageMode === 'string' ? suggestion.postageMode : 'label',
          reason: typeof suggestion.reason === 'string' ? suggestion.reason : '',
          weightOz: typeof suggestion.weightOz === 'number' ? suggestion.weightOz : 1,
        }
      : null,
    labelUrl: typeof data.labelUrl === 'string' ? data.labelUrl : null,
    trackingNumber: typeof data.trackingNumber === 'string' ? data.trackingNumber : null,
    trackingUrl: typeof data.trackingUrl === 'string' ? data.trackingUrl : null,
    carrier: typeof data.carrier === 'string' ? data.carrier : null,
    trackingStatus: typeof data.trackingStatus === 'string' ? data.trackingStatus : null,
    trackingStatusDetail:
      typeof data.trackingStatusDetail === 'string' ? data.trackingStatusDetail : null,
    createdAt: timestampToIso(data.createdAt),
    shippedAt: timestampToIso(data.shippedAt),
    deliveredAt: timestampToIso(data.deliveredAt),
  }
}

export async function listAdminOrders(): Promise<AdminOrder[]> {
  const data = await adminFetch<{ orders: Record<string, unknown>[] }>('/api/admin/orders', {
    method: 'GET',
  })

  return (data.orders || [])
    .map((order) => {
      const id = typeof order.id === 'string' ? order.id : ''
      if (!id) return null
      return parseAdminOrder(id, order)
    })
    .filter((order): order is AdminOrder => order !== null)
}

export async function markOrderFulfilledWithStamp(
  orderId: string,
  packageType: 'envelope' | 'bubble_mailer' | 'box' = 'envelope',
): Promise<void> {
  await ensureAdminFirestoreAccess()
  await setDoc(
    doc(db, 'orders', orderId),
    {
      fulfillmentStatus: 'fulfilled',
      postageMode: 'stamp',
      packageType,
      shippedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

/** Clear label/tracking so you can buy a new (e.g. live) Shippo label. */
export async function resetOrderFulfillment(orderId: string): Promise<void> {
  await ensureAdminFirestoreAccess()
  await setDoc(
    doc(db, 'orders', orderId),
    {
      fulfillmentStatus: 'unfulfilled',
      labelUrl: deleteField(),
      trackingNumber: deleteField(),
      trackingUrl: deleteField(),
      carrier: deleteField(),
      shippoTransactionId: deleteField(),
      trackingStatus: deleteField(),
      trackingStatusDetail: deleteField(),
      trackingUpdatedAt: deleteField(),
      shippedAt: deleteField(),
      deliveredAt: deleteField(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function getAdminOrderRates(
  orderId: string,
  packageType?: 'envelope' | 'bubble_mailer' | 'box',
): Promise<{
  postageMode: string
  packaging: { packageType: string; postageMode: string; reason?: string; weightOz: number }
  rates: Array<{
    objectId: string
    provider: string
    service: string
    amount: string
    currency: string
    estimatedDays: number | null
  }>
  recommendedRateId: string | null
  message?: string
}> {
  return adminFetch('/api/admin/orders/rates', {
    method: 'POST',
    body: JSON.stringify({ orderId, packageType }),
  })
}

export async function purchaseAdminOrderLabel(
  orderId: string,
  options: { rateId?: string; packageType?: 'envelope' | 'bubble_mailer' | 'box' } = {},
): Promise<{
  ok: boolean
  labelUrl: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  carrier: string | null
  emailSent?: boolean
  emailNote?: string | null
}> {
  return adminFetch('/api/admin/orders/label', {
    method: 'POST',
    body: JSON.stringify({
      orderId,
      rateId: options.rateId,
      packageType: options.packageType,
    }),
  })
}
