// web/src/core/localPrefs.ts: the ONLY localStorage user (boundary rule R7; ARCH §16.3, AD-26). UI conveniences only,
// never vault data:
//   se.ack18.v1             the SCR-01 18+ and "own photos only" acknowledgement ('1')
//   se.settings.v1          Settings (SCR-20) as JSON; every field validated on read, unknown keys dropped
//   se.cap.<YYYY-MM-DD>     the daily cloud-attack counter, per LOCAL day (A+B pair = 1 run; ARCH §8.2 caps)
//   se.dev.simulateNoNano   the developer simulations (AC-006, P1); they can only DOWNGRADE capability (AD-33)
//   se.dev.simulateOffline
//   se.vaultGen             D-80: the vault generation COUNTER (a number, no vault data), read UNCACHED (vault/generation.ts)
// The app must work when storage throws (AC-275): private mode, blocked site data, a full quota, or no localStorage
// at all. Every access is inside try/catch, and a per-tab cache is the truth for this page: a write that fails is
// still applied for the session, and a read that fails falls back to the cache, then to the default.
// Other tabs' changes arrive through the `storage` event, which drops the cached key and notifies subscribers.

/** The subset of the Web Storage API this module uses (injectable for tests). */
export interface PrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export const PREF_KEYS = {
  ack18: 'se.ack18.v1',
  settings: 'se.settings.v1',
  capPrefix: 'se.cap.',
  simulateNoNano: 'se.dev.simulateNoNano',
  simulateOffline: 'se.dev.simulateOffline',
  vaultGeneration: 'se.vaultGen',
} as const;

/** Every key this module owns starts with this (the storage listener ignores other keys). */
const OWN_PREFIX = 'se.';

// ---------- settings (SCR-20) ----------

export type PremaskMode = 'standard' | 'strict';

export interface Settings {
  /** P0: "Use Gemini Nano when available" (AC-277). Off: S0/S1 RULES-ONLY, S2/S4 ONLY_IN_CLOUD (AD-33). */
  readonly useNano: boolean;
  /** P1 (D-33). null = follow RC `strict_mode_default` until the user picks one. */
  readonly premask: PremaskMode | null;
  /** P1 (D-33). */
  readonly showVaultLabels: boolean;
  /** P1: "Include live search notes" default. */
  readonly liveNotes: boolean;
  /** P1: "Notes on re-attack". */
  readonly notesOnReattack: boolean;
  /** P1: Router HUD shown. */
  readonly hud: boolean;
  /** P1: Ledger rail shown. */
  readonly ledgerRail: boolean;
  /** P1: Leak Atlas opt-in (SCR-21), default OFF. */
  readonly atlasOptIn: boolean;
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  useNano: true,
  premask: null,
  showVaultLabels: true,
  liveNotes: true,
  notesOnReattack: true,
  hud: true,
  ledgerRail: true,
  atlasOptIn: false,
});

const BOOLEAN_FIELDS = ['useNano', 'showVaultLabels', 'liveNotes', 'notesOnReattack', 'hud', 'ledgerRail', 'atlasOptIn'] as const;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Parse the stored settings. Anything unreadable (null, not JSON, not a plain object) is the defaults; each field of
 * the wrong type falls back to its own default, so one bad field never resets the others. Unknown keys are dropped.
 */
export function parseSettings(raw: string | null): Settings {
  if (raw === null) return DEFAULT_SETTINGS;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (!isPlainObject(v)) return DEFAULT_SETTINGS;
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const k of BOOLEAN_FIELDS) if (own(v, k) && typeof v[k] === 'boolean') out[k] = v[k];
  if (own(v, 'premask') && (v.premask === 'standard' || v.premask === 'strict' || v.premask === null)) out.premask = v.premask;
  return Object.freeze(out) as unknown as Settings;
}

/** Keep only valid fields of a patch (a caller can never store a non-boolean toggle or an unknown key). */
export function sanitizePatch(patch: Partial<Settings>): Partial<Settings> {
  const p: Record<string, unknown> = patch;
  const out: Record<string, unknown> = {};
  for (const k of BOOLEAN_FIELDS) if (own(p, k) && typeof p[k] === 'boolean') out[k] = p[k];
  if (own(p, 'premask') && (p.premask === 'standard' || p.premask === 'strict' || p.premask === null)) out.premask = p.premask;
  return out as Partial<Settings>;
}

// ---------- simulations (AC-006, P1) ----------

export type Simulation = 'noNano' | 'offline';
export interface Simulations {
  readonly noNano: boolean;
  readonly offline: boolean;
}
const SIM_KEY: Readonly<Record<Simulation, string>> = {
  noNano: PREF_KEYS.simulateNoNano,
  offline: PREF_KEYS.simulateOffline,
};
export const SIMS_NONE: Simulations = Object.freeze({ noNano: false, offline: false });

// ---------- the daily cap counter ----------

/** The LOCAL calendar day, YYYY-MM-DD (the cap resets at local midnight; SPEC SCR-22). */
export function localDay(d: Date): string {
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export const capKey = (d: Date): string => `${PREF_KEYS.capPrefix}${localDay(d)}`;

/** Milliseconds from `now` to one second past the next LOCAL midnight (when the daily cap resets). */
export function msToNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return Math.max(1_000, next.getTime() - now.getTime());
}

/** A stored counter: a canonical non-negative integer string, anything else is 0. */
export function parseCount(raw: string | null): number {
  if (raw === null || !/^(0|[1-9][0-9]{0,8})$/.test(raw)) return 0;
  return Number(raw);
}

// ---------- the store ----------

export interface LocalPrefsDeps {
  /** The storage, or null when there is none. Called on every access, inside try/catch (the getter itself may throw). */
  storage: () => PrefsStorage | null;
  now: () => Date;
  /** Where cross-tab `storage` events arrive (window), or null. */
  events: {
    addEventListener(type: 'storage', fn: (e: { key: string | null }) => void): void;
    removeEventListener(type: 'storage', fn: (e: { key: string | null }) => void): void;
  } | null;
  /**
   * The local day changing must reach subscribers even when nothing is written (the daily-cap banner and chip clear at
   * local midnight): a timer to the next local midnight, plus a re-check when the page becomes visible again (a timer
   * can fire late after the device slept). Both optional.
   */
  timers?: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(id: unknown): void } | null;
  visibility?: {
    addEventListener(type: 'visibilitychange', fn: () => void): void;
    removeEventListener(type: 'visibilitychange', fn: () => void): void;
  } | null;
}

export interface LocalPrefs {
  ack18(): boolean;
  /** Store the acknowledgement. Returns whether it reached storage (it applies for this session either way). */
  setAck18(): boolean;
  /** The parsed settings; the same object while nothing changed (a stable useSyncExternalStore snapshot). */
  settings(): Settings;
  updateSettings(patch: Partial<Settings>): boolean;
  simulations(): Simulations;
  /** Turn a simulation on or off. Either way it only ever removes a capability (AD-33). */
  setSimulation(sim: Simulation, on: boolean): boolean;
  /** Cloud attack runs used today (local day). Read fresh from storage, so other tabs' runs count. */
  capUsedToday(): number;
  /** Count one run (A+B pair) today and drop earlier days' counters. Returns today's new total. */
  incrementCap(): number;
  /** Changes from this tab or another, and the local day turning over; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Bumps on every change: a cheap snapshot for hooks. */
  version(): number;
}

export function createLocalPrefs(deps: LocalPrefsDeps): LocalPrefs {
  /** This tab's view of each key: what we last read or wrote. A failed write still lands here (AC-275). */
  const cache = new Map<string, string | null>();
  const listeners = new Set<() => void>();
  /** Keys whose last write did not reach storage: this session's value wins over what storage still holds. */
  const failedWrites = new Set<string>();

  let ver = 0;
  let parsedFrom: string | null | undefined; // the raw string `parsed` came from (undefined = nothing parsed yet)
  let parsed: Settings = DEFAULT_SETTINGS;
  let simsFrom: string | undefined;
  let sims: Simulations = SIMS_NONE;
  let lastDay = '';
  let dayTimer: unknown = null;

  const store = (): PrefsStorage | null => {
    try {
      return deps.storage();
    } catch {
      return null;
    }
  };

  /** Fresh from storage when it can be read; the cache otherwise. Never throws. */
  const readFresh = (key: string): string | null => {
    const s = store();
    if (s) {
      try {
        const v = s.getItem(key);
        // A key we failed to write keeps this session's value: storage still holds the old one.
        if (failedWrites.has(key)) return cache.get(key) ?? null;
        cache.set(key, v);
        return v;
      } catch {
        /* fall through to the cache */
      }
    }
    return cache.get(key) ?? null;
  };
  /** Cached when known (stable within the tab); storage on first read. */
  const read = (key: string): string | null => (cache.has(key) ? (cache.get(key) ?? null) : readFresh(key));

  const changed = () => {
    ver++;
    for (const l of [...listeners]) l();
  };

  const write = (key: string, value: string | null): boolean => {
    cache.set(key, value);
    let ok = false;
    const s = store();
    if (s) {
      try {
        if (value === null) s.removeItem(key);
        else s.setItem(key, value);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (ok) failedWrites.delete(key);
    else failedWrites.add(key);
    changed();
    return ok;
  };

  const onStorage = (e: { key: string | null }) => {
    if (e.key === null) {
      // localStorage.clear() in another tab: forget everything we read (failed writes stay this session's truth).
      for (const k of [...cache.keys()]) if (!failedWrites.has(k)) cache.delete(k);
    } else if (e.key.startsWith(OWN_PREFIX)) {
      if (failedWrites.has(e.key)) return;
      cache.delete(e.key);
    } else {
      return;
    }
    changed();
  };

  /** Announce a new local day (the cap counter key changed) to subscribers. */
  const checkDay = () => {
    const today = localDay(deps.now());
    if (today === lastDay) return;
    lastDay = today;
    changed();
  };
  const armDayTimer = () => {
    if (!deps.timers) return;
    dayTimer = deps.timers.setTimeout(() => {
      dayTimer = null;
      checkDay();
      if (listeners.size > 0) armDayTimer();
    }, msToNextLocalMidnight(deps.now()));
  };

  const api: LocalPrefs = {
    ack18: () => read(PREF_KEYS.ack18) === '1',
    setAck18: () => write(PREF_KEYS.ack18, '1'),

    settings() {
      const raw = read(PREF_KEYS.settings);
      if (raw !== parsedFrom) {
        parsedFrom = raw;
        parsed = parseSettings(raw);
      }
      return parsed;
    },
    updateSettings(patch) {
      const next = { ...api.settings(), ...sanitizePatch(patch) };
      return write(PREF_KEYS.settings, JSON.stringify(next));
    },

    simulations() {
      const key = `${read(SIM_KEY.noNano) === '1' ? 1 : 0}${read(SIM_KEY.offline) === '1' ? 1 : 0}`;
      if (key !== simsFrom) {
        simsFrom = key;
        sims = key === '00' ? SIMS_NONE : Object.freeze({ noNano: key[0] === '1', offline: key[1] === '1' });
      }
      return sims;
    },
    setSimulation: (sim, on) => write(SIM_KEY[sim], on ? '1' : null),

    capUsedToday: () => parseCount(readFresh(capKey(deps.now()))),
    incrementCap() {
      const today = capKey(deps.now());
      const next = parseCount(readFresh(today)) + 1;
      write(today, String(next));
      // Earlier days' counters are dead weight: drop them (best effort).
      const s = store();
      if (s) {
        try {
          const old: string[] = [];
          for (let i = 0; i < s.length; i++) {
            const k = s.key(i);
            if (k !== null && k.startsWith(PREF_KEYS.capPrefix) && k !== today) old.push(k);
          }
          for (const k of old) {
            s.removeItem(k);
            cache.delete(k);
          }
        } catch {
          /* best effort */
        }
      }
      return next;
    },

    subscribe(listener) {
      if (listeners.size === 0) {
        deps.events?.addEventListener('storage', onStorage);
        deps.visibility?.addEventListener('visibilitychange', checkDay);
        lastDay = localDay(deps.now());
        armDayTimer();
      }
      listeners.add(listener);
      return () => {
        if (!listeners.delete(listener) || listeners.size > 0) return;
        deps.events?.removeEventListener('storage', onStorage);
        deps.visibility?.removeEventListener('visibilitychange', checkDay);
        if (dayTimer !== null) deps.timers?.clearTimeout(dayTimer);
        dayTimer = null;
      };
    },
    version: () => ver,
  };
  return api;
}

/** The browser's localStorage. Even reading the property can throw (SecurityError when site data is blocked). */
function browserStorage(): PrefsStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

/** The app's instance. In Node (tests) there is no window, so it runs on the in-memory cache alone. */
export const localPrefs: LocalPrefs = createLocalPrefs({
  storage: browserStorage,
  now: () => new Date(),
  events: typeof window === 'undefined' ? null : window,
  timers: { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) },
  visibility: typeof document === 'undefined' ? null : document,
});

/**
 * ARCH §8.2's names for the gate (T-062): `prefs.nanoEnabled()`, `prefs.simulateNoNano()`, `prefs.simulateOffline()`.
 * nanoEnabled() is false when the setting is off OR "Simulate: no Nano" is on, so a check of nanoEnabled() alone (ARCH
 * §8.2's RECLASSIFY path) also honours the simulation (downgrade only, AD-33); check simulateNoNano() first to tell
 * the note 'simulated' from 'Nano off'.
 */
export const prefs = {
  nanoEnabled: (): boolean => localPrefs.settings().useNano && !localPrefs.simulations().noNano,
  simulateNoNano: (): boolean => localPrefs.simulations().noNano,
  simulateOffline: (): boolean => localPrefs.simulations().offline,
} as const;

/** ARCH §8.2's daily cap counter: `caps.usedToday()`, `caps.increment()` (one run per A+B pair). */
export const caps = {
  usedToday: (): number => localPrefs.capUsedToday(),
  increment: (): number => localPrefs.incrementCap(),
} as const;

/**
 * D-80: raw, UNCACHED access to the vault generation counter for vault/generation.ts. Unlike the prefs above it must
 * see another tab's write at once (before the storage event or the BroadcastChannel message arrives), so it reads
 * storage on every call. null when storage is unavailable or throws. Holds a number only, never vault data.
 */
export const generationStorage = {
  read(): string | null | undefined {
    try {
      const s = browserStorage();
      return s ? s.getItem(PREF_KEYS.vaultGeneration) : undefined;
    } catch {
      return undefined;
    }
  },
  write(v: string): void {
    try { browserStorage()?.setItem(PREF_KEYS.vaultGeneration, v); } catch { /* full or blocked: announcements still rebuild */ }
  },
} as const;
