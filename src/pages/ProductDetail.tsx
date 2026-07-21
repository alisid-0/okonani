import { Link, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import ProductGallery from '../components/ProductGallery'
import ProductOptionModal from '../components/ProductOptionModal'
import ReviewForm from '../components/ReviewForm'
import StarRating from '../components/StarRating'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { getCategoryName, useCategories } from '../data/categories'
import {
  availableStock,
  averageRating,
  formatPrice,
  isProductSoldOut,
  useProduct,
  useProductReviews,
} from '../data/products'
import {
  formatSelectedOptions,
  resolveProductOptionGroups,
  type SelectedProductOption,
} from '../data/productOptions'
import { getProductTypeById, useProductTypes } from '../data/productTypes'
import { deleteAdminProductReview } from '../lib/adminApi'
import { deleteOwnProductReview } from '../lib/userApi'

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
  const { user, isAdmin } = useAuth()
  const { addItem, remainingForProduct } = useCart()
  const { categories } = useCategories()
  const { productTypes } = useProductTypes()
  const { product, loading, error } = useProduct(productId)
  const [reviewVersion, setReviewVersion] = useState(0)
  const [reviewPage, setReviewPage] = useState(1)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [lastSelected, setLastSelected] = useState<SelectedProductOption[]>([])
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null)
  const { reviews, loading: reviewsLoading } = useProductReviews(productId, reviewVersion)
  const rating = averageRating(reviews)
  const categoryName = getCategoryName(categories, product?.category)

  const optionGroups = useMemo(() => {
    if (!product) return []
    const productType = getProductTypeById(productTypes, product.productTypeId)
    return resolveProductOptionGroups(product, productType)
  }, [product, productTypes])

  const hasOptions = optionGroups.length > 0
  const totalReviewPages = Math.max(1, Math.ceil(reviews.length / REVIEWS_PER_PAGE))

  useEffect(() => {
    setReviewPage(1)
  }, [reviewVersion, productId])

  useEffect(() => {
    setLastSelected([])
    setOptionsOpen(false)
  }, [productId])

  useEffect(() => {
    if (reviewPage > totalReviewPages) {
      setReviewPage(totalReviewPages)
    }
  }, [reviewPage, totalReviewPages])

  const paginatedReviews = reviews.slice(
    (reviewPage - 1) * REVIEWS_PER_PAGE,
    reviewPage * REVIEWS_PER_PAGE,
  )

  function handleAddToCartClick() {
    if (!product) return
    if (isProductSoldOut(product)) return
    const remaining = remainingForProduct(product)
    if (remaining !== null && remaining < 1) return
    if (hasOptions) {
      setOptionsOpen(true)
      return
    }
    addItem(product)
  }

  function handleOptionsConfirm(selected: SelectedProductOption[]) {
    if (!product) return
    if (isProductSoldOut(product)) return
    const remaining = remainingForProduct(product)
    if (remaining !== null && remaining < 1) return
    setLastSelected(selected)
    addItem(product, selected)
    setOptionsOpen(false)
  }

  async function handleDeleteReview(reviewUserId: string) {
    if (!productId) return
    if (!window.confirm('Delete this review?')) return
    setDeletingReviewId(reviewUserId)
    try {
      if (isAdmin) {
        await deleteAdminProductReview(productId, reviewUserId)
      } else if (user?.uid === reviewUserId) {
        await deleteOwnProductReview(productId, reviewUserId)
      }
      setReviewVersion((v) => v + 1)
    } catch (err) {
      console.error('[ProductDetail] delete review failed', err)
      window.alert(err instanceof Error ? err.message : 'Could not delete review')
    } finally {
      setDeletingReviewId(null)
    }
  }

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

  const lastSelectedLabel = formatSelectedOptions(lastSelected)

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

            {(() => {
              const stock = availableStock(product)
              const soldOut = isProductSoldOut(product)
              const remaining = remainingForProduct(product)
              if (stock === null) return null
              return (
                <p className={`product-detail-stock ${soldOut ? 'is-sold-out' : ''}`}>
                  {soldOut
                    ? 'Sold out'
                    : remaining !== null && remaining < stock
                      ? `${remaining} left to add · ${stock} in stock`
                      : `${stock} in stock`}
                </p>
              )
            })()}

            {hasOptions && (
              <p className="product-detail-options-note">
                This item has options{lastSelectedLabel ? ` · last added: ${lastSelectedLabel}` : ''}.
              </p>
            )}

            <div className="product-detail-actions">
              <button
                type="button"
                className="btn btn-primary btn-full"
                disabled={
                  isProductSoldOut(product) ||
                  (remainingForProduct(product) !== null && remainingForProduct(product)! < 1)
                }
                onClick={handleAddToCartClick}
              >
                {isProductSoldOut(product)
                  ? 'Sold out'
                  : remainingForProduct(product) !== null && remainingForProduct(product)! < 1
                    ? 'Max in cart'
                    : hasOptions
                      ? 'Choose options & add'
                      : 'Add to cart'}
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
              {paginatedReviews.map((review) => {
                const canDelete = isAdmin || user?.uid === review.id
                return (
                  <li key={review.id} className="product-review-item">
                    <div className="product-review-top">
                      <strong>{review.author}</strong>
                      <StarRating rating={review.rating} size="sm" />
                    </div>
                    <p>{review.body}</p>
                    <div className="product-review-meta">
                      {review.createdAt && (
                        <time dateTime={review.createdAt}>{formatReviewDate(review.createdAt)}</time>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={deletingReviewId === review.id}
                          onClick={() => void handleDeleteReview(review.id)}
                        >
                          {deletingReviewId === review.id ? 'Deleting…' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
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

      <ProductOptionModal
        open={optionsOpen}
        productName={product.name}
        basePriceCents={product.priceInCents}
        groups={optionGroups}
        onClose={() => setOptionsOpen(false)}
        onConfirm={handleOptionsConfirm}
      />
    </div>
  )
}
