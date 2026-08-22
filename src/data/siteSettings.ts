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

export type HomeLayoutSettings = {
  collectionsEnabled: boolean
  collectionsTitle: string
  collectionsLead: string
  collections: HomeCollectionItem[]
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
  collectionsEnabled: false,
  collectionsTitle: 'Shop by collection',
  collectionsLead: 'Browse stickers, sheets, charms, and more.',
  collections: [],
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

export function parseHomeLayout(data: unknown): HomeLayoutSettings {
  const record =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {}

  return {
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
