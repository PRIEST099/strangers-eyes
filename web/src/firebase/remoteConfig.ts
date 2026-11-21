// web/src/firebase/remoteConfig.ts: Remote Config as code (ARCH §13.4; SPEC §16; T-102). The parse is rcParse.ts
// (pure); this file owns the SDK: settings, ensureInitialized before any read, a background fetch, real-time updates for
// the kill switch, and the cfg() snapshot the app reads. It never blocks the app on the network: an offline start
// uses the last ACTIVATED values (IndexedDB) or the template defaults at once (AC-294).
// Calls verified against @firebase/remote-config 0.10.0 (firebase 13.4.0) typings and source (API-NOTES §2.4).
import {
  activate, ensureInitialized, fetchAndActivate, getRemoteConfig, getValue, onConfigUpdate, type RemoteConfig,
} from 'firebase/remote-config';
import { app } from './init';
import { DEFAULT_CONFIG, parseConfig, RC_DEFAULTS, RC_KEYS, sameConfig, type AppConfig, type ConfigSource } from './rcParse';

export type { AppConfig, ConfigSource, RcWarning, RcWarningReason } from './rcParse';
export { DEFAULT_CONFIG, RC_DEFAULTS, RC_KEYS } from './rcParse';

/** SPEC §16: 60 s in dev, 1 h in production (the SDK default is 12 h). A function so the production value is testable. */
export const minFetchIntervalMs = (dev: boolean): number => (dev ? 60_000 : 3_600_000);
export const RC_MIN_FETCH_INTERVAL_MS = minFetchIntervalMs(import.meta.env.DEV);
/** SPEC §16: 8 s (the SDK default is 60 s). */
export const RC_FETCH_TIMEOUT_MS = 8_000;
/**
 * The longest boot waits for `ensureInitialized` (an IndexedDB read, normally a few ms). If IndexedDB is slow or
 * broken the app starts on the template defaults and picks up the cached values when the read finishes.
 */
export const RC_INIT_TIMEOUT_MS = 2_000;

export const rc: RemoteConfig = getRemoteConfig(app);
rc.settings.minimumFetchIntervalMillis = RC_MIN_FETCH_INTERVAL_MS;
rc.settings.fetchTimeoutMillis = RC_FETCH_TIMEOUT_MS;
rc.defaultConfig = { ...RC_DEFAULTS };

let current: AppConfig = DEFAULT_CONFIG; // the template defaults until the SDK's values are readable
let fetchedThisSession = false; // a fetch or real-time activation succeeded in this page load
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** The config in force: deep-frozen, and the same object until a value really changes (useSyncExternalStore-safe). */
export const cfg = (): AppConfig => current;

/** Called after every change of cfg() (activation, real-time kill switch). Returns the unsubscribe function. */
export function subscribeConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Re-read every key from the SDK and publish a new cfg() if anything changed. Called ONLY once values are readable:
 * ensureInitialized resolved, or a fetch or real-time activation succeeded (API-NOTES §2.4: never read before that).
 */
function refresh(): void {
  const raw: Record<string, string> = {};
  let anyRemote = false;
  for (const k of RC_KEYS) {
    const v = getValue(rc, k);
    raw[k] = v.asString();
    if (v.getSource() === 'remote') anyRemote = true;
  }
  // 'remote' = fetched in this page load; 'cached' = activated in an earlier one (offline start); 'default' = template.
  const source: ConfigSource = anyRemote ? (fetchedThisSession ? 'remote' : 'cached') : 'default';
  const next = parseConfig(raw, source);
  if (sameConfig(next, current)) return;
  current = next;
  for (const l of [...listeners]) l();
}

/**
 * ARCH §15.1 step 3. Resolves as soon as the last activated values are readable (or after RC_INIT_TIMEOUT_MS); the
 * fetch and the real-time listener run in the background and never reject this promise. Idempotent.
 */
export function loadConfig(): Promise<void> {
  loading ??= (async () => {
    const init = ensureInitialized(rc);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settled = await Promise.race([
      init.then(() => true, () => false),
      new Promise<false>((res) => { timer = setTimeout(() => res(false), RC_INIT_TIMEOUT_MS); }),
    ]);
    clearTimeout(timer);
    if (settled) refresh();
    else void init.then(refresh, () => {}); // slow or broken IndexedDB: defaults now, cached values if it recovers

    // Background fetch: offline it rejects ('remoteconfig/fetch-client-network') and the cached/default values stay.
    void fetchAndActivate(rc).then(
      () => { fetchedThisSession = true; refresh(); },
      () => {},
    );
    // Real time: the SDK fetches the new template itself; activating it applies the kill switch within seconds.
    onConfigUpdate(rc, {
      next: () => {
        // An activation makes values readable by itself: after a failed ensureInitialized (broken IndexedDB) and an
        // offline first fetch, this is the first moment they are, and the kill switch must reach cfg() (F-159).
        void activate(rc).then(() => { fetchedThisSession = true; refresh(); }, () => {});
      },
      error: () => {}, // e.g. offline or the real-time API unavailable: polling at the next start still applies
      complete: () => {},
    });
  })();
  return loading;
}
