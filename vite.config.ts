import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const projectId = env.VITE_FIREBASE_PROJECT_ID || 'okonani-dff36'
  const functionsOrigin = `https://us-central1-${projectId}.cloudfunctions.net`
  const useProxy = env.VITE_USE_FIREBASE_EMULATORS !== 'true'

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/firebase')) return 'firebase'
            if (id.includes('node_modules/react-router') || id.includes('node_modules/react-dom')) {
              return 'vendor'
            }
          },
        },
      },
    },
    server: useProxy
      ? {
          proxy: {
            '/api/admin/check-access': {
              target: functionsOrigin,
              changeOrigin: true,
              rewrite: () => '/adminCheckAccess',
            },
            '/api/admin/products/save': {
              target: functionsOrigin,
              changeOrigin: true,
              rewrite: () => '/adminSaveProduct',
            },
            '/api/admin/products/delete': {
              target: functionsOrigin,
              changeOrigin: true,
              rewrite: () => '/adminDeleteProduct',
            },
            '/api/admin/media/upload': {
              target: functionsOrigin,
              changeOrigin: true,
              rewrite: () => '/adminUploadMedia',
            },
            '/api/admin/media/read': {
              target: functionsOrigin,
              changeOrigin: true,
              rewrite: () => '/adminReadMedia',
            },
            '/api/create-checkout-session': {
              target: functionsOrigin,
              changeOrigin: true,
              rewrite: () => '/createCheckoutSession',
            },
            '/api/checkout-session': {
              target: functionsOrigin,
              changeOrigin: true,
              rewrite: (path) => path.replace('/api/checkout-session', '/getCheckoutSession'),
            },
            '/api/rewards/redeem': {
              target: functionsOrigin,
              changeOrigin: true,
              rewrite: () => '/redeemPoints',
            },
            '/api/rewards/summary': {
              target: functionsOrigin,
              changeOrigin: true,
              rewrite: () => '/getRewardsSummary',
            },
            '/api/social/feeds': {
              target: functionsOrigin,
              changeOrigin: true,
              rewrite: () => '/getSocialFeeds',
            },
          },
        }
      : undefined,
  }
})
