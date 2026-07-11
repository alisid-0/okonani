import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import PageSheet from '../components/PageSheet'
import { GuestCheckoutGate, GuestRewardsPrompt } from '../components/RewardsPrompt'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { formatPrice, getProductCover } from '../data/products'
import { createCheckoutSession } from '../lib/checkout'
import { getOptionalAuthToken, getRewardsSummary, type RewardsSummary } from '../lib/rewardsApi'

export default function Cart() {
  const { user } = useAuth()
  const { lines, subtotalCents, updateQuantity, removeItem } = useCart()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rewards, setRewards] = useState<RewardsSummary | null>(null)
  const [selectedRewardId, setSelectedRewardId] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [guestGateOpen, setGuestGateOpen] = useState(false)

  useEffect(() => {
    let ignore = false

    async function loadRewards() {
      if (!user) {
        setRewards(null)
        setSelectedRewardId('')
        return
      }

      try {
        const summary = await getRewardsSummary()
        if (!ignore) setRewards(summary)
      } catch {
        if (!ignore) setRewards(null)
      }
    }

    loadRewards()

    return () => {
      ignore = true
    }
  }, [user])

  async function proceedToCheckout() {
    setLoading(true)
    setError(null)

    try {
      const missingStripe = lines.find((line) => !line.product.stripePriceId)
      if (missingStripe) {
        throw new Error(`${missingStripe.product.name} is not available for checkout yet.`)
      }

      const authToken = await getOptionalAuthToken()
      const url = await createCheckoutSession(
        lines.map((line) => ({
          stripePriceId: line.product.stripePriceId!,
          quantity: line.quantity,
        })),
        {
          authToken,
          rewardId: promoCode.trim() ? undefined : selectedRewardId || undefined,
          promotionCode: promoCode.trim() || undefined,
        },
      )
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setLoading(false)
      setGuestGateOpen(false)
    }
  }

  function handleCheckoutClick() {
    setError(null)

    if (!user) {
      setGuestGateOpen(true)
      return
    }

    void proceedToCheckout()
  }

  if (lines.length === 0) {
    return (
      <div className="page cart-page notebook-page">
        <PageHeader title="Shopping cart" subtitle="Your cart is empty." />

        <PageSheet>
        <div className="cart-empty">
          <p>No items in your cart yet.</p>
          <Link to="/store" className="btn btn-primary">
            Continue shopping
          </Link>
        </div>
        </PageSheet>
      </div>
    )
  }

  const selectedReward = rewards?.activeRewards.find((reward) => reward.id === selectedRewardId)
  const potentialPoints = Math.floor(subtotalCents / 100)
  const itemCount = lines.reduce((total, line) => total + line.quantity, 0)

  return (
    <div className="page cart-page notebook-page">
      <PageHeader
        title="Shopping cart"
        subtitle={`${itemCount} item${itemCount === 1 ? '' : 's'} · ${formatPrice(subtotalCents)}`}
      />

      {!user && <GuestRewardsPrompt returnTo="/cart" />}

      <div className="cart-layout">
        <section className="cart-items-panel" aria-label="Cart items">
          <ul className="cart-list">
            {lines.map((line) => {
              const cover = getProductCover(line.product)
              const lineTotal = line.product.priceInCents * line.quantity

              return (
                <li key={line.product.id} className="cart-item">
                  <Link
                    to={`/store/${line.product.id}`}
                    className="cart-item-image"
                    aria-label={`View ${line.product.name}`}
                  >
                    {cover ?
                      <img src={cover} alt="" />
                    : <span className="cart-item-image-placeholder" aria-hidden="true">
                        ✿
                      </span>
                    }
                  </Link>

                  <div className="cart-item-body">
                    <Link to={`/store/${line.product.id}`} className="cart-item-name">
                      {line.product.name}
                    </Link>
                    <p className="cart-item-unit">{formatPrice(line.product.priceInCents)} each</p>
                    <button
                      type="button"
                      className="cart-item-remove"
                      onClick={() => removeItem(line.product.id)}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="cart-item-controls">
                    <div className="cart-qty">
                      <button
                        type="button"
                        className="cart-qty-btn"
                        aria-label={`Decrease quantity of ${line.product.name}`}
                        onClick={() => updateQuantity(line.product.id, Math.max(1, line.quantity - 1))}
                      >
                        −
                      </button>
                      <span className="cart-qty-value">{line.quantity}</span>
                      <button
                        type="button"
                        className="cart-qty-btn"
                        aria-label={`Increase quantity of ${line.product.name}`}
                        onClick={() => updateQuantity(line.product.id, Math.min(99, line.quantity + 1))}
                      >
                        +
                      </button>
                    </div>
                    <p className="cart-item-total">{formatPrice(lineTotal)}</p>
                  </div>
                </li>
              )
            })}
          </ul>

          <Link to="/store" className="cart-continue-link">
            ← Continue shopping
          </Link>
        </section>

        <aside className="cart-summary" aria-label="Order summary">
          <div className="cart-summary-section">
            <div className="cart-summary-row">
              <span>Subtotal</span>
              <strong>{formatPrice(subtotalCents)}</strong>
            </div>
            <p className="cart-summary-note">Tax and shipping calculated at Stripe checkout.</p>
          </div>

          <div className="cart-summary-section">
            <label className="cart-summary-label" htmlFor="cart-promo-code">
              Promo code
            </label>
            <input
              id="cart-promo-code"
              className="cart-promo-input"
              type="text"
              value={promoCode}
              onChange={(e) => {
                setPromoCode(e.target.value.toUpperCase())
                if (e.target.value.trim()) setSelectedRewardId('')
              }}
              placeholder="Enter code"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {user && (
            <div className="cart-summary-section cart-summary-rewards">
              <p className="cart-summary-rewards-line">
                <span>{rewards?.points ?? 0} points</span>
                <span aria-hidden="true">·</span>
                <span>Earn ~{potentialPoints} this order</span>
              </p>

              {rewards && rewards.activeRewards.length > 0 && !promoCode.trim() && (
                <label className="cart-reward-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedRewardId)}
                    onChange={(e) =>
                      setSelectedRewardId(
                        e.target.checked ? (rewards.activeRewards[0]?.id ?? '') : '',
                      )
                    }
                  />
                  <span>
                    Apply{' '}
                    <strong>{selectedReward?.code ?? rewards.activeRewards[0]?.code}</strong> (
                    {formatPrice(selectedReward?.discountCents ?? rewards.activeRewards[0]?.discountCents ?? 0)}{' '}
                    off)
                  </span>
                </label>
              )}

              {rewards && rewards.points < rewards.redeemPointsCost && (
                <p className="cart-summary-note">
                  <Link to="/account">Redeem points</Link> for coupons at {rewards.redeemPointsCost}{' '}
                  points.
                </p>
              )}
            </div>
          )}

          {error && <p className="form-error">{error}</p>}

          <button
            type="button"
            className="btn btn-primary btn-full cart-checkout-btn"
            disabled={loading}
            onClick={handleCheckoutClick}
          >
            {loading ? 'Redirecting…' : 'Checkout'}
          </button>
        </aside>
      </div>

      <GuestCheckoutGate
        open={guestGateOpen}
        loading={loading}
        onClose={() => setGuestGateOpen(false)}
        onContinue={() => void proceedToCheckout()}
      />
    </div>
  )
}
