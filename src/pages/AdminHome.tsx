import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_HOME_LAYOUT,
  DEFAULT_SITE_SETTINGS,
  emptyHomeSection,
  resolveHomeSections,
  type HomeCollectionItem,
  type HomeLayoutSettings,
  type HomeSection,
  type SiteSettings,
} from '../data/siteSettings'
import type { StoreCategory } from '../data/categories'
import type { ProductType } from '../data/productTypes'
import {
  getSiteSettings,
  listAdminCategories,
  listAdminProducts,
  listAdminProductTypes,
  saveAdminCategory,
  saveSiteSettings,
  type AdminProduct,
} from '../lib/adminApi'
import { uploadProductImages } from '../lib/storageUpload'
import { playUiSound } from '../lib/uiSounds'

type CategoryHomeRow = StoreCategory

function seedSectionsFromLegacy(
  home: HomeLayoutSettings,
  categories: CategoryHomeRow[],
): HomeSection[] {
  if (home.sections.length > 0) return home.sections
  return resolveHomeSections(home, categories).map((section, index) => ({
    ...section,
    id: section.id.startsWith('legacy-') ? emptyHomeSection(section.kind, section.sourceId).id : section.id,
    sortOrder: index,
  }))
}

export default function AdminHome() {
  const [categories, setCategories] = useState<CategoryHomeRow[]>([])
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [products, setProducts] = useState<AdminProduct[]>([])
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
  const [addKind, setAddKind] = useState<'category' | 'productType' | 'collections'>('category')
  const [addSourceId, setAddSourceId] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [settings, cats, types, productList] = await Promise.all([
        getSiteSettings(),
        listAdminCategories(),
        listAdminProductTypes(),
        listAdminProducts(),
      ])
      setPagesSnapshot({
        pages: settings.pages,
        siteOffline: settings.siteOffline,
        offlineMessage: settings.offlineMessage,
        shoppingPaused: settings.shoppingPaused,
        shoppingPausedTitle: settings.shoppingPausedTitle,
        shoppingPausedMessage: settings.shoppingPausedMessage,
      })
      const nextCats = cats.filter((category) => category.active)
      setCategories(nextCats)
      setProductTypes(types.filter((type) => type.active))
      setProducts(productList.products.filter((product) => product.active !== false))
      const seededSections = seedSectionsFromLegacy(settings.home, nextCats)
      setHome({
        ...DEFAULT_HOME_LAYOUT,
        ...settings.home,
        sections: seededSections,
      })
      setAddSourceId(nextCats[0]?.id ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load home settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const orderedSections = useMemo(
    () => [...home.sections].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    [home.sections],
  )

  function setSections(next: HomeSection[]) {
    setHome((prev) => ({
      ...prev,
      sections: next.map((section, index) => ({ ...section, sortOrder: index })),
    }))
  }

  function updateSection(id: string, patch: Partial<HomeSection>) {
    setSections(
      orderedSections.map((section) => (section.id === id ? { ...section, ...patch } : section)),
    )
  }

  function moveSection(id: string, direction: -1 | 1) {
    const index = orderedSections.findIndex((section) => section.id === id)
    if (index < 0) return
    const target = index + direction
    if (target < 0 || target >= orderedSections.length) return
    const next = [...orderedSections]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    playUiSound('tap')
    setSections(next)
  }

  function removeSection(id: string) {
    if (!window.confirm('Remove this home section?')) return
    playUiSound('tap')
    setSections(orderedSections.filter((section) => section.id !== id))
  }

  function addSection() {
    if (addKind === 'collections') {
      if (orderedSections.some((section) => section.kind === 'collections')) {
        setError('You already have a collections section. Toggle it on instead of adding another.')
        return
      }
      const section = emptyHomeSection('collections')
      section.title = home.collectionsTitle
      section.lead = home.collectionsLead
      playUiSound('success')
      setSections([...orderedSections, section])
      setError(null)
      return
    }

    if (!addSourceId) {
      setError(addKind === 'category' ? 'Choose a category first.' : 'Choose a product type first.')
      return
    }

    const section = emptyHomeSection(addKind, addSourceId)
    if (addKind === 'category') {
      const category = categories.find((item) => item.id === addSourceId)
      section.productLimit = category?.homeProductLimit ?? 4
      section.lead = category?.description ?? ''
    }
    playUiSound('success')
    setSections([...orderedSections, section])
    setError(null)
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
      playUiSound('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload collection image')
    } finally {
      setUploadingTypeId(null)
    }
  }

  function productsForSection(section: HomeSection): AdminProduct[] {
    if (section.kind === 'category') {
      return products.filter((product) => product.category === section.sourceId)
    }
    if (section.kind === 'productType') {
      return products.filter((product) => product.productTypeId === section.sourceId)
    }
    return []
  }

  function toggleProductPick(section: HomeSection, productId: string) {
    const selected = new Set(section.productIds)
    if (selected.has(productId)) selected.delete(productId)
    else selected.add(productId)
    playUiSound('tap')
    updateSection(section.id, { productIds: [...selected] })
  }

  function sectionLabel(section: HomeSection): string {
    if (section.kind === 'collections') return 'Collections grid'
    if (section.kind === 'category') {
      return categories.find((item) => item.id === section.sourceId)?.name ?? section.sourceId
    }
    return productTypes.find((item) => item.id === section.sourceId)?.name ?? section.sourceId
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

      const enabledCategoryIds = new Set(
        orderedSections
          .filter((section) => section.kind === 'category' && section.enabled && section.sourceId)
          .map((section) => section.sourceId),
      )

      await Promise.all(
        categories.map((category) => {
          const matching = orderedSections.find(
            (section) =>
              section.kind === 'category' && section.sourceId === category.id && section.enabled,
          )
          return saveAdminCategory({
            ...category,
            showOnHome: enabledCategoryIds.has(category.id),
            homeProductLimit: matching?.productLimit ?? category.homeProductLimit,
          })
        }),
      )

      await saveSiteSettings({
        ...base,
        home: {
          ...home,
          sections: orderedSections,
          collectionsEnabled: orderedSections.some(
            (section) => section.kind === 'collections' && section.enabled,
          ),
          collections: home.collections.map((item, index) => ({
            ...item,
            sortOrder: index,
          })),
        },
      })

      playUiSound('success')
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

  const sourceOptions =
    addKind === 'category' ? categories
    : addKind === 'productType' ? productTypes
    : []

  return (
    <div className="admin-home">
      <header className="admin-main-header">
        <div>
          <p className="admin-main-eyebrow">Site</p>
          <h1>Home</h1>
          <p className="admin-main-lead">
            Mix and match sections: category product rows, product-type rows, and a collections
            tile grid. Toggle, reorder, set headers, limits, and optional product picks.
          </p>
        </div>
      </header>

      {message && <p className="admin-alert admin-alert-success">{message}</p>}
      {error && <p className="admin-alert admin-alert-error">{error}</p>}

      <form className="admin-home-form" onSubmit={handleSubmit}>
        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2>Home sections</h2>
              <p>Order is top-to-bottom on the homepage. Disabled sections stay saved but hidden.</p>
            </div>
          </div>

          <div className="admin-home-add-row">
            <label>
              Add section
              <select
                value={addKind}
                onChange={(e) => {
                  const kind = e.target.value as typeof addKind
                  setAddKind(kind)
                  if (kind === 'category') setAddSourceId(categories[0]?.id ?? '')
                  else if (kind === 'productType') setAddSourceId(productTypes[0]?.id ?? '')
                  else setAddSourceId('')
                }}
              >
                <option value="category">Category products</option>
                <option value="productType">Product type products</option>
                <option value="collections">Collections grid</option>
              </select>
            </label>
            {addKind !== 'collections' && (
              <label>
                {addKind === 'category' ? 'Category' : 'Product type'}
                <select value={addSourceId} onChange={(e) => setAddSourceId(e.target.value)}>
                  {sourceOptions.length === 0 && <option value="">None available</option>}
                  {sourceOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" className="btn btn-outline" onClick={addSection}>
              + Add
            </button>
          </div>

          {orderedSections.length === 0 ?
            <p className="admin-empty-copy">No sections yet. Add a category, product type, or collections block.</p>
          : <ul className="admin-home-section-list">
              {orderedSections.map((section, index) => {
                const pool = productsForSection(section)
                return (
                  <li
                    key={section.id}
                    className={`admin-home-section-card ${section.enabled ? '' : 'is-disabled'}`.trim()}
                  >
                    <div className="admin-home-section-top">
                      <label className="admin-toggle">
                        <input
                          type="checkbox"
                          checked={section.enabled}
                          onChange={(e) => {
                            playUiSound('tap')
                            updateSection(section.id, { enabled: e.target.checked })
                          }}
                        />
                        <span>
                          <strong>
                            {section.kind === 'collections' ?
                              'Collections'
                            : section.kind === 'category' ?
                              'Category'
                            : 'Product type'}
                            : {sectionLabel(section)}
                          </strong>
                          <small>{section.kind}</small>
                        </span>
                      </label>
                      <div className="admin-home-section-move">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={index === 0}
                          onClick={() => moveSection(section.id, -1)}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={index === orderedSections.length - 1}
                          onClick={() => moveSection(section.id, 1)}
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => removeSection(section.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="admin-home-section-fields">
                      <label>
                        Header title
                        <input
                          value={section.title}
                          disabled={!section.enabled}
                          placeholder={sectionLabel(section)}
                          onChange={(e) => updateSection(section.id, { title: e.target.value })}
                        />
                      </label>
                      <label>
                        Supporting text
                        <input
                          value={section.lead}
                          disabled={!section.enabled || section.showDescription === false}
                          placeholder={
                            section.kind === 'collections'
                              ? 'Optional override'
                              : 'Leave blank to use category/type description'
                          }
                          onChange={(e) => updateSection(section.id, { lead: e.target.value })}
                        />
                      </label>
                      <label className="admin-toggle admin-home-show-description">
                        <input
                          type="checkbox"
                          checked={section.showDescription !== false}
                          disabled={!section.enabled}
                          onChange={(e) => {
                            playUiSound('tap')
                            updateSection(section.id, { showDescription: e.target.checked })
                          }}
                        />
                        <span>
                          <strong>Show description</strong>
                          <small>
                            {section.kind === 'collections'
                              ? 'Supporting text under the collections title'
                              : 'Category or product type description under the header'}
                          </small>
                        </span>
                      </label>
                      {section.kind !== 'collections' && (
                        <label className="admin-home-limit">
                          Products shown
                          <input
                            type="number"
                            min={1}
                            max={24}
                            disabled={!section.enabled}
                            value={section.productLimit}
                            onChange={(e) =>
                              updateSection(section.id, {
                                productLimit: Math.min(
                                  24,
                                  Math.max(1, Number.parseInt(e.target.value, 10) || 4),
                                ),
                              })
                            }
                          />
                        </label>
                      )}
                    </div>

                    {section.kind !== 'collections' && section.enabled && (
                      <div className="admin-home-product-picks">
                        <p className="admin-field-hint">
                          Optional picks: leave empty to show the first {section.productLimit} by
                          store order. Checked products appear in check order, capped by the limit.
                        </p>
                        {pool.length === 0 ?
                          <p className="admin-empty-copy">No products in this source yet.</p>
                        : <ul className="admin-home-product-pick-list">
                            {pool.map((product) => {
                              const checked = section.productIds.includes(product.id)
                              return (
                                <li key={product.id}>
                                  <label className="admin-toggle">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleProductPick(section, product.id)}
                                    />
                                    <span>
                                      <strong>{product.name}</strong>
                                      <small>{product.id}</small>
                                    </span>
                                  </label>
                                </li>
                              )
                            })}
                          </ul>
                        }
                        {section.productIds.length > 0 && (
                          <button
                            type="button"
                            className="admin-option-text-btn"
                            onClick={() => {
                              playUiSound('soft')
                              updateSection(section.id, { productIds: [] })
                            }}
                          >
                            Clear picks (use automatic)
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          }
        </section>

        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2>Collections tiles</h2>
              <p>
                Used by any Collections section. Each tile links to the store filtered by product
                type.
              </p>
            </div>
          </div>

          <div className="admin-home-collections-copy">
            <label>
              Default collections title
              <input
                value={home.collectionsTitle}
                onChange={(e) =>
                  setHome((prev) => ({ ...prev, collectionsTitle: e.target.value }))
                }
              />
            </label>
            <label>
              Default supporting text
              <input
                value={home.collectionsLead}
                onChange={(e) =>
                  setHome((prev) => ({ ...prev, collectionsLead: e.target.value }))
                }
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
                        onChange={(e) => {
                          playUiSound('tap')
                          upsertCollection(type.id, {}, e.target.checked)
                        }}
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
                        disabled={!enabled}
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
                            disabled={!enabled || uploadingTypeId === type.id || saving}
                            onChange={(e) => void handleUpload(type.id, e)}
                          />
                        </label>
                        {item?.imageUrl && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={!enabled}
                            onClick={() => {
                              playUiSound('soft')
                              upsertCollection(type.id, { imageUrl: '' }, true)
                            }}
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
