import { useEffect, useState } from 'react'
import { freeShippingBannerAmount } from '../lib/freeShipping'
import { useFreeShippingThresholdCents } from '../lib/useFreeShippingThreshold'
import { uiClick } from '../lib/uiSounds'

const STORAGE_KEY = 'okonani-free-shipping-banner-dismissed'

export default function FreeShippingBanner() {
  const thresholdCents = useFreeShippingThresholdCents()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) !== '1')
    } catch {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  function dismiss() {
    uiClick('soft')
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
  }

  return (
    <div className="free-shipping-banner" role="status">
      <p className="free-shipping-banner-text">
        <span className="free-shipping-banner-copy">free shipping on orders over</span>
        <span className="free-shipping-banner-amount">{freeShippingBannerAmount(thresholdCents)}</span>
      </p>
      <button
        type="button"
        className="free-shipping-banner-close"
        onClick={dismiss}
        aria-label="Dismiss free shipping banner"
      >
        x
      </button>
    </div>
  )
}
