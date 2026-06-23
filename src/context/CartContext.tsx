import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Product } from '../data/products'

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

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [linesByProductId, setLinesByProductId] = useState<Record<string, CartLine>>({})

  const addItem = useCallback((product: Product) => {
    setLinesByProductId((prev) => ({
      ...prev,
      [product.id]: {
        product,
        quantity: Math.min(99, (prev[product.id]?.quantity ?? 0) + 1),
      },
    }))
  }, [])

  const removeItem = useCallback((productId: string) => {
    setLinesByProductId((prev) => {
      const next = { ...prev }
      delete next[productId]
      return next
    })
  }, [])

  const updateQuantity = useCallback((productId: string, quantity: number) => {
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
  }, [])

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
