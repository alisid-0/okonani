import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import PageSheet from '../components/PageSheet'
import { GuestCheckoutGate, GuestRewardsPrompt } from '../components/RewardsPrompt'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useShopPause } from '../context/ShopPauseContext'
import { formatPrice, getProductCover, maxOrderQuantity } from '../data/products'
import { formatSelectedOptions, unitPriceWithOptions } from '../data/productOptions'
import {
  amountUntilFreeShipping,
  qualifiesForFreeShipping,
} from '../lib/freeShipping'
import { Price, ReadableNumbers } from '../lib/readableNumbers'
import { useFreeShippingThresholdCents } from '../lib/useFreeShippingThreshold'
import ProtectedImage from '../components/ProtectedImage'
import { getRewardsSummary, type RewardsSummary } from '../lib/rewardsApi'
import { uiClick } from '../lib/uiSounds'

export default function Cart() {
  const { user } = useAuth()
  const { lines, subtotalCents, updateQuantity, removeItem, quantityForProduct } = useCart()
  const freeShippingThresholdCents = useFreeShippingThresholdCents()
  const { shoppingPaused, showPausedModal } = useShopPause()
  const navigate = useNavigate()
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

    void loadRewards()

    return () => {
      ignore = true
    }
  }, [user])

  function goToCheckout() {
    setError(null)

    const missingStripe = lines.find((line) => !line.product.stripePriceId)
    if (missingStripe) {
      setError(`${missingStripe.product.name} is not available for checkout yet.`)
      setGuestGateOpen(false)
      return
    }

    setLoading(true)
    navigate('/checkout', {
      state: {
        promotionCode: promoCode.trim() || undefined,
        rewardId: promoCode.trim() ? undefined : selectedRewardId || undefined,
      },
    })
    setLoading(false)
    setGuestGateOpen(false)
  }

  function handleCheckoutClick() {
    setError(null)
    uiClick('tap')

    if (shoppingPaused) {
      showPausedModal()
      return
    }

    if (!user) {
      setGuestGateOpen(true)
      return
    }

    goToCheckout()
  }

  if (lines.length === 0) {
    return (
      <div className="page cart-page notebook-page">
        <PageHeader title="Shopping cart" subtitle="Your cart is empty." />

        <PageSheet>
          <div className="cart-empty">
            <p>No items in your cart yet.</p>
            <Link to="/store" className="btn btn-primary" onClick={() => uiClick('soft')}>
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
  const freeShipping = qualifiesForFreeShipping(subtotalCents, freeShippingThresholdCents)
  const untilFreeShipping = amountUntilFreeShipping(subtotalCents, freeShippingThresholdCents)

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
              const unitCents = unitPriceWithOptions(line.product.priceInCents, line.selectedOptions)
              const lineTotal = unitCents * line.quantity
              const optionsLabel = formatSelectedOptions(line.selectedOptions)
              const maxForProduct = maxOrderQuantity(line.product)
              const usedElsewhere = quantityForProduct(line.product.id, line.lineKey)
              const maxForLine = Math.max(0, maxForProduct - usedElsewhere)
              const atStockMax = line.product.trackStock === true && line.quantity >= maxForLine

              return (
                <li key={line.lineKey} className="cart-item">
                  <Link
                    to={`/store/${line.product.id}`}
                    className="cart-item-image"
                    aria-label={`View ${line.product.name}`}
                  >
                    {cover ?
                      <ProtectedImage src={cover} alt="" />
                    : <span className="cart-item-image-placeholder" aria-hidden="true">
                        ✿
                      </span>
                    }
                  </Link>

                  <div className="cart-item-body">
                    <Link to={`/store/${line.product.id}`} className="cart-item-name">
                      {line.product.name}
                    </Link>
                    {optionsLabel && <p className="cart-item-options">{optionsLabel}</p>}
                    <p className="cart-item-unit">
                      <Price cents={unitCents} /> each
                    </p>
                    {line.product.trackStock === true && (
                      <p className="cart-item-stock">
                        {maxForProduct <= 0 ? 'Sold out' : `${maxForProduct} in stock`}
                      </p>
                    )}
                    <button
                      type="button"
                      className="cart-item-remove"
                      onClick={() => removeItem(line.lineKey)}
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
                        onClick={() => updateQuantity(line.lineKey, Math.max(1, line.quantity - 1))}
                      >
                        −
                      </button>
                      <span className="cart-qty-value">{line.quantity}</span>
                      <button
                        type="button"
                        className="cart-qty-btn"
                        aria-label={`Increase quantity of ${line.product.name}`}
                        disabled={atStockMax}
                        onClick={() =>
                          updateQuantity(line.lineKey, Math.min(maxForLine, line.quantity + 1))
                        }
                      >
                        +
                      </button>
                    </div>
                    <p className="cart-item-total">
                      <Price cents={lineTotal} />
                    </p>
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
              <strong>
                <Price cents={subtotalCents} />
              </strong>
            </div>
            <div className="cart-summary-row">
              <span>Shipping</span>
              <strong>{freeShipping ? 'Free' : 'Calculated at checkout'}</strong>
            </div>
            <p className="cart-summary-note">
              {freeShipping ?
                'Your order qualifies for free shipping. Choose Untracked letter or Bubble mailer at checkout.'
              : <>
                  Free shipping on orders over <Price cents={freeShippingThresholdCents} />.
                  {untilFreeShipping > 0 && (
                    <>
                      {' '}
                      Add <Price cents={untilFreeShipping} /> more to qualify.
                    </>
                  )}
                </>
              }
            </p>
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
                <span>
                  <ReadableNumbers text={`${rewards?.points ?? 0}`} /> points
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Earn ~<ReadableNumbers text={String(potentialPoints)} /> this order
                </span>
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
                    <Price
                      cents={
                        selectedReward?.discountCents ?? rewards.activeRewards[0]?.discountCents ?? 0
                      }
                    />{' '}
                    off)
                  </span>
                </label>
              )}

              {rewards && rewards.points < rewards.redeemPointsCost && (
                <p className="cart-summary-note">
                  <Link to="/account">Redeem points</Link> for coupons at{' '}
                  <ReadableNumbers text={String(rewards.redeemPointsCost)} /> points.
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
            {loading ? 'Opening…' : 'Checkout'}
          </button>
        </aside>
      </div>

      <GuestCheckoutGate
        open={guestGateOpen}
        loading={loading}
        onClose={() => setGuestGateOpen(false)}
        onContinue={() => goToCheckout()}
      />
    </div>
  )
}
