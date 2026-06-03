import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'

export default function CheckoutCancel() {
  return (
    <div className="page page-narrow">
      <PageHeader title="Checkout canceled" subtitle="No payment was made." />

      <p className="content-block">Your cart is still saved. You can try again when you are ready.</p>

      <div className="hero-actions">
        <Link to="/cart" className="btn btn-primary">
          Back to cart
        </Link>
        <Link to="/store" className="btn btn-ghost">
          Continue shopping
        </Link>
      </div>
    </div>
  )
}
