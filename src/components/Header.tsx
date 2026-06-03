import { NavLink } from 'react-router-dom'
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

export default function Header() {
  const { itemCount } = useCart()

  return (
    <header className="header">
      <div className="header-inner">
        <NavLink to="/" className="logo">
          okonani
        </NavLink>

        <div className="header-bar">
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/store" className={navLinkClass}>
              Store
            </NavLink>
            <NavLink to="/about" className={navLinkClass}>
              About
            </NavLink>
            <NavLink to="/contact" className={navLinkClass}>
              Contact
            </NavLink>
          </nav>

          <div className="header-actions">
            <NavLink
              to="/cart"
              className={iconLinkClass}
              aria-label={itemCount > 0 ? `Cart, ${itemCount} items` : 'Cart'}
            >
              <CartIcon />
              {itemCount > 0 && <span className="icon-badge">{itemCount}</span>}
            </NavLink>
            <NavLink to="/login" className={iconLinkClass} aria-label="Log in">
              <LoginIcon />
            </NavLink>
          </div>
        </div>
      </div>
    </header>
  )
}
