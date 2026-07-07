import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import AdminRoute from './components/AdminRoute'
import Layout from './components/Layout'
import RequireVisiblePage from './components/RequireVisiblePage'
import Home from './pages/Home'

const About = lazy(() => import('./pages/About'))
const Account = lazy(() => import('./pages/Account'))
const Admin = lazy(() => import('./pages/Admin'))
const AdminLogin = lazy(() => import('./pages/AdminLogin'))
const Cart = lazy(() => import('./pages/Cart'))
const Contact = lazy(() => import('./pages/Contact'))
const Socials = lazy(() => import('./pages/Socials'))
const CheckoutCancel = lazy(() => import('./pages/CheckoutCancel'))
const CheckoutSuccess = lazy(() => import('./pages/CheckoutSuccess'))
const Login = lazy(() => import('./pages/Login'))
const ProductDetail = lazy(() => import('./pages/ProductDetail'))
const Store = lazy(() => import('./pages/Store'))

function PageLoader() {
  return (
    <div className="page">
      <p className="page-loader">Loading…</p>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<Layout />}>
          <Route
            index
            element={
              <RequireVisiblePage pageId="home">
                <Home />
              </RequireVisiblePage>
            }
          />
          <Route
            path="store"
            element={
              <RequireVisiblePage pageId="store">
                <Store />
              </RequireVisiblePage>
            }
          />
          <Route
            path="store/:productId"
            element={
              <RequireVisiblePage pageId="store">
                <ProductDetail />
              </RequireVisiblePage>
            }
          />
          <Route
            path="about"
            element={
              <RequireVisiblePage pageId="about">
                <About />
              </RequireVisiblePage>
            }
          />
          <Route
            path="contact"
            element={
              <RequireVisiblePage pageId="contact">
                <Contact />
              </RequireVisiblePage>
            }
          />
          <Route
            path="socials"
            element={
              <RequireVisiblePage pageId="socials">
                <Socials />
              </RequireVisiblePage>
            }
          />
          <Route path="cart" element={<Cart />} />
          <Route path="login" element={<Login />} />
          <Route path="account" element={<Account />} />
          <Route path="checkout/success" element={<CheckoutSuccess />} />
          <Route path="checkout/cancel" element={<CheckoutCancel />} />
        </Route>

        <Route path="admin/login" element={<AdminLogin />} />
        <Route element={<AdminRoute />}>
          <Route path="admin" element={<Admin />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
