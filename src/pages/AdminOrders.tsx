import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { formatPrice } from '../data/products'
import {
  getAdminOrderRates,
  listAdminOrders,
  markOrderFulfilledWithStamp,
  purchaseAdminOrderLabel,
  resetOrderFulfillment,
  type AdminOrder,
} from '../lib/adminApi'
import { packageTypeLabel, type PackageType } from '../lib/packaging'

function formatOrderDate(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatAddress(order: AdminOrder): string {
  const address = order.shippingAddress
  if (!address?.line1) return 'No shipping address'
  return [
    address.name,
    address.line1,
    address.line2,
    `${address.city}, ${address.state} ${address.postalCode}`,
    address.country,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Prefer what the customer paid for at checkout over letter packaging heuristics. */
function packageTypeFromOrder(order: AdminOrder): PackageType {
  const rate = (order.shippingRateName || '').toLowerCase()
  if (rate.includes('bubble') || rate.includes('mailer')) return 'bubble_mailer'
  if (rate.includes('letter') || rate.includes('stamp')) return 'envelope'
  if (
    order.packageType === 'envelope' ||
    order.packageType === 'bubble_mailer' ||
    order.packageType === 'box'
  ) {
    return order.packageType
  }
  return 'bubble_mailer'
}

export default function AdminOrders({ initialOrderId = null }: { initialOrderId?: string | null }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(initialOrderId)
  const [filter, setFilter] = useState<'unfulfilled' | 'all'>(initialOrderId ? 'all' : 'unfulfilled')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [packageType, setPackageType] = useState<PackageType>('bubble_mailer')
  const [rates, setRates] = useState<
    Array<{
      objectId: string
      provider: string
      service: string
      amount: string
      currency: string
      estimatedDays: number | null
    }>
  >([])
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null)

  function selectOrder(orderId: string) {
    setSelectedId(orderId)
    const params = new URLSearchParams(searchParams)
    params.set('panel', 'orders')
    params.set('order', orderId)
    setSearchParams(params, { replace: true })
  }

  const selected = orders.find((order) => order.id === selectedId) ?? null
  const visibleOrders =
    filter === 'unfulfilled' ?
      orders.filter((order) => order.fulfillmentStatus === 'unfulfilled')
    : orders

  const needsLabel = packageType !== 'envelope'
  const missingAddress = Boolean(selected && !selected.shippingAddress?.line1)

  async function loadOrders(selectId?: string) {
    setLoading(true)
    setError(null)

    try {
      const next = await listAdminOrders()
      setOrders(next)
      const preferred = selectId || initialOrderId
      const nextSelected =
        preferred && next.some((order) => order.id === preferred) ?
          preferred
        : next.find((order) => order.fulfillmentStatus === 'unfulfilled')?.id ?? next[0]?.id ?? null
      setSelectedId(nextSelected)
      if (preferred && next.some((order) => order.id === preferred)) {
        setFilter('all')
      }
      if (nextSelected) {
        const params = new URLSearchParams(searchParams)
        params.set('panel', 'orders')
        params.set('order', nextSelected)
        setSearchParams(params, { replace: true })
      }
    } catch (err) {
      console.error('[AdminOrders] loadOrders failed', err)
      setError(err instanceof Error ? err.message : 'Could not load orders')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOrders(initialOrderId || undefined)
  }, [initialOrderId])

  useEffect(() => {
    if (!selected) return
    setPackageType(packageTypeFromOrder(selected))
    setRates([])
    setSelectedRateId(null)
    setMessage(null)
    setError(null)
    setBusyLabel(null)
  }, [selected?.id])

  async function handleResetFulfillment() {
    if (!selected) return
    if (
      !window.confirm(
        'Reset this order to unfulfilled? Clears the test/old label and tracking so you can buy a new live Shippo label.',
      )
    ) {
      return
    }

    setBusy(true)
    setBusyLabel('Resetting fulfillment…')
    setError(null)
    setMessage(null)

    try {
      await resetOrderFulfillment(selected.id)
      setRates([])
      setSelectedRateId(null)
      setMessage('Order reset to unfulfilled. Get Shippo rates, then buy a live label.')
      await loadOrders(selected.id)
    } catch (err) {
      console.error('[AdminOrders] reset fulfillment failed', err)
      setError(err instanceof Error ? err.message : 'Could not reset order')
    } finally {
      setBusy(false)
      setBusyLabel(null)
    }
  }

  async function handleStampFulfill() {
    if (!selected) return
    setBusy(true)
    setBusyLabel('Marking as packed…')
    setError(null)
    setMessage(null)

    try {
      await markOrderFulfilledWithStamp(selected.id, packageType)
      setMessage('Marked as packed with stamp.')
      await loadOrders(selected.id)
    } catch (err) {
      console.error('[AdminOrders] stamp fulfill failed', err)
      setError(err instanceof Error ? err.message : 'Could not mark order fulfilled')
    } finally {
      setBusy(false)
      setBusyLabel(null)
    }
  }

  async function handleLoadRates() {
    if (!selected) return

    if (missingAddress) {
      setError('This order has no shipping address yet. Hit Refresh, or check Stripe for the session.')
      return
    }

    if (!needsLabel) {
      setError(
        'Package type is set to Envelope (letter). Switch it to Bubble mailer above, then try again.',
      )
      return
    }

    setBusy(true)
    setBusyLabel('Requesting live Shippo rates…')
    setError(null)
    setMessage(null)
    setRates([])

    try {
      const result = await getAdminOrderRates(selected.id, packageType)
      if (result.postageMode === 'stamp') {
        setRates([])
        setSelectedRateId(null)
        setMessage(result.message || 'Letter-eligible — use stamp fulfillment instead.')
        return
      }

      setRates(result.rates)
      setSelectedRateId(result.recommendedRateId)
      setMessage(
        result.rates.length > 0 ?
          `Loaded ${result.rates.length} rate${result.rates.length === 1 ? '' : 's'} from Shippo. Pick one, then Buy & print label.`
        : 'Shippo returned no rates. Check SHIPPO_API_TOKEN and SHIP_FROM_* in .env / secrets.',
      )
    } catch (err) {
      console.error('[AdminOrders] get rates failed', err)
      setError(err instanceof Error ? err.message : 'Could not load shipping rates')
    } finally {
      setBusy(false)
      setBusyLabel(null)
    }
  }

  async function handleBuyLabel() {
    if (!selected) return

    if (missingAddress) {
      setError('This order has no shipping address yet. Hit Refresh, or check Stripe for the session.')
      return
    }

    if (!needsLabel) {
      setError(
        'Package type is set to Envelope (letter). Switch it to Bubble mailer above, then try again.',
      )
      return
    }

    if (rates.length > 0 && !selectedRateId) {
      setError('Select a Shippo rate first (or click Get Shippo rates).')
      return
    }

    setBusy(true)
    setBusyLabel(
      selectedRateId ? 'Buying Shippo label…' : 'Getting a rate, then buying Shippo label…',
    )
    setError(null)
    setMessage(null)

    try {
      const result = await purchaseAdminOrderLabel(selected.id, {
        rateId: selectedRateId || undefined,
        packageType,
      })

      if (result.labelUrl) {
        window.open(result.labelUrl, '_blank', 'noopener,noreferrer')
      }

      setMessage(
        [
          result.trackingNumber ? `Label purchased. Tracking: ${result.trackingNumber}` : 'Label purchased.',
          result.labelUrl ? 'Label PDF opened in a new tab.' : 'No label PDF URL returned.',
          result.emailSent ? 'Shipping email sent to customer.' : null,
          !result.emailSent && result.emailNote ? `(Email skipped: ${result.emailNote})` : null,
        ]
          .filter(Boolean)
          .join(' '),
      )
      await loadOrders(selected.id)
    } catch (err) {
      console.error('[AdminOrders] buy label failed', err)
      setError(err instanceof Error ? err.message : 'Could not purchase label')
    } finally {
      setBusy(false)
      setBusyLabel(null)
    }
  }

  return (
    <div className="admin-orders">
      <header className="admin-main-header">
        <div>
          <p className="admin-main-eyebrow">Fulfillment</p>
          <h1>Orders</h1>
        </div>
        <div className="admin-main-actions">
          <div className="admin-orders-filters">
            <button
              type="button"
              className={`admin-tab ${filter === 'unfulfilled' ? 'is-active' : ''}`}
              onClick={() => setFilter('unfulfilled')}
            >
              Unfulfilled
            </button>
            <button
              type="button"
              className={`admin-tab ${filter === 'all' ? 'is-active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void loadOrders(selectedId || undefined)}
          >
            Refresh
          </button>
        </div>
      </header>

      <div className="admin-orders-layout">
        <aside className="admin-card admin-orders-list" aria-label="Orders">
          {loading && <p className="admin-empty-copy">Loading…</p>}
          {!loading && visibleOrders.length === 0 && (
            <p className="admin-empty-copy">
              {filter === 'unfulfilled' ? 'No unfulfilled orders.' : 'No orders yet.'}
            </p>
          )}
          <ul>
            {visibleOrders.map((order) => (
              <li key={order.id}>
                <button
                  type="button"
                  className={`admin-orders-item ${selectedId === order.id ? 'is-selected' : ''}`}
                  onClick={() => selectOrder(order.id)}
                >
                  <strong>
                    {order.shippingAddress?.name || order.customerName || order.email || 'Guest order'}
                  </strong>
                  <span>
                    {formatPrice(order.amountTotal)} · {order.fulfillmentStatus}
                  </span>
                  <span>
                    {order.email || 'No email'} · {formatOrderDate(order.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="admin-card admin-orders-detail">
          {!selected && <p className="admin-empty-copy">Select an order to fulfill.</p>}

          {selected && (
            <>
              <div className="admin-orders-detail-top">
                <div>
                  <h2>
                    {selected.shippingAddress?.name ||
                      selected.customerName ||
                      selected.email ||
                      'Guest order'}
                  </h2>
                  <p className="admin-meta">
                    {selected.email || 'No email'} · {formatOrderDate(selected.createdAt)} ·{' '}
                    {selected.fulfillmentStatus} · {formatPrice(selected.amountTotal)}
                  </p>
                </div>
                {selected.labelUrl && (
                  <a
                    className="btn btn-outline btn-sm"
                    href={selected.labelUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open label PDF
                  </a>
                )}
              </div>

              <div className="admin-orders-grid">
                <div>
                  <h3>Ship to</h3>
                  <pre className="admin-orders-address">{formatAddress(selected)}</pre>
                  {selected.phone && <p className="admin-meta">Phone: {selected.phone}</p>}
                  {selected.shippingRateName && (
                    <p className="admin-meta">
                      Paid shipping: {selected.shippingRateName}
                      {typeof selected.shippingAmountCents === 'number'
                        ? ` (${formatPrice(selected.shippingAmountCents)})`
                        : ''}
                    </p>
                  )}
                </div>
                <div>
                  <h3>Items</h3>
                  <ul className="admin-orders-items">
                    {selected.items.map((item, index) => (
                      <li key={`${item.productId || item.name}-${index}`}>
                        <div>
                          {item.quantity} × {item.name}{' '}
                          <span>
                            {formatPrice(item.amountCents || item.unitAmountCents * item.quantity)}
                          </span>
                          {item.selectedOptions.length > 0 && (
                            <p className="admin-orders-item-options">
                              {item.selectedOptions
                                .map((option) => `${option.groupName}: ${option.choiceLabel}`)
                                .join(' · ')}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="admin-orders-packaging">
                <h3>Packaging</h3>
                {selected.packagingSuggestion && (
                  <p className="admin-orders-reason">{selected.packagingSuggestion.reason}</p>
                )}
                <label>
                  Package type
                  <select
                    value={packageType}
                    onChange={(e) => {
                      setPackageType(e.target.value as PackageType)
                      setRates([])
                      setSelectedRateId(null)
                      setError(null)
                      setMessage(null)
                    }}
                    disabled={busy || selected.fulfillmentStatus === 'fulfilled'}
                  >
                    <option value="envelope">{packageTypeLabel('envelope')}</option>
                    <option value="bubble_mailer">{packageTypeLabel('bubble_mailer')}</option>
                    <option value="box">{packageTypeLabel('box')}</option>
                  </select>
                </label>
                <p className="admin-meta">
                  {needsLabel ?
                    'Carrier label via Shippo (Get rates → Buy & print).'
                  : 'Untracked letter — use Mark packed (stamp), not Shippo.'}
                </p>
              </div>

              {(selected.trackingNumber || selected.trackingStatus) && (
                <div className="admin-orders-tracking">
                  <h3>Tracking</h3>
                  <p className="admin-meta">
                    Status:{' '}
                    <strong>{selected.trackingStatus || 'Label created'}</strong>
                    {selected.trackingStatusDetail ? ` — ${selected.trackingStatusDetail}` : ''}
                  </p>
                  {selected.trackingNumber && (
                    <p className="admin-meta">
                      {selected.carrier ? `${selected.carrier} ` : ''}
                      {selected.trackingUrl ?
                        <a href={selected.trackingUrl} target="_blank" rel="noreferrer">
                          {selected.trackingNumber}
                        </a>
                      : selected.trackingNumber}
                    </p>
                  )}
                  {selected.deliveredAt && (
                    <p className="admin-meta">Delivered: {formatOrderDate(selected.deliveredAt)}</p>
                  )}
                </div>
              )}

              {selected.fulfillmentStatus === 'fulfilled' && (
                <div className="admin-orders-actions-block">
                  <div className="admin-orders-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={busy}
                      onClick={() => void handleResetFulfillment()}
                    >
                      Reset fulfillment
                    </button>
                  </div>
                  <p className="admin-meta">
                    Use this if the label was a Shippo test/sample — clears tracking so you can buy a
                    live label.
                  </p>
                  {busyLabel && (
                    <p className="admin-orders-status" role="status">
                      {busyLabel}
                    </p>
                  )}
                  {message && <p className="admin-alert admin-alert-success">{message}</p>}
                  {error && <p className="admin-alert admin-alert-error">{error}</p>}
                </div>
              )}

              {selected.fulfillmentStatus !== 'fulfilled' && (
                <div className="admin-orders-actions-block">
                  <div className="admin-orders-actions">
                    {!needsLabel && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={busy}
                        onClick={() => void handleStampFulfill()}
                      >
                        Mark packed (stamp)
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy || missingAddress}
                      onClick={() => void handleLoadRates()}
                    >
                      Get Shippo rates
                    </button>

                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy || missingAddress}
                      onClick={() => void handleBuyLabel()}
                    >
                      Buy & print label
                    </button>
                  </div>

                  {busyLabel && (
                    <p className="admin-orders-status" role="status">
                      {busyLabel}
                    </p>
                  )}
                  {message && <p className="admin-alert admin-alert-success">{message}</p>}
                  {error && <p className="admin-alert admin-alert-error">{error}</p>}
                  {missingAddress && (
                    <p className="admin-alert admin-alert-error">
                      No shipping address on this order — Shippo buttons stay disabled until Refresh
                      backfills it from Stripe.
                    </p>
                  )}
                  {!needsLabel && !busy && !error && (
                    <p className="admin-meta">
                      Tip: customer paid for a carrier label? Set package type to Bubble mailer first.
                    </p>
                  )}
                </div>
              )}

              {rates.length > 0 && (
                <div className="admin-orders-rates">
                  <h3>Shippo rates</h3>
                  <ul>
                    {rates.map((rate) => (
                      <li key={rate.objectId}>
                        <label className="admin-orders-rate">
                          <input
                            type="radio"
                            name="shippo-rate"
                            checked={selectedRateId === rate.objectId}
                            onChange={() => setSelectedRateId(rate.objectId)}
                          />
                          <span>
                            {rate.provider} {rate.service} — ${rate.amount}
                            {rate.estimatedDays != null ? ` · ~${rate.estimatedDays} days` : ''}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
