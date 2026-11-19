import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: false, // we call useRegisterSW() from virtual:pwa-register/react
      manifest: {
        name: "Strangers' Eyes",
        short_name: 'Strangers',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b0b0f',
        theme_color: '#0b0b0f',
        icons: [],
      },
      workbox: {
        // Must list ALL types once you override; .tflite/.gz are not in the default pattern
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm,tflite,gz}'],
        maximumFileSizeToCacheInBytes: 32 * 1024 * 1024, // vision_wasm_internal.wasm is ~14.7 MB
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
