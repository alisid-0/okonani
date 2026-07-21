import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AdminRoute() {
  const { user, loading, isAdmin } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="page">
        <p>Checking access…</p>
      </div>
    )
  }

  if (!user) {
    const from = `${location.pathname}${location.search}` || '/admin'
    return <Navigate to="/admin/login" replace state={{ from }} />
  }

  if (!isAdmin) {
    return (
      <div className="page page-narrow">
        <h1>Access denied</h1>
        <p>Your account is not authorized for the admin panel.</p>
      </div>
    )
  }

  return <Outlet />
}
