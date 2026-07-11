import { Outlet, useLocation } from 'react-router-dom'

import SiteOffline from './SiteOffline'

import Footer from './Footer'

import Header from './Header'

import { useSiteSettings } from '../data/siteSettings'

export default function Layout() {
  const { pathname } = useLocation()
  const { settings, loading } = useSiteSettings()
  const isAdminRoute = pathname.startsWith('/admin')
  const isHome = pathname === '/'

  const mainClassName = [
    'main',
    isHome && 'main-home',
    !isAdminRoute && !isHome && 'main-notebook',
  ]
    .filter(Boolean)
    .join(' ')

  if (!loading && settings.siteOffline) {
    return <SiteOffline message={settings.offlineMessage} />
  }

  return (
    <div className="site">
      <Header />

      <main className={mainClassName}>
        <Outlet />
      </main>

      <Footer />
    </div>
  )
}
