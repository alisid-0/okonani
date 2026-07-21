import { type FormEvent, useEffect, useState } from 'react'
import {
  DEFAULT_OFFLINE_MESSAGE,
  DEFAULT_SITE_SETTINGS,
  SITE_NAV_PAGES,
  type SitePageId,
  type SiteSettings,
} from '../data/siteSettings'
import { getSiteSettings, saveSiteSettings } from '../lib/adminApi'

type PageForm = SiteSettings

function toForm(settings: SiteSettings): PageForm {
  return {
    pages: { ...settings.pages },
    siteOffline: settings.siteOffline,
    offlineMessage: settings.offlineMessage,
    shoppingPaused: settings.shoppingPaused,
    home: { ...settings.home, collections: [...settings.home.collections] },
  }
}

export default function AdminPages() {
  const [form, setForm] = useState<PageForm>(toForm(DEFAULT_SITE_SETTINGS))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function loadSettings() {
    setLoading(true)
    setError(null)

    try {
      const settings = await getSiteSettings()
      setForm(toForm(settings))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load page settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  function togglePage(pageId: SitePageId, visible: boolean) {
    setForm((prev) => ({
      ...prev,
      pages: { ...prev.pages, [pageId]: visible },
    }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      await saveSiteSettings(form)
      setMessage('Page settings saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save page settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-pages">
      <header className="admin-main-header">
        <div>
          <p className="admin-main-eyebrow">Site</p>
          <h1>Pages</h1>
        </div>
      </header>

      {message && <p className="admin-alert admin-alert-success">{message}</p>}
      {error && <p className="admin-alert admin-alert-error">{error}</p>}

      {loading ?
        <p className="admin-empty-copy">Loading…</p>
      : <form className="admin-editor" onSubmit={handleSubmit}>
          <div className="admin-card">
            <div className="admin-card-header">
              <div>
                <h2>Navigation pages</h2>
                <p>Choose which tabs appear in the site header.</p>
              </div>
            </div>

            <ul className="admin-page-toggle-list">
              {SITE_NAV_PAGES.map((page) => (
                <li key={page.id}>
                  <label className="admin-toggle admin-page-toggle">
                    <input
                      type="checkbox"
                      checked={form.pages[page.id]}
                      onChange={(event) => togglePage(page.id, event.target.checked)}
                    />
                    <span>
                      <strong>{page.label}</strong>
                      <small>{page.to}</small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="admin-card">
            <div className="admin-card-header">
              <div>
                <h2>Pause shopping</h2>
                <p>
                  Visitors can still browse the store and product pages, but adding to cart is blocked
                  and they see an under-construction message.
                </p>
              </div>
            </div>

            <label className="admin-toggle">
              <input
                type="checkbox"
                checked={form.shoppingPaused}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, shoppingPaused: event.target.checked }))
                }
              />
              <span>
                <strong>Pause orders &amp; shopping</strong>
                <small>Shows a modal on first visit and when someone tries to add to cart.</small>
              </span>
            </label>
          </div>

          <div className="admin-card">
            <div className="admin-card-header">
              <div>
                <h2>Site-wide turn off</h2>
                <p>
                  Locks the storefront for visitors and shows only your logo, name, and message.
                  Admin panel stays available.
                </p>
              </div>
            </div>

            <label className="admin-toggle">
              <input
                type="checkbox"
                checked={form.siteOffline}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, siteOffline: event.target.checked }))
                }
              />
              <span>
                <strong>Turn site off</strong>
                <small>Visitors see the maintenance screen instead of the shop.</small>
              </span>
            </label>

            <label>
              Offline message
              <textarea
                rows={4}
                value={form.offlineMessage}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, offlineMessage: event.target.value }))
                }
                placeholder={DEFAULT_OFFLINE_MESSAGE}
                disabled={!form.siteOffline}
              />
            </label>
          </div>

          <footer className="admin-editor-footer">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save page settings'}
            </button>
          </footer>
        </form>
      }
    </div>
  )
}
