import catalog from '../../data/products.json'

export type Product = {
  id: number
  name: string
  priceInCents: number
}

export const products: Product[] = catalog

export function formatPrice(priceInCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(priceInCents / 100)
}

export function getProduct(id: number): Product | undefined {
  return products.find((p) => p.id === id)
}
