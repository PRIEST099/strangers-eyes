// web/src/ui/gate.ts: what App shows before any route (pure, unit-tested in Node).
//   1. Unsupported browser (no WebAssembly or no IndexedDB): a full page, copy.err.browser (SPEC SCR-22).
//   2. No 18+ acknowledgement on this device: SCR-01 Welcome, in place of every product route (ARCH §3.4).
//   3. Otherwise the app. A Welcome finished on #/judge (the `?judge=1` deep link, or #/judge typed on a fresh profile)
//      opens SCR-02 on top of Judge Mode: SCR-01 → SCR-02 → Judge Mode in ≤ 3 clicks (AC-071; D-103).
// DEV pages (#/dev/*) skip both, so unattended spike runs never stop at Welcome (App.tsx).
import type { AppRoute } from './router';

/** `typeof` results, so the check runs on any object in tests. */
export interface BrowserEnv {
  readonly wasm: string;
  readonly idb: string;
}

/** Strangers' Eyes needs WebAssembly (MediaPipe, Tesseract) and IndexedDB (the sealed vault). */
export const browserSupported = (env: BrowserEnv): boolean => env.wasm === 'object' && env.idb === 'object';

/** This browser, now. */
export function detectBrowserSupport(): boolean {
  return browserSupported({ wasm: typeof WebAssembly, idb: typeof indexedDB });
}

export type TopScreen = 'unsupported' | 'welcome' | 'app';

/** The unsupported page wins over Welcome: a browser that cannot run the app should not ask for the 18+ box. */
export function topScreen(s: { supported: boolean; acknowledged: boolean }): TopScreen {
  if (!s.supported) return 'unsupported';
  return s.acknowledged ? 'app' : 'welcome';
}

/** After Welcome: open SCR-02 when the user arrived for Judge Mode (AC-071). */
export const capabilityAfterWelcome = (route: AppRoute): boolean => route.name === 'judge';

/** `?debug=1` shows Settings › Developer (ARCH §3.4). Other values, or none, do not. */
export const isDebugSearch = (search: string): boolean => new URLSearchParams(search).get('debug') === '1';

let debugAtBoot: boolean | undefined;
/** `?debug=1`, read once (the hash router never changes the query; main.tsx's redirect keeps `debug`). */
export function debugFlag(): boolean {
  debugAtBoot ??= typeof location !== 'undefined' && isDebugSearch(location.search);
  return debugAtBoot;
}
