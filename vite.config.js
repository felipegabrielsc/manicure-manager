import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['carla-icon.svg'], // O ícone que criamos antes
      manifest: {
        name: 'Agenda Manicure',
        short_name: 'Agenda',
        description: 'Gestão completa para manicures',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone', // Isso faz parecer App nativo (sem barra de URL)
        icons: [
          {
            src: 'carla-icon.svg', // Usando o SVG como ícone
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'carla-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
})