import { type FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { hasPurchasedProduct, submitProductReview } from '../lib/userApi'
import { playUiSound, uiClick } from '../lib/uiSounds'

type ReviewFormProps = {
  productId: string
  onSubmitted: () => void
}

export default function ReviewForm({ productId, onSubmitted }: ReviewFormProps) {
  const { user } = useAuth()
  const [rating, setRating] = useState(5)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [purchaseLoading, setPurchaseLoading] = useState(true)
  const [hasPurchased, setHasPurchased] = useState(false)

  useEffect(() => {
    let ignore = false

    async function loadPurchaseStatus() {
      if (!user) {
        if (!ignore) {
          setHasPurchased(false)
          setPurchaseLoading(false)
        }
        return
      }

      setPurchaseLoading(true)

      try {
        const purchased = await hasPurchasedProduct(user.uid, productId)
        if (!ignore) setHasPurchased(purchased)
      } catch {
        if (!ignore) setHasPurchased(false)
      } finally {
        if (!ignore) setPurchaseLoading(false)
      }
    }

    loadPurchaseStatus()

    return () => {
      ignore = true
    }
  }, [user, productId])

  if (!user) {
    return (
      <p className="product-review-signin">
        <Link to="/login" state={{ from: `/store/${productId}` }} onClick={() => uiClick('tap')}>
          Sign in
        </Link>{' '}
        to leave a review after you purchase this item.
      </p>
    )
  }

  if (purchaseLoading) {
    return <p className="product-review-signin">Checking purchase history…</p>
  }

  if (!hasPurchased) {
    return (
      <p className="product-review-purchase-note">
        Only customers who have purchased this item can leave a review.
      </p>
    )
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!user) return

    setSaving(true)
    setError(null)

    const author = user.displayName || user.email?.split('@')[0] || 'Customer'

    try {
      await submitProductReview(productId, user.uid, { author, rating, body })
      setBody('')
      setRating(5)
      onSubmitted()
      playUiSound('success')
    } catch {
      setError('Could not submit review. Please try again.')
      playUiSound('soft')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="review-form" onSubmit={handleSubmit}>
      <h3>Leave a review</h3>
      <label>
        Rating
        <select value={rating} onChange={(e) => setRating(Number.parseInt(e.target.value, 10))}>
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>
              {value} star{value === 1 ? '' : 's'}
            </option>
          ))}
        </select>
      </label>
      <label>
        Your review
        <textarea
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What did you think of this product?"
          required
          minLength={3}
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
        {saving ? 'Submitting…' : 'Submit review'}
      </button>
    </form>
  )
}
