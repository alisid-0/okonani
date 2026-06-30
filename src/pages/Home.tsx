import { Link } from 'react-router-dom'
import img from '../assets/hero/Untitled_Artwork.png'
import ProductCard from '../components/ProductCard'
import { homeCategories, useCategories } from '../data/categories'
import { useProducts } from '../data/products'
import { useCart } from '../context/CartContext'

export default function Home() {
  const { addItem } = useCart()
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
    <div className="home-notebook">
      <div className="home-notebook-edges" aria-hidden>
        <span className="home-notebook-side-deco home-notebook-side-deco-star" />
        <span className="home-notebook-side-deco home-notebook-side-deco-scribble" />
        <span className="home-notebook-side-deco home-notebook-side-deco-heart" />
        <span className="home-notebook-side-deco home-notebook-side-deco-confetti" />
      </div>

      <section className="hero hero-large">
        <div className="home-notebook-sheet home-notebook-hero">
          <img
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
                    <ProductCard key={product.id} product={product} onAdd={() => addItem(product)} />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  )
}
