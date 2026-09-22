import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
