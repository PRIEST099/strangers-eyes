import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Unit tests run in Node: pure functions (geo, boxes, parsers, gate logic) plus IndexedDB via fake-indexeddb.
// Browser-only libraries (MediaPipe, Tesseract, canvas) are exercised by the DEV selftest page instead.
export default defineConfig({
  resolve: {
    alias: {
      '@prompts': r('../shared/prompts'),
      '@strings': r('../shared/strings'),
      '@vectors': r('../shared/testvectors'),
      '@root': r('..'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
