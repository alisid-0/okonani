import { useEffect, useState } from 'react'
import { cropImageSource, DEFAULT_CROP_STATE, type CropState } from '../lib/cropImage'

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
  const [previewUrl, setPreviewUrl] = useState('')
  const [crop, setCrop] = useState<CropState>(DEFAULT_CROP_STATE)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCrop(DEFAULT_CROP_STATE)

    if (typeof source === 'string') {
      setPreviewUrl(source)
      return
    }

    const url = URL.createObjectURL(source)
    setPreviewUrl(url)

    return () => {
      URL.revokeObjectURL(url)
    }
  }, [source])

  async function handleConfirm() {
    setProcessing(true)
    setError(null)

    try {
      const cropped = await cropImageSource(source, crop)
      onConfirm(cropped)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not crop image')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="image-crop-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="image-crop-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-crop-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="image-crop-header">
          <h2 id="image-crop-title">{replaceExisting ? 'Edit image crop' : 'Crop image'}</h2>
          <p>Drag the preview to center your product, then save a square image.</p>
        </header>

        <div
          className="image-crop-stage"
          style={{
            backgroundImage: previewUrl ? `url(${previewUrl})` : undefined,
            backgroundSize: `${crop.zoom * 100}%`,
            backgroundPosition: `calc(50% + ${crop.offsetX * 28}%) calc(50% + ${crop.offsetY * 28}%)`,
          }}
          onPointerDown={(event) => {
            const stage = event.currentTarget
            const startX = event.clientX
            const startY = event.clientY
            const startCrop = { ...crop }

            function onMove(moveEvent: PointerEvent) {
              const dx = (moveEvent.clientX - startX) / stage.clientWidth
              const dy = (moveEvent.clientY - startY) / stage.clientHeight

              setCrop({
                ...startCrop,
                offsetX: Math.max(-1, Math.min(1, startCrop.offsetX + dx * 2)),
                offsetY: Math.max(-1, Math.min(1, startCrop.offsetY + dy * 2)),
              })
            }

            function onUp() {
              window.removeEventListener('pointermove', onMove)
              window.removeEventListener('pointerup', onUp)
            }

            window.addEventListener('pointermove', onMove)
            window.addEventListener('pointerup', onUp)
          }}
        />

        <label className="image-crop-zoom">
          Zoom
          <input
            type="range"
            min={1}
            max={2.5}
            step={0.01}
            value={crop.zoom}
            onChange={(event) =>
              setCrop((prev) => ({ ...prev, zoom: Number.parseFloat(event.target.value) }))
            }
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <footer className="image-crop-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={processing}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={processing}>
            {processing ? 'Saving crop…' : replaceExisting ? 'Save cropped image' : 'Use cropped image'}
          </button>
        </footer>
      </div>
    </div>
  )
}
