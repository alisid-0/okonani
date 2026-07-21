import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'

export type SitePageId = 'home' | 'store' | 'about' | 'contact'

export type SiteSettings = {
  pages: Record<SitePageId, boolean>
  siteOffline: boolean
  offlineMessage: string
  shoppingPaused: boolean
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

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  pages: {
    home: true,
    store: true,
    about: true,
    contact: true,
  },
  siteOffline: false,
  offlineMessage: DEFAULT_OFFLINE_MESSAGE,
  shoppingPaused: false,
}

export const SITE_SETTINGS_DOC = 'siteSettings/public'

export function parseSiteSettings(data: Record<string, unknown> | undefined): SiteSettings {
  const pagesInput =
    data?.pages && typeof data.pages === 'object' ?
      (data.pages as Record<string, unknown>)
    : {}

  return {
    pages: {
      home: pagesInput.home !== false,
      store: pagesInput.store !== false,
      about: pagesInput.about !== false,
      contact: pagesInput.contact !== false,
    },
    siteOffline: data?.siteOffline === true,
    offlineMessage:
      typeof data?.offlineMessage === 'string' && data.offlineMessage.trim() ?
        data.offlineMessage.trim()
      : DEFAULT_OFFLINE_MESSAGE,
    shoppingPaused: data?.shoppingPaused === true,
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
