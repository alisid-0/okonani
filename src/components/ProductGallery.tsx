import { useEffect, useState } from 'react'
import type { ProductMedia } from '../data/products'
import ProtectedImage from './ProtectedImage'

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
  const hasMultiple = items.length > 1

  useEffect(() => {
    setActiveIndex(0)
  }, [media])

  useEffect(() => {
    if (activeIndex > items.length - 1) {
      setActiveIndex(Math.max(0, items.length - 1))
    }
  }, [activeIndex, items.length])

  function showPrevious() {
    setActiveIndex((index) => (index <= 0 ? items.length - 1 : index - 1))
  }

  function showNext() {
    setActiveIndex((index) => (index >= items.length - 1 ? 0 : index + 1))
  }

  if (items.length === 0) {
    return <div className="product-gallery-empty" aria-label={`${productName} gallery placeholder`} />
  }

  return (
    <div className="product-gallery" onContextMenu={(event) => event.preventDefault()}>
      <div className="product-gallery-stage">
        {activeItem.type === 'image' && (
          <ProtectedImage
            src={activeItem.url}
            alt={activeItem.alt || productName}
            className="product-gallery-image"
            decoding="async"
            fetchPriority="high"
          />
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
          <video
            controls
            className="product-gallery-video"
            src={activeItem.url}
            controlsList="nodownload"
          >
            <track kind="captions" />
          </video>
        )}

        {hasMultiple && (
          <>
            <button
              type="button"
              className="product-gallery-nav product-gallery-nav-prev"
              onClick={showPrevious}
              aria-label="Previous image"
            >
              ‹
            </button>
            <button
              type="button"
              className="product-gallery-nav product-gallery-nav-next"
              onClick={showNext}
              aria-label="Next image"
            >
              ›
            </button>
            <p className="product-gallery-count">
              {activeIndex + 1} / {items.length}
            </p>
          </>
        )}
      </div>

      {hasMultiple && (
        <div className="product-gallery-thumbs" role="tablist" aria-label={`${productName} media`}>
          {items.map((item, index) => (
            <button
              key={`${item.url}-${index}`}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              className={`product-gallery-thumb ${index === activeIndex ? 'is-active' : ''}`}
              onClick={() => setActiveIndex(index)}
              aria-label={`Show media ${index + 1}`}
            >
              {item.type === 'image' ?
                <ProtectedImage src={item.url} alt="" loading="lazy" decoding="async" />
              : <span className="product-gallery-thumb-video">▶</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
