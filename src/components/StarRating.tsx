type StarRatingProps = {
  rating: number
  max?: number
  size?: 'sm' | 'md'
}

export default function StarRating({ rating, max = 5, size = 'md' }: StarRatingProps) {
  const rounded = Math.max(0, Math.min(max, rating))

  return (
    <div className={`star-rating star-rating-${size}`} aria-label={`${rounded.toFixed(1)} out of ${max} stars`}>
      {Array.from({ length: max }, (_, index) => (
        <span key={index} className={`star-rating-star ${index < Math.round(rounded) ? 'is-filled' : ''}`}>
          ★
        </span>
      ))}
    </div>
  )
}
