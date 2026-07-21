import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Product } from '../data/products'
import { useShopPause } from './ShopPauseContext'

export type CartLine = {
  product: Product
  quantity: number
}

type CartContextValue = {
  lines: CartLine[]
  itemCount: number
  subtotalCents: number
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
}

const CART_STORAGE_KEY = 'okonani-cart-v1'

const CartContext = createContext<CartContextValue | null>(null)

function isProductSnapshot(value: unknown): value is Product {
  if (!value || typeof value !== 'object') return false
  const product = value as Record<string, unknown>
  return (
    typeof product.id === 'string' &&
    typeof product.name === 'string' &&
    typeof product.priceInCents === 'number'
  )
}

function loadCartFromStorage(): Record<string, CartLine> {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const next: Record<string, CartLine> = {}
    for (const [productId, line] of Object.entries(parsed as Record<string, unknown>)) {
      if (!line || typeof line !== 'object') continue
      const quantity = Math.round(Number((line as { quantity?: unknown }).quantity) || 0)
      const product = (line as { product?: unknown }).product
      if (!isProductSnapshot(product) || quantity < 1) continue
      next[productId] = {
        product,
        quantity: Math.min(99, quantity),
      }
    }
    return next
  } catch {
    return {}
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { shoppingPaused, showPausedModal } = useShopPause()
  const [linesByProductId, setLinesByProductId] = useState<Record<string, CartLine>>(() =>
    loadCartFromStorage(),
  )

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(linesByProductId))
    } catch {
      // Ignore quota / private mode write failures.
    }
  }, [linesByProductId])

  const addItem = useCallback(
    (product: Product) => {
      if (shoppingPaused) {
        showPausedModal()
        return
      }

      setLinesByProductId((prev) => ({
        ...prev,
        [product.id]: {
          product,
          quantity: Math.min(99, (prev[product.id]?.quantity ?? 0) + 1),
        },
      }))
    },
    [shoppingPaused, showPausedModal],
  )

  const removeItem = useCallback((productId: string) => {
    setLinesByProductId((prev) => {
      const next = { ...prev }
      delete next[productId]
      return next
    })
  }, [])

  const updateQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (shoppingPaused) {
        showPausedModal()
        return
      }

      if (quantity < 1) {
        setLinesByProductId((prev) => {
          const next = { ...prev }
          delete next[productId]
          return next
        })
        return
      }

      setLinesByProductId((prev) => {
        const line = prev[productId]
        if (!line) return prev

        return {
          ...prev,
          [productId]: {
            ...line,
            quantity: Math.min(99, quantity),
          },
        }
      })
    },
    [shoppingPaused, showPausedModal],
  )

  const clearCart = useCallback(() => setLinesByProductId({}), [])

  const lines = useMemo(() => Object.values(linesByProductId), [linesByProductId])

  const itemCount = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity, 0),
    [lines],
  )

  const subtotalCents = useMemo(
    () => lines.reduce((sum, line) => sum + line.product.priceInCents * line.quantity, 0),
    [lines],
  )

  const value = useMemo(
    () => ({
      lines,
      itemCount,
      subtotalCents,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
    }),
    [lines, itemCount, subtotalCents, addItem, removeItem, updateQuantity, clearCart],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
