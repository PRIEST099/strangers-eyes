// ARCH §16.1. The PWA settings are the verified shape (API-NOTES §5.5); paths follow ARCH §3 / R-08.
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
// Private photos live OUTSIDE the repo (CLAUDE.md). The dev server may read them only for unattended spikes.
const PRIV = '/Users/mac/StrangersEyes-private';

export default defineConfig(({ mode }) => ({
  build: {
    // Emit the licenses of every bundled npm dependency (the minifier strips their comments). A non-dot path,
    // because firebase.json hosting ignores dotfiles. The self-hosted wasm/model notices ship as
    // /vendor/third-party-notices.md (copied from THIRD_PARTY_NOTICES.md by scripts/copy-assets.mjs).
    license: { fileName: 'third-party-licenses.md' },
  },
  resolve: {
    alias: {
      '@prompts': r('../shared/prompts'),
      '@strings': r('../shared/strings'),
      '@vectors': r('../shared/testvectors'),
      '@root': r('..'),
    },
  },
  server: {
    fs: { allow: ['..', ...(mode === 'development' && process.env.VITE_SPIKE === '1' ? [PRIV] : [])] },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: false, // registered from React via useRegisterSW()
      manifest: {
        name: "Strangers' Eyes",
        short_name: 'Strangers',
        description: "See your photo the way a stalker's AI would, before you post it.",
        start_url: '/',
        display: 'standalone',
        background_color: '#0b0b0f',
        theme_color: '#0b0b0f',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Setting globPatterns REPLACES the defaults: keep js/css/html. Do NOT add webmanifest (the plugin adds it).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm,tflite,gz,jpg,json}'],
        // vision_wasm_internal.wasm is ~14.7 MB; the plugin fails the build above this limit.
        maximumFileSizeToCacheInBytes: 32 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/__\//], // keep Firebase reserved URLs
        cleanupOutdatedCaches: true,
        // With injectRegister:false the plugin does not set these for autoUpdate, so a new deploy would wait
        // until every tab closed and a first install would not control the open page (T-023 review build-config-1).
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [], // NEVER cache googleapis or AI responses
      },
    }),
  ],
}));
