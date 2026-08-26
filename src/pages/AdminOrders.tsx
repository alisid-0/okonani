import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Price } from '../lib/readableNumbers'
import { getProductCover } from '../data/products'
import { resolveProductOptionGroups } from '../data/productOptions'
import {
  getAdminOrderRates,
  listAdminOrders,
  listAdminProducts,
  listAdminProductTypes,
  markOrderFulfilledWithStamp,
  purchaseAdminOrderLabel,
  resetOrderFulfillment,
  type AdminOrder,
  type AdminOrderItem,
  type AdminProduct,
} from '../lib/adminApi'
import type { ProductType } from '../data/productTypes'
import { packageTypeLabel, type PackageType } from '../lib/packaging'
import { playUiSound, uiClick } from '../lib/uiSounds'

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

type DisplayOrderOption = {
  groupName: string
  choiceLabel: string
  imageUrl?: string
}

type DisplayOrderItem = {
  quantity: number
  name: string
  amountCents: number
  coverUrl: string | null
  options: DisplayOrderOption[]
}

function resolveDisplayItem(
  item: AdminOrderItem,
  productsById: Map<string, AdminProduct>,
  productTypes: ProductType[],
): DisplayOrderItem {
  const product = item.productId ? productsById.get(item.productId) : undefined
  const coverUrl = item.imageUrl || (product ? getProductCover(product) : null)
  const groups = product
    ? resolveProductOptionGroups(product, productTypes.find((type) => type.id === product.productTypeId))
    : []

  const options = item.selectedOptions.map((option) => {
    if (option.imageUrl) {
      return {
        groupName: option.groupName,
        choiceLabel: option.choiceLabel,
        imageUrl: option.imageUrl,
      }
    }

    const group =
      groups.find(
        (entry) =>
          entry.id === option.groupId || entry.name === option.groupName,
      ) ?? null
    const choice =
      group?.choices.find(
        (entry) =>
          entry.id === option.choiceId || entry.label === option.choiceLabel,
      ) ?? null

    return {
      groupName: option.groupName,
      choiceLabel: option.choiceLabel,
      ...(choice?.imageUrl ? { imageUrl: choice.imageUrl } : {}),
    }
  })

  return {
    quantity: item.quantity,
    name: item.name,
    amountCents: item.amountCents || item.unitAmountCents * item.quantity,
    coverUrl,
    options,
  }
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
  const [catalogProducts, setCatalogProducts] = useState<AdminProduct[]>([])
  const [catalogProductTypes, setCatalogProductTypes] = useState<ProductType[]>([])

  function selectOrder(orderId: string) {
    uiClick('tap')
    setSelectedId(orderId)
    const params = new URLSearchParams(searchParams)
    params.set('panel', 'orders')
    params.set('order', orderId)
    setSearchParams(params, { replace: true })
  }

  const selected = orders.find((order) => order.id === selectedId) ?? null
  const productsById = useMemo(() => {
    const map = new Map<string, AdminProduct>()
    for (const product of catalogProducts) map.set(product.id, product)
    return map
  }, [catalogProducts])
  const displayItems = useMemo(
    () =>
      selected
        ? selected.items.map((item) => resolveDisplayItem(item, productsById, catalogProductTypes))
        : [],
    [selected, productsById, catalogProductTypes],
  )
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
      const [next, catalog] = await Promise.all([
        listAdminOrders(),
        Promise.all([listAdminProducts(), listAdminProductTypes()]).then(([products, types]) => ({
          products: products.products,
          types,
        })),
      ])
      setOrders(next)
      setCatalogProducts(catalog.products)
      setCatalogProductTypes(catalog.types)
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
      playUiSound('success')
    } catch (err) {
      console.error('[AdminOrders] reset fulfillment failed', err)
      setError(err instanceof Error ? err.message : 'Could not reset order')
      playUiSound('soft')
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
      playUiSound('success')
    } catch (err) {
      console.error('[AdminOrders] stamp fulfill failed', err)
      setError(err instanceof Error ? err.message : 'Could not mark order fulfilled')
      playUiSound('soft')
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
      playUiSound(result.rates.length > 0 ? 'success' : 'soft')
    } catch (err) {
      console.error('[AdminOrders] get rates failed', err)
      setError(err instanceof Error ? err.message : 'Could not load shipping rates')
      playUiSound('soft')
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
      playUiSound('success')
    } catch (err) {
      console.error('[AdminOrders] buy label failed', err)
      setError(err instanceof Error ? err.message : 'Could not purchase label')
      playUiSound('soft')
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
              onClick={() => {
                uiClick('tap')
                setFilter('unfulfilled')
              }}
            >
              Unfulfilled
            </button>
            <button
              type="button"
              className={`admin-tab ${filter === 'all' ? 'is-active' : ''}`}
              onClick={() => {
                uiClick('tap')
                setFilter('all')
              }}
            >
              All
            </button>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              uiClick('soft')
              void loadOrders(selectedId || undefined)
            }}
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
                    <Price cents={order.amountTotal} /> · {order.fulfillmentStatus}
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
                    {selected.fulfillmentStatus} · <Price cents={selected.amountTotal} />
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
                        ? <> (<Price cents={selected.shippingAmountCents} />)</>
                        : ''}
                    </p>
                  )}
                </div>
                <div>
                  <h3>Items</h3>
                  <ul className="admin-orders-items">
                    {displayItems.map((item, index) => (
                      <li key={`${item.name}-${index}`} className="admin-orders-line">
                        <div className="admin-orders-line-media">
                          {item.coverUrl ?
                            <img
                              src={item.coverUrl}
                              alt=""
                              className="admin-orders-line-cover"
                            />
                          : <div className="admin-orders-line-cover is-placeholder" aria-hidden />}
                          {item.options
                            .filter((option) => option.imageUrl)
                            .map((option) => (
                              <img
                                key={`${option.groupName}-${option.choiceLabel}`}
                                src={option.imageUrl}
                                alt=""
                                className="admin-orders-line-option-thumb"
                                title={`${option.groupName}: ${option.choiceLabel}`}
                              />
                            ))}
                        </div>
                        <div className="admin-orders-line-copy">
                          <p className="admin-orders-line-title">
                            {item.quantity} × {item.name}{' '}
                            <span>
                              <Price cents={item.amountCents} />
                            </span>
                          </p>
                          {item.options.length > 0 && (
                            <ul className="admin-orders-item-options">
                              {item.options.map((option) => (
                                <li key={`${option.groupName}-${option.choiceLabel}`}>
                                  {option.groupName}: {option.choiceLabel}
                                </li>
                              ))}
                            </ul>
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
                      uiClick('soft')
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
                            onChange={() => {
                              uiClick('soft')
                              setSelectedRateId(rate.objectId)
                            }}
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
