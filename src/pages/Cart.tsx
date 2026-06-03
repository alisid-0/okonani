import { useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { useCart } from '../context/CartContext'
import { formatPrice } from '../data/products'
import { createCheckoutSession } from '../lib/checkout'

export default function Cart() {
  const { lines, subtotalCents, updateQuantity, removeItem } = useCart()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCheckout() {
    setLoading(true)
    setError(null)

    try {
      const url = await createCheckoutSession(
        lines.map((line) => ({ id: line.product.id, quantity: line.quantity })),
      )
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setLoading(false)
    }
  }

  if (lines.length === 0) {
    return (
      <div className="page">
        <PageHeader title="Shopping cart" subtitle="Your cart is empty." />

        <div className="cart-empty">
          <p>No items in your cart yet.</p>
          <Link to="/store" className="btn btn-primary">
            Continue shopping
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader title="Shopping cart" subtitle={`${lines.length} item(s) in your cart.`} />

      <ul className="cart-list">
        {lines.map((line) => (
          <li key={line.product.id} className="cart-item">
            <div className="cart-item-info">
              <h2>{line.product.name}</h2>
              <p>{formatPrice(line.product.priceInCents)} each</p>
            </div>

            <div className="cart-item-actions">
              <label className="qty-label">
                Qty
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={line.quantity}
                  onChange={(e) =>
                    updateQuantity(line.product.id, Number.parseInt(e.target.value, 10) || 1)
                  }
                />
              </label>
              <p className="cart-line-total">
                {formatPrice(line.product.priceInCents * line.quantity)}
              </p>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => removeItem(line.product.id)}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="cart-footer">
        <p className="cart-subtotal">
          Subtotal <strong>{formatPrice(subtotalCents)}</strong>
        </p>
        <p className="cart-note">Tax and shipping calculated at checkout (Stripe).</p>

        {error && <p className="form-error">{error}</p>}

        <button
          type="button"
          className="btn btn-primary"
          disabled={loading}
          onClick={handleCheckout}
        >
          {loading ? 'Redirecting…' : 'Checkout with Stripe'}
        </button>
      </div>
    </div>
  )
}
