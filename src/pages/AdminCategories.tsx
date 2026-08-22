import { type FormEvent, useEffect, useState } from 'react'
import SortableList from '../components/SortableList'
import {
  deleteAdminCategory,
  listAdminCategories,
  saveAdminCategory,
  updateCategorySortOrders,
} from '../lib/adminApi'
import type { StoreCategory } from '../data/categories'
import { playUiSound, uiClick } from '../lib/uiSounds'

type CategoryForm = {
  id: string
  name: string
  description: string
  showOnHome: boolean
  showInStore: boolean
  homeProductLimit: string
  active: boolean
}

const emptyCategoryForm = (): CategoryForm => ({
  id: '',
  name: '',
  description: '',
  showOnHome: true,
  showInStore: true,
  homeProductLimit: '4',
  active: true,
})

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function AdminCategories() {
  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [form, setForm] = useState<CategoryForm>(emptyCategoryForm())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function loadCategories() {
    setLoading(true)
    setError(null)

    try {
      setCategories(await listAdminCategories())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load categories')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCategories()
  }, [])

  function startCreate() {
    uiClick('tap')
    setForm(emptyCategoryForm())
    setMessage(null)
    setError(null)
  }

  function startEdit(category: StoreCategory) {
    uiClick('tap')
    setForm({
      id: category.id,
      name: category.name,
      description: category.description,
      showOnHome: category.showOnHome,
      showInStore: category.showInStore,
      homeProductLimit: String(category.homeProductLimit),
      active: category.active,
    })
    setMessage(null)
    setError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)

    const categoryId = form.id.trim() || slugify(form.name)
    const existingCategory = categories.find((category) => category.id === categoryId)

    try {
      await saveAdminCategory({
        id: categoryId,
        name: form.name,
        description: form.description,
        showOnHome: form.showOnHome,
        showInStore: form.showInStore,
        homeProductLimit: Number.parseInt(form.homeProductLimit, 10) || 4,
        sortOrder: existingCategory?.sortOrder ?? 0,
        active: form.active,
      })
      setMessage(`Saved category "${form.name}".`)
      setForm(emptyCategoryForm())
      await loadCategories()
      playUiSound('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save category')
      playUiSound('soft')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(category: StoreCategory) {
    if (
      !window.confirm(
        `Remove category "${category.name}"? Products in this category stay in the store, but become uncategorized.`,
      )
    ) {
      return
    }

    try {
      await deleteAdminCategory(category.id)
      setMessage(`Removed "${category.name}".`)
      if (form.id === category.id) setForm(emptyCategoryForm())
      await loadCategories()
      playUiSound('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove category')
      playUiSound('soft')
    }
  }

  async function handleReorderCategories(nextCategories: StoreCategory[]) {
    setReordering(true)
    setError(null)
    setMessage(null)

    const previousCategories = categories

    try {
      const ordered = nextCategories.map((category, index) => ({ ...category, sortOrder: index + 1 }))
      setCategories(ordered)
      await updateCategorySortOrders(ordered.map((category) => category.id))
      setMessage('Category order updated.')
      playUiSound('soft')
    } catch (err) {
      setCategories(previousCategories)
      setError(err instanceof Error ? err.message : 'Could not update category order')
      playUiSound('soft')
    } finally {
      setReordering(false)
    }
  }

  return (
    <div className="admin-categories">
      <header className="admin-main-header">
        <div>
          <p className="admin-main-eyebrow">Catalog</p>
          <h1>Categories</h1>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
          + New category
        </button>
      </header>

      {message && <p className="admin-alert admin-alert-success">{message}</p>}
      {error && <p className="admin-alert admin-alert-error">{error}</p>}

      <div className="admin-category-layout">
        <form className="admin-card admin-category-form" onSubmit={handleSubmit}>
          <h2>{form.id ? 'Edit category' : 'Create category'}</h2>

          <label>
            Name
            <input
              type="text"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  name: e.target.value,
                  id: prev.id || slugify(e.target.value),
                }))
              }
              required
            />
          </label>

          <label>
            ID (URL slug)
            <input
              type="text"
              value={form.id}
              onChange={(e) => setForm((prev) => ({ ...prev, id: slugify(e.target.value) }))}
              placeholder="new-arrivals"
              required
            />
          </label>

          <label>
            Description
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </label>

          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={form.showInStore}
              onChange={(e) => setForm((prev) => ({ ...prev, showInStore: e.target.checked }))}
            />
            <span>
              <strong>Show in store filters</strong>
              <small>Home page rows are configured under Home.</small>
            </span>
          </label>

          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
            />
            <span>
              <strong>Active</strong>
            </span>
          </label>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save category'}
          </button>
        </form>

        <div className="admin-card">
          <h2>All categories</h2>
          <p className="admin-field-hint">
            Drag ⠿ to set store filter order. Home page category rows are managed under Home.
          </p>
          {loading && <p>Loading…</p>}
          {!loading && categories.length === 0 && (
            <p className="admin-empty-copy">No categories yet. Create New arrivals and Best sellers to get started.</p>
          )}

          {!loading && categories.length > 0 && (
            <SortableList
              className="admin-category-sortable"
              rowClassName="admin-category-sortable-row"
              ariaLabel="Categories"
              items={categories}
              onReorder={handleReorderCategories}
              renderItem={(category) => (
                <div className="admin-category-item">
                  <div>
                    <strong>{category.name}</strong>
                    <p className="admin-meta">
                      {category.id} · store {category.showInStore ? 'on' : 'off'}
                      {category.showOnHome ? ` · home (${category.homeProductLimit})` : ''}
                    </p>
                  </div>
                  <div className="admin-item-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => startEdit(category)}
                      disabled={reordering}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDelete(category)}
                      disabled={reordering}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            />
          )}
        </div>
      </div>
    </div>
  )
}
