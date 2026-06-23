import { Link } from 'react-router-dom'

type RewardsPromptProps = {
  returnTo?: string
  compact?: boolean
}

export function GuestRewardsPrompt({ returnTo = '/cart', compact = false }: RewardsPromptProps) {
  return (
    <aside className={`rewards-prompt ${compact ? 'rewards-prompt-compact' : ''}`}>
      <p className="rewards-prompt-eyebrow">Okonani rewards</p>
      <h2 className="rewards-prompt-title">
        {compact ? 'Sign in to earn points' : 'Sign in to earn & redeem points'}
      </h2>
      <ul className="rewards-prompt-list">
        <li>Earn <strong>1 point per $1</strong> spent on every order</li>
        <li>Redeem <strong>100 points</strong> for <strong>$5 off</strong> your next purchase</li>
        <li>Apply reward coupons automatically at checkout</li>
      </ul>
      <div className="rewards-prompt-actions">
        <Link to="/login" state={{ from: returnTo }} className="btn btn-primary btn-sm">
          Sign in
        </Link>
        <Link to="/login" state={{ from: returnTo }} className="btn btn-outline btn-sm">
          Create account
        </Link>
      </div>
    </aside>
  )
}

type GuestCheckoutGateProps = {
  open: boolean
  loading: boolean
  onClose: () => void
  onContinue: () => void
}

export function GuestCheckoutGate({ open, loading, onClose, onContinue }: GuestCheckoutGateProps) {
  if (!open) return null

  return (
    <div className="rewards-checkout-gate" role="dialog" aria-modal="true" aria-labelledby="rewards-gate-title">
      <div className="rewards-checkout-gate-panel">
        <h2 id="rewards-gate-title">Sign in before checkout?</h2>
        <p>
          Members earn points on every purchase and can redeem them for Stripe coupon codes. Guest
          checkout is still available if you prefer.
        </p>
        <ul className="rewards-prompt-list">
          <li>1 point per $1 spent</li>
          <li>100 points = $5 off a future order</li>
        </ul>
        <div className="rewards-checkout-gate-actions">
          <Link to="/login" state={{ from: '/cart' }} className="btn btn-primary">
            Sign in to earn points
          </Link>
          <button type="button" className="btn btn-outline" disabled={loading} onClick={onContinue}>
            {loading ? 'Redirecting…' : 'Continue as guest'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Back to cart
          </button>
        </div>
      </div>
    </div>
  )
}
