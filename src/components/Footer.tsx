import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <p className="footer-brand">okonani</p>
        <p className="footer-copy">&copy; {new Date().getFullYear()} okonani. All rights reserved.</p>
        <nav className="footer-nav" aria-label="Footer">
          <Link to="/store">Store</Link>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
        </nav>
      </div>
    </footer>
  )
}
