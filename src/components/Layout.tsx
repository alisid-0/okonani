import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'

export default function Layout() {
  const { pathname } = useLocation()
  const isHome = pathname === '/'

  return (
    <div className="site">
      <Header />
      <main className={`main${isHome ? ' main-home' : ''}`}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
