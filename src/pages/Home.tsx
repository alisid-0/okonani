import { Link, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import img from '../assets/hero/Untitled_Artwork.png'
import ProductCard from '../components/ProductCard'
import ProtectedImage from '../components/ProtectedImage'
import { useCart } from '../context/CartContext'
import { getCategoryById, getCategoryName, useCategories } from '../data/categories'
import { productHasConfigurableOptions } from '../data/productOptions'
import { useProducts, type Product } from '../data/products'
import { getProductTypeById, useProductTypes } from '../data/productTypes'
import {
  resolveHomeSections,
  useSiteSettings,
  type HomeSection,
} from '../data/siteSettings'
import { playUiSound, unlockUiSounds } from '../lib/uiSounds'

function productsForSection(
  section: HomeSection,
  products: Product[],
): Product[] {
  if (section.kind === 'collections') return []

  const pool =
    section.kind === 'category' ?
      products.filter((product) => product.category === section.sourceId)
    : products.filter((product) => product.productTypeId === section.sourceId)

  if (section.productIds.length > 0) {
    const byId = new Map(pool.map((product) => [product.id, product]))
    return section.productIds
      .map((id) => byId.get(id))
      .filter((product): product is Product => Boolean(product))
      .slice(0, section.productLimit)
  }

  return pool.slice(0, section.productLimit)
}

export default function Home() {
  const navigate = useNavigate()
  const { addItem } = useCart()
  const { categories } = useCategories()
  const { productTypes } = useProductTypes()
  const { products } = useProducts()
  const { settings } = useSiteSettings()
  const homeLayout = settings.home

  const sections = useMemo(
    () => resolveHomeSections(homeLayout, categories).filter((section) => section.enabled),
    [homeLayout, categories],
  )

  const collectionTiles = homeLayout.collections
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

  function handleAdd(product: Product) {
    unlockUiSounds()
    const productType = getProductTypeById(productTypes, product.productTypeId)
    if (productHasConfigurableOptions(product, productType)) {
      playUiSound('tap')
      navigate(`/store/${product.id}`)
      return
    }
    addItem(product)
  }

  function sectionTitle(section: HomeSection): string {
    if (section.title.trim()) return section.title.trim()
    if (section.kind === 'collections') return homeLayout.collectionsTitle
    if (section.kind === 'category') {
      return getCategoryById(categories, section.sourceId)?.name ?? 'Shop'
    }
    return getProductTypeById(productTypes, section.sourceId)?.name ?? 'Shop'
  }

  function sectionLead(section: HomeSection): string {
    if (section.showDescription === false) return ''
    if (section.lead.trim()) return section.lead.trim()
    if (section.kind === 'collections') return homeLayout.collectionsLead
    if (section.kind === 'category') {
      return getCategoryById(categories, section.sourceId)?.description ?? ''
    }
    return getProductTypeById(productTypes, section.sourceId)?.description ?? ''
  }

  function sectionLink(section: HomeSection): { to: string; label: string } | null {
    if (section.kind === 'category' && section.sourceId) {
      return { to: `/store?category=${section.sourceId}`, label: 'View all' }
    }
    if (section.kind === 'productType' && section.sourceId) {
      return { to: `/store?type=${encodeURIComponent(section.sourceId)}`, label: 'View all' }
    }
    return null
  }

  return (
    <div className="home-notebook" onPointerDown={() => unlockUiSounds()}>
      <div className="home-notebook-edges" aria-hidden>
        <span className="home-notebook-star home-notebook-star-1" />
        <span className="home-notebook-star home-notebook-star-2" />
        <span className="home-notebook-star home-notebook-star-3" />
        <span className="home-notebook-star home-notebook-star-4" />
      </div>

      <section className="hero hero-large home-hero-animate">
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

      {sections.map((section, sectionIndex) => {
        if (section.kind === 'collections') {
          if (collectionTiles.length === 0) return null
          const title = sectionTitle(section)
          const lead = sectionLead(section)
          return (
            <div
              key={section.id}
              className="home-notebook-sheet home-section-animate"
              style={{ animationDelay: `${Math.min(sectionIndex, 6) * 70}ms` }}
            >
              <section className="home-section home-collections" aria-labelledby={`home-sec-${section.id}`}>
                <div className="home-section-header">
                  <h2 id={`home-sec-${section.id}`} className="home-section-title">
                    {title}
                  </h2>
                  {lead && <p className="home-section-lead">{lead}</p>}
                </div>
                <div className="home-collections-grid">
                  {collectionTiles.map((tile) => (
                    <Link
                      key={tile.productTypeId}
                      to={`/store?type=${encodeURIComponent(tile.productTypeId)}`}
                      className="home-collection-tile"
                      onClick={() => {
                        unlockUiSounds()
                        playUiSound('tap')
                      }}
                    >
                      <span className="home-collection-media">
                        {tile.imageUrl ?
                          <ProtectedImage
                            src={tile.imageUrl}
                            alt=""
                            className="home-collection-image"
                          />
                        : <span className="home-collection-image is-placeholder" aria-hidden />}
                      </span>
                      <span className="home-collection-label">{tile.label}</span>
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          )
        }

        const rowProducts = productsForSection(section, products)
        if (rowProducts.length === 0) return null
        const title = sectionTitle(section)
        const lead = sectionLead(section)
        const link = sectionLink(section)
        const categoryName =
          section.kind === 'category' ? getCategoryName(categories, section.sourceId) : undefined

        return (
          <div
            key={section.id}
            className="home-notebook-sheet home-section-animate"
            style={{ animationDelay: `${Math.min(sectionIndex, 6) * 70}ms` }}
          >
            <section className="home-section">
              <div className="home-section-header home-section-header-row">
                <div>
                  <h2 className="home-section-title">{title}</h2>
                  {lead && <p className="home-section-lead">{lead}</p>}
                </div>
                {link && (
                  <Link
                    to={link.to}
                    className="home-section-link"
                    onClick={() => {
                      unlockUiSounds()
                      playUiSound('soft')
                    }}
                  >
                    {link.label}
                  </Link>
                )}
              </div>
              <div className="product-grid product-grid-compact home-product-row">
                {rowProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    categoryName={categoryName}
                    onAdd={() => handleAdd(product)}
                  />
                ))}
              </div>
            </section>
          </div>
        )
      })}
    </div>
  )
}
