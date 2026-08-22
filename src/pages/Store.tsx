import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import ProductCard from '../components/ProductCard'
import { useCart } from '../context/CartContext'
import {
  getCategoryById,
  getCategoryName,
  storeFilterCategories,
  useCategories,
} from '../data/categories'
import { productHasConfigurableOptions } from '../data/productOptions'
import { useProducts } from '../data/products'
import { getProductTypeById, useProductTypes } from '../data/productTypes'
import { playUiSound, unlockUiSounds } from '../lib/uiSounds'

export default function Store() {
  const navigate = useNavigate()
  const { addItem } = useCart()
  const { products, loading, error } = useProducts()
  const { categories } = useCategories()
  const { productTypes } = useProductTypes()
  const [searchParams, setSearchParams] = useSearchParams()

  const activeCategory = searchParams.get('category') ?? 'all'
  const activeType = searchParams.get('type') ?? 'all'
  const storeCategories = storeFilterCategories(categories)
  const activeProductTypes = useMemo(
    () => productTypes.filter((type) => type.active),
    [productTypes],
  )

  const categoriesWithProducts = useMemo(() => {
    const used = new Set(
      products.map((product) => product.category?.trim()).filter((id): id is string => Boolean(id)),
    )
    return storeCategories.filter((category) => used.has(category.id))
  }, [storeCategories, products])

  const typesWithProducts = useMemo(() => {
    const used = new Set(
      products
        .map((product) => product.productTypeId?.trim())
        .filter((id): id is string => Boolean(id)),
    )
    return activeProductTypes.filter((type) => used.has(type.id))
  }, [activeProductTypes, products])

  const showCategoryFilters = categoriesWithProducts.length > 0
  const showTypeFilters = typesWithProducts.length > 0

  const filteredProducts = products.filter((product) => {
    if (activeCategory !== 'all' && product.category !== activeCategory) return false
    if (activeType !== 'all' && product.productTypeId !== activeType) return false
    return true
  })

  const activeCategoryMeta =
    activeCategory === 'all' ? null : getCategoryById(categories, activeCategory)
  const activeTypeMeta =
    activeType === 'all' ? null : getProductTypeById(productTypes, activeType)

  const subtitle =
    activeCategoryMeta?.description ||
    (activeTypeMeta ? `Showing ${activeTypeMeta.name.toLowerCase()}.` : undefined)

  function updateFilters(next: { category?: string; type?: string }) {
    unlockUiSounds()
    playUiSound('tap')
    const params = new URLSearchParams()
    const category = next.category ?? activeCategory
    const type = next.type ?? activeType
    if (category && category !== 'all') params.set('category', category)
    if (type && type !== 'all') params.set('type', type)
    setSearchParams(params)
  }

  function clearFilters() {
    unlockUiSounds()
    playUiSound('soft')
    setSearchParams({})
  }

  function handleAdd(product: (typeof products)[number]) {
    unlockUiSounds()
    const productType = getProductTypeById(productTypes, product.productTypeId)
    if (productHasConfigurableOptions(product, productType)) {
      playUiSound('tap')
      navigate(`/store/${product.id}`)
      return
    }
    addItem(product)
  }

  const hasActiveFilters = activeCategory !== 'all' || activeType !== 'all'

  return (
    <div className="page store-page notebook-page" onPointerDown={() => unlockUiSounds()}>
      <PageHeader title="Shop" subtitle={subtitle} />

      <section className="store-browse" aria-label="Shop catalog">
        {(showCategoryFilters || showTypeFilters) && (
          <nav className="store-nav" aria-label="Shop filters">
            {showCategoryFilters && (
              <div className="store-nav-row">
                <button
                  type="button"
                  className={`store-nav-link ${activeCategory === 'all' ? 'is-active' : ''}`}
                  onClick={() => updateFilters({ category: 'all' })}
                >
                  All
                </button>
                {categoriesWithProducts.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={`store-nav-link ${activeCategory === category.id ? 'is-active' : ''}`}
                    onClick={() => updateFilters({ category: category.id })}
                  >
                    {category.name}
                  </button>
                ))}
                {hasActiveFilters && (
                  <button type="button" className="store-nav-clear" onClick={clearFilters}>
                    Clear
                  </button>
                )}
              </div>
            )}

            {showTypeFilters && (
              <div className="store-nav-row store-nav-row-secondary" aria-label="Collections">
                {typesWithProducts.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    className={`store-nav-link is-quiet ${activeType === type.id ? 'is-active' : ''}`}
                    onClick={() =>
                      updateFilters({
                        type: activeType === type.id ? 'all' : type.id,
                      })
                    }
                  >
                    {type.name}
                  </button>
                ))}
                {!showCategoryFilters && hasActiveFilters && (
                  <button type="button" className="store-nav-clear" onClick={clearFilters}>
                    Clear
                  </button>
                )}
              </div>
            )}
          </nav>
        )}

        {loading && <p className="store-status">Loading products...</p>}
        {error && <p className="form-error">{error}</p>}
        {!loading && !error && filteredProducts.length === 0 && (
          <p className="store-status">
            No products match these filters.
            {hasActiveFilters && (
              <>
                {' '}
                <button type="button" className="store-status-clear" onClick={clearFilters}>
                  Clear filters
                </button>
              </>
            )}
          </p>
        )}

        {!loading && !error && filteredProducts.length > 0 && (
          <div className="product-grid product-grid-compact">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                categoryName={getCategoryName(categories, product.category)}
                onAdd={() => handleAdd(product)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
