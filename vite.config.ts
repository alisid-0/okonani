import react from '@vitejs/plugin-react'
import dotenv from 'dotenv'
import { defineConfig } from 'vite'
import { createStripeApp } from './server/createApp.js'

dotenv.config()

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'stripe-api',
      configureServer(server) {
        try {
          const app = createStripeApp()
          server.middlewares.use(app)
          console.log('[stripe-api] Payment routes mounted at /api/*')
        } catch (err) {
          console.error('[stripe-api]', err instanceof Error ? err.message : err)
        }
      },
    },
  ],
})
