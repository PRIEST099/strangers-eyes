// ARCH §16.1. The PWA settings are the verified shape (API-NOTES §5.5); paths follow ARCH §3 / R-08.
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
// Private photos live OUTSIDE the repo (CLAUDE.md). The dev server may read them only for unattended spikes.
const PRIV = '/Users/mac/StrangersEyes-private';

/** The commit About shows (SPEC SCR-20, AC-276): VITE_GIT_SHA if the environment sets it, else `git rev-parse`. */
function gitSha(): string {
  if (process.env.VITE_GIT_SHA) return process.env.VITE_GIT_SHA;
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: r('.'), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown'; // no git (e.g. a source tarball): About says the commit is not recorded
  }
}

/**
 * Paths the service worker must never answer with index.html: Firebase's reserved URLs, and real files the app links to
 * or fetches (the licence notices About links to, the self-hosted wasm and models). Without this, once the worker
 * controls the page, About's licence links opened the app shell (T-092 review). scripts/check-dist.mjs asserts it.
 */
export const NAVIGATE_FALLBACK_DENYLIST = [/^\/__\//, /\.md$/, /^\/vendor\//, /^\/models\//];

/**
 * DEV server only (apply: 'serve'): #/dev/nano POSTs its synthetic Nano report here, and it is written OUTSIDE the repo
 * (PRIV/raw/nano-check.json) so Claude can read it without driving the user's Chrome. Accepts small JSON only.
 */
function devNanoReport(): Plugin {
  return {
    name: 'se-dev-nano-report',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__se_dev/nano-report', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (c: Buffer) => { body += c.toString('utf8'); if (body.length > 20_000) req.destroy(); });
        req.on('end', () => {
          try {
            const parsed: unknown = JSON.parse(body);
            mkdirSync(`${PRIV}/raw`, { recursive: true });
            writeFileSync(`${PRIV}/raw/nano-check.json`, JSON.stringify(parsed, null, 2));
            res.statusCode = 204;
          } catch { res.statusCode = 400; }
          res.end();
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const spike = mode === 'development' && process.env.VITE_SPIKE === '1';
  return {
  define: {
    'import.meta.env.VITE_GIT_SHA': JSON.stringify(gitSha()),
  },
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
  server: spike
    ? {
        // Unattended spike runs only: serve PRIV/spike (not all of PRIV), and turn off HMR and the websocket so no
        // hot update or forced reload can restart a live run and repeat cloud calls (T-031 review blockers).
        fs: { allow: ['..', `${PRIV}/spike`] },
        hmr: false,
        ws: false,
      }
    : { fs: { allow: ['..'] } },
  plugins: [
    devNanoReport(),
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
        navigateFallbackDenylist: NAVIGATE_FALLBACK_DENYLIST,
        cleanupOutdatedCaches: true,
        // With injectRegister:false the plugin does not set these for autoUpdate, so a new deploy would wait
        // until every tab closed and a first install would not control the open page (T-023 review build-config-1).
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [], // NEVER cache googleapis or AI responses
      },
    }),
  ],
  };
});
