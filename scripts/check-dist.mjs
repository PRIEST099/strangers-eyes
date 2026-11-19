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
console.log('check-dist: ok (no DEV-only code in the build)');
