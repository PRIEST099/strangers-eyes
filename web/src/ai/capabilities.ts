// web/src/ai/capabilities.ts: the ONLY file that touches globalThis.LanguageModel (check-boundaries R4; SPEC §5.1).
// Two paths that never share state (SPEC D-03, AC-007; ARCH §9.5; R-11):
//   - Gate path: availabilityNow(io) / deviceReadyNow(io) call availability() FRESH on every call, with the very
//     createOptions objects the device models use (NANO_TEXT_IO / NANO_IMAGE_IO, D-86). An absent global, a throw,
//     a hang or an unknown answer all fail closed ('no-api' / 'unavailable' → RULES-ONLY, never the cloud).
//   - UI path: uiCapabilities() caches one snapshot for 30 s (header chip, SCR-02 panel, HUD Policy tab). The gate
//     never reads it.
// Also here: the pure state mapping (a)/(a′)/(b)/(c) plus the (d) flag (SPEC §5.2, AC-001), the display-only route
// per class for each state (SPEC §5.3), "Download Gemini Nano" (SPEC SCR-02, AC-073; D-87) and Chrome desktop
// detection for the how-to. Feature inference never happens here: no prompt() call, ever (API-NOTES §8).
import type { LanguageModelCreateOptions } from 'firebase/ai';
import type { Route } from '../core/types';

export type NanoIo = 'text' | 'image';
/** availability() answers, plus 'no-api' when the global is missing (SPEC §5.1 `hasLM` false). */
export type NanoState = 'no-api' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

const deepFreeze = <T extends object>(o: T): T => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v as object);
  return Object.freeze(o);
};

// The SAME objects go to availability() here and to the models' onDeviceParams.createOptions (ai/models.ts imports
// them from this file, D-86): the SDK checks availability(createOptions) itself (API-NOTES §1.5), so a gate check with
// different options could pass while the real call needs a download. Frozen so no caller can make them drift; both
// fields are set, so the SDK's constructor never writes defaults into them (it only fills missing ones).
export const NANO_TEXT_IO: LanguageModelCreateOptions = deepFreeze({
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
});
export const NANO_IMAGE_IO: LanguageModelCreateOptions = deepFreeze({
  expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
});
export const ioOptions = (io: NanoIo): LanguageModelCreateOptions => (io === 'image' ? NANO_IMAGE_IO : NANO_TEXT_IO);

// ---------- the global (read only through lm()) ----------

interface LmMonitor {
  addEventListener?: (type: 'downloadprogress', listener: (e: { loaded?: unknown }) => void) => void;
}
interface LmGlobal {
  availability?: (options: LanguageModelCreateOptions) => unknown;
  create?: (options: LanguageModelCreateOptions & { monitor?: (m: LmMonitor) => void }) => unknown;
}

/** The Chrome global, or null. A throwing getter counts as absent. */
function lm(): LmGlobal | null {
  try {
    const g = (globalThis as { LanguageModel?: unknown }).LanguageModel;
    return g !== null && (typeof g === 'object' || typeof g === 'function') ? (g as LmGlobal) : null;
  } catch {
    return null;
  }
}

const ANSWERS: ReadonlySet<string> = new Set(['unavailable', 'downloadable', 'downloading', 'available']);
/** A hung availability() must not freeze a check: after this the answer is 'unavailable' (fail closed). */
export const AVAILABILITY_TIMEOUT_MS = 5_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('availability() timed out')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

// ---------- gate path: fresh on every call ----------

/**
 * Gate path (SPEC AC-007, D-03; invariant 3). Calls availability() NOW, with the createOptions of `io`. Never cached:
 * call it immediately before every S0/S1 call and for every other device-readiness decision the gate makes.
 */
export async function availabilityNow(io: NanoIo): Promise<NanoState> {
  const g = lm();
  if (!g) return 'no-api';
  try {
    if (typeof g.availability !== 'function') return 'unavailable';
    const answer = await withTimeout(Promise.resolve(g.availability(ioOptions(io))), AVAILABILITY_TIMEOUT_MS);
    return typeof answer === 'string' && ANSWERS.has(answer) ? (answer as NanoState) : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/** True only when the device model for `io` is 'available' right now (fresh check, never cached). */
export const deviceReadyNow = async (io: NanoIo): Promise<boolean> => (await availabilityNow(io)) === 'available';

// ---------- UI path: cached for 30 s ----------

export interface UiCapabilities {
  /** Date.now() when the snapshot was taken. */
  readonly at: number;
  readonly text: NanoState;
  readonly image: NanoState;
}
export const UI_CACHE_MS = 30_000;
let uiCache: UiCapabilities | null = null;
let uiCacheSeq = 0;
let uiSeq = 0;
let uiInflight: Promise<UiCapabilities> | null = null;

/**
 * UI path only (header chip, SCR-02 panel, HUD Policy tab): a snapshot reused for up to 30 s. `force` (visibilitychange,
 * polling during a download, after a download) takes a new one. The gate must never call this (SPEC AC-007).
 * Resolves to the newest snapshot known, so a slow older check can never overwrite a newer one.
 */
export function uiCapabilities(force = false): Promise<UiCapabilities> {
  const fresh = force ? null : peekUiCapabilities();
  if (fresh) return Promise.resolve(fresh);
  if (!force && uiInflight) return uiInflight;
  const seq = ++uiSeq;
  const p = Promise.all([availabilityNow('text'), availabilityNow('image')]).then(([text, image]) => {
    if (seq > uiCacheSeq) {
      uiCache = Object.freeze({ at: Date.now(), text, image });
      uiCacheSeq = seq;
    }
    if (uiInflight === p) uiInflight = null;
    return uiCache as UiCapabilities;
  });
  uiInflight = p;
  return p;
}

/** The UI snapshot if one younger than 30 s exists, else null (a remount shows it at once instead of (c)). */
export function peekUiCapabilities(): UiCapabilities | null {
  const age = uiCache ? Date.now() - uiCache.at : Infinity;
  return uiCache && age >= 0 && age < UI_CACHE_MS ? uiCache : null;
}

// ---------- states (SPEC §5.2, AC-001) ----------

/** (a) Nano available · (a′) Nano for text, not images · (b) Nano downloading · (c) no Nano. */
export type CapState = 'a' | 'a-prime' | 'b' | 'c';
/** Why the state is (c). */
export type NoNanoReason = 'disabled' | 'no-api' | 'unavailable';

/** SPEC §5.1 signals. `hasLM` false is text/image 'no-api'; `nanoEnabled` already folds in the "no Nano" simulation. */
export interface CapSignals {
  readonly text: NanoState;
  readonly image: NanoState;
  readonly nanoEnabled: boolean;
  readonly online: boolean;
}

export interface Capability {
  readonly state: CapState;
  /** The (d) flag: offline, independent of (a)–(c). */
  readonly offline: boolean;
  /** Set only in (c). */
  readonly noNano: NoNanoReason | null;
  /** What "Download Gemini Nano" fetches: in (b), or in (a′) when the image model is downloadable. Null otherwise. */
  readonly downloadIo: NanoIo | null;
  /** Chrome reports a download in progress (ours or its own) for text or image. */
  readonly downloading: boolean;
}

const isFetchable = (s: NanoState) => s === 'downloadable' || s === 'downloading';

/**
 * Exactly one of (a), (a′), (b), (c), plus the (d) flag (D-86 fixes the precedence where SPEC §5.2's definitions
 * overlap):
 *   1. Nano turned off (setting or simulation) → (c) 'disabled'.
 *   2. No LanguageModel global → (c) 'no-api'.
 *   3. text 'available' → (a) if image is 'available' too, else (a′). The gate checks each io freshly, so text jobs
 *      really run on the device even while the image model downloads; (a′) is what happens.
 *   4. text 'downloadable' / 'downloading' → (b).
 *   5. text 'unavailable' → (c) 'unavailable', whatever image says (the image options include text input).
 */
export function capabilityOf(s: CapSignals): Capability {
  const offline = !s.online;
  const noNano = (reason: NoNanoReason): Capability => ({ state: 'c', offline, noNano: reason, downloadIo: null, downloading: false });
  if (!s.nanoEnabled) return noNano('disabled');
  if (s.text === 'no-api' || s.image === 'no-api') return noNano('no-api');
  const downloading = s.text === 'downloading' || s.image === 'downloading';
  if (s.text === 'available') {
    if (s.image === 'available') return { state: 'a', offline, noNano: null, downloadIo: null, downloading: false };
    return { state: 'a-prime', offline, noNano: null, downloadIo: isFetchable(s.image) ? 'image' : null, downloading };
  }
  if (isFetchable(s.text)) {
    return { state: 'b', offline, noNano: null, downloadIo: isFetchable(s.image) ? 'image' : 'text', downloading };
  }
  return noNano('unavailable');
}

export const PAYLOAD_CLASSES = ['S0', 'S1', 'S2', 'S3', 'S4'] as const;
export type PayloadClass = (typeof PAYLOAD_CLASSES)[number];

/**
 * Where each class runs in this state (SPEC §5.3), for the SCR-02 policy mini-table. Display only: the Egress Gate
 * decides every real call afresh.
 */
export function expectedRoutes(c: Capability): Readonly<Record<PayloadClass, Route>> {
  const text = c.state === 'a' || c.state === 'a-prime';
  const elsewhere: Route = c.offline ? 'RULES_ONLY' : 'IN_CLOUD'; // S2/S4 without Nano: SDK cloud fallback, or the template offline
  return {
    S0: text ? 'ON_DEVICE' : 'RULES_ONLY',
    S1: c.state === 'a' ? 'ON_DEVICE' : 'RULES_ONLY',
    S2: text ? 'ON_DEVICE' : elsewhere,
    S3: c.offline ? 'QUEUED' : 'IN_CLOUD',
    S4: text ? 'ON_DEVICE' : elsewhere,
  };
}

// ---------- "Download Gemini Nano" (SPEC SCR-02, AC-073; D-87) ----------

/** Download progress from 0 to 1. */
export type ProgressFn = (fraction: number) => void;
/** The SDK's `GenerativeModel.initializeDeviceModel`, bound to an on-device model built in ai/models.ts. */
export type DeviceModelInitializer = (onDownloadProgress: ProgressFn) => Promise<void>;

/** Clamp to [0, 1], drop non-numbers, never go backwards. */
function progressReporter(onProgress: ProgressFn): ProgressFn {
  let last = -1;
  return (f) => {
    if (typeof f !== 'number' || !Number.isFinite(f)) return;
    const v = Math.min(1, Math.max(0, f));
    if (v <= last) return;
    last = v;
    onProgress(v);
  };
}

/**
 * Starts the Gemini Nano download for `io` and resolves when the model is ready (progress ends at 1).
 *
 * Call it SYNCHRONOUSLY from the button's click handler, with no await before it: Chrome starts a download only with a
 * user activation.
 * - Without `initialize` (the default, D-87): the same call the SDK makes internally, create({...createOptions, monitor})
 *   relaying `downloadprogress` (API-NOTES §1.6), reached in the click's own task. The session is destroyed at once, so
 *   the model is not held in memory; nothing is prompted.
 * - With `initialize` (the SDK's initializeDeviceModel, SPEC SCR-02's literal path): the SDK awaits availability()
 *   before its create(), so this relies on Chrome's transient activation (about 5 s) surviving that one await, not on
 *   the same task. Build the initializer synchronously in the click, with no other await (API-NOTES §1.6).
 * Rejects when there is no API or Chrome refuses (no activation, no disk space, unsupported hardware).
 */
export function enableDeviceModel(io: NanoIo, onProgress: ProgressFn, initialize?: DeviceModelInitializer): Promise<void> {
  const report = progressReporter(onProgress);
  try {
    if (initialize) return Promise.resolve(initialize(report)).then(() => report(1));
    const g = lm();
    if (!g || typeof g.create !== 'function') return Promise.reject(new Error('no on-device model API in this browser'));
    const session = g.create({
      ...ioOptions(io),
      monitor: (m) => {
        if (typeof m?.addEventListener === 'function') {
          m.addEventListener('downloadprogress', (e) => report(typeof e?.loaded === 'number' ? e.loaded : NaN));
        }
      },
    });
    return Promise.resolve(session).then((s) => {
      try {
        (s as { destroy?: () => void } | null)?.destroy?.();
      } catch {
        // already gone: nothing holds the model
      }
      report(1);
    });
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }
}

// ---------- Chrome desktop (the SCR-02 how-to) ----------

export interface NavigatorLike {
  readonly userAgent?: string;
  readonly userAgentData?: { readonly brands?: readonly { readonly brand: string }[]; readonly mobile?: boolean };
}

/** Google Chrome on a desktop OS (not Edge, Opera, Brave, Samsung Internet, Chrome on Android or iOS). */
export function isChromeDesktop(nav: NavigatorLike | undefined | null): boolean {
  if (!nav) return false;
  const uad = nav.userAgentData;
  if (uad && Array.isArray(uad.brands) && uad.brands.length > 0) {
    return uad.mobile !== true && uad.brands.some((b) => b.brand === 'Google Chrome');
  }
  const ua = nav.userAgent ?? '';
  return (
    /\bChrome\/\d+/.test(ua) &&
    !/\b(?:Edg|EdgA|OPR|SamsungBrowser|YaBrowser|Vivaldi|Brave)\//.test(ua) &&
    !/\b(?:Mobile|Android)\b/.test(ua)
  );
}
