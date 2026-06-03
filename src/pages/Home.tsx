import { Link } from 'react-router-dom'
import img from '../assets/hero/Untitled_Artwork.png'

export default function Home() {
  return (
    <section className="hero">
      <img className="hero-image" src={img} alt="Welcome to my shop" />
      <div className="hero-actions">
        <Link to="/store" className="btn btn-primary">
          Shop the store
        </Link>
        <Link to="/about" className="btn btn-ghost">
          My story
        </Link>
      </div>
    </section>
  )
}
