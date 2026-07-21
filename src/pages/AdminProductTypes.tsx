import { type FormEvent, useEffect, useState } from 'react'
import { formatPrice } from '../data/products'
import type { ProductType } from '../data/productTypes'
import {
  deleteAdminProductType,
  installDefaultProductTypes,
  listAdminProductTypes,
  saveAdminProductType,
} from '../lib/adminApi'

type ProductTypeForm = {
  id: string
  name: string
  description: string
  defaultPrice: string
  shipsAsLetter: boolean
  active: boolean
}

const emptyForm = (): ProductTypeForm => ({
  id: '',
  name: '',
  description: '',
  defaultPrice: '3.00',
  shipsAsLetter: true,
  active: true,
})

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function dollarsToCents(value: string): number {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(parsed * 100)
}

function toForm(type: ProductType): ProductTypeForm {
  return {
    id: type.id,
    name: type.name,
    description: type.description,
    defaultPrice: (type.defaultPriceCents / 100).toFixed(2),
    shipsAsLetter: type.shipsAsLetter,
    active: type.active,
  }
}

export default function AdminProductTypes() {
  const [types, setTypes] = useState<ProductType[]>([])
  const [form, setForm] = useState<ProductTypeForm>(emptyForm())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setTypes(await listAdminProductTypes())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load product types')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function startCreate() {
    setForm(emptyForm())
    setMessage(null)
    setError(null)
  }

  function startEdit(type: ProductType) {
    setForm(toForm(type))
    setMessage(null)
    setError(null)
  }

  async function handleInstallDefaults() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const installed = await installDefaultProductTypes()
      setTypes(installed)
      setMessage('Installed default product types (Sticker, Sheet, Charm).')
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

    const id = form.id.trim() || slugify(form.name)
    const existing = types.find((type) => type.id === id)

    try {
      const saved = await saveAdminProductType({
        id,
        name: form.name,
        description: form.description,
        defaultPriceCents: dollarsToCents(form.defaultPrice),
        shippingTypeId: form.shipsAsLetter ? 'letter' : 'bubble-mailer',
        shipsAsLetter: form.shipsAsLetter,
        maxLetterQty: form.shipsAsLetter ? 10 : 0,
        sortOrder: existing?.sortOrder ?? 0,
        active: form.active,
      })
      setMessage(`Saved product type “${saved.name}”.`)
      setForm(toForm(saved))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save product type')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this product type? Products using it will clear the type.')) return
    setSaving(true)
    setError(null)
    try {
      await deleteAdminProductType(id)
      if (form.id === id) startCreate()
      await load()
      setMessage('Product type deleted.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete product type')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-categories">
      <header className="admin-main-header">
        <div>
          <p className="admin-main-eyebrow">Catalog</p>
          <h1>Product types</h1>
          <p className="admin-empty-copy">
            Mark stickers/sheets as letter-eligible. Those carts can choose Untracked letter (≤ max
            items) or Bubble mailer. Everything else ships as Bubble mailer only.
          </p>
        </div>
        <div className="admin-main-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={startCreate}>
            New type
          </button>
          {types.length === 0 && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void handleInstallDefaults()}
              disabled={saving}
            >
              Install defaults
            </button>
          )}
        </div>
      </header>

      {message && <p className="admin-alert admin-alert-success">{message}</p>}
      {error && <p className="admin-alert admin-alert-error">{error}</p>}

      <div className="admin-categories-layout">
        <form className="admin-editor admin-card" onSubmit={handleSubmit}>
          <label>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </label>
          <label>
            Id
            <input
              value={form.id}
              onChange={(e) => setForm((prev) => ({ ...prev, id: e.target.value }))}
              placeholder="auto from name"
              disabled={Boolean(types.find((type) => type.id === form.id))}
            />
          </label>
          <label>
            Description
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </label>
          <label>
            Default price ($)
            <input
              value={form.defaultPrice}
              onChange={(e) => setForm((prev) => ({ ...prev, defaultPrice: e.target.value }))}
              inputMode="decimal"
              required
            />
          </label>
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={form.shipsAsLetter}
              onChange={(e) => setForm((prev) => ({ ...prev, shipsAsLetter: e.target.checked }))}
            />
            <span>Can ship as untracked letter (stickers / sheets)</span>
          </label>
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
            />
            <span>Active</span>
          </label>
          <div className="admin-main-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save product type'}
            </button>
            {form.id && types.some((type) => type.id === form.id) && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void handleDelete(form.id)}
                disabled={saving}
              >
                Delete
              </button>
            )}
          </div>
        </form>

        <section className="admin-card">
          <h2>All product types</h2>
          {loading && <p>Loading…</p>}
          {!loading && types.length === 0 && (
            <p className="admin-empty-copy">No product types yet. Install defaults to get started.</p>
          )}
          <ul className="admin-orders-list">
            {types.map((type) => (
              <li key={type.id}>
                <button type="button" className="admin-sidebar-item" onClick={() => startEdit(type)}>
                  <span className="admin-sidebar-copy">
                    <strong>{type.name}</strong>
                    <span>
                      {formatPrice(type.defaultPriceCents)} ·{' '}
                      {type.shipsAsLetter ? 'Letter-eligible' : 'Bubble mailer'} ·{' '}
                      {type.active ? 'Active' : 'Off'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
