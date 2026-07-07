import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import {
  isPageVisible,
  SITE_NAV_PAGES,
  type SitePageId,
  useSiteSettings,
} from '../data/siteSettings'

type RequireVisiblePageProps = {
  pageId: SitePageId
  children: ReactNode
}

export default function RequireVisiblePage({ pageId, children }: RequireVisiblePageProps) {
  const { settings, loading } = useSiteSettings()

  if (loading) {
    return <p className="page-loader">Loading…</p>
  }

  if (!isPageVisible(settings, pageId)) {
    const fallback = SITE_NAV_PAGES.find(
      (page) => page.id !== pageId && isPageVisible(settings, page.id),
    )
    return <Navigate to={fallback?.to ?? '/'} replace />
  }

  return children
}
