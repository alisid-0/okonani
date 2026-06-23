import { Link } from 'react-router-dom'
import img from '../assets/hero/Untitled_Artwork.png'
import { homeCategories, useCategories } from '../data/categories'

export default function Home() {
  const { categories } = useCategories()
  const featuredCategories = homeCategories(categories)

  return (
    <>
      <section className="hero hero-large">
        <img className="hero-image" src={img} alt="Welcome to my shop" />
      </section>

      {featuredCategories.length > 0 && (
        <section className="home-categories">
          <p className="eyebrow">Shop</p>
          <div className="home-category-chips">
            {featuredCategories.map((category) => (
              <Link
                key={category.id}
                to={`/store?category=${category.id}`}
                className="home-category-chip"
              >
                {category.name}
              </Link>
            ))}
            <Link to="/store" className="home-category-chip home-category-chip-all">
              All products
            </Link>
          </div>
        </section>
      )}
    </>
  )
}
