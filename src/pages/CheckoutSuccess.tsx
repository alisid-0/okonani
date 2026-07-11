import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import PageSheet from '../components/PageSheet'
import { GuestRewardsPrompt } from '../components/RewardsPrompt'
import { formatPrice } from '../data/products'
import { useCart } from '../context/CartContext'
import { getCheckoutSession } from '../lib/checkout'

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const { clearCart } = useCart()
  const [details, setDetails] = useState<Awaited<ReturnType<typeof getCheckoutSession>> | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return

    getCheckoutSession(sessionId)
      .then((data) => {
        setDetails(data)
        if (data.paymentStatus === 'paid') clearCart()
      })
      .catch(() => setError('We could not confirm your order. Contact support if you were charged.'))
  }, [sessionId, clearCart])

  return (
    <div className="page page-narrow notebook-page">
      <PageHeader title="Thank you" subtitle="Your payment was received." />

      <PageSheet className="page-stack">
      {error && <p className="form-error">{error}</p>}

      {details && (
        <div className="checkout-summary">
          {details.email && <p>Confirmation sent to {details.email}</p>}
          {details.amountTotal != null && (
            <p className="checkout-total">Total paid: {formatPrice(details.amountTotal)}</p>
          )}
          {details.earnedPoints && details.pointsEarned > 0 && (
            <p className="form-success">
              You earned {details.pointsEarned} rewards point
              {details.pointsEarned === 1 ? '' : 's'}.
            </p>
          )}
        </div>
      )}

      {details && details.paymentStatus === 'paid' && !details.earnedPoints && (
        <GuestRewardsPrompt returnTo="/store" compact />
      )}

      <Link to="/store" className="btn btn-primary">
        Continue shopping
      </Link>
      </PageSheet>
    </div>
  )
}
