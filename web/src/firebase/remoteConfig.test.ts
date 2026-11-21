// T-102: Remote Config loading (ARCH §13.4; SPEC §16, AC-294) against a mocked firebase/remote-config: no network.
// Covers the settings, ensureInitialized before any read, offline and hung starts, the background fetch, the real-time
// kill switch, the source field and the cfg() identity contract.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigUpdateObserver } from 'firebase/remote-config';

const h = vi.hoisted(() => {
  const state = {
    active: {} as Record<string, string>, // the activated remote values the SDK would return
    fetched: null as Record<string, string> | null, // what a successful fetch would activate
    init: 'ok' as 'ok' | 'fail' | 'hang',
    fetch: 'offline' as 'ok' | 'offline' | 'hang',
    initResolve: null as null | (() => void),
    observers: [] as ConfigUpdateObserver[],
    log: [] as string[],
    reads: 0,
  };
  const rc = { settings: { minimumFetchIntervalMillis: 43_200_000, fetchTimeoutMillis: 60_000 }, defaultConfig: {} as Record<string, string> };
  return { state, rc };
});

vi.mock('./init', () => ({ app: { name: '[DEFAULT]' } }));
vi.mock('firebase/remote-config', () => ({
  getRemoteConfig: vi.fn(() => { h.state.log.push('getRemoteConfig'); return h.rc; }),
  ensureInitialized: vi.fn(() => {
    h.state.log.push('ensureInitialized');
    if (h.state.init === 'fail') return Promise.reject(new Error('idb'));
    if (h.state.init === 'hang') return new Promise<void>((res) => { h.state.initResolve = res; });
    return Promise.resolve();
  }),
  fetchAndActivate: vi.fn(() => {
    h.state.log.push('fetchAndActivate');
    if (h.state.fetch === 'offline') return Promise.reject(new Error('remoteconfig/fetch-client-network'));
    if (h.state.fetch === 'hang') return new Promise<boolean>(() => {});
    if (h.state.fetched) h.state.active = { ...h.state.fetched };
    return Promise.resolve(true);
  }),
  activate: vi.fn(() => {
    h.state.log.push('activate');
    if (h.state.fetched) h.state.active = { ...h.state.fetched };
    return Promise.resolve(true);
  }),
  onConfigUpdate: vi.fn((_rc: unknown, o: ConfigUpdateObserver) => { h.state.log.push('onConfigUpdate'); h.state.observers.push(o); return () => {}; }),
  getValue: vi.fn((_rc: unknown, key: string) => {
    h.state.reads++;
    const remote = Object.hasOwn(h.state.active, key);
    const v = remote ? h.state.active[key] : String(h.rc.defaultConfig[key] ?? '');
    return { asString: () => v, getSource: () => (remote ? 'remote' : 'default'), asBoolean: () => false, asNumber: () => 0 };
  }),
}));

async function load() {
  vi.resetModules();
  return import('./remoteConfig');
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(() => {
  Object.assign(h.state, { active: {}, fetched: null, init: 'ok', fetch: 'offline', initResolve: null, observers: [], log: [], reads: 0 });
  h.rc.settings = { minimumFetchIntervalMillis: 43_200_000, fetchTimeoutMillis: 60_000 };
  h.rc.defaultConfig = {};
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('settings (SPEC §16)', () => {
  it('fetch timeout 8 s, minimum interval 60 s in dev (1 h in production), defaults = the template strings', async () => {
    const m = await load();
    expect(h.rc.settings.fetchTimeoutMillis).toBe(8_000);
    expect(h.rc.settings.minimumFetchIntervalMillis).toBe(import.meta.env.DEV ? 60_000 : 3_600_000);
    expect(m.RC_MIN_FETCH_INTERVAL_MS).toBe(import.meta.env.DEV ? 60_000 : 3_600_000);
    expect(h.rc.defaultConfig).toEqual(m.RC_DEFAULTS);
    expect(h.rc.defaultConfig).not.toBe(m.RC_DEFAULTS); // the SDK gets its own mutable copy
  });
  it('the production interval is 1 h (Vitest always runs DEV, so the flag is injected)', async () => {
    const m = await load();
    expect(m.minFetchIntervalMs(false)).toBe(3_600_000);
    expect(m.minFetchIntervalMs(true)).toBe(60_000);
  });
});

describe('loadConfig', () => {
  it('never reads a value before ensureInitialized; cfg() is the template defaults until then', async () => {
    const m = await load();
    expect(m.cfg()).toBe(m.DEFAULT_CONFIG);
    expect(h.state.reads).toBe(0);
    expect(h.state.log).toEqual(['getRemoteConfig']);
  });

  it('offline start with cached values: resolves at once with them (source cached), the fetch fails quietly (AC-294)', async () => {
    h.state.active = { kill_switch: 'true', daily_adversary_cap: '5' };
    const m = await load();
    await m.loadConfig();
    expect(m.cfg()).toMatchObject({ killSwitch: true, dailyAdversaryCap: 5, source: 'cached' });
    await flush();
    expect(h.state.log).toEqual(['getRemoteConfig', 'ensureInitialized', 'fetchAndActivate', 'onConfigUpdate']);
    expect(m.cfg().source).toBe('cached'); // still: the failed fetch changed nothing
  });

  it('never waits for the fetch: a hanging network (lie-fi) still starts at once on the cached values (AC-294)', async () => {
    h.state.fetch = 'hang';
    h.state.active = { strict_mode_default: 'true' };
    const m = await load();
    let done = false;
    void m.loadConfig().then(() => { done = true; });
    await flush();
    expect(done).toBe(true);
    expect(m.cfg()).toMatchObject({ strictModeDefault: true, source: 'cached' });
  });

  it('first offline start (nothing cached): the defaults, source default, no warning', async () => {
    const m = await load();
    await m.loadConfig();
    await flush();
    expect(m.cfg()).toEqual(m.DEFAULT_CONFIG);
  });

  it('a successful fetch publishes the new values with source remote and notifies once', async () => {
    h.state.fetch = 'ok';
    h.state.fetched = { adversary_model: 'gemini-4-hydrogen' };
    const m = await load();
    const seen: string[] = [];
    m.subscribeConfig(() => seen.push(`${m.cfg().adversaryModel}/${m.cfg().source}`));
    await m.loadConfig();
    await flush();
    expect(seen).toEqual(['gemini-4-hydrogen/remote']);
    expect(m.cfg().adversaryModel).toBe('gemini-4-hydrogen');
  });

  it('keeps cfg() identity when nothing changed, and unsubscribe works', async () => {
    h.state.fetch = 'ok';
    const m = await load();
    const fn = vi.fn();
    const off = m.subscribeConfig(fn);
    await m.loadConfig();
    await flush();
    expect(fn).not.toHaveBeenCalled(); // defaults before, defaults after (no remote values at all)
    expect(m.cfg()).toBe(m.DEFAULT_CONFIG);
    off();
    h.state.fetched = { kill_switch: 'true' };
    h.state.observers[0].next({ getUpdatedKeys: () => new Set(['kill_switch']) });
    await flush();
    expect(m.cfg().killSwitch).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it('applies the kill switch in real time: onConfigUpdate → activate → cfg() and listeners (SCR-22)', async () => {
    const m = await load();
    await m.loadConfig();
    await flush();
    const fn = vi.fn();
    m.subscribeConfig(fn);
    expect(m.cfg().killSwitch).toBe(false);
    h.state.fetched = { kill_switch: 'true' };
    expect(h.state.observers).toHaveLength(1);
    h.state.observers[0].next({ getUpdatedKeys: () => new Set(['kill_switch']) });
    await flush();
    expect(h.state.log.at(-1)).toBe('activate');
    expect(m.cfg()).toMatchObject({ killSwitch: true, source: 'remote' });
    expect(fn).toHaveBeenCalledTimes(1);
    h.state.observers[0].error(new Error('realtime unavailable') as never); // ignored, nothing thrown
    expect(m.cfg().killSwitch).toBe(true);
  });

  it('a hostile remote value falls back to its default with a warning; a hostile routing policy is floored', async () => {
    h.state.active = {
      fuzzy_threshold: 'NaN', bands_m: '{"street":1}',
      routing_policy: '{"version":1,"classes":{},"jobs":{}}',
    };
    const m = await load();
    await m.loadConfig();
    expect(m.cfg().fuzzyThreshold).toBe(0.8);
    expect(m.cfg().warnings).toEqual([{ key: 'bands_m', reason: 'invalid' }, { key: 'fuzzy_threshold', reason: 'invalid' }]); // template order
    expect(m.cfg().policyWarning).toBe('bad_shape: classes');
    expect(m.cfg().routingPolicy.classes.S0.cloud).toBe(false);
  });

  it('a hung IndexedDB never delays boot beyond RC_INIT_TIMEOUT_MS: defaults now, cached values when it recovers', async () => {
    vi.useFakeTimers();
    h.state.init = 'hang';
    h.state.active = { max_fix_rounds: '5' };
    const m = await load();
    let done = false;
    void m.loadConfig().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(m.RC_INIT_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    expect(m.cfg()).toBe(m.DEFAULT_CONFIG);
    expect(h.state.reads).toBe(0);
    h.state.initResolve?.();
    await flush();
    expect(m.cfg()).toMatchObject({ maxFixRounds: 5, source: 'cached' });
  });

  it('a failed ensureInitialized keeps the defaults (no read), and a later successful fetch still applies', async () => {
    h.state.init = 'fail';
    h.state.fetch = 'ok';
    h.state.fetched = { atlas_enabled: 'false' };
    const m = await load();
    await m.loadConfig();
    await flush();
    expect(m.cfg()).toMatchObject({ atlasEnabled: false, source: 'remote' });
  });

  it('a broken IndexedDB plus an offline first fetch: a later real-time kill switch still reaches cfg() (F-159)', async () => {
    h.state.init = 'fail';
    const m = await load();
    await m.loadConfig();
    await flush();
    expect(m.cfg()).toBe(m.DEFAULT_CONFIG);
    expect(h.state.reads).toBe(0); // nothing was readable yet
    const fn = vi.fn();
    m.subscribeConfig(fn);
    h.state.fetched = { kill_switch: 'true' };
    h.state.observers[0].next({ getUpdatedKeys: () => new Set(['kill_switch']) });
    await flush();
    expect(m.cfg()).toMatchObject({ killSwitch: true, source: 'remote' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a failed real-time activation reads nothing and changes nothing', async () => {
    vi.useFakeTimers();
    h.state.init = 'hang';
    const m = await load();
    void m.loadConfig();
    await vi.advanceTimersByTimeAsync(m.RC_INIT_TIMEOUT_MS);
    const { activate } = await import('firebase/remote-config');
    vi.mocked(activate).mockImplementationOnce(() => Promise.reject(new Error('idb')));
    h.state.observers[0].next({ getUpdatedKeys: () => new Set(['kill_switch']) });
    await flush();
    expect(h.state.reads).toBe(0);
    expect(m.cfg()).toBe(m.DEFAULT_CONFIG);
  });

  it('is idempotent: one ensureInitialized, one fetch, one real-time listener', async () => {
    const m = await load();
    const a = m.loadConfig();
    const b = m.loadConfig();
    expect(a).toBe(b);
    await a;
    await m.loadConfig();
    await flush();
    expect(h.state.log.filter((l) => l === 'ensureInitialized')).toHaveLength(1);
    expect(h.state.log.filter((l) => l === 'fetchAndActivate')).toHaveLength(1);
    expect(h.state.log.filter((l) => l === 'onConfigUpdate')).toHaveLength(1);
  });
});
