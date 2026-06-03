import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'

export default function Login() {
  return (
    <div className="page page-narrow">
      <PageHeader title="Log in" subtitle="Sign in to your okonani account." />

      <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
        <label>
          Email
          <input type="email" name="email" placeholder="you@example.com" autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </label>
        <button type="submit" className="btn btn-primary btn-full">
          Log in
        </button>
      </form>

      <p className="auth-footer">
        Don&apos;t have an account?{' '}
        <Link to="/contact">Contact us</Link> to get started.
      </p>
    </div>
  )
}
