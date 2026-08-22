import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'

export type SitePageId = 'home' | 'store' | 'about' | 'contact'

export type HomeCollectionItem = {
  productTypeId: string
  label: string
  imageUrl: string
  sortOrder: number
}

export type HomeSectionKind = 'collections' | 'category' | 'productType'

/** Ordered, toggleable home page blocks — mix category rows, type rows, and collections. */
export type HomeSection = {
  id: string
  kind: HomeSectionKind
  enabled: boolean
  sortOrder: number
  /** Optional header override; empty uses category/type name or collections title. */
  title: string
  lead: string
  /** When false, hide supporting description on the homepage. Default true. */
  showDescription: boolean
  /** Category id or product type id; unused for collections. */
  sourceId: string
  /** Max products in a strip (category / productType). */
  productLimit: number
  /** Curated product ids; empty = first N by store sort for that source. */
  productIds: string[]
}

export type HomeLayoutSettings = {
  sections: HomeSection[]
  collectionsTitle: string
  collectionsLead: string
  collections: HomeCollectionItem[]
  /** Legacy: migrated into a collections section when sections is empty. */
  collectionsEnabled?: boolean
}

export type SiteSettings = {
  pages: Record<SitePageId, boolean>
  siteOffline: boolean
  offlineMessage: string
  shoppingPaused: boolean
  shoppingPausedTitle: string
  shoppingPausedMessage: string
  home: HomeLayoutSettings
}

export const SITE_NAV_PAGES: {
  id: SitePageId
  label: string
  to: string
  end?: boolean
}[] = [
  { id: 'home', label: 'Home', to: '/', end: true },
  { id: 'store', label: 'Store', to: '/store' },
  { id: 'about', label: 'About', to: '/about' },
  { id: 'contact', label: 'Contact', to: '/contact' },
]

export const DEFAULT_OFFLINE_MESSAGE =
  'Please check my socials for an update on when my site is live again!'

export const DEFAULT_SHOP_PAUSED_TITLE = 'Shop Under Construction'

export const DEFAULT_SHOP_PAUSED_MESSAGE =
  'Feel free to browse the site while we work on the shop. We will be up soon!'

export const DEFAULT_HOME_LAYOUT: HomeLayoutSettings = {
  sections: [],
  collectionsTitle: 'Shop by collection',
  collectionsLead: 'Browse stickers, sheets, charms, and more.',
  collections: [],
  collectionsEnabled: false,
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  pages: {
    home: true,
    store: true,
    // Temporarily hidden — About.tsx and /about route remain; flip to true when ready.
    about: false,
    contact: true,
  },
  siteOffline: false,
  offlineMessage: DEFAULT_OFFLINE_MESSAGE,
  shoppingPaused: false,
  shoppingPausedTitle: DEFAULT_SHOP_PAUSED_TITLE,
  shoppingPausedMessage: DEFAULT_SHOP_PAUSED_MESSAGE,
  home: { ...DEFAULT_HOME_LAYOUT },
}

export const SITE_SETTINGS_DOC = 'siteSettings/public'

export function createHomeSectionId(prefix = 'section'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export function emptyHomeSection(kind: HomeSectionKind, sourceId = ''): HomeSection {
  return {
    id: createHomeSectionId(kind),
    kind,
    enabled: true,
    sortOrder: 0,
    title: '',
    lead: '',
    showDescription: true,
    sourceId,
    productLimit: 4,
    productIds: [],
  }
}

function parseHomeCollections(data: unknown): HomeCollectionItem[] {
  if (!Array.isArray(data)) return []

  const items: HomeCollectionItem[] = []
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const productTypeId =
      typeof record.productTypeId === 'string' ? record.productTypeId.trim() : ''
    if (!productTypeId) continue

    items.push({
      productTypeId,
      label: typeof record.label === 'string' ? record.label.trim() : '',
      imageUrl: typeof record.imageUrl === 'string' ? record.imageUrl.trim() : '',
      sortOrder: typeof record.sortOrder === 'number' ? record.sortOrder : items.length,
    })
  }

  return items.sort((a, b) => a.sortOrder - b.sortOrder || a.productTypeId.localeCompare(b.productTypeId))
}

function parseProductIds(data: unknown): string[] {
  if (!Array.isArray(data)) return []
  const ids: string[] = []
  for (const entry of data) {
    if (typeof entry !== 'string') continue
    const id = entry.trim()
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

function parseHomeSections(data: unknown): HomeSection[] {
  if (!Array.isArray(data)) return []

  const sections: HomeSection[] = []
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const kind =
      record.kind === 'collections' || record.kind === 'category' || record.kind === 'productType'
        ? record.kind
        : null
    if (!kind) continue

    const id =
      typeof record.id === 'string' && record.id.trim()
        ? record.id.trim()
        : createHomeSectionId(kind)

    const productLimitRaw = Math.round(Number(record.productLimit) || 4)
    sections.push({
      id,
      kind,
      enabled: record.enabled !== false,
      sortOrder: typeof record.sortOrder === 'number' ? record.sortOrder : sections.length,
      title: typeof record.title === 'string' ? record.title.trim() : '',
      lead: typeof record.lead === 'string' ? record.lead.trim() : '',
      showDescription: record.showDescription !== false,
      sourceId: typeof record.sourceId === 'string' ? record.sourceId.trim() : '',
      productLimit: Math.min(24, Math.max(1, productLimitRaw)),
      productIds: parseProductIds(record.productIds),
    })
  }

  return sections.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
}

export function parseHomeLayout(data: unknown): HomeLayoutSettings {
  const record =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {}

  return {
    sections: parseHomeSections(record.sections),
    collectionsEnabled: record.collectionsEnabled === true,
    collectionsTitle:
      typeof record.collectionsTitle === 'string' && record.collectionsTitle.trim()
        ? record.collectionsTitle.trim()
        : DEFAULT_HOME_LAYOUT.collectionsTitle,
    collectionsLead:
      typeof record.collectionsLead === 'string' ? record.collectionsLead.trim() : DEFAULT_HOME_LAYOUT.collectionsLead,
    collections: parseHomeCollections(record.collections),
  }
}

/**
 * Build the effective section list for the storefront.
 * When no sections are saved yet, fall back to legacy category showOnHome + collectionsEnabled.
 */
export function resolveHomeSections(
  home: HomeLayoutSettings,
  categories: Array<{
    id: string
    name: string
    description: string
    showOnHome: boolean
    homeProductLimit: number
    sortOrder: number
  }>,
): HomeSection[] {
  if (home.sections.length > 0) {
    return [...home.sections].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
  }

  const legacy: HomeSection[] = categories
    .filter((category) => category.showOnHome)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((category, index) => ({
      id: `legacy-category-${category.id}`,
      kind: 'category' as const,
      enabled: true,
      sortOrder: index,
      title: '',
      lead: category.description,
      showDescription: true,
      sourceId: category.id,
      productLimit: category.homeProductLimit,
      productIds: [],
    }))

  if (home.collectionsEnabled) {
    legacy.push({
      id: 'legacy-collections',
      kind: 'collections',
      enabled: true,
      sortOrder: legacy.length,
      title: home.collectionsTitle,
      lead: home.collectionsLead,
      showDescription: true,
      sourceId: '',
      productLimit: 4,
      productIds: [],
    })
  }

  return legacy
}

export function serializeHomeLayout(home: HomeLayoutSettings): HomeLayoutSettings {
  const sections = parseHomeSections(home.sections).map((section, index) => ({
    ...section,
    sortOrder: index,
  }))
  const collections = parseHomeCollections(home.collections).map((item, index) => ({
    ...item,
    sortOrder: index,
  }))

  return {
    sections,
    collectionsTitle: home.collectionsTitle.trim() || DEFAULT_HOME_LAYOUT.collectionsTitle,
    collectionsLead: home.collectionsLead.trim(),
    collections,
    collectionsEnabled: sections.some(
      (section) => section.kind === 'collections' && section.enabled,
    ),
  }
}

export function parseSiteSettings(data: Record<string, unknown> | undefined): SiteSettings {
  const pagesInput =
    data?.pages && typeof data.pages === 'object' ?
      (data.pages as Record<string, unknown>)
    : {}

  return {
    pages: {
      home: pagesInput.home !== false,
      store: pagesInput.store !== false,
      // Temporarily force-hidden; keep About.tsx + route. Re-enable with: pagesInput.about !== false
      about: false,
      contact: pagesInput.contact !== false,
    },
    siteOffline: data?.siteOffline === true,
    offlineMessage:
      typeof data?.offlineMessage === 'string' && data.offlineMessage.trim() ?
        data.offlineMessage.trim()
      : DEFAULT_OFFLINE_MESSAGE,
    shoppingPaused: data?.shoppingPaused === true,
    shoppingPausedTitle:
      typeof data?.shoppingPausedTitle === 'string' && data.shoppingPausedTitle.trim()
        ? data.shoppingPausedTitle.trim()
        : DEFAULT_SHOP_PAUSED_TITLE,
    shoppingPausedMessage:
      typeof data?.shoppingPausedMessage === 'string' && data.shoppingPausedMessage.trim()
        ? data.shoppingPausedMessage.trim()
        : DEFAULT_SHOP_PAUSED_MESSAGE,
    home: parseHomeLayout(data?.home),
  }
}

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onSnapshot(
      doc(db, SITE_SETTINGS_DOC),
      (snapshot) => {
        setSettings(parseSiteSettings(snapshot.data()))
        setLoading(false)
      },
      () => {
        setSettings(DEFAULT_SITE_SETTINGS)
        setLoading(false)
      },
    )
  }, [])

  return { settings, loading }
}

export function isPageVisible(settings: SiteSettings, pageId: SitePageId) {
  return settings.pages[pageId] !== false
}
