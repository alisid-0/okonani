import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import PageSheet from '../components/PageSheet'

export default function CheckoutCancel() {
  return (
    <div className="page page-narrow">
      <PageHeader title="Checkout canceled" subtitle="No payment was made." />

      <PageSheet className="page-stack">
        <p className="content-block">Your cart is still saved. You can try again when you are ready.</p>

        <div className="checkout-actions">
          <Link to="/cart" className="btn btn-primary">
            Back to cart
          </Link>
          <Link to="/store" className="btn btn-ghost">
            Continue shopping
          </Link>
        </div>
      </PageSheet>
    </div>
  )
}
