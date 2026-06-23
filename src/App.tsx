import { Route, Routes } from 'react-router-dom'
import AdminRoute from './components/AdminRoute'
import Layout from './components/Layout'
import About from './pages/About'
import Account from './pages/Account'
import Admin from './pages/Admin'
import AdminLogin from './pages/AdminLogin'
import Cart from './pages/Cart'
import Contact from './pages/Contact'
import Home from './pages/Home'
import CheckoutCancel from './pages/CheckoutCancel'
import CheckoutSuccess from './pages/CheckoutSuccess'
import Login from './pages/Login'
import ProductDetail from './pages/ProductDetail'
import Store from './pages/Store'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="store" element={<Store />} />
        <Route path="store/:productId" element={<ProductDetail />} />
        <Route path="about" element={<About />} />
        <Route path="contact" element={<Contact />} />
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
  )
}
