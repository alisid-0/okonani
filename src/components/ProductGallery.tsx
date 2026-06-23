import { useState } from 'react'
import type { ProductMedia } from '../data/products'

type ProductGalleryProps = {
  media: ProductMedia[]
  productName: string
}

function isYoutubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/.test(url)
}

function youtubeEmbedUrl(url: string): string | null {
  const match =
    url.match(/[?&]v=([^&]+)/) ??
    url.match(/youtu\.be\/([^?&]+)/) ??
    url.match(/youtube\.com\/shorts\/([^?&]+)/)

  return match?.[1] ? `https://www.youtube.com/embed/${match[1]}` : null
}

export default function ProductGallery({ media, productName }: ProductGalleryProps) {
  const items = media.filter((item) => item.url.trim())
  const [activeIndex, setActiveIndex] = useState(0)
  const activeItem = items[activeIndex] ?? items[0]

  if (items.length === 0) {
    return <div className="product-gallery-empty" aria-label={`${productName} gallery placeholder`} />
  }

  return (
    <div className="product-gallery">
      <div className="product-gallery-stage">
        {activeItem.type === 'image' && (
          <img src={activeItem.url} alt={activeItem.alt || productName} className="product-gallery-image" />
        )}

        {activeItem.type === 'video' && isYoutubeUrl(activeItem.url) && youtubeEmbedUrl(activeItem.url) && (
          <iframe
            title={`${productName} video`}
            src={youtubeEmbedUrl(activeItem.url)!}
            className="product-gallery-video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )}

        {activeItem.type === 'video' && (!isYoutubeUrl(activeItem.url) || !youtubeEmbedUrl(activeItem.url)) && (
          <video controls className="product-gallery-video" src={activeItem.url}>
            <track kind="captions" />
          </video>
        )}
      </div>

      {items.length > 1 && (
        <div className="product-gallery-thumbs">
          {items.map((item, index) => (
            <button
              key={`${item.url}-${index}`}
              type="button"
              className={`product-gallery-thumb ${index === activeIndex ? 'is-active' : ''}`}
              onClick={() => setActiveIndex(index)}
              aria-label={`Show media ${index + 1}`}
            >
              {item.type === 'image' ?
                <img src={item.url} alt="" />
              : <span className="product-gallery-thumb-video">▶</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
