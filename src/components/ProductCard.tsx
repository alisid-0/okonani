import { Link } from 'react-router-dom'
import ProtectedImage from './ProtectedImage'
import {
  availableStock,
  formatPrice,
  getProductCover,
  isProductSoldOut,
  type Product,
} from '../data/products'

type ProductCardProps = {
  product: Product
  categoryName?: string
  onAdd: () => void
}

export default function ProductCard({ product, categoryName, onAdd }: ProductCardProps) {
  const cover = getProductCover(product)
  const soldOut = isProductSoldOut(product)
  const stock = availableStock(product)

  return (
    <article className={`product-card product-card-compact ${soldOut ? 'is-sold-out' : ''}`}>
      <Link to={`/store/${product.id}`} className="product-card-media" aria-label={`View ${product.name}`}>
        {cover ?
          <ProtectedImage
            src={cover}
            alt={product.name}
            className="product-card-image"
            loading="lazy"
          />
        : <div className="product-card-image product-card-image-placeholder" aria-hidden="true" />}
        {categoryName && <span className="product-card-badge">{categoryName}</span>}
        {soldOut && <span className="product-card-sold-out">Sold out</span>}
      </Link>

      <div className="product-card-body">
        <Link to={`/store/${product.id}`} className="product-card-title">
          <h2>{product.name}</h2>
        </Link>

        <div className="product-card-footer product-card-footer-inline">
          <div className="product-card-price-wrap">
            <p className="product-card-price">{formatPrice(product.priceInCents)}</p>
            {stock !== null && !soldOut && stock <= 5 && (
              <p className="product-card-stock">{stock} left</p>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={soldOut}
            onClick={(event) => {
              event.preventDefault()
              if (!soldOut) onAdd()
            }}
          >
            {soldOut ? 'Sold out' : 'Add'}
          </button>
        </div>
      </div>
    </article>
  )
}
