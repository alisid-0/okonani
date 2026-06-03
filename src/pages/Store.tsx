import PageHeader from '../components/PageHeader'
import { useCart } from '../context/CartContext'
import { formatPrice, products } from '../data/products'

export default function Store() {
  const { addItem } = useCart()

  return (
    <div className="page">
      <PageHeader title="Store" subtitle="Browse my catalog and add items to your cart." />

      <div className="product-grid">
        {products.map((product) => (
          <article key={product.id} className="product-card">
            <div className="product-image" aria-hidden="true" />
            <h2>{product.name}</h2>
            <p className="product-price">{formatPrice(product.priceInCents)}</p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => addItem(product.id)}
            >
              Add to cart
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}
