import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import logoMark from '../assets/hero/Untitled_Artwork(3).png'
import { SITE_NAV_PAGES, useSiteSettings } from '../data/siteSettings'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'nav-link active' : 'nav-link'

const iconLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'icon-link active' : 'icon-link'

function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6h15l-1.5 9h-12L6 6Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M6 6 5 3H2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="19" r="1.25" fill="currentColor" />
      <circle cx="17.5" cy="19" r="1.25" fill="currentColor" />
    </svg>
  )
}

function LoginIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M5 20c0-3.314 3.134-6 7-6s7 2.686 7 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MenuIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { itemCount } = useCart()
  const { user } = useAuth()
  const { settings } = useSiteSettings()

  const visiblePages = SITE_NAV_PAGES.filter((page) => settings.pages[page.id])

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <header className="header">
      <div className="header-inner">
        <NavLink to="/" className="logo" onClick={closeMenu}>
          <img
            src={logoMark}
            alt="okonani home"
            className="logo-mark"
            width={320}
            height={128}
            decoding="async"
          />
        </NavLink>

        <div className="header-nav-row">
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={menuOpen}
            aria-controls="site-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MenuIcon open={menuOpen} />
          </button>

          <nav
            id="site-nav"
            className={`nav ${menuOpen ? 'is-open' : ''}`}
            aria-label="Main"
            onClick={closeMenu}
          >
            {visiblePages.map((page) => (
              <NavLink key={page.id} to={page.to} end={page.end} className={navLinkClass}>
                {page.label}
              </NavLink>
            ))}
          </nav>

          <div className="header-actions">
            <NavLink
              to="/cart"
              className={iconLinkClass}
              aria-label={itemCount > 0 ? `Cart, ${itemCount} items` : 'Cart'}
              onClick={closeMenu}
            >
              <CartIcon />
              {itemCount > 0 && <span className="icon-badge">{itemCount}</span>}
            </NavLink>
            <NavLink
              to={user ? '/account' : '/login'}
              className={iconLinkClass}
              aria-label={user ? 'Your account' : 'Sign in'}
              onClick={closeMenu}
            >
              <LoginIcon />
            </NavLink>
          </div>
        </div>
      </div>
    </header>
  )
}
