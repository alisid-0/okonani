import { type FormEvent, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import PageSheet from '../components/PageSheet'
import { useAuth } from '../context/AuthContext'

type AuthMode = 'signin' | 'signup'

export default function Login() {
  const { user, loading: authLoading, signIn, signUp } = useAuth()
  const location = useLocation()
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/account'
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (authLoading) {
    return (
      <div className="page page-narrow">
        <p>Loading…</p>
      </div>
    )
  }

  if (user) {
    return <Navigate to={redirectTo} replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (mode === 'signin') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
      }
    } catch {
      setError(
        mode === 'signin' ?
          'Could not sign in. Check your email and password.'
        : 'Could not create account. Use a valid email and password (6+ characters).',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        title={mode === 'signin' ? 'Sign in' : 'Create account'}
        subtitle="Save your reviews and get notified about new products."
      />

      <PageSheet>
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === 'signin' ? 'is-active' : ''}`}
            onClick={() => setMode('signin')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'signup' ? 'is-active' : ''}`}
            onClick={() => setMode('signup')}
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ?
              mode === 'signin' ?
                'Signing in…'
              : 'Creating account…'
            : mode === 'signin' ?
              'Sign in'
            : 'Create account'}
          </button>
        </form>

        <p className="auth-footer">
          <Link to="/store">Back to store</Link>
        </p>
      </PageSheet>
    </div>
  )
}
