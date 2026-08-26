import { Link, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import ProductGallery from '../components/ProductGallery'
import ProductOptionTiles from '../components/ProductOptionTiles'
import ReviewForm from '../components/ReviewForm'
import StarRating from '../components/StarRating'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { getCategoryName, useCategories } from '../data/categories'
import {
  availableStock,
  averageRating,
  indexOfMediaId,
  isProductSoldOut,
  useProduct,
  useProductReviews,
} from '../data/products'
import { Price, ReadableNumbers } from '../lib/readableNumbers'
import {
  buildSelectedOptions,
  formatSelectedOptions,
  resolveProductOptionGroups,
  unitPriceWithOptions,
  validateSelectedOptions,
  type ProductOptionChoice,
  type SelectedProductOption,
} from '../data/productOptions'
import { getProductTypeById, useProductTypes } from '../data/productTypes'
import { deleteAdminProductReview } from '../lib/adminApi'
import { deleteOwnProductReview } from '../lib/userApi'
import { playUiSound, uiClick } from '../lib/uiSounds'

function formatReviewDate(value: string | null): string {
  if (!value) return ''

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

const REVIEWS_PER_PAGE = 5
const EMPTY_SELECTION: Record<string, string> = {}

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
  const [selectedByGroupId, setSelectedByGroupId] =
    useState<Record<string, string>>(EMPTY_SELECTION)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [optionsError, setOptionsError] = useState<string | null>(null)
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

  const selected = useMemo(
    () => buildSelectedOptions(optionGroups, selectedByGroupId),
    [optionGroups, selectedByGroupId],
  )
  const displayPriceCents = product
    ? unitPriceWithOptions(product.priceInCents, selected)
    : 0

  useEffect(() => {
    setReviewPage(1)
  }, [reviewVersion, productId])

  useEffect(() => {
    setLastSelected([])
    setSelectedByGroupId(EMPTY_SELECTION)
    setOptionsError(null)
    setGalleryIndex(0)
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

  function handleSelectChoice(groupId: string, choiceId: string, choice: ProductOptionChoice) {
    setSelectedByGroupId((prev) => ({ ...prev, [groupId]: choiceId }))
    setOptionsError(null)
    if (!product) return
    const linkedIndex = indexOfMediaId(product.media, choice.linkedMediaId)
    if (linkedIndex >= 0) setGalleryIndex(linkedIndex)
  }

  function handleAddToCartClick() {
    if (!product) return
    if (isProductSoldOut(product)) return
    const remaining = remainingForProduct(product)
    if (remaining !== null && remaining < 1) return

    if (hasOptions) {
      const validationError = validateSelectedOptions(optionGroups, selectedByGroupId)
      if (validationError) {
        setOptionsError(validationError)
        playUiSound('soft')
        return
      }
      const nextSelected = buildSelectedOptions(optionGroups, selectedByGroupId)
      setLastSelected(nextSelected)
      addItem(product, nextSelected)
      return
    }

    addItem(product)
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
      playUiSound('success')
    } catch (err) {
      console.error('[ProductDetail] delete review failed', err)
      window.alert(err instanceof Error ? err.message : 'Could not delete review')
      playUiSound('soft')
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
            <ProductGallery
              media={product.media}
              productName={product.name}
              activeIndex={galleryIndex}
              onActiveIndexChange={setGalleryIndex}
            />
          </div>

          <section className="product-detail-panel">
            {categoryName && <p className="product-detail-category">{categoryName}</p>}
            <h1>{product.name}</h1>

            {product.description && <p className="product-detail-lead">{product.description}</p>}

            <div className="product-detail-price-row">
              <p className="product-detail-price">
                <Price cents={displayPriceCents} />
              </p>
              {rating != null && (
                <div className="product-detail-rating">
                  <StarRating rating={rating} />
                  <span>
                    <ReadableNumbers text={rating.toFixed(1)} /> ·{' '}
                    <ReadableNumbers text={String(reviews.length)} /> review
                    {reviews.length === 1 ? '' : 's'}
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
              <div className="product-detail-options">
                <ProductOptionTiles
                  groups={optionGroups}
                  selectedByGroupId={selectedByGroupId}
                  onSelect={handleSelectChoice}
                />
                {lastSelectedLabel && (
                  <p className="product-detail-options-note">Last added: {lastSelectedLabel}</p>
                )}
                {optionsError && <p className="form-error">{optionsError}</p>}
              </div>
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
                  <ReadableNumbers text={rating.toFixed(1)} /> average from{' '}
                  <ReadableNumbers text={String(reviews.length)} /> review
                  {reviews.length === 1 ? '' : 's'}
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
                onClick={() => {
                  uiClick('soft')
                  setReviewPage((page) => page - 1)
                }}
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
                onClick={() => {
                  uiClick('soft')
                  setReviewPage((page) => page + 1)
                }}
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
