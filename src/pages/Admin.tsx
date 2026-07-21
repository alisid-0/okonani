import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react'
import { collection, doc } from 'firebase/firestore'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCategories } from '../data/categories'
import { getProductCover, formatPrice, type ProductMedia } from '../data/products'
import {
  batchUpdateAdminProducts,
  deleteAdminProduct,
  listAdminProductTypes,
  listAdminProducts,
  listAdminShippingTypes,
  saveAdminProduct,
  updateProductSortOrders,
  type AdminProduct,
} from '../lib/adminApi'
import { db } from '../lib/firebase'
import { uploadProductImages } from '../lib/storageUpload'
import ImageCropModal from '../components/ImageCropModal'
import SortableList from '../components/SortableList'
import type { ProductType } from '../data/productTypes'
import type { ShippingType } from '../data/shippingTypes'
import AdminCategories from './AdminCategories'
import AdminMessages from './AdminMessages'
import AdminOrders from './AdminOrders'
import AdminPages from './AdminPages'
import AdminProductTypes from './AdminProductTypes'
import AdminShippingTypes from './AdminShippingTypes'

type EditorTab = 'details' | 'media'
type AdminPanel =
  | 'products'
  | 'categories'
  | 'messages'
  | 'pages'
  | 'orders'
  | 'productTypes'
  | 'shippingTypes'

type PendingCrop =
  | { kind: 'new'; file: File }
  | { kind: 'existing'; source: string; mediaIndex: number }

type ProductForm = {
  id: string
  name: string
  description: string
  longDescription: string
  price: string
  active: boolean
  category: string
  productTypeId: string
  media: ProductMedia[]
  shipClass: 'letter' | 'soft_pack' | 'parcel'
  weightOz: string
  thicknessIn: string
  maxLetterQty: string
}

const emptyForm = (): ProductForm => ({
  id: '',
  name: '',
  description: '',
  longDescription: '',
  price: '',
  active: true,
  category: '',
  productTypeId: '',
  media: [],
  shipClass: 'soft_pack',
  weightOz: '1',
  thicknessIn: '0.5',
  maxLetterQty: '0',
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [panel, setPanel] = useState<AdminPanel>(() => {
    const fromUrl = searchParams.get('panel')
    if (
      fromUrl === 'orders' ||
      fromUrl === 'productTypes' ||
      fromUrl === 'shippingTypes' ||
      fromUrl === 'categories' ||
      fromUrl === 'messages' ||
      fromUrl === 'pages' ||
      fromUrl === 'products'
    ) {
      return fromUrl
    }
    return 'products'
  })
  const initialOrderId = searchParams.get('order')

  function selectPanel(next: AdminPanel) {
    setPanel(next)
    const params = new URLSearchParams(searchParams)
    params.set('panel', next)
    if (next !== 'orders') params.delete('order')
    setSearchParams(params, { replace: true })
  }

  const [products, setProducts] = useState<AdminProduct[]>([])
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [shippingTypes, setShippingTypes] = useState<ShippingType[]>([])
  const [form, setForm] = useState<ProductForm>(emptyForm())
  const [tab, setTab] = useState<EditorTab>('details')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cropQueue, setCropQueue] = useState<PendingCrop[]>([])
  const [reorderingProducts, setReorderingProducts] = useState(false)
  const [productMode, setProductMode] = useState<'list' | 'edit'>('list')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [batchProductTypeId, setBatchProductTypeId] = useState('')
  const [batchCategoryId, setBatchCategoryId] = useState('')
  const [batchBusy, setBatchBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const draftProductIdRef = useRef('')

  async function loadProducts(selectId?: string) {
    setLoading(true)
    setError(null)

    try {
      const [data, nextProductTypes, nextShippingTypes] = await Promise.all([
        listAdminProducts(),
        listAdminProductTypes(),
        listAdminShippingTypes(),
      ])
      setProducts(data.products)
      setProductTypes(nextProductTypes)
      setShippingTypes(nextShippingTypes)

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

  useEffect(() => {
    if (form.id || categories.length === 0 || form.category) return
    setForm((prev) => ({ ...prev, category: categories[0].id }))
  }, [categories, form.id, form.category])

  async function selectProduct(product: AdminProduct) {
    setTab('details')
    setMessage(null)
    setError(null)
    setProductMode('edit')
    draftProductIdRef.current = product.id

    const resolvedCategory =
      product.category && categories.some((category) => category.id === product.category) ?
        product.category
      : product.category || ''

    setForm({
      id: product.id,
      name: product.name,
      description: product.description,
      longDescription: product.longDescription,
      price: (product.priceInCents / 100).toFixed(2),
      active: product.active,
      category: resolvedCategory,
      productTypeId: product.productTypeId ?? '',
      media: product.media.length > 0 ? product.media : [],
      shipClass: product.shipClass,
      weightOz: String(product.weightOz),
      thicknessIn: String(product.thicknessIn),
      maxLetterQty: String(product.maxLetterQty),
    })
  }

  function applyProductTypeDefaults(productTypeId: string, current: ProductForm): ProductForm {
    const productType = productTypes.find((type) => type.id === productTypeId)
    if (!productType) return { ...current, productTypeId }

    const shippingType = shippingTypes.find((type) => type.id === productType.shippingTypeId)
    const shipClass = shippingType?.shipClass ?? current.shipClass
    return {
      ...current,
      productTypeId,
      price:
        productType.defaultPriceCents > 0
          ? (productType.defaultPriceCents / 100).toFixed(2)
          : current.price,
      shipClass,
      weightOz: shipClass === 'letter' ? '0.1' : shipClass === 'parcel' ? '4' : '1',
      thicknessIn: shipClass === 'letter' ? '0.02' : shipClass === 'parcel' ? '2' : '0.5',
      maxLetterQty: String(productType.maxLetterQty),
    }
  }

  function backToProductList() {
    setProductMode('list')
    setForm(emptyForm())
    draftProductIdRef.current = ''
    setTab('details')
    setError(null)
  }

  function startCreate() {
    const nextId = createProductId()
    draftProductIdRef.current = nextId
    setProductMode('edit')
    setForm({
      ...emptyForm(),
      id: nextId,
      category: categories[0]?.id ?? '',
      productTypeId: productTypes[0]?.id ?? '',
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

    if (!form.category.trim() && categories.length > 0) {
      setError('Choose a category before saving.')
      setSaving(false)
      return
    }

    try {
      const existingProduct = products.find((item) => item.id === form.id)
      const data = await saveAdminProduct({
        id: form.id || undefined,
        name: form.name,
        description: form.description,
        longDescription: form.longDescription,
        priceInCents,
        active: form.active,
        sortOrder: existingProduct?.sortOrder ?? 0,
        category: form.category,
        media: form.media.filter((item) => item.url.trim()),
        productTypeId: form.productTypeId,
        shipClass: form.shipClass,
        weightOz: Number.parseFloat(form.weightOz) || 0.1,
        thicknessIn: Number.parseFloat(form.thicknessIn) || 0,
        maxLetterQty: Number.parseInt(form.maxLetterQty, 10) || 0,
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
    if (form.id.trim()) {
      draftProductIdRef.current = form.id.trim()
      return form.id.trim()
    }

    if (draftProductIdRef.current) return draftProductIdRef.current

    const nextId = createProductId()
    draftProductIdRef.current = nextId
    setForm((prev) => ({ ...prev, id: nextId }))
    return nextId
  }

  async function uploadCroppedImage(file: File, replaceAtIndex?: number, originalFile?: File) {
    setUploading(true)
    setError(null)
    setMessage(null)

    try {
      const productId = ensureProductId()
      const uploaded = await uploadProductImages(productId, [file])
      const nextItem = uploaded[0]

      if (!nextItem) {
        throw new Error('Upload did not return an image URL')
      }

      let sourceUrl: string | undefined
      if (replaceAtIndex === undefined && originalFile) {
        const originals = await uploadProductImages(productId, [originalFile])
        sourceUrl = originals[0]?.url
      }

      setForm((prev) => {
        if (replaceAtIndex === undefined) {
          return {
            ...prev,
            id: productId,
            media: [
              ...prev.media,
              {
                ...nextItem,
                ...(sourceUrl ? { sourceUrl } : {}),
              },
            ],
          }
        }

        const sourceItem = prev.media[replaceAtIndex]

        return {
          ...prev,
          id: productId,
          media: prev.media.map((item, index) =>
            index === replaceAtIndex ?
              {
                ...item,
                url: nextItem.url,
                type: 'image',
                sourceUrl: sourceItem?.sourceUrl ?? sourceItem?.url,
                alt: sourceItem?.alt || nextItem.alt,
              }
            : item,
          ),
        }
      })

      setMessage(
        replaceAtIndex === undefined ?
          `Uploaded image. Save the product to publish.`
        : 'Store image updated. The original is saved so you can crop again. Save the product to publish.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload images')
    } finally {
      setUploading(false)
    }
  }

  function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files?.length) return

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (!imageFiles.length) {
      setError('Choose an image file to upload.')
      event.target.value = ''
      return
    }

    setError(null)
    setMessage(null)
    setCropQueue(imageFiles.map((file) => ({ kind: 'new' as const, file })))
    event.target.value = ''
  }

  function startCropExisting(mediaIndex: number, item: ProductMedia) {
    const cropSource = (item.sourceUrl ?? item.url).trim()

    if (!cropSource) {
      setError('Add an image URL before cropping.')
      return
    }

    setError(null)
    setMessage(null)
    setCropQueue([{ kind: 'existing', source: cropSource, mediaIndex }])
  }

  async function handleCropConfirm(file: File) {
    const current = cropQueue[0]
    if (!current) return

    setCropQueue((prev) => prev.slice(1))

    if (current.kind === 'new') {
      await uploadCroppedImage(file, undefined, current.file)
      return
    }

    await uploadCroppedImage(file, current.mediaIndex)
  }

  function handleCropCancel() {
    setCropQueue((prev) => prev.slice(1))
  }

  async function handleReorderProducts(nextProducts: AdminProduct[]) {
    setReorderingProducts(true)
    setError(null)
    setMessage(null)

    const previousProducts = products

    try {
      const ordered = nextProducts.map((product, index) => ({ ...product, sortOrder: index + 1 }))
      setProducts(ordered)
      await updateProductSortOrders(ordered.map((product) => product.id))
      setMessage('Product order updated.')
    } catch (err) {
      setProducts(previousProducts)
      setError(err instanceof Error ? err.message : 'Could not update product order')
    } finally {
      setReorderingProducts(false)
    }
  }

  function toggleSelected(productId: string) {
    setSelectedIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId],
    )
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.length === products.length ? [] : products.map((product) => product.id)))
  }

  async function handleBatchAssignProductType() {
    if (selectedIds.length === 0 || !batchProductTypeId) return
    setBatchBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await batchUpdateAdminProducts(
        selectedIds,
        { productTypeId: batchProductTypeId, applyProductTypeDefaults: true },
        { productTypes, shippingTypes },
      )
      setMessage(`Updated product type on ${result.updated} product${result.updated === 1 ? '' : 's'}.`)
      setSelectedIds([])
      setBatchProductTypeId('')
      await loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch update failed')
    } finally {
      setBatchBusy(false)
    }
  }

  async function handleBatchAssignCategory() {
    if (selectedIds.length === 0 || !batchCategoryId) return
    setBatchBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await batchUpdateAdminProducts(selectedIds, { category: batchCategoryId })
      setMessage(`Updated category on ${result.updated} product${result.updated === 1 ? '' : 's'}.`)
      setSelectedIds([])
      setBatchCategoryId('')
      await loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch update failed')
    } finally {
      setBatchBusy(false)
    }
  }

  async function handleBatchSetActive(active: boolean) {
    if (selectedIds.length === 0) return
    setBatchBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await batchUpdateAdminProducts(selectedIds, { active })
      setMessage(
        `${active ? 'Published' : 'Hidden'} ${result.updated} product${result.updated === 1 ? '' : 's'}.`,
      )
      setSelectedIds([])
      await loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch update failed')
    } finally {
      setBatchBusy(false)
    }
  }

  const activeCrop = cropQueue[0]

  async function handleDelete(product: AdminProduct) {
    if (!window.confirm(`Remove "${product.name}" from the store? Stripe IDs will be kept in Firestore.`)) return

    setError(null)
    setMessage(null)

    try {
      await deleteAdminProduct(product.id, product.stripePriceId, product.stripeProductId)
      setMessage(`Removed "${product.name}".`)
      setSelectedIds((prev) => prev.filter((id) => id !== product.id))
      backToProductList()
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

  const cover = getProductCover({ media: form.media })

  function categoryName(categoryId: string): string {
    if (!categoryId) return 'Uncategorized'
    return categories.find((category) => category.id === categoryId)?.name ?? 'Uncategorized'
  }

  function isCategoryMissing(categoryId: string): boolean {
    return !categoryId || !categories.some((category) => category.id === categoryId)
  }

  return (
    <div className="admin-shell">
      {activeCrop && (
        <ImageCropModal
          source={activeCrop.kind === 'new' ? activeCrop.file : activeCrop.source}
          replaceExisting={activeCrop.kind === 'existing'}
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
        />
      )}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-top">
          <p className="admin-brand">Okonani</p>
          <p className="admin-brand-sub">Product studio</p>
        </div>

        <div className="admin-sidebar-nav">
          <button
            type="button"
            className={`admin-sidebar-nav-btn ${panel === 'products' ? 'is-active' : ''}`}
            onClick={() => {
              selectPanel('products')
              setProductMode('list')
              setError(null)
            }}
          >
            Products
          </button>
          <button
            type="button"
            className={`admin-sidebar-nav-btn ${panel === 'orders' ? 'is-active' : ''}`}
            onClick={() => selectPanel('orders')}
          >
            Orders
          </button>
          <button
            type="button"
            className={`admin-sidebar-nav-btn ${panel === 'productTypes' ? 'is-active' : ''}`}
            onClick={() => selectPanel('productTypes')}
          >
            Product types
          </button>
          <button
            type="button"
            className={`admin-sidebar-nav-btn ${panel === 'shippingTypes' ? 'is-active' : ''}`}
            onClick={() => selectPanel('shippingTypes')}
          >
            Shipping
          </button>
          <button
            type="button"
            className={`admin-sidebar-nav-btn ${panel === 'categories' ? 'is-active' : ''}`}
            onClick={() => selectPanel('categories')}
          >
            Categories
          </button>
          <button
            type="button"
            className={`admin-sidebar-nav-btn ${panel === 'messages' ? 'is-active' : ''}`}
            onClick={() => selectPanel('messages')}
          >
            Messages
          </button>
          <button
            type="button"
            className={`admin-sidebar-nav-btn ${panel === 'pages' ? 'is-active' : ''}`}
            onClick={() => selectPanel('pages')}
          >
            Pages
          </button>
        </div>

        <div className="admin-sidebar-fill" aria-hidden="true" />

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
        {panel === 'orders' ?
          <AdminOrders initialOrderId={initialOrderId} />
        : panel === 'productTypes' ?
          <AdminProductTypes />
        : panel === 'shippingTypes' ?
          <AdminShippingTypes />
        : panel === 'categories' ?
          <AdminCategories />
        : panel === 'messages' ?
          <AdminMessages />
        : panel === 'pages' ?
          <AdminPages />
        : productMode === 'list' ?
          <>
            <header className="admin-main-header">
              <div>
                <p className="admin-main-eyebrow">Catalog</p>
                <h1>Products</h1>
                <p className="admin-empty-copy">
                  {loading ? 'Loading…' : `${products.length} product${products.length === 1 ? '' : 's'}`}
                  · drag ⠿ to set storefront order
                </p>
              </div>
              <div className="admin-main-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadProducts()}>
                  Refresh
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
                  + Create product
                </button>
              </div>
            </header>

            {message && <p className="admin-alert admin-alert-success">{message}</p>}
            {error && <p className="admin-alert admin-alert-error">{error}</p>}

            {selectedIds.length > 0 && (
              <div className="admin-products-bulk admin-card">
                <div className="admin-products-bulk-top">
                  <strong>{selectedIds.length} selected</strong>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedIds([])}>
                    Clear
                  </button>
                </div>
                <div className="admin-products-bulk-grid">
                  <label>
                    Product type
                    <select value={batchProductTypeId} onChange={(e) => setBatchProductTypeId(e.target.value)}>
                      <option value="">Choose…</option>
                      {productTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={!batchProductTypeId || batchBusy}
                    onClick={() => void handleBatchAssignProductType()}
                  >
                    Apply type
                  </button>
                  <label>
                    Category
                    <select value={batchCategoryId} onChange={(e) => setBatchCategoryId(e.target.value)}>
                      <option value="">Choose…</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={!batchCategoryId || batchBusy}
                    onClick={() => void handleBatchAssignCategory()}
                  >
                    Apply category
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={batchBusy}
                    onClick={() => void handleBatchSetActive(true)}
                  >
                    Set live
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={batchBusy}
                    onClick={() => void handleBatchSetActive(false)}
                  >
                    Hide
                  </button>
                </div>
              </div>
            )}

            <section className="admin-card admin-products-list-card">
              <div className="admin-products-list-toolbar">
                <label className="admin-products-select-all">
                  <input
                    type="checkbox"
                    checked={products.length > 0 && selectedIds.length === products.length}
                    onChange={toggleSelectAll}
                    disabled={products.length === 0}
                  />
                  Select all
                </label>
              </div>

              {loading && <p className="admin-empty-copy">Loading products…</p>}
              {!loading && products.length === 0 && (
                <div className="admin-products-empty">
                  <p>No products yet.</p>
                  <button type="button" className="btn btn-primary" onClick={startCreate}>
                    Create your first product
                  </button>
                </div>
              )}

              {!loading && products.length > 0 && (
                <SortableList
                  className="admin-products-sortable"
                  rowClassName="admin-products-sortable-row"
                  ariaLabel="Products"
                  items={products}
                  onReorder={handleReorderProducts}
                  renderItem={(product) => {
                    const thumb = getProductCover(product)
                    const typeName =
                      productTypes.find((type) => type.id === product.productTypeId)?.name ?? 'No type'
                    return (
                      <div className="admin-products-row">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(product.id)}
                          onChange={() => toggleSelected(product.id)}
                          aria-label={`Select ${product.name}`}
                        />
                        <button
                          type="button"
                          className="admin-products-row-main"
                          onClick={() => void selectProduct(product)}
                          disabled={reorderingProducts}
                        >
                          <span className="admin-products-thumb">
                            {thumb ? <img src={thumb} alt="" /> : <span aria-hidden="true">✿</span>}
                          </span>
                          <span className="admin-products-row-copy">
                            <strong>{product.name}</strong>
                            <span className={isCategoryMissing(product.category) ? 'admin-warning-text' : undefined}>
                              {categoryName(product.category)} · {typeName}
                            </span>
                          </span>
                          <span className="admin-products-row-meta">
                            <span>{formatPrice(product.priceInCents)}</span>
                            <span className={`admin-products-status ${product.active ? 'is-live' : 'is-hidden'}`}>
                              {product.active ? 'Live' : 'Hidden'}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => void selectProduct(product)}
                        >
                          Edit
                        </button>
                      </div>
                    )
                  }}
                />
              )}
            </section>
          </>
        : <>
        <header className="admin-main-header">
          <div>
            <button type="button" className="admin-back-link" onClick={backToProductList}>
              ← Back to products
            </button>
            <p className="admin-main-eyebrow">
              {products.some((item) => item.id === form.id) ? 'Editing product' : 'Create product'}
            </p>
            <h1>{form.name || 'Untitled product'}</h1>
          </div>

          <div className="admin-main-actions">
            {form.id && products.some((item) => item.id === form.id) && (
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
                    required={categories.length > 0}
                  >
                    {categories.length === 0 && <option value="">No categories yet</option>}
                    {categories.length > 0 && !categories.some((category) => category.id === form.category) && (
                      <option value={form.category || ''}>
                        {form.category ? 'Uncategorized (pick a category)' : 'Select a category'}
                      </option>
                    )}
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Product type (internal)
                  <select
                    value={form.productTypeId}
                    onChange={(e) => {
                      const productTypeId = e.target.value
                      setForm((prev) => applyProductTypeDefaults(productTypeId, prev))
                    }}
                  >
                    <option value="">None</option>
                    {productTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
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

              <div className="admin-card">
                <h2>Shipping profile</h2>
                <p className="admin-field-hint">
                  Letter vs bubble mailer is controlled by the product type (letter-eligible stickers/sheets).
                  Weight is used for Shippo bubble-mailer quotes.
                </p>
                <label>
                  Ship class
                  <select
                    value={form.shipClass}
                    onChange={(e) => {
                      const shipClass = e.target.value as ProductForm['shipClass']
                      setForm((prev) => ({
                        ...prev,
                        shipClass,
                        weightOz: shipClass === 'letter' ? '0.1' : shipClass === 'parcel' ? '4' : '1',
                        thicknessIn: shipClass === 'letter' ? '0.02' : shipClass === 'parcel' ? '2' : '0.5',
                        maxLetterQty: shipClass === 'letter' ? '10' : '0',
                      }))
                    }}
                  >
                    <option value="letter">Letter (flat)</option>
                    <option value="soft_pack">Soft pack (bubble mailer)</option>
                    <option value="parcel">Parcel</option>
                  </select>
                </label>
                <label>
                  Weight (oz)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.weightOz}
                    onChange={(e) => setForm((prev) => ({ ...prev, weightOz: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Thickness (inches)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.thicknessIn}
                    onChange={(e) => setForm((prev) => ({ ...prev, thicknessIn: e.target.value }))}
                    required
                  />
                </label>
              </div>
            </div>
          )}

          {tab === 'media' && (
            <div className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h2>Gallery & media</h2>
                  <p>Upload images to Firebase Storage, or paste a video URL. Cropping updates the store image but keeps the original for re-cropping. The first image is the store thumbnail.</p>
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
                      {item.type === 'image' && item.url.trim() && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={uploading || cropQueue.length > 0}
                          onClick={() => startCropExisting(index, item)}
                        >
                          Crop
                        </button>
                      )}
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
            <button type="button" className="btn btn-ghost" onClick={backToProductList}>
              Cancel
            </button>
            {form.id && products.some((item) => item.id === form.id) && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  const product = products.find((item) => item.id === form.id)
                  if (product) void handleDelete(product)
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
