import { Link } from 'react-router-dom'
import img from '../assets/hero/Untitled_Artwork.webp'
import { homeCategories, useCategories } from '../data/categories'
import { formatPrice, getProductCover, useProducts, type Product } from '../data/products'
import { useCart } from '../context/CartContext'

function HomeProductCard({ product }: { product: Product }) {
  const { addItem } = useCart()
  const cover = getProductCover(product)

  return (
    <article className="home-product-card">
      <Link to={`/store/${product.id}`} className="home-product-card-link">
        {cover ?
          <img src={cover} alt="" className="home-product-card-image" loading="lazy" />
        : <div className="home-product-card-image home-product-card-image-placeholder" aria-hidden />}
        <div className="home-product-card-body">
          <h3>{product.name}</h3>
          <p>{formatPrice(product.priceInCents)}</p>
        </div>
      </Link>
      <div className="home-product-card-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm home-product-card-btn"
          onClick={() => addItem(product)}
        >
          Add to cart
        </button>
      </div>
    </article>
  )
}

export default function Home() {
  const { categories } = useCategories()
  const { products } = useProducts()
  const featuredCategories = homeCategories(categories)

  const categoryRows = featuredCategories
    .map((category) => ({
      category,
      products: products
        .filter((product) => product.category === category.id)
        .slice(0, category.homeProductLimit),
    }))
    .filter((row) => row.products.length > 0)

  return (
    <>
      <section className="hero hero-large">
        <img
          className="hero-image"
          src={img}
          alt="Welcome to my shop"
          width={1400}
          height={788}
          decoding="async"
          fetchPriority="high"
        />
      </section>

      {categoryRows.length > 0 && (
        <div className="home-sections">
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
              <div className="home-product-row">
                {rowProducts.map((product) => (
                  <HomeProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
