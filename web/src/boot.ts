// web/src/boot.ts: the app's start-up in the mandatory order (ARCH §15.1; SPEC AC-291, AC-294; T-101, T-102).
// main.tsx imports this SECOND, right after './ai/tripwire-install', so evaluating it runs firebase/init first:
// initializeApp → [DEV debug flag] → initializeAppCheck → getAuth + signInAnonymously → getAI (then getRemoteConfig).
// boot() then runs steps 3–5: Remote Config → the vault scanner → render. No step can keep the app from rendering:
// each wait is bounded, and every failure leaves the safe state behind (defaults; a vault scanner that blocks every
// cloud call until the index is built, so the gate fails closed).
import './firebase/init'; // step 2, explicitly first (remoteConfig imports it too)
import { cfg, loadConfig, subscribeConfig } from './firebase/remoteConfig';
import { vaultScan } from './ai/vaultScan';
import { bootRedirect, parseHash } from './ui/router';

/** The longest boot waits for one step before rendering anyway; the step keeps running in the background. */
export const BOOT_STEP_TIMEOUT_MS = 3_000;
export type BootStepOutcome = 'ok' | 'failed' | 'timeout';
export interface BootResult {
  /** Booted on the Judge Mode route: the real vault was not unsealed (D-37). */
  readonly judge: boolean;
  /** Step 3. Never 'failed' in practice: loadConfig falls back to the cached or default values by itself. */
  readonly config: BootStepOutcome;
  /** Step 4. 'failed' or 'timeout' = the scanner stays blocking (every cloud call refused) until the index is built. */
  readonly vault: BootStepOutcome;
}

/** ARCH §15.1 step 4: the boot route is Judge Mode for `?judge=1` (before or after the redirect) or `#/judge`. */
export function isJudgeBoot(loc: Pick<Location, 'search' | 'hash'>): boolean {
  return bootRedirect(loc.search) !== null || parseHash(loc.hash, { dev: false }).name === 'judge';
}

function settle(p: Promise<unknown>): Promise<BootStepOutcome> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve('timeout'), BOOT_STEP_TIMEOUT_MS);
    p.then(
      () => { clearTimeout(t); resolve('ok'); },
      () => { clearTimeout(t); resolve('failed'); },
    );
  });
}

let booting: Promise<BootResult> | null = null;

/** Steps 3–5, once per page load (a second call returns the first call's promise). */
export function boot(opts: { judge: boolean; render: () => void }): Promise<BootResult> {
  booting ??= run(opts);
  return booting;
}

async function run({ judge, render }: { judge: boolean; render: () => void }): Promise<BootResult> {
  // 3. Remote Config: last activated values (works offline) or the template defaults; the fetch runs in the background.
  const config = await settle(loadConfig());

  // RC fuzzy_threshold drives the scanner the vault index registers with the tripwire; it follows real-time updates.
  let theta = cfg().fuzzyThreshold;
  vaultScan.setFuzzyThreshold(theta);
  subscribeConfig(() => {
    const next = cfg().fuzzyThreshold;
    if (next !== theta) { theta = next; vaultScan.setFuzzyThreshold(next); }
  });

  // 4. The vault scanner: finishes an interrupted burn first, then the real vault's index, or an empty one on the
  //    Judge Mode route (never unsealing the real vault). It blocks synchronously before its first await, so the
  //    tripwire refuses every AI request until the index exists, whatever happens to the render below.
  const vault = await settle(vaultScan.init({ judge }));

  // 5. Render (the Welcome gate, T-091, is App's).
  render();
  return Object.freeze({ judge, config, vault });
}
