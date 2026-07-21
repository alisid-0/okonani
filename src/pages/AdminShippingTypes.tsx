import { type FormEvent, useEffect, useState } from 'react'
import { formatPrice } from '../data/products'
import type { ShippingType } from '../data/shippingTypes'
import {
  installDefaultShippingTypes,
  listAdminShippingTypes,
  saveAdminShippingType,
} from '../lib/adminApi'

type LetterForm = {
  id: string
  flatFee: string
  maxItems: string
  active: boolean
}

const emptyForm = (): LetterForm => ({
  id: 'letter',
  flatFee: '1.50',
  maxItems: '10',
  active: true,
})

function dollarsToCents(value: string): number {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(parsed * 100)
}

function findLetterType(types: ShippingType[]): ShippingType | null {
  return (
    types.find((type) => type.id === 'letter') ||
    types.find((type) => type.packageType === 'envelope' || type.shipClass === 'letter') ||
    null
  )
}

function toForm(type: ShippingType): LetterForm {
  return {
    id: type.id,
    flatFee: (type.baseRateCents / 100).toFixed(2),
    maxItems: String(type.maxItems > 0 ? type.maxItems : 10),
    active: type.active,
  }
}

export default function AdminShippingTypes() {
  const [types, setTypes] = useState<ShippingType[]>([])
  const [form, setForm] = useState<LetterForm>(emptyForm())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const next = await listAdminShippingTypes()
      setTypes(next)
      const letter = findLetterType(next)
      if (letter) setForm(toForm(letter))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load shipping settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleInstallDefaults() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const installed = await installDefaultShippingTypes()
      setTypes(installed)
      const letter = findLetterType(installed)
      if (letter) setForm(toForm(letter))
      setMessage('Installed letter shipping settings.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not install defaults')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)

    const existing = findLetterType(types)

    try {
      const saved = await saveAdminShippingType({
        id: form.id || 'letter',
        name: 'Untracked letter',
        packageType: 'envelope',
        postageMode: 'stamp',
        shipClass: 'letter',
        baseRateCents: dollarsToCents(form.flatFee),
        freeAboveSubtotalCents: null,
        includedWeightOz: 3,
        overweightCentsPerOz: 0,
        maxWeightOz: 3,
        maxThicknessIn: 0.25,
        maxItems: Math.max(1, Number.parseInt(form.maxItems, 10) || 10),
        sortOrder: existing?.sortOrder ?? 1,
        active: form.active,
      })
      setMessage(`Saved untracked letter fee (${formatPrice(saved.baseRateCents)}).`)
      setForm(toForm(saved))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save letter settings')
    } finally {
      setSaving(false)
    }
  }

  const letter = findLetterType(types)

  return (
    <div className="admin-categories">
      <header className="admin-main-header">
        <div>
          <p className="admin-main-eyebrow">Fulfillment</p>
          <h1>Shipping</h1>
          <p className="admin-empty-copy">
            Stripe Checkout collects the address, then Shippo prices Bubble mailer live. Configure only
            the Untracked letter flat fee below (offered when the cart is letter-eligible).
          </p>
        </div>
        <div className="admin-main-actions">
          {!letter && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void handleInstallDefaults()}
              disabled={saving}
            >
              Install letter settings
            </button>
          )}
        </div>
      </header>

      {message && <p className="admin-alert admin-alert-success">{message}</p>}
      {error && <p className="admin-alert admin-alert-error">{error}</p>}

      <div className="admin-categories-layout">
        <form className="admin-editor admin-card" onSubmit={handleSubmit}>
          <h2>Untracked letter</h2>
          {loading && <p>Loading…</p>}
          <label>
            Flat fee ($)
            <input
              value={form.flatFee}
              onChange={(e) => setForm((prev) => ({ ...prev, flatFee: e.target.value }))}
              inputMode="decimal"
              required
            />
          </label>
          <label>
            Max letter items
            <input
              value={form.maxItems}
              onChange={(e) => setForm((prev) => ({ ...prev, maxItems: e.target.value }))}
              inputMode="numeric"
              min={1}
              required
            />
          </label>
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
            />
            <span>Offer untracked letter when eligible</span>
          </label>
          <div className="admin-main-actions">
            <button type="submit" className="btn btn-primary" disabled={saving || loading}>
              {saving ? 'Saving…' : 'Save letter settings'}
            </button>
          </div>
        </form>

        <section className="admin-card">
          <h2>At checkout</h2>
          <ul className="admin-orders-list">
            <li>
              <div className="admin-sidebar-item">
                <span className="admin-sidebar-copy">
                  <strong>Untracked letter</strong>
                  <span>
                    Flat fee · ≤ {form.maxItems || '10'} items ·{' '}
                    {letter ? formatPrice(letter.baseRateCents) : 'not set'}
                  </span>
                </span>
              </div>
            </li>
            <li>
              <div className="admin-sidebar-item">
                <span className="admin-sidebar-copy">
                  <strong>Bubble mailer</strong>
                  <span>Live Shippo rate after address entry</span>
                </span>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}
