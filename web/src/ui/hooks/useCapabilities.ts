// web/src/ui/hooks/useCapabilities.ts: the UI's view of on-device AI (SPEC §5.1–5.2, §8.2 chip, SCR-02 panel).
// UI path only: it shows ai/capabilities' cached snapshot (uiCapabilities, ≤30 s old). The Egress Gate never uses any
// of this (it checks freshly, AC-007; check-boundaries R23 keeps the snapshot inside web/src/ui).
// Fail closed: until the first check returns, the state is (c) and the chip says Rules-only, never on-device AI.
// Call it ONCE (AppShell) and hand the view to the header chip and the capability panel, so both show one state and
// one download.
// All timing lives in createCapabilitiesController, a plain object with injected clock, timers, document and service
// worker, so it is unit-tested with fake timers (T-061 review, D-100). The hook only starts and stops it.
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  UI_CACHE_MS,
  capabilityOf,
  enableDeviceModel,
  isChromeDesktop,
  peekUiCapabilities,
  uiCapabilities,
  type Capability,
  type DeviceModelInitializer,
  type NanoIo,
  type ProgressFn,
  type UiCapabilities,
} from '../../ai/capabilities';
import type { CapabilityChipState } from '../layout';

export type DownloadState =
  | { kind: 'idle' }
  | { kind: 'running'; pct: number }
  | { kind: 'done' }
  | { kind: 'failed' };

export interface CapabilitiesView {
  /** False until the first availability check returns (the state is (c) meanwhile). */
  checked: boolean;
  capability: Capability;
  chip: CapabilityChipState;
  download: DownloadState;
  /** "Download Gemini Nano": call it directly in the click handler (user activation; SPEC AC-073). */
  startDownload: () => void;
  /** The panel became visible: re-check if the snapshot is older than 30 s (stable identity). */
  onPanelShown: () => void;
  /** Google Chrome on a desktop OS: show the how-to in state (c). */
  chromeDesktop: boolean;
  /** A service worker controls the page, so the app opens offline. */
  swReady: boolean;
}

export interface UseCapabilitiesOptions {
  online: boolean;
  /** "Use Gemini Nano when available" AND not simulating "no Nano" (SPEC §5.1 `nanoEnabled`). Default on. */
  nanoEnabled?: boolean;
  /**
   * Per-io SDK initializer, e.g. `(io) => initializeDeviceModelFor(ai, io)` from ai/models.ts (D-91). Called inside
   * the click, so it must be synchronous and cheap. Absent: the direct create() download (D-87), the default.
   */
  initializeDeviceModel?: (io: NanoIo) => DeviceModelInitializer;
}

/** How often the snapshot is re-taken while Chrome reports a download (AC-073: the chip flips within 2 s). */
export const POLL_MS = 2_000;

const UNCHECKED: Pick<UiCapabilities, 'text' | 'image'> = { text: 'no-api', image: 'no-api' };

/** Whole percent from a 0..1 fraction; 100 only when the download is complete. */
export const pctOf = (fraction: number): number =>
  Number.isFinite(fraction) ? Math.min(100, Math.max(0, Math.floor(fraction * 100))) : 0;

/**
 * The header chip (SPEC §8.2). (b) shows a percentage only while something is downloading: our own download, or
 * Chrome's (pct 0 until a click attaches a monitor). 'downloadable' alone shows Rules-only, because nothing is
 * downloading and private checks are rules-only until the model is ready (D-86).
 */
export function chipStateOf(cap: Capability, download: DownloadState): CapabilityChipState {
  switch (cap.state) {
    case 'a':
      return { kind: 'nano' };
    case 'a-prime':
      return { kind: 'nanoTextOnly' };
    case 'b':
      if (download.kind === 'running') return { kind: 'downloading', pct: download.pct };
      if (cap.downloading) return { kind: 'downloading', pct: download.kind === 'done' ? 100 : 0 };
      return { kind: 'rulesOnly' };
    case 'c':
      return { kind: 'rulesOnly' };
  }
}

// ---------- the controller (pure timing; unit-tested with fake timers) ----------

export interface VisibilityTarget {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}
export interface ServiceWorkerLike {
  readonly controller: unknown;
  addEventListener(type: 'controllerchange', listener: () => void): void;
  removeEventListener(type: 'controllerchange', listener: () => void): void;
}
export interface ControllerDeps {
  uiCapabilities: (force: boolean) => Promise<UiCapabilities>;
  enableDeviceModel: (io: NanoIo, onProgress: ProgressFn, initialize?: DeviceModelInitializer) => Promise<void>;
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  /** Absent (no DOM): treated as always visible, with no visibilitychange. */
  doc?: VisibilityTarget;
  sw?: ServiceWorkerLike;
}
export interface CapabilitiesState {
  readonly snap: UiCapabilities | null;
  readonly download: DownloadState;
  readonly swReady: boolean;
}
export interface CapabilitiesController {
  getState(): CapabilitiesState;
  subscribe(listener: () => void): () => void;
  /** Mount: first check, listeners, timers. Idempotent; restartable (StrictMode). */
  start(): void;
  /** Unmount: removes every listener and timer; results arriving later are ignored. */
  stop(): void;
  /** Re-check if the snapshot is older than 30 s (the panel became visible). */
  panelShown(): void;
  /** Call synchronously from the click: the download request is made before this returns (user activation). */
  startDownload(io: NanoIo, initialize?: DeviceModelInitializer): void;
}

const chromeDownloading = (s: UiCapabilities | null) => s !== null && (s.text === 'downloading' || s.image === 'downloading');

/**
 * When the snapshot is re-taken (SPEC §5.1: the UI shows it ≤30 s; D-100):
 *   - at start (unforced: a fresh cached snapshot is reused);
 *   - when it expires (30 s after it was taken) while the page is visible, and whenever the panel becomes visible
 *     (both unforced, so an unexpired snapshot is kept);
 *   - on visibilitychange to visible (forced);
 *   - every 2 s (forced) while Chrome reports a download or ours runs;
 *   - right after our download ends, success or failure (forced).
 * A check that rejects is retried after 30 s, so one bad first check never pins (c).
 */
export function createCapabilitiesController(deps: ControllerDeps, initial: UiCapabilities | null = null): CapabilitiesController {
  let state: CapabilitiesState = { snap: initial, download: { kind: 'idle' }, swReady: Boolean(deps.sw?.controller) };
  const listeners = new Set<() => void>();
  let started = false;
  let running = false;
  let expiry: unknown = null;
  let poll: unknown = null;

  const visible = () => deps.doc?.visibilityState !== 'hidden';

  const clearExpiry = () => {
    if (expiry !== null) deps.clearTimeout(expiry);
    expiry = null;
  };
  const scheduleExpiry = (ms: number) => {
    clearExpiry();
    if (!started) return;
    expiry = deps.setTimeout(() => {
      expiry = null;
      if (visible()) refresh(false); // hidden: the visibilitychange re-check takes over
    }, Math.max(0, ms));
  };
  const syncPoll = () => {
    const want = started && (state.download.kind === 'running' || chromeDownloading(state.snap));
    if (want && poll === null) {
      poll = deps.setInterval(() => {
        if (visible()) refresh(true);
      }, POLL_MS);
    } else if (!want && poll !== null) {
      deps.clearInterval(poll);
      poll = null;
    }
  };
  const set = (patch: Partial<CapabilitiesState>) => {
    state = { ...state, ...patch };
    syncPoll();
    for (const l of listeners) l();
  };

  function refresh(force: boolean) {
    let p: Promise<UiCapabilities>;
    try {
      p = deps.uiCapabilities(force);
    } catch (e) {
      p = Promise.reject(e);
    }
    p.then(
      (s) => {
        if (!started) return;
        if (s !== state.snap) set({ snap: s });
        scheduleExpiry(s.at + UI_CACHE_MS - deps.now());
      },
      () => {
        if (started) scheduleExpiry(UI_CACHE_MS);
      },
    );
  }

  const onVisibility = () => {
    if (visible()) refresh(true);
  };
  const onController = () => {
    const sw = Boolean(deps.sw?.controller);
    if (sw !== state.swReady) set({ swReady: sw });
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (started) return;
      started = true;
      onController(); // a worker may have taken control between the first render and this mount
      deps.doc?.addEventListener('visibilitychange', onVisibility);
      deps.sw?.addEventListener('controllerchange', onController);
      refresh(false);
      syncPoll();
    },
    stop() {
      if (!started) return;
      started = false;
      deps.doc?.removeEventListener('visibilitychange', onVisibility);
      deps.sw?.removeEventListener('controllerchange', onController);
      clearExpiry();
      syncPoll();
    },
    panelShown() {
      if (started) refresh(false);
    },
    startDownload(io, initialize) {
      if (running) return;
      running = true;
      set({ download: { kind: 'running', pct: 0 } });
      let last = 0;
      let p: Promise<void>;
      try {
        // No await before this call: the click's user activation must reach the browser's download request.
        p = deps.enableDeviceModel(
          io,
          (f) => {
            const pct = pctOf(f);
            if (pct !== last) {
              last = pct;
              set({ download: { kind: 'running', pct } });
            }
          },
          initialize,
        );
      } catch (e) {
        p = Promise.reject(e);
      }
      p.then(
        () => set({ download: { kind: 'done' } }),
        () => set({ download: { kind: 'failed' } }),
      ).finally(() => {
        running = false;
        if (started) refresh(true);
      });
    },
  };
}

// ---------- the hook ----------

const hasNavigator = () => typeof navigator !== 'undefined';

const browserDeps = (): ControllerDeps => ({
  uiCapabilities,
  enableDeviceModel,
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  doc: typeof document === 'undefined' ? undefined : document,
  sw: hasNavigator() ? navigator.serviceWorker : undefined,
});

export function useCapabilities({ online, nanoEnabled = true, initializeDeviceModel }: UseCapabilitiesOptions): CapabilitiesView {
  const [ctl] = useState(() => createCapabilitiesController(browserDeps(), peekUiCapabilities()));
  const [chromeDesktop] = useState(() => hasNavigator() && isChromeDesktop(navigator));
  useEffect(() => {
    ctl.start();
    return () => ctl.stop();
  }, [ctl]);
  const st = useSyncExternalStore(ctl.subscribe, ctl.getState, ctl.getState);

  const capability = capabilityOf({ ...(st.snap ?? UNCHECKED), nanoEnabled, online });
  const { downloadIo } = capability;

  return {
    checked: st.snap !== null,
    capability,
    chip: chipStateOf(capability, st.download),
    download: st.download,
    startDownload: () => {
      if (downloadIo) ctl.startDownload(downloadIo, initializeDeviceModel?.(downloadIo));
    },
    onPanelShown: ctl.panelShown,
    chromeDesktop,
    swReady: st.swReady,
  };
}
