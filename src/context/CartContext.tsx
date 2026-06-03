import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getProduct, type Product } from '../data/products'

export type CartLine = {
  product: Product
  quantity: number
}

type CartContextValue = {
  lines: CartLine[]
  itemCount: number
  subtotalCents: number
  addItem: (productId: number) => void
  removeItem: (productId: number) => void
  updateQuantity: (productId: number, quantity: number) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [quantities, setQuantities] = useState<Record<number, number>>({})

  const addItem = useCallback((productId: number) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: Math.min(99, (prev[productId] ?? 0) + 1),
    }))
  }, [])

  const removeItem = useCallback((productId: number) => {
    setQuantities((prev) => {
      const next = { ...prev }
      delete next[productId]
      return next
    })
  }, [])

  const updateQuantity = useCallback((productId: number, quantity: number) => {
    if (quantity < 1) {
      setQuantities((prev) => {
        const next = { ...prev }
        delete next[productId]
        return next
      })
      return
    }

    setQuantities((prev) => ({
      ...prev,
      [productId]: Math.min(99, quantity),
    }))
  }, [])

  const clearCart = useCallback(() => setQuantities({}), [])

  const lines = useMemo(
    () =>
      Object.entries(quantities)
        .map(([id, quantity]) => {
          const product = getProduct(Number(id))
          if (!product) return null
          return { product, quantity }
        })
        .filter((line): line is CartLine => line !== null),
    [quantities],
  )

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
