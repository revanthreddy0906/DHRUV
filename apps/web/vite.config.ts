import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Same-origin API calls: the dev server forwards /api to the backend, so no CORS setup is needed.
  server: {
    proxy: { '/api': process.env.DHRUV_API_URL ?? 'http://localhost:4000' },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'DHRUV',
        short_name: 'DHRUV',
        description: 'Polar expedition operational decision support',
        theme_color: '#0B1220',
        background_color: '#0B1220',
        display: 'standalone'
      }
    })
  ]
})
