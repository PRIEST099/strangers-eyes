// T-091/T-092: core/localPrefs, the only localStorage user (R7). Settings validation, the 18+ acknowledgement, the
// simulations, the daily cap counter, cross-tab events, and AC-275: everything keeps working when storage throws.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  PREF_KEYS,
  SIMS_NONE,
  capKey,
  caps,
  createLocalPrefs,
  localDay,
  localPrefs,
  msToNextLocalMidnight,
  prefs,
  parseCount,
  parseSettings,
  sanitizePatch,
  type LocalPrefsDeps,
  type PrefsStorage,
} from './localPrefs';

/** An in-memory Web Storage, with switches to make each operation throw. */
class FakeStorage implements PrefsStorage {
  data = new Map<string, string>();
  failGet = false;
  failSet = false;
  failRemove = false;
  failKey = false;
  getItem(k: string) {
    if (this.failGet) throw new Error('SecurityError');
    return this.data.has(k) ? (this.data.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    if (this.failSet) throw new Error('QuotaExceededError');
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    if (this.failRemove) throw new Error('SecurityError');
    this.data.delete(k);
  }
  key(i: number) {
    if (this.failKey) throw new Error('SecurityError');
    return [...this.data.keys()][i] ?? null;
  }
  get length() {
    return this.data.size;
  }
}

type StorageListener = (e: { key: string | null }) => void;
function fakeEvents() {
  const listeners = new Set<StorageListener>();
  return {
    listeners,
    addEventListener: vi.fn((_: 'storage', fn: StorageListener) => void listeners.add(fn)),
    removeEventListener: vi.fn((_: 'storage', fn: StorageListener) => void listeners.delete(fn)),
    fire: (key: string | null) => { for (const l of [...listeners]) l({ key }); },
  };
}

const NOV21 = new Date(2026, 10, 21, 23, 59); // local time
const NOV22 = new Date(2026, 10, 22, 0, 1);

function setup(over: Partial<LocalPrefsDeps> = {}, storage = new FakeStorage()) {
  let now = NOV21;
  const events = fakeEvents();
  const prefs = createLocalPrefs({ storage: () => storage, now: () => now, events, ...over });
  return { prefs, storage, events, setNow: (d: Date) => { now = d; } };
}

describe('parseSettings: every field validated, unknown keys dropped', () => {
  it('null, non-JSON, arrays, primitives and non-plain objects are the defaults', () => {
    for (const raw of [null, '', '{', 'null', '[]', '[true]', '42', '"x"', 'true']) expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
  });

  it('defaults: Nano on, every P1 display toggle on, Atlas opt-in OFF, Technical details OFF, pre-mask follows RC', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      useNano: true, premask: null, showVaultLabels: true, liveNotes: true, notesOnReattack: true, hud: true, ledgerRail: true, atlasOptIn: false,
      techDetails: false,
    });
  });

  it('Technical details: a stored boolean is kept, anything else falls back to OFF', () => {
    expect(parseSettings(JSON.stringify({ techDetails: true })).techDetails).toBe(true);
    expect(parseSettings(JSON.stringify({ techDetails: 'yes' })).techDetails).toBe(false);
    expect(sanitizePatch({ techDetails: true })).toEqual({ techDetails: true });
  });

  it('keeps valid fields, replaces each invalid one with its own default, drops unknown keys', () => {
    const s = parseSettings(JSON.stringify({ useNano: false, hud: 'no', atlasOptIn: 1, premask: 'strict', extra: true, __proto__x: 1 }));
    expect(s).toEqual({ ...DEFAULT_SETTINGS, useNano: false, premask: 'strict' });
    expect(Object.keys(s).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('premask accepts only standard, strict or null', () => {
    expect(parseSettings('{"premask":"standard"}').premask).toBe('standard');
    expect(parseSettings('{"premask":null}').premask).toBeNull();
    expect(parseSettings('{"premask":"STRICT"}').premask).toBeNull();
  });

  it('a prototype-pollution payload changes nothing', () => {
    const s = parseSettings('{"__proto__":{"useNano":false},"constructor":{"x":1}}');
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(({} as Record<string, unknown>).useNano).toBeUndefined();
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(parseSettings('{"useNano":false}'))).toBe(true);
  });
});

describe('sanitizePatch', () => {
  it('keeps only valid fields', () => {
    expect(sanitizePatch({ useNano: false, hud: 'x' as unknown as boolean, premask: 'loose' as unknown as null })).toEqual({ useNano: false });
    expect(sanitizePatch({ premask: 'strict', atlasOptIn: true })).toEqual({ premask: 'strict', atlasOptIn: true });
    expect(sanitizePatch({ nope: true } as never)).toEqual({});
  });
});

describe('18+ acknowledgement (SCR-01, AC-070)', () => {
  it('is false on a fresh profile and true after setAck18; a reload (a new instance) keeps it', () => {
    const { prefs, storage } = setup();
    expect(prefs.ack18()).toBe(false);
    expect(prefs.setAck18()).toBe(true);
    expect(prefs.ack18()).toBe(true);
    expect(storage.data.get(PREF_KEYS.ack18)).toBe('1');
    const reloaded = createLocalPrefs({ storage: () => storage, now: () => NOV21, events: null });
    expect(reloaded.ack18()).toBe(true);
  });

  it('only the exact value "1" counts', () => {
    for (const v of ['true', '0', '', ' 1', '11', '{"v":1}']) {
      const st = new FakeStorage();
      st.data.set(PREF_KEYS.ack18, v);
      expect(createLocalPrefs({ storage: () => st, now: () => NOV21, events: null }).ack18()).toBe(false);
    }
  });
});

describe('AC-275: the app works when storage throws', () => {
  it('no storage at all (Node, or a browser without localStorage): defaults, and writes apply for the session', () => {
    const prefs = createLocalPrefs({ storage: () => null, now: () => NOV21, events: null });
    expect(prefs.ack18()).toBe(false);
    expect(prefs.settings()).toEqual(DEFAULT_SETTINGS);
    expect(prefs.setAck18()).toBe(false); // not stored...
    expect(prefs.ack18()).toBe(true); // ...but applied
    expect(prefs.updateSettings({ useNano: false })).toBe(false);
    expect(prefs.settings().useNano).toBe(false);
    expect(prefs.incrementCap()).toBe(1);
    expect(prefs.capUsedToday()).toBe(1);
  });

  it('the storage getter itself throws (SecurityError when site data is blocked)', () => {
    const prefs = createLocalPrefs({ storage: () => { throw new Error('SecurityError'); }, now: () => NOV21, events: null });
    expect(() => prefs.settings()).not.toThrow();
    expect(prefs.setAck18()).toBe(false);
    expect(prefs.ack18()).toBe(true);
    expect(prefs.setSimulation('noNano', true)).toBe(false);
    expect(prefs.simulations().noNano).toBe(true);
  });

  it('every operation throws: nothing propagates, the session still sees its own changes', () => {
    const st = new FakeStorage();
    st.failGet = st.failSet = st.failRemove = st.failKey = true;
    const { prefs } = setup({}, st);
    expect(prefs.ack18()).toBe(false);
    expect(prefs.setAck18()).toBe(false);
    expect(prefs.ack18()).toBe(true);
    expect(prefs.updateSettings({ hud: false })).toBe(false);
    expect(prefs.settings().hud).toBe(false);
    expect(prefs.setSimulation('offline', true)).toBe(false);
    expect(prefs.setSimulation('offline', false)).toBe(false);
    expect(prefs.simulations()).toBe(SIMS_NONE);
    expect(() => prefs.incrementCap()).not.toThrow();
    expect(prefs.capUsedToday()).toBe(1);
  });

  it('reads work but writes fail (a full quota): the session value wins over the stale stored one', () => {
    const st = new FakeStorage();
    st.data.set(PREF_KEYS.settings, JSON.stringify({ useNano: true }));
    const { prefs } = setup({}, st);
    expect(prefs.settings().useNano).toBe(true);
    st.failSet = true;
    expect(prefs.updateSettings({ useNano: false })).toBe(false);
    expect(prefs.settings().useNano).toBe(false);
    st.failSet = false; // a later successful write stores it again
    expect(prefs.updateSettings({ hud: false })).toBe(true);
    expect(parseSettings(st.data.get(PREF_KEYS.settings) ?? null)).toMatchObject({ useNano: false, hud: false });
  });

  it('a failed cap write still counts the run for this session', () => {
    const st = new FakeStorage();
    st.data.set(capKey(NOV21), '3');
    const { prefs } = setup({}, st);
    st.failSet = true;
    expect(prefs.incrementCap()).toBe(4);
    expect(prefs.capUsedToday()).toBe(4); // storage still says 3
  });
});

describe('settings persist across a reload (AC-275)', () => {
  it('updateSettings merges the patch over the current settings and stores valid JSON', () => {
    const { prefs, storage } = setup();
    prefs.updateSettings({ useNano: false });
    prefs.updateSettings({ atlasOptIn: true });
    expect(JSON.parse(storage.data.get(PREF_KEYS.settings) ?? '')).toEqual({ ...DEFAULT_SETTINGS, useNano: false, atlasOptIn: true });
    const reloaded = createLocalPrefs({ storage: () => storage, now: () => NOV21, events: null });
    expect(reloaded.settings()).toEqual({ ...DEFAULT_SETTINGS, useNano: false, atlasOptIn: true });
  });

  it('an invalid patch field is never stored', () => {
    const { prefs, storage } = setup();
    prefs.updateSettings({ useNano: 'off' as unknown as boolean });
    expect(JSON.parse(storage.data.get(PREF_KEYS.settings) ?? '')).toEqual(DEFAULT_SETTINGS);
  });

  it('settings() returns the same object while nothing changed (a stable store snapshot)', () => {
    const { prefs } = setup();
    const a = prefs.settings();
    expect(prefs.settings()).toBe(a);
    prefs.updateSettings({ hud: false });
    const b = prefs.settings();
    expect(b).not.toBe(a);
    expect(prefs.settings()).toBe(b);
  });
});

describe('simulations (AC-006: downgrade only)', () => {
  it('both off by default; each turns on and off on its own key', () => {
    const { prefs, storage } = setup();
    expect(prefs.simulations()).toEqual({ noNano: false, offline: false });
    prefs.setSimulation('noNano', true);
    expect(prefs.simulations()).toEqual({ noNano: true, offline: false });
    expect(storage.data.get(PREF_KEYS.simulateNoNano)).toBe('1');
    prefs.setSimulation('offline', true);
    prefs.setSimulation('noNano', false);
    expect(prefs.simulations()).toEqual({ noNano: false, offline: true });
    expect(storage.data.has(PREF_KEYS.simulateNoNano)).toBe(false);
  });

  it('a stable snapshot while unchanged', () => {
    const { prefs } = setup();
    prefs.setSimulation('offline', true);
    expect(prefs.simulations()).toBe(prefs.simulations());
  });
});

describe('the daily cap counter (se.cap.<local day>)', () => {
  it('local day formatting', () => {
    expect(localDay(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(capKey(NOV21)).toBe('se.cap.2026-11-21');
  });

  it('parseCount accepts canonical non-negative integers only', () => {
    expect(parseCount('0')).toBe(0);
    expect(parseCount('17')).toBe(17);
    for (const v of [null, '', '-1', '1.5', '01', 'NaN', '1e3', ' 2', '9999999999']) expect(parseCount(v)).toBe(0);
  });

  it('counts per local day and resets at local midnight', () => {
    const { prefs, setNow } = setup();
    expect(prefs.capUsedToday()).toBe(0);
    expect(prefs.incrementCap()).toBe(1);
    expect(prefs.incrementCap()).toBe(2);
    setNow(NOV22);
    expect(prefs.capUsedToday()).toBe(0);
    expect(prefs.incrementCap()).toBe(1);
  });

  it('incrementCap itself reads fresh: another tab’s runs count even with no read in between', () => {
    const { prefs, storage } = setup();
    expect(prefs.incrementCap()).toBe(1); // this tab's cache now says 1
    storage.data.set(capKey(NOV21), '5'); // another tab ran 4 more
    expect(prefs.incrementCap()).toBe(6);
    expect(storage.data.get(capKey(NOV21))).toBe('6');
  });

  it('reads fresh from storage, so another tab’s runs count without an event', () => {
    const { prefs, storage } = setup();
    prefs.incrementCap();
    storage.data.set(capKey(NOV21), '5'); // another tab
    expect(prefs.capUsedToday()).toBe(5);
    expect(prefs.incrementCap()).toBe(6);
  });

  it('an increment drops earlier days’ counters and leaves other keys alone', () => {
    const { prefs, storage } = setup();
    storage.data.set('se.cap.2026-11-19', '9');
    storage.data.set('se.cap.2026-11-20', '4');
    storage.data.set(PREF_KEYS.ack18, '1');
    storage.data.set('other.app', 'x');
    prefs.incrementCap();
    expect([...storage.data.keys()].sort()).toEqual(['other.app', PREF_KEYS.ack18, capKey(NOV21)].sort());
  });
});

describe('subscribe, version and cross-tab storage events', () => {
  it('notifies on every write and bumps the version', () => {
    const { prefs } = setup();
    const l = vi.fn();
    const off = prefs.subscribe(l);
    const v0 = prefs.version();
    prefs.setAck18();
    prefs.updateSettings({ hud: false });
    prefs.setSimulation('offline', true);
    prefs.incrementCap();
    expect(l).toHaveBeenCalledTimes(4);
    expect(prefs.version()).toBe(v0 + 4);
    off();
    prefs.setAck18();
    expect(l).toHaveBeenCalledTimes(4);
  });

  it('listens for storage events only while subscribed, once', () => {
    const { prefs, events } = setup();
    const a = prefs.subscribe(() => {});
    const b = prefs.subscribe(() => {});
    expect(events.addEventListener).toHaveBeenCalledTimes(1);
    a();
    expect(events.removeEventListener).not.toHaveBeenCalled();
    b();
    expect(events.removeEventListener).toHaveBeenCalledTimes(1);
    expect(events.listeners.size).toBe(0);
  });

  it('another tab’s change to one of our keys is picked up and announced', () => {
    const { prefs, storage, events } = setup();
    const l = vi.fn();
    prefs.subscribe(l);
    expect(prefs.settings().useNano).toBe(true); // cached now
    storage.data.set(PREF_KEYS.settings, JSON.stringify({ useNano: false }));
    expect(prefs.settings().useNano).toBe(true); // still the cached value: no event yet
    events.fire(PREF_KEYS.settings);
    expect(l).toHaveBeenCalledTimes(1);
    expect(prefs.settings().useNano).toBe(false);
  });

  it('other apps’ keys are ignored; a clear() in another tab drops the cache', () => {
    const { prefs, storage, events } = setup();
    const l = vi.fn();
    prefs.subscribe(l);
    prefs.setAck18();
    events.fire('someone.else');
    expect(l).toHaveBeenCalledTimes(1); // only our own write
    storage.data.clear();
    events.fire(null);
    expect(l).toHaveBeenCalledTimes(2);
    expect(prefs.ack18()).toBe(false);
  });

  it('a key whose write failed keeps this session’s value through events', () => {
    const st = new FakeStorage();
    const { prefs, events } = setup({}, st);
    prefs.subscribe(() => {});
    st.failSet = true;
    prefs.setAck18();
    events.fire(PREF_KEYS.ack18);
    events.fire(null);
    expect(prefs.ack18()).toBe(true);
  });
});

describe('local day, where the local and UTC days differ (TZ pinned to UTC+14 for this block)', () => {
  const savedTz = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'Pacific/Kiritimati'; });
  afterAll(() => { if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz; });

  it('uses the LOCAL date and month, never UTC (05:00 on 1 Dec local is 30 Nov in UTC)', () => {
    const d = new Date(2026, 11, 1, 5, 0);
    expect(d.getUTCDate()).toBe(30); // the zone really is ahead of UTC here
    expect(d.getUTCMonth()).toBe(10);
    expect(localDay(d)).toBe('2026-12-01');
    expect(capKey(d)).toBe('se.cap.2026-12-01');
  });

  it('the year too (05:00 on 1 Jan local is 31 Dec in UTC)', () => {
    expect(localDay(new Date(2027, 0, 1, 5, 0))).toBe('2027-01-01');
  });

  it('the next local midnight', () => {
    expect(msToNextLocalMidnight(new Date(2026, 11, 1, 23, 0, 0))).toBe(3_601_000);
  });
});

describe('the daily cap clears at local midnight without a write (the banner and chip must update)', () => {
  function clockedSetup() {
    let now = new Date(2026, 10, 21, 23, 0, 0);
    const timers = new Map<number, { fn: () => void; ms: number }>();
    let id = 0;
    const vis = new Set<() => void>();
    const storage = new FakeStorage();
    const p = createLocalPrefs({
      storage: () => storage, now: () => now, events: null,
      timers: { setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; }, clearTimeout: (h) => { timers.delete(h as number); } },
      visibility: {
        addEventListener: (_: 'visibilitychange', fn: () => void) => void vis.add(fn),
        removeEventListener: (_: 'visibilitychange', fn: () => void) => void vis.delete(fn),
      },
    });
    const fireTimers = () => { for (const [k, t] of [...timers]) { timers.delete(k); t.fn(); } };
    return { p, timers, vis, storage, setNow: (d: Date) => { now = d; }, fireTimers };
  }

  it('msToNextLocalMidnight: one second past the next local midnight, never under a second', () => {
    expect(msToNextLocalMidnight(new Date(2026, 10, 21, 23, 0, 0))).toBe(3_601_000);
    expect(msToNextLocalMidnight(new Date(2026, 10, 21, 0, 0, 0))).toBe(86_401_000);
    expect(msToNextLocalMidnight(new Date(2026, 10, 21, 23, 59, 59, 999))).toBeGreaterThanOrEqual(1_000);
  });

  it('a subscriber hears the day turn over at the timer, and the cap reads 0 for the new day', () => {
    const { p, timers, setNow, fireTimers } = clockedSetup();
    p.incrementCap();
    const l = vi.fn();
    p.subscribe(l);
    expect([...timers.values()].map((t) => t.ms)).toEqual([3_601_000]);
    setNow(new Date(2026, 10, 22, 0, 0, 1));
    fireTimers();
    expect(l).toHaveBeenCalledTimes(1);
    expect(p.capUsedToday()).toBe(0);
    expect(timers.size).toBe(1); // re-armed for the next midnight
  });

  it('a timer that fires early (same day) announces nothing', () => {
    const { p, setNow, fireTimers } = clockedSetup();
    const l = vi.fn();
    p.subscribe(l);
    setNow(new Date(2026, 10, 21, 23, 59, 0));
    fireTimers();
    expect(l).not.toHaveBeenCalled();
  });

  it('becoming visible after a sleep past midnight announces the new day once', () => {
    const { p, vis, setNow } = clockedSetup();
    const l = vi.fn();
    p.subscribe(l);
    for (const f of vis) f(); // same day: nothing
    expect(l).not.toHaveBeenCalled();
    setNow(new Date(2026, 10, 22, 8, 0, 0));
    for (const f of vis) f();
    for (const f of vis) f();
    expect(l).toHaveBeenCalledTimes(1);
  });

  it('the last unsubscribe stops the timer and the visibility listener', () => {
    const { p, timers, vis } = clockedSetup();
    const a = p.subscribe(() => {});
    const b = p.subscribe(() => {});
    expect(timers.size).toBe(1);
    a();
    a(); // a second call is a no-op
    expect(timers.size).toBe(1);
    b();
    expect(timers.size).toBe(0);
    expect(vis.size).toBe(0);
  });
});

describe('the gate-facing exports (ARCH §8.2 names) on the app instance', () => {
  afterEach(() => {
    localPrefs.updateSettings({ useNano: true });
    localPrefs.setSimulation('noNano', false);
    localPrefs.setSimulation('offline', false);
  });

  it('prefs.nanoEnabled() is false when the setting is off OR "Simulate: no Nano" is on (downgrade only)', () => {
    expect(prefs.nanoEnabled()).toBe(true);
    localPrefs.updateSettings({ useNano: false });
    expect(prefs.nanoEnabled()).toBe(false);
    localPrefs.updateSettings({ useNano: true });
    localPrefs.setSimulation('noNano', true);
    expect(prefs.nanoEnabled()).toBe(false);
    expect(prefs.simulateNoNano()).toBe(true);
    localPrefs.updateSettings({ useNano: false });
    expect(prefs.nanoEnabled()).toBe(false);
    localPrefs.setSimulation('noNano', false);
    localPrefs.updateSettings({ useNano: true });
    expect(prefs.nanoEnabled()).toBe(true);
  });

  it('prefs.simulateOffline() mirrors the simulation', () => {
    expect(prefs.simulateOffline()).toBe(false);
    localPrefs.setSimulation('offline', true);
    expect(prefs.simulateOffline()).toBe(true);
    expect(prefs.simulateNoNano()).toBe(false);
  });

  it('caps.increment() counts one run and caps.usedToday() reads it', () => {
    const before = caps.usedToday();
    expect(caps.increment()).toBe(before + 1);
    expect(caps.usedToday()).toBe(before + 1);
    expect(localPrefs.capUsedToday()).toBe(before + 1);
  });
});
