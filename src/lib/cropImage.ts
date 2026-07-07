export type CropState = {
  zoom: number
  offsetX: number
  offsetY: number
}

export const DEFAULT_CROP_STATE: CropState = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load image'))
    }

    image.src = url
  })
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load image'))

    image.src = url
  })
}

async function loadImageSource(source: File | string): Promise<HTMLImageElement> {
  if (typeof source === 'string') return loadImageFromUrl(source)
  return loadImage(source)
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

export async function cropImageSource(
  source: File | string,
  crop: CropState,
  outputSize = 1200,
): Promise<File> {
  const image = await loadImageSource(source)
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare image crop')

  const baseCropSize = Math.min(image.width, image.height) / crop.zoom
  const maxOffsetX = Math.max(0, (image.width - baseCropSize) / 2)
  const maxOffsetY = Math.max(0, (image.height - baseCropSize) / 2)
  const sourceX = (image.width - baseCropSize) / 2 + crop.offsetX * maxOffsetX
  const sourceY = (image.height - baseCropSize) / 2 + crop.offsetY * maxOffsetY

  context.drawImage(
    image,
    sourceX,
    sourceY,
    baseCropSize,
    baseCropSize,
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
      'image/jpeg',
      0.92,
    )
  })

  const baseName = sourceBaseName(source)

  return new File([blob], `${baseName}-cropped.jpg`, { type: 'image/jpeg' })
}

export async function cropImageFile(
  file: File,
  crop: CropState,
  outputSize = 1200,
): Promise<File> {
  return cropImageSource(file, crop, outputSize)
}
