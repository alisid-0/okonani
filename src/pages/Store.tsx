import { useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import ProductCard from '../components/ProductCard'
import { GuestRewardsPrompt } from '../components/RewardsPrompt'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { getCategoryById, getCategoryName, storeFilterCategories, useCategories } from '../data/categories'
import { useProducts } from '../data/products'

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

      <div className="store-body">
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
          <ProductCard
            key={product.id}
            product={product}
            categoryName={getCategoryName(categories, product.category)}
            onAdd={() => addItem(product)}
          />
        ))}
      </div>
      </div>
    </div>
  )
}
