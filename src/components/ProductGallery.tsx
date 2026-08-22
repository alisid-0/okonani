import { useEffect, useState } from 'react'
import type { ProductMedia } from '../data/products'
import { uiClick } from '../lib/uiSounds'
import ProtectedImage from './ProtectedImage'

type ProductGalleryProps = {
  media: ProductMedia[]
  productName: string
  /** Controlled active slide index (among non-empty media items). */
  activeIndex?: number
  onActiveIndexChange?: (index: number) => void
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

export default function ProductGallery({
  media,
  productName,
  activeIndex: controlledIndex,
  onActiveIndexChange,
}: ProductGalleryProps) {
  const items = media.filter((item) => item.url.trim())
  const isControlled = controlledIndex !== undefined
  const [internalIndex, setInternalIndex] = useState(0)
  const activeIndex = isControlled ? controlledIndex : internalIndex

  function setActiveIndex(next: number | ((prev: number) => number)) {
    const resolved = typeof next === 'function' ? next(activeIndex) : next
    const clamped = Math.max(0, Math.min(resolved, Math.max(0, items.length - 1)))
    if (!isControlled) setInternalIndex(clamped)
    onActiveIndexChange?.(clamped)
  }

  const activeItem = items[activeIndex] ?? items[0]
  const hasMultiple = items.length > 1

  useEffect(() => {
    if (!isControlled) setInternalIndex(0)
  }, [media, isControlled])

  useEffect(() => {
    if (activeIndex > items.length - 1) {
      setActiveIndex(Math.max(0, items.length - 1))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clamp only when length shrinks
  }, [activeIndex, items.length])

  function showPrevious() {
    uiClick('soft')
    setActiveIndex((index) => (index <= 0 ? items.length - 1 : index - 1))
  }

  function showNext() {
    uiClick('soft')
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
              key={item.id || `${item.url}-${index}`}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              className={`product-gallery-thumb ${index === activeIndex ? 'is-active' : ''}`}
              onClick={() => {
                uiClick('soft')
                setActiveIndex(index)
              }}
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
