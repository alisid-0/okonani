import type { Area } from 'react-easy-crop'

function loadImage(imageSrc: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://')) {
      image.crossOrigin = 'anonymous'
    }

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load image'))
    image.src = imageSrc
  })
}

function sourceBaseName(source: File | string, fallback = 'product-image'): string {
  if (typeof source === 'string') {
    const path = source.split('?')[0] ?? ''
    const segment = path.split('/').pop() ?? ''
    const stripped = segment.replace(/\.[^.]+$/, '')
    return stripped || fallback
  }

  return source.name.replace(/\.[^.]+$/, '') || fallback
}

export async function exportCroppedImageFile(
  imageSrc: string,
  pixelCrop: Area,
  source: File | string,
  outputSize = 1200,
): Promise<File> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize

  const context = canvas.getContext('2d', { alpha: true })
  if (!context) throw new Error('Could not prepare image crop')

  context.clearRect(0, 0, outputSize, outputSize)
  context.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize,
  )

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error('Could not export cropped image'))
          return
        }

        resolve(result)
      },
      'image/png',
    )
  })

  const baseName = sourceBaseName(source)

  return new File([blob], `${baseName}-cropped.png`, { type: 'image/png' })
}
