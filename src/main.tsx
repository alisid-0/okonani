import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { ShopPauseProvider } from './context/ShopPauseContext'
import './index.css'
import './craft-theme.css'
import './pages-art.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ShopPauseProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </ShopPauseProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
