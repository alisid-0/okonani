import { useCallback, useEffect, useState } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { exportCroppedImageFile } from '../lib/cropImage'
import { fetchAdminMediaBlobUrl, isFirebaseStorageUrl } from '../lib/storageUpload'

type ImageCropModalProps = {
  source: File | string
  replaceExisting?: boolean
  onCancel: () => void
  onConfirm: (file: File) => void
}

export default function ImageCropModal({
  source,
  replaceExisting = false,
  onCancel,
  onConfirm,
}: ImageCropModalProps) {
  const [imageUrl, setImageUrl] = useState('')
  const [loadingImage, setLoadingImage] = useState(true)
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl = ''
    let cancelled = false

    async function loadImageSource() {
      setLoadingImage(true)
      setError(null)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
      setImageUrl('')

      try {
        if (typeof source === 'string') {
          if (isFirebaseStorageUrl(source)) {
            objectUrl = await fetchAdminMediaBlobUrl(source)
          } else {
            objectUrl = source
          }
        } else {
          objectUrl = URL.createObjectURL(source)
        }

        if (!cancelled) {
          setImageUrl(objectUrl)
        } else if (objectUrl.startsWith('blob:')) {
          URL.revokeObjectURL(objectUrl)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load image')
        }
      } finally {
        if (!cancelled) {
          setLoadingImage(false)
        }
      }
    }

    loadImageSource()

    return () => {
      cancelled = true
      if (objectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [source])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  async function handleConfirm() {
    if (!imageUrl || !croppedAreaPixels) {
      setError('Adjust the crop area before saving.')
      return
    }

    setProcessing(true)
    setError(null)

    try {
      const cropped = await exportCroppedImageFile(imageUrl, croppedAreaPixels, source)
      onConfirm(cropped)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not crop image')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="image-crop-backdrop" role="presentation">
      <div
        className="image-crop-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-crop-title"
      >
        <header className="image-crop-header">
          <h2 id="image-crop-title">{replaceExisting ? 'Re-crop store image' : 'Crop image'}</h2>
          <p>
            {replaceExisting ?
              'This updates the image shoppers see. The original file is kept so you can crop again later.'
            : 'Drag to reposition. Use the slider or scroll wheel to zoom. The square frame is what shoppers will see.'}
          </p>
        </header>

        <div className="image-crop-stage">
          {loadingImage ?
            <p className="image-crop-loading">Loading image…</p>
          : imageUrl ?
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="rect"
              showGrid
              zoomWithScroll
              restrictPosition={false}
              minZoom={1}
              maxZoom={4}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          : null}
        </div>

        <label className="image-crop-zoom">
          Zoom
          <input
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            disabled={loadingImage || !imageUrl}
            onChange={(event) => setZoom(Number.parseFloat(event.target.value))}
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <footer className="image-crop-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={processing}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={processing || loadingImage || !imageUrl}
          >
            {processing ? 'Saving crop…' : replaceExisting ? 'Update store image' : 'Use cropped image'}
          </button>
        </footer>
      </div>
    </div>
  )
}
