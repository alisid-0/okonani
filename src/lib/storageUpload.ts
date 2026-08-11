import type { ProductMedia } from '../data/products'
import { createMediaId } from '../data/products'
import { checkAdminAccess } from './adminApi'
import { auth } from './firebase'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read file'))
        return
      }

      const base64 = reader.result.split(',')[1]
      if (!base64) {
        reject(new Error('Could not read file'))
        return
      }

      resolve(base64)
    }

    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

async function uploadProductImageViaApi(
  productId: string,
  file: File,
): Promise<string> {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Sign in required')
  }

  const token = await user.getIdToken()
  const dataBase64 = await readFileAsBase64(file)

  const res = await fetch(`${apiBaseUrl}/api/admin/media/upload`, {
    method: 'POST',
    headers: {
      'X-Firebase-Auth': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      productId,
      fileName: file.name,
      contentType: file.type,
      dataBase64,
    }),
  })

  const text = await res.text()
  let data: Record<string, unknown> = {}

  if (text.trim()) {
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new Error('Upload service returned an invalid response')
    }
  }

  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Upload failed')
  }

  if (typeof data.url !== 'string') {
    throw new Error('Upload did not return an image URL')
  }

  return data.url
}

export function isFirebaseStorageUrl(url: string): boolean {
  return url.includes('firebasestorage.googleapis.com')
}

export async function fetchAdminMediaBlobUrl(url: string): Promise<string> {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Sign in required')
  }

  await checkAdminAccess()
  await user.getIdToken(true)

  const token = await user.getIdToken()
  const res = await fetch(`${apiBaseUrl}/api/admin/media/read`, {
    method: 'POST',
    headers: {
      'X-Firebase-Auth': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  })

  const text = await res.text()
  let data: Record<string, unknown> = {}

  if (text.trim()) {
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new Error('Could not load image for cropping')
    }
  }

  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Could not load image for cropping')
  }

  const contentType = typeof data.contentType === 'string' ? data.contentType : 'image/jpeg'
  const dataBase64 = typeof data.dataBase64 === 'string' ? data.dataBase64 : ''

  if (!dataBase64) {
    throw new Error('Could not load image for cropping')
  }

  const bytes = Uint8Array.from(atob(dataBase64), (char) => char.charCodeAt(0))
  const blob = new Blob([bytes], { type: contentType })

  return URL.createObjectURL(blob)
}

export async function uploadProductImages(
  productId: string,
  files: FileList | File[],
): Promise<ProductMedia[]> {
  const productKey = productId.trim()
  if (!productKey) {
    throw new Error('Product id is required before uploading images')
  }

  const selectedFiles = Array.from(files)
  if (selectedFiles.length === 0) {
    throw new Error('Choose one or more image files')
  }

  await checkAdminAccess()
  if (auth.currentUser) {
    await auth.currentUser.getIdToken(true)
  }

  const uploaded: ProductMedia[] = []

  for (const file of selectedFiles) {
    if (!file.type.startsWith('image/')) {
      throw new Error(`${file.name} is not an image file`)
    }

    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`${file.name} is over 10 MB`)
    }

    const url = await uploadProductImageViaApi(productKey, file)
    uploaded.push({
      id: createMediaId(),
      url,
      type: 'image',
      alt: file.name.replace(/\.[^.]+$/, ''),
    })
  }

  return uploaded
}
