import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { useSiteSettings } from '../data/siteSettings'

const SESSION_KEY = 'okonani-shop-paused-modal-seen'

type ShopPauseContextValue = {
  shoppingPaused: boolean
  showPausedModal: () => void
}

const ShopPauseContext = createContext<ShopPauseContextValue | null>(null)

export function ShopPausedModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <div
      className="shop-paused-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shop-paused-title"
    >
      <div className="shop-paused-modal-panel">
        <h2 id="shop-paused-title">Shop Under Construction</h2>
        <p>Feel free to browse the site while we work on the shop. We will be up soon!</p>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  )
}

export function ShopPauseProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { settings, loading } = useSiteSettings()
  const shoppingPaused = settings.shoppingPaused === true
  const isAdminRoute = pathname.startsWith('/admin')
  const [modalOpen, setModalOpen] = useState(false)

  const showPausedModal = useCallback(() => {
    setModalOpen(true)
  }, [])

  useEffect(() => {
    if (loading || !shoppingPaused || isAdminRoute) return

    try {
      if (sessionStorage.getItem(SESSION_KEY) === '1') return
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      // sessionStorage may be unavailable; still show once this mount
    }

    setModalOpen(true)
  }, [loading, shoppingPaused, isAdminRoute])

  useEffect(() => {
    if (shoppingPaused) return
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // ignore
    }
  }, [shoppingPaused])

  const value = useMemo(
    () => ({
      shoppingPaused,
      showPausedModal,
    }),
    [shoppingPaused, showPausedModal],
  )

  return (
    <ShopPauseContext.Provider value={value}>
      {children}
      {!isAdminRoute && (
        <ShopPausedModal open={modalOpen} onClose={() => setModalOpen(false)} />
      )}
    </ShopPauseContext.Provider>
  )
}

export function useShopPause() {
  const ctx = useContext(ShopPauseContext)
  if (!ctx) throw new Error('useShopPause must be used within ShopPauseProvider')
  return ctx
}
