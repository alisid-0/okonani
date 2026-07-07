import { Outlet, useLocation } from 'react-router-dom'

import SiteOffline from './SiteOffline'

import Footer from './Footer'

import Header from './Header'

import { useSiteSettings } from '../data/siteSettings'



export default function Layout() {

  const { pathname } = useLocation()

  const { settings, loading } = useSiteSettings()

  const isHome = pathname === '/'

  const isScrapbook =

    pathname === '/store' ||

    pathname === '/about' ||

    pathname === '/contact' ||

    pathname === '/socials'



  if (!loading && settings.siteOffline) {

    return <SiteOffline message={settings.offlineMessage} />

  }



  return (

    <div className="site">

      <Header />

      <main

        className={`main${isHome ? ' main-home' : ''}${isScrapbook ? ' main-scrapbook' : ''}`}

      >

        <Outlet />

      </main>

      <Footer />

    </div>

  )

}

