import { useCallback, useMemo, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { useCart } from '../context/CartContext'
import { createCheckoutSession, updateCheckoutShipping } from '../lib/checkout'
import { getOptionalAuthToken } from '../lib/rewardsApi'

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() || ''
const stripePromise = publishableKey ? loadStripe(publishableKey) : null

type CheckoutLocationState = {
  promotionCode?: string
  rewardId?: string
}

export default function Checkout() {
  const { lines, clearCart } = useCart()
  const location = useLocation()
  const state = (location.state || {}) as CheckoutLocationState
  const [error, setError] = useState<string | null>(null)

  const items = useMemo(
    () =>
      lines
        .filter((line) => line.product.stripePriceId)
        .map((line) => ({
          stripePriceId: line.product.stripePriceId!,
          quantity: line.quantity,
        })),
    [lines],
  )

  const fetchClientSecret = useCallback(async () => {
    setError(null)
    try {
      const authToken = await getOptionalAuthToken()
      const session = await createCheckoutSession(items, {
        authToken,
        promotionCode: state.promotionCode,
        rewardId: state.rewardId,
      })
      return session.clientSecret
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start checkout'
      setError(message)
      throw err
    }
  }, [items, state.promotionCode, state.rewardId])

  const onShippingDetailsChange = useCallback(
    async (event: { checkoutSessionId: string; shippingDetails: unknown }) => {
      const result = await updateCheckoutShipping({
        checkoutSessionId: event.checkoutSessionId,
        shippingDetails: event.shippingDetails,
      })

      if (result.type === 'error') {
        return {
          type: 'reject' as const,
          errorMessage: result.message || 'Could not calculate shipping for that address.',
        }
      }

      return { type: 'accept' as const }
    },
    [],
  )

  const options = useMemo(
    () => ({
      fetchClientSecret,
      onShippingDetailsChange,
      onComplete: () => {
        clearCart()
      },
    }),
    [fetchClientSecret, onShippingDetailsChange, clearCart],
  )

  if (lines.length === 0) {
    return <Navigate to="/cart" replace />
  }

  if (!publishableKey || !stripePromise) {
    return (
      <div className="checkout-shell">
        <header className="checkout-shell-bar">
          <Link to="/cart" className="checkout-shell-back">
            ← Cart
          </Link>
          <Link to="/" className="checkout-shell-brand">
            okonani
          </Link>
          <span className="checkout-shell-spacer" aria-hidden="true" />
        </header>
        <div className="checkout-shell-body">
          <p className="form-error">
            Add <code>VITE_STRIPE_PUBLISHABLE_KEY</code> to your root <code>.env</code>, then restart
            the dev server.
          </p>
        </div>
      </div>
    )
  }

  if (items.length !== lines.length) {
    return (
      <div className="checkout-shell">
        <header className="checkout-shell-bar">
          <Link to="/cart" className="checkout-shell-back">
            ← Cart
          </Link>
          <Link to="/" className="checkout-shell-brand">
            okonani
          </Link>
          <span className="checkout-shell-spacer" aria-hidden="true" />
        </header>
        <div className="checkout-shell-body">
          <p className="form-error">
            Every cart item needs a Stripe price. Remove unavailable items or sync them in Admin.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="checkout-shell">
      <header className="checkout-shell-bar">
        <Link to="/cart" className="checkout-shell-back">
          ← Cart
        </Link>
        <Link to="/" className="checkout-shell-brand">
          okonani
        </Link>
        <span className="checkout-shell-spacer" aria-hidden="true" />
      </header>

      {error && (
        <p className="form-error checkout-shell-error" role="alert">
          {error}
        </p>
      )}

      <div className="checkout-shell-body">
        <div className="checkout-embed" id="checkout">
          <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
            <EmbeddedCheckout className="checkout-embed-frame" />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    </div>
  )
}
