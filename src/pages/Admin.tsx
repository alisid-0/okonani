import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react'
import { collection, doc } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCategories } from '../data/categories'
import { getProductCover, type ProductMedia } from '../data/products'
import {
  deleteAdminProduct,
  listAdminProducts,
  saveAdminProduct,
  type AdminProduct,
} from '../lib/adminApi'
import { db } from '../lib/firebase'
import { uploadProductImages } from '../lib/storageUpload'
import AdminCategories from './AdminCategories'
import AdminMessages from './AdminMessages'

type EditorTab = 'details' | 'media'
type AdminPanel = 'products' | 'categories' | 'messages'

type ProductForm = {
  id: string
  name: string
  description: string
  longDescription: string
  price: string
  active: boolean
  sortOrder: string
  category: string
  media: ProductMedia[]
}

const emptyForm = (): ProductForm => ({
  id: '',
  name: '',
  description: '',
  longDescription: '',
  price: '',
  active: true,
  sortOrder: '0',
  category: '',
  media: [],
})

function dollarsToCents(value: string): number {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return NaN
  return Math.round(parsed * 100)
}

function createProductId(): string {
  return doc(collection(db, 'products')).id
}

function newMediaItem(type: ProductMedia['type'] = 'image'): ProductMedia {
  return { url: '', type, alt: '' }
}

export default function Admin() {
  const { logOut } = useAuth()
  const { categories } = useCategories()
  const [panel, setPanel] = useState<AdminPanel>('products')
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [form, setForm] = useState<ProductForm>(emptyForm())
  const [tab, setTab] = useState<EditorTab>('details')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function loadProducts(selectId?: string) {
    setLoading(true)
    setError(null)

    try {
      const data = await listAdminProducts()
      setProducts(data.products)

      if (selectId) {
        const selected = data.products.find((product) => product.id === selectId)
        if (selected) await selectProduct(selected)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load products')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  async function selectProduct(product: AdminProduct) {
    setTab('details')
    setMessage(null)
    setError(null)

    setForm({
      id: product.id,
      name: product.name,
      description: product.description,
      longDescription: product.longDescription,
      price: (product.priceInCents / 100).toFixed(2),
      active: product.active,
      sortOrder: String(product.sortOrder),
      category: product.category,
      media: product.media.length > 0 ? product.media : [],
    })
  }

  function startCreate() {
    setForm({
      ...emptyForm(),
      id: createProductId(),
      category: categories[0]?.id ?? '',
    })
    setTab('details')
    setMessage(null)
    setError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)

    const priceInCents = dollarsToCents(form.price)

    try {
      const data = await saveAdminProduct({
        id: form.id || undefined,
        name: form.name,
        description: form.description,
        longDescription: form.longDescription,
        priceInCents,
        active: form.active,
        sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
        category: form.category,
        media: form.media.filter((item) => item.url.trim()),
      })
      setMessage(`Saved "${data.product.name}" and synced to Stripe.`)
      await loadProducts(data.product.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save product')
    } finally {
      setSaving(false)
    }
  }

  function ensureProductId(): string {
    if (form.id.trim()) return form.id

    const nextId = createProductId()
    setForm((prev) => ({ ...prev, id: nextId }))
    return nextId
  }

  async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files?.length) return

    setUploading(true)
    setError(null)
    setMessage(null)

    try {
      const productId = ensureProductId()
      const uploaded = await uploadProductImages(productId, files)
      setForm((prev) => ({ ...prev, id: productId, media: [...prev.media, ...uploaded] }))
      setMessage(`Uploaded ${uploaded.length} image${uploaded.length === 1 ? '' : 's'}. Save the product to publish.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload images')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  async function handleDelete(product: AdminProduct) {
    if (!window.confirm(`Remove "${product.name}" from the store? Stripe IDs will be kept in Firestore.`)) return

    setError(null)
    setMessage(null)

    try {
      await deleteAdminProduct(product.id, product.stripePriceId, product.stripeProductId)
      setMessage(`Removed "${product.name}".`)
      if (form.id === product.id) startCreate()
      await loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove product')
    }
  }

  function updateMedia(index: number, patch: Partial<ProductMedia>) {
    setForm((prev) => ({
      ...prev,
      media: prev.media.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }))
  }

  function moveMedia(index: number, direction: -1 | 1) {
    setForm((prev) => {
      const next = [...prev.media]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...prev, media: next }
    })
  }

  const selectedId = form.id
  const cover = getProductCover({ media: form.media })

  function categoryName(categoryId: string): string {
    return categories.find((category) => category.id === categoryId)?.name ?? 'Uncategorized'
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-top">
          <p className="admin-brand">Okonani</p>
          <p className="admin-brand-sub">Product studio</p>
        </div>

        <div className="admin-sidebar-nav">
          <button
            type="button"
            className={`admin-sidebar-nav-btn ${panel === 'products' ? 'is-active' : ''}`}
            onClick={() => setPanel('products')}
          >
            Products
          </button>
          <button
            type="button"
            className={`admin-sidebar-nav-btn ${panel === 'categories' ? 'is-active' : ''}`}
            onClick={() => setPanel('categories')}
          >
            Categories
          </button>
          <button
            type="button"
            className={`admin-sidebar-nav-btn ${panel === 'messages' ? 'is-active' : ''}`}
            onClick={() => setPanel('messages')}
          >
            Messages
          </button>
        </div>

        {panel !== 'products' && <div className="admin-sidebar-fill" aria-hidden="true" />}

        {panel === 'products' && (
          <>
        <div className="admin-sidebar-actions">
          <button type="button" className="btn btn-primary btn-sm btn-full" onClick={startCreate}>
            + New product
          </button>
        </div>

        <div className="admin-sidebar-list">
          {loading && <p className="admin-sidebar-empty">Loading…</p>}
          {!loading && products.length === 0 && (
            <p className="admin-sidebar-empty">No products yet.</p>
          )}

          {products.map((product) => {
            const thumb = getProductCover(product)
            return (
              <button
                key={product.id}
                type="button"
                className={`admin-sidebar-item ${selectedId === product.id ? 'is-selected' : ''}`}
                onClick={() => selectProduct(product)}
              >
                <span className="admin-sidebar-thumb">
                  {thumb ?
                    <img src={thumb} alt="" />
                  : <span aria-hidden="true">✿</span>}
                </span>
                <span className="admin-sidebar-copy">
                  <strong>{product.name}</strong>
                  <span>
                    {categoryName(product.category)} · {product.active ? 'Live' : 'Hidden'}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
          </>
        )}

        <div className="admin-sidebar-footer">
          <Link to="/store" className="admin-footer-link">
            View storefront
          </Link>
          <button type="button" className="admin-footer-link" onClick={() => logOut()}>
            Log out
          </button>
        </div>
      </aside>

      <main className="admin-main">
        {panel === 'categories' ?
          <AdminCategories />
        : panel === 'messages' ?
          <AdminMessages />
        : <>
        <header className="admin-main-header">
          <div>
            <p className="admin-main-eyebrow">{form.id ? 'Editing product' : 'Create product'}</p>
            <h1>{form.name || 'Untitled product'}</h1>
          </div>

          <div className="admin-main-actions">
            {form.id && (
              <Link to={`/store/${form.id}`} className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer">
                Preview page
              </Link>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadProducts(form.id || undefined)}>
              Refresh
            </button>
          </div>
        </header>

        {message && <p className="admin-alert admin-alert-success">{message}</p>}
        {error && <p className="admin-alert admin-alert-error">{error}</p>}

        <form className="admin-editor" onSubmit={handleSubmit}>
          <div className="admin-tabs">
            {(['details', 'media'] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={`admin-tab ${tab === item ? 'is-active' : ''}`}
                onClick={() => setTab(item)}
              >
                {item === 'details' ? 'Details' : 'Gallery & media'}
              </button>
            ))}
          </div>

          {tab === 'details' && (
            <div className="admin-panel-grid">
              <div className="admin-card">
                <h2>Basics</h2>
                <label>
                  Name
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Short description
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Shown on store cards and under the title on the product page"
                  />
                </label>
                <label>
                  Full description
                  <textarea
                    rows={8}
                    value={form.longDescription}
                    onChange={(e) => setForm((prev) => ({ ...prev, longDescription: e.target.value }))}
                    placeholder="Long-form copy for the product page. Use blank lines for paragraphs."
                  />
                </label>
              </div>

              <div className="admin-card">
                <h2>Store settings</h2>
                <label>
                  Price (USD)
                  <input
                    type="number"
                    min="0.50"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Category
                  <select
                    value={form.category}
                    onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Sort order
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                  />
                </label>
                <label className="admin-toggle">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
                  />
                  <span>
                    <strong>Active in store</strong>
                    <small>Inactive products stay in admin but hide from shoppers.</small>
                  </span>
                </label>

                {form.id && (
                  <div className="admin-meta-block">
                    <p>
                      <span>Stripe price</span>
                      <code>{products.find((item) => item.id === form.id)?.stripePriceId ?? 'not synced'}</code>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'media' && (
            <div className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h2>Gallery & media</h2>
                  <p>Upload images to Firebase Storage, or paste a video URL. The first image is the store thumbnail.</p>
                </div>
                <div className="admin-media-header-actions">
                  <label className="admin-upload-label">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={uploading}
                      onChange={handleImageUpload}
                    />
                    {uploading ? 'Uploading…' : 'Upload images'}
                  </label>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setForm((prev) => ({ ...prev, media: [...prev.media, newMediaItem('video')] }))}
                  >
                    + Video URL
                  </button>
                </div>
              </div>

              <div className="admin-upload-zone">
                <label className="admin-upload-dropzone">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={uploading}
                    onChange={handleImageUpload}
                  />
                  <strong>{uploading ? 'Uploading to Firebase Storage…' : 'Drop images here or click to upload'}</strong>
                  <span>JPEG, PNG, WebP, GIF · up to 10 MB each</span>
                </label>
              </div>

              {cover && (
                <div className="admin-media-preview">
                  <img src={cover} alt="Cover preview" />
                </div>
              )}

              <div className="admin-media-list">
                {form.media.length === 0 && (
                  <p className="admin-empty-copy">No media yet. Upload images above or add a video URL.</p>
                )}

                {form.media.map((item, index) => (
                  <div key={`${item.url}-${index}`} className="admin-media-row">
                    <div className="admin-media-row-preview">
                      {item.url && item.type === 'image' ?
                        <img src={item.url} alt="" />
                      : <span>{item.type === 'video' ? '▶' : '✿'}</span>}
                    </div>

                    <div className="admin-media-row-fields">
                      <label>
                        {item.type === 'image' ? 'Image URL' : 'Video URL'}
                        <input
                          type="url"
                          value={item.url}
                          onChange={(e) => updateMedia(index, { url: e.target.value })}
                          placeholder={item.type === 'image' ? 'Uploaded automatically or paste a URL' : 'https://youtube.com/...'}
                        />
                      </label>
                      <div className="admin-media-row-inline">
                        {item.type === 'video' && (
                          <label>
                            Type
                            <select
                              value={item.type}
                              onChange={(e) =>
                                updateMedia(index, { type: e.target.value as ProductMedia['type'] })
                              }
                            >
                              <option value="video">Video</option>
                            </select>
                          </label>
                        )}
                        <label>
                          Alt text
                          <input
                            type="text"
                            value={item.alt ?? ''}
                            onChange={(e) => updateMedia(index, { alt: e.target.value })}
                            placeholder="Optional"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="admin-media-row-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveMedia(index, -1)}>
                        ↑
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveMedia(index, 1)}>
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            media: prev.media.filter((_, itemIndex) => itemIndex !== index),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <footer className="admin-editor-footer">
            {form.id && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  const product = products.find((item) => item.id === form.id)
                  if (product) handleDelete(product)
                }}
              >
                Delete product
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save & sync to Stripe'}
            </button>
          </footer>
        </form>
        </>
        }
      </main>
    </div>
  )
}
