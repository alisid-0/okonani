import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { maxOrderQuantity, type Product } from '../data/products'
import {
  formatSelectedOptions,
  lineKeyForOptions,
  unitPriceWithOptions,
  type SelectedProductOption,
} from '../data/productOptions'
import { playUiSound, unlockUiSounds } from '../lib/uiSounds'
import { useShopPause } from './ShopPauseContext'

export type CartLine = {
  lineKey: string
  product: Product
  quantity: number
  selectedOptions: SelectedProductOption[]
}

type CartContextValue = {
  lines: CartLine[]
  itemCount: number
  subtotalCents: number
  addItem: (product: Product, selectedOptions?: SelectedProductOption[]) => void
  removeItem: (lineKey: string) => void
  updateQuantity: (lineKey: string, quantity: number) => void
  clearCart: () => void
  /** Total qty in cart for a product across all option variants. */
  quantityForProduct: (productId: string, excludeLineKey?: string) => number
  /** How many more of this product can be added (null = unlimited within 99). */
  remainingForProduct: (product: Product, excludeLineKey?: string) => number | null
}

const CART_STORAGE_KEY = 'okonani-cart-v2'

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

function parseSelectedOptions(value: unknown): SelectedProductOption[] {
  if (!Array.isArray(value)) return []
  const selected: SelectedProductOption[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (
      typeof record.groupId !== 'string' ||
      typeof record.groupName !== 'string' ||
      typeof record.choiceId !== 'string' ||
      typeof record.choiceLabel !== 'string'
    ) {
      continue
    }
    selected.push({
      groupId: record.groupId,
      groupName: record.groupName,
      choiceId: record.choiceId,
      choiceLabel: record.choiceLabel,
      priceDeltaCents: Math.round(Number(record.priceDeltaCents) || 0),
      ...(typeof record.imageUrl === 'string' && record.imageUrl
        ? { imageUrl: record.imageUrl }
        : {}),
    })
  }
  return selected
}

function loadCartFromStorage(): Record<string, CartLine> {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const next: Record<string, CartLine> = {}
    for (const [key, line] of Object.entries(parsed as Record<string, unknown>)) {
      if (!line || typeof line !== 'object') continue
      const quantity = Math.round(Number((line as { quantity?: unknown }).quantity) || 0)
      const product = (line as { product?: unknown }).product
      if (!isProductSnapshot(product) || quantity < 1) continue
      const selectedOptions = parseSelectedOptions((line as { selectedOptions?: unknown }).selectedOptions)
      const lineKey =
        typeof (line as { lineKey?: unknown }).lineKey === 'string'
          ? (line as { lineKey: string }).lineKey
          : lineKeyForOptions(product.id, selectedOptions)
      const maxQty = maxOrderQuantity(product)
      if (maxQty < 1) continue
      next[key || lineKey] = {
        lineKey,
        product,
        quantity: Math.min(maxQty, quantity),
        selectedOptions,
      }
    }
    return next
  } catch {
    return {}
  }
}

function sumQuantityForProduct(
  lines: Record<string, CartLine>,
  productId: string,
  excludeLineKey?: string,
): number {
  let total = 0
  for (const line of Object.values(lines)) {
    if (line.product.id !== productId) continue
    if (excludeLineKey && line.lineKey === excludeLineKey) continue
    total += line.quantity
  }
  return total
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { shoppingPaused, showPausedModal } = useShopPause()
  const [linesByKey, setLinesByKey] = useState<Record<string, CartLine>>(() => loadCartFromStorage())

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(linesByKey))
    } catch {
      // Ignore quota / private mode write failures.
    }
  }, [linesByKey])

  const quantityForProduct = useCallback(
    (productId: string, excludeLineKey?: string) =>
      sumQuantityForProduct(linesByKey, productId, excludeLineKey),
    [linesByKey],
  )

  const remainingForProduct = useCallback(
    (product: Product, excludeLineKey?: string) => {
      const max = maxOrderQuantity(product)
      if (product.trackStock !== true) return null
      const used = sumQuantityForProduct(linesByKey, product.id, excludeLineKey)
      return Math.max(0, max - used)
    },
    [linesByKey],
  )

  const addItem = useCallback(
    (product: Product, selectedOptions: SelectedProductOption[] = []) => {
      if (shoppingPaused) {
        showPausedModal()
        return
      }

      const maxForProduct = maxOrderQuantity(product)
      if (maxForProduct < 1) return

      const lineKey = lineKeyForOptions(product.id, selectedOptions)
      const usedElsewhere = sumQuantityForProduct(linesByKey, product.id, lineKey)
      const room = Math.max(0, maxForProduct - usedElsewhere)
      if (room < 1) return

      const currentQty = linesByKey[lineKey]?.quantity ?? 0
      const nextQty = Math.min(room, currentQty + 1)
      if (nextQty <= currentQty) return

      unlockUiSounds()
      playUiSound('add')

      setLinesByKey((prev) => {
        const usedNow = sumQuantityForProduct(prev, product.id, lineKey)
        const roomNow = Math.max(0, maxForProduct - usedNow)
        if (roomNow < 1) return prev

        const qtyNow = prev[lineKey]?.quantity ?? 0
        const qtyNext = Math.min(roomNow, qtyNow + 1)
        if (qtyNext <= qtyNow) return prev

        return {
          ...prev,
          [lineKey]: {
            lineKey,
            product,
            selectedOptions,
            quantity: qtyNext,
          },
        }
      })
    },
    [shoppingPaused, showPausedModal, linesByKey],
  )

  const removeItem = useCallback((lineKey: string) => {
    unlockUiSounds()
    playUiSound('soft')
    setLinesByKey((prev) => {
      const next = { ...prev }
      delete next[lineKey]
      return next
    })
  }, [])

  const updateQuantity = useCallback(
    (lineKey: string, quantity: number) => {
      if (shoppingPaused) {
        showPausedModal()
        return
      }

      unlockUiSounds()
      playUiSound('soft')

      if (quantity < 1) {
        setLinesByKey((prev) => {
          const next = { ...prev }
          delete next[lineKey]
          return next
        })
        return
      }

      setLinesByKey((prev) => {
        const line = prev[lineKey]
        if (!line) return prev

        const maxForProduct = maxOrderQuantity(line.product)
        const usedElsewhere = sumQuantityForProduct(prev, line.product.id, lineKey)
        const room = Math.max(0, maxForProduct - usedElsewhere)
        const nextQty = Math.min(room, quantity)
        if (nextQty < 1) {
          const next = { ...prev }
          delete next[lineKey]
          return next
        }

        return {
          ...prev,
          [lineKey]: {
            ...line,
            quantity: nextQty,
          },
        }
      })
    },
    [shoppingPaused, showPausedModal],
  )

  const clearCart = useCallback(() => {
    setLinesByKey({})
  }, [])

  const lines = useMemo(() => Object.values(linesByKey), [linesByKey])
  const itemCount = useMemo(() => lines.reduce((sum, line) => sum + line.quantity, 0), [lines])
  const subtotalCents = useMemo(
    () =>
      lines.reduce(
        (sum, line) =>
          sum + unitPriceWithOptions(line.product.priceInCents, line.selectedOptions) * line.quantity,
        0,
      ),
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
      quantityForProduct,
      remainingForProduct,
    }),
    [
      lines,
      itemCount,
      subtotalCents,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      quantityForProduct,
      remainingForProduct,
    ],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart must be used within CartProvider')
  return value
}

export { formatSelectedOptions }
