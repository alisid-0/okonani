import { Link, useNavigate } from 'react-router-dom'
import img from '../assets/hero/Untitled_Artwork.png'
import ProductCard from '../components/ProductCard'
import ProtectedImage from '../components/ProtectedImage'
import { useCart } from '../context/CartContext'
import { homeCategories, useCategories } from '../data/categories'
import { productHasConfigurableOptions } from '../data/productOptions'
import { useProducts } from '../data/products'
import { getProductTypeById, useProductTypes } from '../data/productTypes'
import { useSiteSettings } from '../data/siteSettings'

export default function Home() {
  const navigate = useNavigate()
  const { addItem } = useCart()
  const { categories } = useCategories()
  const { productTypes } = useProductTypes()
  const { products } = useProducts()
  const { settings } = useSiteSettings()
  const featuredCategories = homeCategories(categories)
  const homeLayout = settings.home

  const categoryRows = featuredCategories
    .map((category) => ({
      category,
      products: products
        .filter((product) => product.category === category.id)
        .slice(0, category.homeProductLimit),
    }))
    .filter((row) => row.products.length > 0)

  const collectionTiles = homeLayout.collectionsEnabled
    ? homeLayout.collections
        .map((item) => {
          const type = getProductTypeById(productTypes, item.productTypeId)
          if (!type || !type.active) return null
          return {
            ...item,
            label: item.label.trim() || type.name,
            type,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    : []

  function handleAdd(product: (typeof products)[number]) {
    const productType = getProductTypeById(productTypes, product.productTypeId)
    if (productHasConfigurableOptions(product, productType)) {
      navigate(`/store/${product.id}`)
      return
    }
    addItem(product)
  }

  return (
    <div className="home-notebook">
      <div className="home-notebook-edges" aria-hidden>
        <span className="home-notebook-star home-notebook-star-1" />
        <span className="home-notebook-star home-notebook-star-2" />
        <span className="home-notebook-star home-notebook-star-3" />
        <span className="home-notebook-star home-notebook-star-4" />
      </div>

      <section className="hero hero-large">
        <div className="home-notebook-sheet home-notebook-hero">
          <ProtectedImage
            className="hero-image"
            src={img}
            alt="Welcome to my shop"
            width={1400}
            height={788}
            decoding="async"
            fetchPriority="high"
          />
        </div>
      </section>

      {categoryRows.length > 0 && (
        <div className="home-notebook-sheet">
          {categoryRows.map(({ category, products: rowProducts }) => (
            <section key={category.id} className="home-section">
              <div className="home-section-header home-section-header-row">
                <div>
                  <h2 className="home-section-title">{category.name}</h2>
                  {category.description && (
                    <p className="home-section-lead">{category.description}</p>
                  )}
                </div>
                <Link to={`/store?category=${category.id}`} className="home-section-link">
                  View all
                </Link>
              </div>
              <div className="product-grid product-grid-compact home-product-row">
                {rowProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAdd={() => handleAdd(product)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {collectionTiles.length > 0 && (
        <div className="home-notebook-sheet">
          <section className="home-section home-collections" aria-labelledby="home-collections-title">
            <div className="home-section-header">
              <h2 id="home-collections-title" className="home-section-title">
                {homeLayout.collectionsTitle}
              </h2>
              {homeLayout.collectionsLead && (
                <p className="home-section-lead">{homeLayout.collectionsLead}</p>
              )}
            </div>
            <div className="home-collections-grid">
              {collectionTiles.map((tile) => (
                <Link
                  key={tile.productTypeId}
                  to={`/store?type=${encodeURIComponent(tile.productTypeId)}`}
                  className="home-collection-tile"
                >
                  <span className="home-collection-media">
                    {tile.imageUrl ?
                      <ProtectedImage src={tile.imageUrl} alt="" className="home-collection-image" />
                    : <span className="home-collection-image is-placeholder" aria-hidden />}
                  </span>
                  <span className="home-collection-label">{tile.label}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
