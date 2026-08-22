import { type FormEvent, useEffect, useState } from 'react'
import ProductOptionsEditorModal from '../components/ProductOptionsEditorModal'
import ProductShopperPreviewModal from '../components/ProductShopperPreviewModal'
import { formatPrice } from '../data/products'
import type { ProductOptionGroup } from '../data/productOptions'
import type { ProductType } from '../data/productTypes'
import {
  deleteAdminProductType,
  installDefaultProductTypes,
  listAdminProductTypes,
  saveAdminProductType,
} from '../lib/adminApi'
import { playUiSound, uiClick } from '../lib/uiSounds'

type ProductTypeForm = {
  id: string
  name: string
  description: string
  defaultPrice: string
  shipsAsLetter: boolean
  active: boolean
  optionGroups: ProductOptionGroup[]
}

const emptyForm = (): ProductTypeForm => ({
  id: '',
  name: '',
  description: '',
  defaultPrice: '3.00',
  shipsAsLetter: true,
  active: true,
  optionGroups: [],
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
    optionGroups: type.optionGroups ?? [],
  }
}

export default function AdminProductTypes() {
  const [types, setTypes] = useState<ProductType[]>([])
  const [form, setForm] = useState<ProductTypeForm>(emptyForm())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const isEditingExisting = Boolean(form.id && types.some((type) => type.id === form.id))
  const optionCount = form.optionGroups.filter((group) => group.name.trim()).length

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
    uiClick('tap')
    setForm(emptyForm())
    setMessage(null)
    setError(null)
  }

  function startEdit(type: ProductType) {
    uiClick('tap')
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
      if (installed[0]) setForm(toForm(installed[0]))
      playUiSound('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not install defaults')
      playUiSound('soft')
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
        optionGroups: form.optionGroups,
        sortOrder: existing?.sortOrder ?? 0,
        active: form.active,
      })
      setMessage(`Saved product type “${saved.name}”.`)
      setForm(toForm(saved))
      await load()
      playUiSound('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save product type')
      playUiSound('soft')
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
      if (form.id === id) {
        setForm(emptyForm())
        setMessage(null)
        setError(null)
      }
      await load()
      setMessage('Product type deleted.')
      playUiSound('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete product type')
      playUiSound('soft')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-product-types">
      <header className="admin-main-header">
        <div>
          <p className="admin-main-eyebrow">Catalog</p>
          <h1>Product types</h1>
          <p className="admin-main-lead">
            Templates for shipping and shopper options. Products inherit these, or override them.
          </p>
        </div>
        <div className="admin-main-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
            + New type
          </button>
        </div>
      </header>

      {message && <p className="admin-alert admin-alert-success">{message}</p>}
      {error && <p className="admin-alert admin-alert-error">{error}</p>}

      <div className="admin-product-types-layout">
        <aside className="admin-card admin-product-types-list" aria-label="Product types">
          <div className="admin-card-header">
            <div>
              <h2>Your types</h2>
              <p>
                {loading ? 'Loading…' : `${types.length} type${types.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>

          {!loading && types.length === 0 && (
            <div className="admin-product-types-empty">
              <p className="admin-empty-copy">
                No product types yet. Install Sticker, Sheet, and Charm to get started, or create
                your own.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void handleInstallDefaults()}
                disabled={saving}
              >
                Install defaults
              </button>
            </div>
          )}

          {types.length > 0 && (
            <ul className="admin-product-types-items">
              {types.map((type) => {
                const selected = form.id === type.id
                const options = type.optionGroups?.length ?? 0
                return (
                  <li key={type.id}>
                    <button
                      type="button"
                      className={`admin-product-type-item ${selected ? 'is-selected' : ''}`}
                      onClick={() => startEdit(type)}
                    >
                      <span className="admin-product-type-item-top">
                        <strong>{type.name}</strong>
                        <span
                          className={`admin-product-type-pill ${type.active ? 'is-live' : 'is-off'}`}
                        >
                          {type.active ? 'Active' : 'Off'}
                        </span>
                      </span>
                      <span className="admin-product-type-item-meta">
                        {formatPrice(type.defaultPriceCents)}
                      </span>
                      <span className="admin-product-type-chips">
                        <span className="admin-product-type-chip">
                          {type.shipsAsLetter ? 'Letter-eligible' : 'Bubble mailer'}
                        </span>
                        <span className="admin-product-type-chip">
                          {options > 0
                            ? `${options} option type${options === 1 ? '' : 's'}`
                            : 'No options'}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        <form className="admin-card admin-product-types-editor" onSubmit={handleSubmit}>
          <div className="admin-card-header">
            <div>
              <h2>{isEditingExisting ? `Edit “${form.name || 'type'}”` : 'New product type'}</h2>
              <p>
                {isEditingExisting
                  ? 'Changes apply as defaults for products that inherit this type.'
                  : 'Create a reusable template for price, shipping, and options.'}
              </p>
            </div>
            {isEditingExisting && (
              <code className="admin-product-type-id">{form.id}</code>
            )}
          </div>

          <section className="admin-product-types-section" aria-labelledby="pt-basics-heading">
            <h3 id="pt-basics-heading">Basics</h3>
            <div className="admin-product-types-grid">
              <label>
                Name
                <input
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value
                    setForm((prev) => ({
                      ...prev,
                      name,
                      id: isEditingExisting ? prev.id : slugify(name),
                    }))
                  }}
                  placeholder="Sticker"
                  required
                />
              </label>
              <label>
                Default price ($)
                <input
                  value={form.defaultPrice}
                  onChange={(e) => setForm((prev) => ({ ...prev, defaultPrice: e.target.value }))}
                  inputMode="decimal"
                  placeholder="3.00"
                  required
                />
              </label>
            </div>

            {!isEditingExisting && (
              <label>
                Id
                <input
                  value={form.id}
                  onChange={(e) => setForm((prev) => ({ ...prev, id: slugify(e.target.value) }))}
                  placeholder="auto from name"
                />
                <span className="admin-field-hint">Used internally. Locked after save.</span>
              </label>
            )}

            <label>
              Description
              <textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={2}
                placeholder="Short note for you — not shown on the storefront."
              />
            </label>
          </section>

          <section className="admin-product-types-section" aria-labelledby="pt-shipping-heading">
            <h3 id="pt-shipping-heading">Shipping & visibility</h3>
            <div className="admin-product-types-toggles">
              <label className="admin-toggle admin-product-types-toggle">
                <input
                  type="checkbox"
                  checked={form.shipsAsLetter}
                  onChange={(e) => setForm((prev) => ({ ...prev, shipsAsLetter: e.target.checked }))}
                />
                <span>
                  <strong>Letter-eligible</strong>
                  <small>
                    Stickers/sheets can use Untracked letter when the cart stays under the letter
                    item limit. Otherwise Bubble mailer only.
                  </small>
                </span>
              </label>
              <label className="admin-toggle admin-product-types-toggle">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
                />
                <span>
                  <strong>Active</strong>
                  <small>Inactive types stay in admin but are a weaker default for new products.</small>
                </span>
              </label>
            </div>
          </section>

          <section className="admin-product-types-section" aria-labelledby="pt-options-heading">
            <div className="admin-product-types-section-head">
              <div>
                <h3 id="pt-options-heading">Option types</h3>
                <p className="admin-field-hint">
                  Open the options editor to name types (Color, Pair with, …), add choices, and
                  attach images. Products inherit these unless they customize or turn options off.
                </p>
              </div>
              {optionCount > 0 && (
                <span className="admin-product-type-chip">{optionCount} defined</span>
              )}
            </div>
            {optionCount > 0 && (
              <ul className="admin-options-preview-list">
                {form.optionGroups
                  .filter((group) => group.name.trim())
                  .map((group) => (
                    <li key={group.id}>
                      <strong>{group.name}</strong>
                      {group.active === false ? ' · off' : ''}
                      {group.required ? ' (required)' : ' (optional)'}:{' '}
                      {group.choices
                        .map(
                          (choice) =>
                            `${choice.label || '…'}${choice.active === false ? ' (off)' : ''}`,
                        )
                        .join(', ') || 'no choices yet'}
                    </li>
                  ))}
              </ul>
            )}
            <div className="admin-options-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  uiClick('tap')
                  setOptionsOpen(true)
                }}
              >
                {optionCount > 0 ? 'Edit options' : 'Add options'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  uiClick('tap')
                  setPreviewOpen(true)
                }}
                disabled={!form.name.trim()}
              >
                Preview shopper view
              </button>
            </div>
          </section>

          <div className="admin-product-types-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : isEditingExisting ? 'Save changes' : 'Create product type'}
            </button>
            {isEditingExisting && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void handleDelete(form.id)}
                disabled={saving}
              >
                Delete
              </button>
            )}
            {isEditingExisting && (
              <button type="button" className="btn btn-ghost" onClick={startCreate} disabled={saving}>
                New instead
              </button>
            )}
          </div>
        </form>
      </div>

      <ProductOptionsEditorModal
        open={optionsOpen}
        title={form.name ? `Options for ${form.name}` : 'Product type options'}
        groups={form.optionGroups}
        uploadKey={`_option-images/types/${form.id || 'new'}`}
        onClose={() => setOptionsOpen(false)}
        onSave={(optionGroups) => setForm((prev) => ({ ...prev, optionGroups }))}
      />
      <ProductShopperPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        productName={`Sample ${form.name || 'product'}`}
        basePriceCents={dollarsToCents(form.defaultPrice) || 0}
        description={
          form.description.trim() ||
          'Preview of how option tiles appear when a product inherits this type.'
        }
        groups={form.optionGroups}
      />
    </div>
  )
}
