import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Agenda Manicure',
        short_name: 'Agenda',
        description: 'Gerenciamento de Agenda e Financeiro',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone', // Isso faz abrir sem barra de navegador!
        icons: [
          {
            src: 'pwa-192x192.png', // Você precisará criar essa imagem depois
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png', // E essa também
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})