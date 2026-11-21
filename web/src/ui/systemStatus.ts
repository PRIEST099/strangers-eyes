// web/src/ui/systemStatus.ts: the system conditions of SPEC SCR-22 and which banner each one shows (D-105).
// Pure selection (selectBanners, cloudOffReason) plus one small store that the cloud side feeds:
//   - Remote Config (T-103): `kill_switch`, `daily_adversary_cap` → systemStatus.set({ killSwitch, dailyCap });
//   - Firebase boot (T-101): App Check token failure (or a 401/403) and anonymous sign-in failure → set({ appCheckFailed,
//     authFailed });
//   - the gate (T-062, BREACH, AD-31) → markTripwire(): one way, until reload;
//   - a cloud call that failed after its retries → report('rateLimit' | 'network' | 'cloudFailed').
// The daily counter itself lives in core/localPrefs (se.cap.<day>); the cap is reached when used ≥ dailyCap.
// Every banner leaves the on-device features working: none of them blocks a screen (AC-290).
import template from '@root/remoteconfig.template.json';
import type { CloudRowState } from './components/CapabilityPanel';
import type { StringId, StringParams } from '../core/strings';

/** Per-call failures after retries (ARCH §17). They are events: dismissible, and hidden while the cloud is off. */
export type TransientEvent = 'rateLimit' | 'network' | 'cloudFailed';
export const TRANSIENT_EVENTS: readonly TransientEvent[] = ['rateLimit', 'network', 'cloudFailed'];

/** Why the cloud is off, most severe first (the order is the precedence). */
export type CloudOff = 'tripwire' | 'killSwitch' | 'appCheck' | 'auth' | 'dailyCap';
export const CLOUD_OFF_ORDER: readonly CloudOff[] = ['tripwire', 'killSwitch', 'appCheck', 'auth', 'dailyCap'];

export type BannerKind = CloudOff | TransientEvent;

export interface SystemStatus {
  /** S0/S1 tripwire or BREACH (AC-022): persistent, the cloud is off until reload. */
  readonly tripwire: boolean;
  /** RC `kill_switch`. */
  readonly killSwitch: boolean;
  /** RC `daily_adversary_cap` (1–200). The bundled template default until RC feeds it. */
  readonly dailyCap: number;
  /** App Check token failure, or a 401/403. */
  readonly appCheckFailed: boolean;
  /** Anonymous sign-in failed (treated like an App Check failure for cloud calls). */
  readonly authFailed: boolean;
  /** Reported per-call failures, oldest first, no duplicates. */
  readonly events: readonly TransientEvent[];
}

/** `daily_adversary_cap` is clamped 1–200 (RC template description); a non-number is rejected. */
export function clampDailyCap(n: number): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.min(200, Math.max(1, Math.floor(n)));
}

/** The bundled default, from the RC template itself (never a hand-kept copy; AD-28). */
export const TEMPLATE_DAILY_CAP: number = (() => {
  const cap = clampDailyCap(Number(template.parameters.daily_adversary_cap.defaultValue.value));
  if (cap === null) throw new Error('remoteconfig.template.json: daily_adversary_cap default is not a number');
  return cap;
})();

export const INITIAL_STATUS: SystemStatus = Object.freeze({
  tripwire: false,
  killSwitch: false,
  dailyCap: TEMPLATE_DAILY_CAP,
  appCheckFailed: false,
  authFailed: false,
  events: Object.freeze([]) as readonly TransientEvent[],
});

// ---------- selection (pure) ----------

/** The one reason the cloud is off, by precedence, or null when it is available. */
export function cloudOffReason(s: SystemStatus, capUsed: number): CloudOff | null {
  if (s.tripwire) return 'tripwire';
  if (s.killSwitch) return 'killSwitch';
  if (s.appCheckFailed) return 'appCheck';
  if (s.authFailed) return 'auth';
  if (capUsed >= s.dailyCap) return 'dailyCap';
  return null;
}

export interface Banner {
  readonly kind: BannerKind;
  readonly copy: StringId;
  readonly params?: StringParams;
  /** danger: the red, assertive tripwire banner. warn: everything else (polite). */
  readonly tone: 'danger' | 'warn';
  /** Only per-call events can be dismissed; a state banner goes when its condition clears. */
  readonly dismissible: boolean;
}

export const BANNER_COPY: Readonly<Record<BannerKind, StringId>> = {
  tripwire: 'copy.gate.tripwire',
  killSwitch: 'copy.err.killSwitch',
  appCheck: 'copy.err.appCheck',
  auth: 'copy.err.auth',
  dailyCap: 'copy.err.dailyCap',
  rateLimit: 'copy.err.rateLimit',
  network: 'copy.err.network',
  cloudFailed: 'copy.err.cloudFailed',
};

const isEvent = (k: BannerKind): k is TransientEvent => (TRANSIENT_EVENTS as readonly string[]).includes(k);

function banner(kind: BannerKind, s: SystemStatus): Banner {
  return {
    kind,
    copy: BANNER_COPY[kind],
    ...(kind === 'dailyCap' ? { params: { cap: s.dailyCap } } : {}),
    tone: kind === 'tripwire' ? 'danger' : 'warn',
    dismissible: isEvent(kind),
  };
}

/**
 * The banners to show (D-105). While the cloud is off, exactly one banner: the most severe reason (each one already says
 * that cloud checks are off and on-device checks still work, and a "try again" event would invite a retry that cannot
 * run). Otherwise every reported event, in a fixed order.
 */
export function selectBanners(s: SystemStatus, capUsed: number): Banner[] {
  const off = cloudOffReason(s, capUsed);
  if (off) return [banner(off, s)];
  return TRANSIENT_EVENTS.filter((e) => s.events.includes(e)).map((e) => banner(e, s));
}

/** SCR-02 row 3 for a cloud-off reason. */
export function cloudRowOf(off: CloudOff | null): CloudRowState {
  switch (off) {
    case 'tripwire':
    case 'killSwitch':
      return 'paused';
    case 'appCheck':
    case 'auth':
      return 'appCheckFail';
    case 'dailyCap':
      return 'cap';
    case null:
      return 'ready';
  }
}

/** The header connectivity chip's inputs (layout.connectivityOf): "Cloud paused" or "Cloud limit reached". */
export const chipInputsOf = (off: CloudOff | null): { killSwitch: boolean; capReached: boolean } => ({
  killSwitch: off !== null && off !== 'dailyCap',
  capReached: off === 'dailyCap',
});

// ---------- the store ----------

/** SPEC SCR-22: after a 429 (or the per-user limit), try again after 60 s. The banner clears itself then. */
export const RATE_LIMIT_MS = 60_000;

export type StatusPatch = Partial<Pick<SystemStatus, 'killSwitch' | 'dailyCap' | 'appCheckFailed' | 'authFailed'>>;

export interface SystemStatusStore {
  get(): SystemStatus;
  subscribe(listener: () => void): () => void;
  /** RC and Firebase boot. A non-boolean flag or an invalid cap is ignored. The tripwire is not settable here. */
  set(patch: StatusPatch): void;
  /** BREACH: on for the rest of this page's life (AD-31). There is no way to turn it off but a reload. */
  markTripwire(): void;
  report(event: TransientEvent): void;
  /** Dismiss an event banner. State banners (and the tripwire) cannot be dismissed. */
  dismiss(kind: BannerKind): void;
}

export interface StatusTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const BROWSER_TIMERS: StatusTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function createSystemStatusStore(timers: StatusTimers = BROWSER_TIMERS, initial: SystemStatus = INITIAL_STATUS): SystemStatusStore {
  let state = initial;
  const listeners = new Set<() => void>();
  let rateTimer: unknown = null;

  const commit = (next: SystemStatus) => {
    if (next === state) return;
    state = next;
    for (const l of [...listeners]) l();
  };
  const withoutEvent = (e: TransientEvent) => {
    if (!state.events.includes(e)) return;
    commit({ ...state, events: state.events.filter((x) => x !== e) });
  };

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(patch) {
      const next: { -readonly [K in keyof SystemStatus]: SystemStatus[K] } = { ...state };
      let changed = false;
      for (const k of ['killSwitch', 'appCheckFailed', 'authFailed'] as const) {
        const v = patch[k];
        if (typeof v === 'boolean' && v !== state[k]) {
          next[k] = v;
          changed = true;
        }
      }
      if (patch.dailyCap !== undefined) {
        const cap = clampDailyCap(patch.dailyCap);
        if (cap !== null && cap !== state.dailyCap) {
          next.dailyCap = cap;
          changed = true;
        }
      }
      if (changed) commit(next);
    },
    markTripwire() {
      if (!state.tripwire) commit({ ...state, tripwire: true });
    },
    report(event) {
      if (!TRANSIENT_EVENTS.includes(event)) return;
      if (event === 'rateLimit') {
        if (rateTimer !== null) timers.clearTimeout(rateTimer);
        rateTimer = timers.setTimeout(() => {
          rateTimer = null;
          withoutEvent('rateLimit');
        }, RATE_LIMIT_MS);
      }
      if (!state.events.includes(event)) commit({ ...state, events: [...state.events, event] });
    },
    dismiss(kind) {
      if (!isEvent(kind)) return;
      if (kind === 'rateLimit' && rateTimer !== null) {
        timers.clearTimeout(rateTimer);
        rateTimer = null;
      }
      withoutEvent(kind);
    },
  };
}

/** The app's store. */
export const systemStatus: SystemStatusStore = createSystemStatusStore();
