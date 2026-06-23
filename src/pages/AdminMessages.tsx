import { useEffect, useState } from 'react'
import {
  deleteAdminContactMessage,
  listAdminContactMessages,
  markContactMessageRead,
  type AdminContactMessage,
} from '../lib/adminApi'

function formatMessageDate(value: string | null): string {
  if (!value) return 'Unknown date'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function AdminMessages() {
  const [messages, setMessages] = useState<AdminContactMessage[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  async function loadMessages(selectId?: string | null) {
    setLoading(true)
    setError(null)

    try {
      const loaded = await listAdminContactMessages()
      setMessages(loaded)

      if (selectId && loaded.some((message) => message.id === selectId)) {
        setSelectedId(selectId)
      } else if (loaded.length > 0 && (!selectedId || !loaded.some((message) => message.id === selectedId))) {
        setSelectedId(loaded[0].id)
      } else if (loaded.length === 0) {
        setSelectedId(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load messages')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMessages()
  }, [])

  const selected = messages.find((message) => message.id === selectedId) ?? null
  const unreadCount = messages.filter((message) => !message.read).length

  async function handleSelect(message: AdminContactMessage) {
    setSelectedId(message.id)
    setActionMessage(null)

    if (!message.read) {
      try {
        await markContactMessageRead(message.id)
        setMessages((prev) =>
          prev.map((item) => (item.id === message.id ? { ...item, read: true } : item)),
        )
      } catch {
        // Non-blocking — message still displays
      }
    }
  }

  async function handleDelete(message: AdminContactMessage) {
    if (!window.confirm(`Delete message from ${message.name}?`)) return

    setActionMessage(null)
    setError(null)

    try {
      await deleteAdminContactMessage(message.id)
      setActionMessage('Message deleted.')
      const nextMessages = messages.filter((item) => item.id !== message.id)
      setMessages(nextMessages)
      setSelectedId(nextMessages[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete message')
    }
  }

  return (
    <div className="admin-messages">
      <header className="admin-main-header">
        <div className="admin-messages-title-row">
          <div>
            <p className="admin-main-eyebrow">Inbox</p>
            <h1>Contact messages</h1>
          </div>
          {unreadCount > 0 && (
            <span className="admin-messages-unread-badge">{unreadCount} unread</span>
          )}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadMessages(selectedId)}>
          Refresh
        </button>
      </header>

      {actionMessage && <p className="admin-alert admin-alert-success">{actionMessage}</p>}
      {error && <p className="admin-alert admin-alert-error">{error}</p>}

      <div className="admin-inbox">
        <aside className="admin-inbox-list" aria-label="Message list">
          {loading && <p className="admin-empty-copy">Loading…</p>}
          {!loading && messages.length === 0 && (
            <p className="admin-empty-copy">No contact messages yet.</p>
          )}

          <ul className="admin-message-items">
            {messages.map((message) => (
              <li key={message.id}>
                <button
                  type="button"
                  className={`admin-message-item ${selectedId === message.id ? 'is-selected' : ''} ${message.read ? '' : 'is-unread'}`}
                  onClick={() => handleSelect(message)}
                >
                  <span className="admin-message-item-row">
                    <strong>{message.name}</strong>
                    {!message.read && <span className="admin-message-badge">New</span>}
                  </span>
                  <span className="admin-message-item-preview">{message.message}</span>
                  <span className="admin-message-item-meta">
                    <span>{message.email}</span>
                    <time dateTime={message.createdAt ?? undefined}>
                      {formatMessageDate(message.createdAt)}
                    </time>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="admin-inbox-detail" aria-label="Message detail">
          {selected ?
            <>
              <div className="admin-inbox-detail-header">
                <div>
                  <h2>{selected.name}</h2>
                  <p className="admin-inbox-detail-subtitle">
                    <a href={`mailto:${encodeURIComponent(selected.email)}`}>{selected.email}</a>
                    <span aria-hidden="true"> · </span>
                    <time dateTime={selected.createdAt ?? undefined}>
                      {formatMessageDate(selected.createdAt)}
                    </time>
                  </p>
                </div>
                <div className="admin-inbox-detail-actions">
                  <a href={`mailto:${encodeURIComponent(selected.email)}`} className="btn btn-primary btn-sm">
                    Reply
                  </a>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleDelete(selected)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="admin-inbox-detail-body">
                {selected.message.split('\n').map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </>
          : <p className="admin-empty-copy admin-inbox-empty">Select a message to read it.</p>}
        </section>
      </div>
    </div>
  )
}
