import { Link, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { GuestRewardsPrompt } from '../components/RewardsPrompt'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { getCategoryById, getCategoryName, storeFilterCategories, useCategories } from '../data/categories'
import { formatPrice, getProductCover, useProducts } from '../data/products'

export default function Store() {
  const { user } = useAuth()
  const { addItem } = useCart()
  const { products, loading, error } = useProducts()
  const { categories } = useCategories()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeCategory = searchParams.get('category') ?? 'all'
  const storeCategories = storeFilterCategories(categories)

  const filteredProducts =
    activeCategory === 'all' ?
      products
    : products.filter((product) => product.category === activeCategory)

  const activeCategoryMeta = activeCategory === 'all' ? null : getCategoryById(categories, activeCategory)

  function setCategory(categoryId: string) {
    if (categoryId === 'all') {
      setSearchParams({})
      return
    }

    setSearchParams({ category: categoryId })
  }

  return (
    <div className="page store-page">
      <PageHeader
        title={activeCategoryMeta?.name ?? 'Store'}
        subtitle={
          activeCategoryMeta?.description ??
          'Browse the catalog, filter by category, and add items to your cart.'
        }
      />

      {!user && <GuestRewardsPrompt returnTo="/store" compact />}

      <div className="store-filters" role="tablist" aria-label="Product categories">
        <button
          type="button"
          className={`store-filter ${activeCategory === 'all' ? 'is-active' : ''}`}
          onClick={() => setCategory('all')}
        >
          All <span>{products.length}</span>
        </button>

        {storeCategories.map((category) => {
          const count = products.filter((product) => product.category === category.id).length

          return (
            <button
              key={category.id}
              type="button"
              className={`store-filter ${activeCategory === category.id ? 'is-active' : ''}`}
              onClick={() => setCategory(category.id)}
            >
              {category.name} <span>{count}</span>
            </button>
          )
        })}
      </div>

      {loading && <p className="store-status">Loading products...</p>}
      {error && <p className="form-error">{error}</p>}
      {!loading && !error && filteredProducts.length === 0 && (
        <p className="store-status">
          {activeCategory === 'all' ?
            'No products are available yet.'
          : `No products in ${activeCategoryMeta?.name ?? 'this category'} yet.`}
        </p>
      )}

      <div className="product-grid product-grid-compact">
        {filteredProducts.map((product) => (
          <StoreProductCard
            key={product.id}
            product={product}
            categoryName={getCategoryName(categories, product.category)}
            onAdd={() => addItem(product)}
          />
        ))}
      </div>
    </div>
  )
}

function StoreProductCard({
  product,
  categoryName,
  onAdd,
}: {
  product: ReturnType<typeof useProducts>['products'][number]
  categoryName: string
  onAdd: () => void
}) {
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
