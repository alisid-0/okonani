import { Link } from 'react-router-dom'
import { formatPrice, getProductCover, type Product } from '../data/products'

type ProductCardProps = {
  product: Product
  categoryName?: string
  onAdd: () => void
}

export default function ProductCard({ product, categoryName, onAdd }: ProductCardProps) {
  const cover = getProductCover(product)

  return (
    <article className="product-card product-card-compact">
      <Link to={`/store/${product.id}`} className="product-card-media" aria-label={`View ${product.name}`}>
        {cover ?
          <img src={cover} alt={product.name} className="product-card-image" loading="lazy" />
        : <div className="product-card-image product-card-image-placeholder" aria-hidden="true" />}
        {categoryName && <span className="product-card-badge">{categoryName}</span>}
      </Link>

      <div className="product-card-body">
        <Link to={`/store/${product.id}`} className="product-card-title">
          <h2>{product.name}</h2>
        </Link>

        <div className="product-card-footer product-card-footer-inline">
          <p className="product-card-price">{formatPrice(product.priceInCents)}</p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={(event) => {
              event.preventDefault()
              onAdd()
            }}
          >
            Add
          </button>
        </div>
      </div>
    </article>
  )
}
