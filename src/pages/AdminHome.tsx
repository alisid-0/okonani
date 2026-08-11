import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react'
import {
  DEFAULT_HOME_LAYOUT,
  DEFAULT_SITE_SETTINGS,
  type HomeCollectionItem,
  type HomeLayoutSettings,
  type SiteSettings,
} from '../data/siteSettings'
import type { StoreCategory } from '../data/categories'
import type { ProductType } from '../data/productTypes'
import {
  getSiteSettings,
  listAdminCategories,
  listAdminProductTypes,
  saveAdminCategory,
  saveSiteSettings,
} from '../lib/adminApi'
import { uploadProductImages } from '../lib/storageUpload'

type CategoryHomeRow = {
  id: string
  name: string
  showOnHome: boolean
  homeProductLimit: number
  showInStore: boolean
  active: boolean
  description: string
  sortOrder: number
}

export default function AdminHome() {
  const [categories, setCategories] = useState<CategoryHomeRow[]>([])
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [home, setHome] = useState<HomeLayoutSettings>({ ...DEFAULT_HOME_LAYOUT })
  const [pagesSnapshot, setPagesSnapshot] = useState<Pick<
    SiteSettings,
    | 'pages'
    | 'siteOffline'
    | 'offlineMessage'
    | 'shoppingPaused'
    | 'shoppingPausedTitle'
    | 'shoppingPausedMessage'
  > | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingTypeId, setUploadingTypeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [settings, cats, types] = await Promise.all([
        getSiteSettings(),
        listAdminCategories(),
        listAdminProductTypes(),
      ])
      setPagesSnapshot({
        pages: settings.pages,
        siteOffline: settings.siteOffline,
        offlineMessage: settings.offlineMessage,
        shoppingPaused: settings.shoppingPaused,
        shoppingPausedTitle: settings.shoppingPausedTitle,
        shoppingPausedMessage: settings.shoppingPausedMessage,
      })
      setHome({ ...DEFAULT_HOME_LAYOUT, ...settings.home })
      setCategories(
        cats.map((category) => ({
          id: category.id,
          name: category.name,
          showOnHome: category.showOnHome,
          homeProductLimit: category.homeProductLimit,
          showInStore: category.showInStore,
          active: category.active,
          description: category.description,
          sortOrder: category.sortOrder,
        })),
      )
      setProductTypes(types.filter((type) => type.active))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load home settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function updateCategory(id: string, patch: Partial<CategoryHomeRow>) {
    setCategories((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  function collectionForType(productTypeId: string): HomeCollectionItem | undefined {
    return home.collections.find((item) => item.productTypeId === productTypeId)
  }

  function upsertCollection(
    productTypeId: string,
    patch: Partial<HomeCollectionItem>,
    enabled = true,
  ) {
    setHome((prev) => {
      const existing = prev.collections.filter((item) => item.productTypeId !== productTypeId)
      if (!enabled) return { ...prev, collections: existing }

      const type = productTypes.find((item) => item.id === productTypeId)
      const current = prev.collections.find((item) => item.productTypeId === productTypeId)
      return {
        ...prev,
        collections: [
          ...existing,
          {
            productTypeId,
            label: patch.label ?? current?.label ?? type?.name ?? '',
            imageUrl: patch.imageUrl ?? current?.imageUrl ?? '',
            sortOrder: patch.sortOrder ?? current?.sortOrder ?? existing.length,
          },
        ],
      }
    })
  }

  async function handleUpload(productTypeId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploadingTypeId(productTypeId)
    setError(null)
    try {
      const uploaded = await uploadProductImages(`_home-collections/${productTypeId}`, [file])
      const url = uploaded[0]?.url
      if (!url) throw new Error('Upload did not return an image URL')
      upsertCollection(productTypeId, { imageUrl: url }, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload collection image')
    } finally {
      setUploadingTypeId(null)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const base = pagesSnapshot ?? {
        pages: DEFAULT_SITE_SETTINGS.pages,
        siteOffline: DEFAULT_SITE_SETTINGS.siteOffline,
        offlineMessage: DEFAULT_SITE_SETTINGS.offlineMessage,
        shoppingPaused: DEFAULT_SITE_SETTINGS.shoppingPaused,
        shoppingPausedTitle: DEFAULT_SITE_SETTINGS.shoppingPausedTitle,
        shoppingPausedMessage: DEFAULT_SITE_SETTINGS.shoppingPausedMessage,
      }

      await Promise.all(
        categories.map((category) =>
          saveAdminCategory({
            id: category.id,
            name: category.name,
            description: category.description,
            showOnHome: category.showOnHome,
            showInStore: category.showInStore,
            homeProductLimit: category.homeProductLimit,
            active: category.active,
            sortOrder: category.sortOrder,
          } satisfies StoreCategory),
        ),
      )

      await saveSiteSettings({
        ...base,
        home: {
          ...home,
          collections: home.collections.map((item, index) => ({
            ...item,
            sortOrder: index,
          })),
        },
      })

      setMessage('Home page settings saved.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save home settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-home">
        <header className="admin-main-header">
          <div>
            <p className="admin-main-eyebrow">Site</p>
            <h1>Home</h1>
          </div>
        </header>
        <p className="admin-empty-copy">Loading…</p>
      </div>
    )
  }

  return (
    <div className="admin-home">
      <header className="admin-main-header">
        <div>
          <p className="admin-main-eyebrow">Site</p>
          <h1>Home</h1>
          <p className="admin-main-lead">
            Choose which category rows appear on the homepage, and optionally add a Shop by
            collection grid that links into the store by product type.
          </p>
        </div>
      </header>

      {message && <p className="admin-alert admin-alert-success">{message}</p>}
      {error && <p className="admin-alert admin-alert-error">{error}</p>}

      <form className="admin-home-form" onSubmit={handleSubmit}>
        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2>Category rows</h2>
              <p>
                Each enabled category shows a product strip on the home page. Create and order
                categories under Categories.
              </p>
            </div>
          </div>

          {categories.length === 0 ?
            <p className="admin-empty-copy">No categories yet. Add some under Categories first.</p>
          : <ul className="admin-home-category-list">
              {categories.map((category) => (
                <li key={category.id} className="admin-home-category-row">
                  <label className="admin-toggle">
                    <input
                      type="checkbox"
                      checked={category.showOnHome}
                      onChange={(e) =>
                        updateCategory(category.id, { showOnHome: e.target.checked })
                      }
                    />
                    <span>
                      <strong>{category.name}</strong>
                      <small>{category.id}</small>
                    </span>
                  </label>
                  <label className="admin-home-limit">
                    Products shown
                    <input
                      type="number"
                      min={1}
                      max={24}
                      disabled={!category.showOnHome}
                      value={category.homeProductLimit}
                      onChange={(e) =>
                        updateCategory(category.id, {
                          homeProductLimit: Math.min(
                            24,
                            Math.max(1, Number.parseInt(e.target.value, 10) || 4),
                          ),
                        })
                      }
                    />
                  </label>
                </li>
              ))}
            </ul>
          }
        </section>

        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2>Shop by collection</h2>
              <p>
                Show product types as clickable tiles. Each tile can have its own image and opens
                the store filtered to that type.
              </p>
            </div>
          </div>

          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={home.collectionsEnabled}
              onChange={(e) =>
                setHome((prev) => ({ ...prev, collectionsEnabled: e.target.checked }))
              }
            />
            <span>
              <strong>Show collections section on home</strong>
            </span>
          </label>

          <div className="admin-home-collections-copy">
            <label>
              Section title
              <input
                value={home.collectionsTitle}
                onChange={(e) =>
                  setHome((prev) => ({ ...prev, collectionsTitle: e.target.value }))
                }
                disabled={!home.collectionsEnabled}
              />
            </label>
            <label>
              Supporting text
              <input
                value={home.collectionsLead}
                onChange={(e) =>
                  setHome((prev) => ({ ...prev, collectionsLead: e.target.value }))
                }
                disabled={!home.collectionsEnabled}
                placeholder="Optional short line under the title"
              />
            </label>
          </div>

          {productTypes.length === 0 ?
            <p className="admin-empty-copy">No active product types. Add some under Product types.</p>
          : <ul className="admin-home-collection-list">
              {productTypes.map((type) => {
                const item = collectionForType(type.id)
                const enabled = Boolean(item)
                return (
                  <li key={type.id} className="admin-home-collection-row">
                    <label className="admin-toggle">
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={!home.collectionsEnabled}
                        onChange={(e) => upsertCollection(type.id, {}, e.target.checked)}
                      />
                      <span>
                        <strong>{type.name}</strong>
                        <small>{type.id}</small>
                      </span>
                    </label>

                    <label>
                      Tile label
                      <input
                        value={item?.label ?? type.name}
                        disabled={!home.collectionsEnabled || !enabled}
                        onChange={(e) => upsertCollection(type.id, { label: e.target.value }, true)}
                        placeholder={type.name}
                      />
                    </label>

                    <div className="admin-home-collection-image">
                      {item?.imageUrl ?
                        <img src={item.imageUrl} alt="" className="admin-home-collection-thumb" />
                      : <div className="admin-home-collection-thumb is-empty" aria-hidden />}
                      <div className="admin-home-collection-image-actions">
                        <label className="btn btn-ghost btn-sm admin-home-upload-btn">
                          {uploadingTypeId === type.id ? 'Uploading…' : 'Upload image'}
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            disabled={
                              !home.collectionsEnabled ||
                              !enabled ||
                              uploadingTypeId === type.id ||
                              saving
                            }
                            onChange={(e) => void handleUpload(type.id, e)}
                          />
                        </label>
                        {item?.imageUrl && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={!home.collectionsEnabled || !enabled}
                            onClick={() => upsertCollection(type.id, { imageUrl: '' }, true)}
                          >
                            Remove image
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          }
        </section>

        <div className="admin-main-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save home settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
