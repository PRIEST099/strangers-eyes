#!/usr/bin/env node
// scripts/check-dist.mjs: runs after `vite build` (web "postbuild"). Fails if any DEV-only code reached the
// production bundle (AC-065). Every file under web/src/dev carries the marker string (check-boundaries R20).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = '__SE_DEV_ONLY__';
const dist = resolve(process.argv[2] ?? fileURLToPath(new URL('../web/dist', import.meta.url)));
if (!existsSync(dist)) {
  console.error(`check-dist: ${dist} does not exist; run the build first`);
  process.exit(1);
}
const hits = [];
const walk = (d) => {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|mjs|css|html|json|map|webmanifest)$/.test(name) && readFileSync(p, 'utf8').includes(MARKER)) hits.push(relative(dist, p));
  }
};
walk(dist);
if (hits.length) {
  console.error(`check-dist: DEV-only code found in the production build:\n  ${hits.join('\n  ')}`);
  process.exit(1);
}

// The service worker's navigation fallback must not swallow real files the app links to: About's licence notices
// (*.md) would otherwise open the app shell once the worker controls the page (T-092 review; vite.config.ts
// NAVIGATE_FALLBACK_DENYLIST). Workbox writes the denylist as regex literals inside `denylist:[…]`.
const swPath = join(dist, 'sw.js');
if (!existsSync(swPath)) {
  console.error('check-dist: sw.js is missing from the build');
  process.exit(1);
}
const deny = /denylist:\[([^\]]*)\]/.exec(readFileSync(swPath, 'utf8'));
const required = ['/\\.md$/', '/^\\/__\\//'];
const missing = deny ? required.filter((re) => !deny[1].split(',').includes(re)) : required;
if (missing.length) {
  console.error(`check-dist: sw.js navigateFallback denylist lacks ${missing.join(' ')} (found: ${deny ? deny[1] : 'no denylist'})`);
  process.exit(1);
}
// The App Check debug flag is set only inside `if (import.meta.env.DEV)` (web/src/firebase/init.ts, T-101). The SDK
// itself only READS the global, so any assignment to it in the build means a debug token path shipped (D-118).
const DEBUG_FLAG_WRITE = /FIREBASE_APPCHECK_DEBUG_TOKEN['"`]?\]?\s*(?:=(?!=)|\?\?=|\|\|=|&&=)/;
const flagWrites = [];
const walkJs = (d) => {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walkJs(p);
    else if (/\.(js|mjs|html)$/.test(name) && DEBUG_FLAG_WRITE.test(readFileSync(p, 'utf8'))) flagWrites.push(relative(dist, p));
  }
};
walkJs(dist);
if (flagWrites.length) {
  console.error(`check-dist: the build assigns FIREBASE_APPCHECK_DEBUG_TOKEN (DEV-only):\n  ${flagWrites.join('\n  ')}`);
  process.exit(1);
}
console.log('check-dist: ok (no DEV-only code in the build; no App Check debug flag write; sw.js never answers *.md or /__/ with index.html)');
