import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import ProductGallery from '../components/ProductGallery'
import ReviewForm from '../components/ReviewForm'
import StarRating from '../components/StarRating'
import { useCart } from '../context/CartContext'
import { getCategoryName, useCategories } from '../data/categories'
import {
  averageRating,
  formatPrice,
  useProduct,
  useProductReviews,
} from '../data/products'

function formatReviewDate(value: string | null): string {
  if (!value) return ''

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

export default function ProductDetail() {
  const { productId: routeProductId } = useParams()
  const productId = routeProductId
  const { addItem } = useCart()
  const { categories } = useCategories()
  const { product, loading, error } = useProduct(productId)
  const [reviewVersion, setReviewVersion] = useState(0)
  const { reviews, loading: reviewsLoading } = useProductReviews(productId, reviewVersion)
  const rating = averageRating(reviews)
  const categoryName = getCategoryName(categories, product?.category)

  if (loading) {
    return (
      <div className="page">
        <PageHeader title="Loading product…" subtitle="Please wait." />
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="page">
        <PageHeader title="Product not found" subtitle={error ?? 'This item is unavailable.'} />
        <Link to="/store" className="btn btn-primary">
          Back to store
        </Link>
      </div>
    )
  }

  return (
    <div className="page product-detail-page">
      <nav className="product-breadcrumb" aria-label="Breadcrumb">
        <Link to="/store">Store</Link>
        <span aria-hidden="true">/</span>
        <span>{product.name}</span>
      </nav>

      <div className="product-detail-layout">
        <ProductGallery media={product.media} productName={product.name} />

        <section className="product-detail-panel">
          {categoryName && <p className="product-detail-category">{categoryName}</p>}
          <p className="product-detail-eyebrow">Okonani</p>
          <h1>{product.name}</h1>

          {product.description && <p className="product-detail-lead">{product.description}</p>}

          <div className="product-detail-price-row">
            <p className="product-detail-price">{formatPrice(product.priceInCents)}</p>
            {rating != null && (
              <div className="product-detail-rating">
                <StarRating rating={rating} />
                <span>
                  {rating.toFixed(1)} · {reviews.length} review{reviews.length === 1 ? '' : 's'}
                </span>
              </div>
            )}
          </div>

          <button type="button" className="btn btn-primary btn-full" onClick={() => addItem(product)}>
            Add to cart
          </button>

          {product.longDescription && (
            <div className="product-detail-copy">
              <h2>About this product</h2>
              {product.longDescription.split('\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="product-reviews">
        <div className="product-reviews-header">
          <h2>Reviews</h2>
          {rating != null && (
            <div className="product-reviews-summary">
              <StarRating rating={rating} size="sm" />
              <span>
                {rating.toFixed(1)} average from {reviews.length} review{reviews.length === 1 ? '' : 's'}
              </span>
            </div>
          )}
        </div>

        <ReviewForm productId={product.id} onSubmitted={() => setReviewVersion((v) => v + 1)} />

        {reviewsLoading && <p>Loading reviews…</p>}

        {!reviewsLoading && reviews.length === 0 && (
          <p className="product-reviews-empty">No reviews yet. Be the first to share your thoughts.</p>
        )}

        <ul className="product-review-list">
          {reviews.map((review) => (
            <li key={review.id} className="product-review-item">
              <div className="product-review-top">
                <strong>{review.author}</strong>
                <StarRating rating={review.rating} size="sm" />
              </div>
              <p>{review.body}</p>
              {review.createdAt && <time dateTime={review.createdAt}>{formatReviewDate(review.createdAt)}</time>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
