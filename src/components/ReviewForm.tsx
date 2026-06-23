import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { submitProductReview } from '../lib/userApi'

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

  if (!user) {
    return (
      <p className="product-review-signin">
        <Link to="/login" state={{ from: `/store/${productId}` }}>
          Sign in
        </Link>{' '}
        to leave a review.
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
    } catch {
      setError('Could not submit review. Please try again.')
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
