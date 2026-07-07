import { Link } from 'react-router-dom'
import { SITE_NAV_PAGES, useSiteSettings } from '../data/siteSettings'

export default function Footer() {
  const { settings } = useSiteSettings()
  const visiblePages = SITE_NAV_PAGES.filter(
    (page) => page.id !== 'home' && settings.pages[page.id],
  )

  return (
    <footer className="footer">
      <div className="footer-inner">
        <p className="footer-brand">okonani</p>
        <p className="footer-copy">&copy; {new Date().getFullYear()} okonani. All rights reserved.</p>
        {visiblePages.length > 0 && (
          <nav className="footer-nav" aria-label="Footer">
            {visiblePages.map((page) => (
              <Link key={page.id} to={page.to}>
                {page.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </footer>
  )
}
