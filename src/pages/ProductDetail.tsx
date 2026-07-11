import { Link, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
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

const REVIEWS_PER_PAGE = 5

export default function ProductDetail() {
  const { productId: routeProductId } = useParams()
  const productId = routeProductId
  const { addItem } = useCart()
  const { categories } = useCategories()
  const { product, loading, error } = useProduct(productId)
  const [reviewVersion, setReviewVersion] = useState(0)
  const [reviewPage, setReviewPage] = useState(1)
  const { reviews, loading: reviewsLoading } = useProductReviews(productId, reviewVersion)
  const rating = averageRating(reviews)
  const categoryName = getCategoryName(categories, product?.category)

  const totalReviewPages = Math.max(1, Math.ceil(reviews.length / REVIEWS_PER_PAGE))

  useEffect(() => {
    setReviewPage(1)
  }, [reviewVersion, productId])

  useEffect(() => {
    if (reviewPage > totalReviewPages) {
      setReviewPage(totalReviewPages)
    }
  }, [reviewPage, totalReviewPages])

  const paginatedReviews = reviews.slice(
    (reviewPage - 1) * REVIEWS_PER_PAGE,
    reviewPage * REVIEWS_PER_PAGE,
  )

  if (loading) {
    return (
      <div className="page product-detail-page notebook-page">
        <p className="product-detail-status">Loading product…</p>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="page product-detail-page notebook-page">
        <div className="product-detail-shell">
          <p className="product-detail-status">{error ?? 'This item is unavailable.'}</p>
          <Link to="/store" className="btn btn-primary">
            Back to store
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page product-detail-page notebook-page">
      <nav className="product-breadcrumb" aria-label="Breadcrumb">
        <Link to="/store">Store</Link>
        <span aria-hidden="true">/</span>
        <span>{product.name}</span>
      </nav>

      <div className="product-detail-shell">
        <div className="product-detail-layout">
          <div className="product-detail-gallery-wrap">
            <ProductGallery media={product.media} productName={product.name} />
          </div>

          <section className="product-detail-panel">
            {categoryName && <p className="product-detail-category">{categoryName}</p>}
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

            <div className="product-detail-actions">
              <button type="button" className="btn btn-primary btn-full" onClick={() => addItem(product)}>
                Add to cart
              </button>
            </div>

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

        <section className="product-reviews" aria-labelledby="product-reviews-heading">
          <div className="product-reviews-header">
            <h2 id="product-reviews-heading">Reviews</h2>
            {rating != null && (
              <div className="product-reviews-summary">
                <StarRating rating={rating} size="sm" />
                <span>
                  {rating.toFixed(1)} average from {reviews.length} review{reviews.length === 1 ? '' : 's'}
                </span>
              </div>
            )}
          </div>

          <ReviewForm
            productId={product.id}
            onSubmitted={() => {
              setReviewVersion((v) => v + 1)
              setReviewPage(1)
            }}
          />

          {reviewsLoading && <p className="product-reviews-status">Loading reviews…</p>}

          {!reviewsLoading && reviews.length === 0 && (
            <p className="product-reviews-empty">No reviews yet.</p>
          )}

          {paginatedReviews.length > 0 && (
            <ul className="product-review-list">
              {paginatedReviews.map((review) => (
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
          )}

          {reviews.length > REVIEWS_PER_PAGE && (
            <nav className="product-reviews-pagination" aria-label="Reviews pages">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={reviewPage <= 1}
                onClick={() => setReviewPage((page) => page - 1)}
              >
                Previous
              </button>
              <span className="product-reviews-page-label">
                Page {reviewPage} of {totalReviewPages}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={reviewPage >= totalReviewPages}
                onClick={() => setReviewPage((page) => page + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </section>
      </div>
    </div>
  )
}
