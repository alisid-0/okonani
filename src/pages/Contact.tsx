import { type FormEvent, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { submitContactMessage } from '../lib/userApi'
import { playUiSound, unlockUiSounds } from '../lib/uiSounds'

export default function Contact() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    unlockUiSounds()
    setSending(true)
    setError(null)
    setSuccess(false)

    try {
      await submitContactMessage({ name, email, message })
      setSuccess(true)
      setName('')
      setEmail('')
      setMessage('')
      playUiSound('success')
    } catch {
      setError('Could not send your message. Please try again.')
      playUiSound('soft')
    } finally {
      setSending(false)
    }
  }

  function handleFieldFocus() {
    unlockUiSounds()
    playUiSound('soft')
  }

  return (
    <div
      className="page page-narrow page-contact notebook-page"
      onPointerDown={() => unlockUiSounds()}
    >
      <PageHeader
        title="Contact"
        subtitle="Questions, custom orders, or just saying hi! I'd love to hear from you."
      />

      <div className="content-card contact-card">
        <div className="content-card-header">
          <h2>Send a message</h2>
          <p>I read every note and usually reply within a few days.</p>
        </div>

        {success && <p className="form-success">Message sent. We'll get back to you soon.</p>}

        <form className="contact-form" onSubmit={handleSubmit}>
          <label>
            Name
            <input
              type="text"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={handleFieldFocus}
              placeholder="Your name"
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={handleFieldFocus}
              placeholder="you@example.com"
              required
            />
          </label>
          <label>
            Message
            <textarea
              name="message"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onFocus={handleFieldFocus}
              placeholder="How can we help?"
              required
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={sending}>
            {sending ? 'Sending…' : 'Send message'}
          </button>
        </form>
      </div>
    </div>
  )
}
