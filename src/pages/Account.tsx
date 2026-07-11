import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import PageSheet from '../components/PageSheet'
import { useAuth } from '../context/AuthContext'
import { formatPrice } from '../data/products'
import { getUserProfile, setNotificationPreference } from '../lib/userApi'
import { getRewardsSummary, redeemPoints, type RewardsSummary } from '../lib/rewardsApi'

export default function Account() {
  const { user, loading: authLoading, logOut } = useAuth()
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [rewards, setRewards] = useState<RewardsSummary | null>(null)
  const [loadingRewards, setLoadingRewards] = useState(true)
  const [saving, setSaving] = useState(false)
  const [redeeming, setRedeeming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadRewards() {
    setLoadingRewards(true)

    try {
      setRewards(await getRewardsSummary())
    } catch {
      setRewards(null)
    } finally {
      setLoadingRewards(false)
    }
  }

  useEffect(() => {
    let ignore = false

    async function loadProfile() {
      if (!user) return

      try {
        const profile = await getUserProfile(user.uid)
        if (!ignore) {
          setNotificationsEnabled(profile?.notificationsEnabled ?? false)
        }
      } finally {
        if (!ignore) setLoadingProfile(false)
      }
    }

    loadProfile()
    loadRewards()

    return () => {
      ignore = true
    }
  }, [user])

  if (authLoading) {
    return (
      <div className="page page-narrow page-account notebook-page">
        <p>Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: '/account' }} />
  }

  async function handleNotificationsChange(enabled: boolean) {
    if (!user?.email) return

    const { uid, email } = user

    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      await setNotificationPreference(uid, email, enabled)
      setNotificationsEnabled(enabled)
      setMessage(enabled ? 'You are subscribed to product updates.' : 'Notifications turned off.')
    } catch {
      setError('Could not update notification preference.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRedeem() {
    setRedeeming(true)
    setError(null)
    setMessage(null)

    try {
      const result = await redeemPoints()
      setMessage(
        `Redeemed ${result.pointsSpent} points for code ${result.code}. Use it at checkout or apply automatically from your cart.`,
      )
      await loadRewards()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not redeem points.')
    } finally {
      setRedeeming(false)
    }
  }

  return (
    <div className="page page-narrow page-account notebook-page">
      <PageHeader title="Your account" subtitle={user.email ?? ''} />

      <PageSheet className="page-stack">
      <section className="account-card">
        <h2>Rewards points</h2>
        <p className="account-copy">
          Earn 1 point per $1 spent when you check out while signed in. Redeem points for Stripe
          coupon codes you can use on future orders.
        </p>

        {loadingRewards ?
          <p className="account-copy">Loading rewards…</p>
        : <>
            <p className="account-points">
              Balance: <strong>{rewards?.points ?? 0} points</strong>
            </p>

            {rewards && (
              <p className="account-copy">
                Redeem {rewards.redeemPointsCost} points for{' '}
                {formatPrice(rewards.redeemDiscountCents)} off your next order.
              </p>
            )}

            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={
                redeeming ||
                !rewards ||
                rewards.points < rewards.redeemPointsCost
              }
              onClick={handleRedeem}
            >
              {redeeming ? 'Redeeming…' : 'Redeem for coupon'}
            </button>

            {rewards && rewards.activeRewards.length > 0 && (
              <div className="account-reward-list">
                <h3>Active coupon codes</h3>
                <ul>
                  {rewards.activeRewards.map((reward) => (
                    <li key={reward.id}>
                      <code>{reward.code}</code> — {formatPrice(reward.discountCents)} off
                    </li>
                  ))}
                </ul>
                <p className="account-copy">
                  These apply automatically from your cart, or enter them at Stripe checkout.
                </p>
              </div>
            )}
          </>
        }
      </section>

      <section className="account-card">
        <h2>Email notifications</h2>
        <p className="account-copy">
          Get notified when new products are added to the store.
        </p>

        <label className="account-toggle">
          <input
            type="checkbox"
            checked={notificationsEnabled}
            disabled={loadingProfile || saving}
            onChange={(e) => handleNotificationsChange(e.target.checked)}
          />
          <span>Notify me about new products</span>
        </label>
      </section>

      {message && <p className="form-success">{message}</p>}
      {error && <p className="form-error">{error}</p>}

      <div className="account-actions">
        <Link to="/store" className="btn btn-outline">
          Continue shopping
        </Link>
        <button type="button" className="btn btn-ghost" onClick={() => logOut()}>
          Log out
        </button>
      </div>
      </PageSheet>
    </div>
  )
}
