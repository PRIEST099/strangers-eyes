// ARCH §15.1 / AC-291 end to end: the tripwire, then firebase/init in the mandated order, then boot() steps 3–5
// (Remote Config → vault scanner → render). Every firebase/* module and the vault scanner are mocked: no network, no
// IndexedDB. The debug token's value is never printed (only whether the flag was set before App Check).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigUpdateObserver } from 'firebase/remote-config';

const h = vi.hoisted(() => {
  const calls: string[] = [];
  const g = globalThis as unknown as Record<string, unknown>;
  g.self = globalThis;
  g.location = { search: '' };
  let flag: unknown;
  Object.defineProperty(globalThis, 'FIREBASE_APPCHECK_DEBUG_TOKEN', {
    configurable: true, get: () => flag, set: (v: unknown) => { calls.push('debugFlag'); flag = v; },
  });
  return {
    calls,
    origFetch: globalThis.fetch,
    flagSet: () => flag !== undefined,
    active: {} as Record<string, string>,
    rc: { settings: {}, defaultConfig: {} as Record<string, string> },
    observers: [] as ConfigUpdateObserver[],
    vault: 'ok' as 'ok' | 'fail' | 'hang',
  };
});

vi.mock('firebase/app', () => ({
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => {
    h.calls.push(globalThis.fetch !== h.origFetch ? 'initializeApp(fetch wrapped)' : 'initializeApp');
    return { name: '[DEFAULT]' };
  }),
}));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: vi.fn(() => { h.calls.push(h.flagSet() ? 'initializeAppCheck(flag set)' : 'initializeAppCheck'); return {}; }),
  ReCaptchaEnterpriseProvider: vi.fn(),
}));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => { h.calls.push('getAuth'); return { currentUser: null }; }),
  signInAnonymously: vi.fn(() => { h.calls.push('signInAnonymously'); return Promise.reject(new Error('offline')); }),
}));
vi.mock('firebase/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/ai')>()), // ai/models.ts (via rcParse) needs the real enums
  getAI: vi.fn(() => { h.calls.push('getAI'); return {}; }),
  GoogleAIBackend: vi.fn(),
}));
vi.mock('firebase/remote-config', () => ({
  getRemoteConfig: vi.fn(() => { h.calls.push('getRemoteConfig'); return h.rc; }),
  ensureInitialized: vi.fn(() => { h.calls.push('ensureInitialized'); return Promise.resolve(); }),
  fetchAndActivate: vi.fn(() => { h.calls.push('fetchAndActivate'); return Promise.reject(new Error('offline')); }),
  activate: vi.fn(() => Promise.resolve(true)),
  onConfigUpdate: vi.fn((_rc: unknown, o: ConfigUpdateObserver) => { h.calls.push('onConfigUpdate'); h.observers.push(o); return () => {}; }),
  getValue: vi.fn((_rc: unknown, k: string) => {
    const remote = Object.hasOwn(h.active, k);
    return { asString: () => (remote ? h.active[k] : h.rc.defaultConfig[k]), getSource: () => (remote ? 'remote' : 'default') };
  }),
}));
vi.mock('./ai/vaultScan', () => ({
  vaultScan: {
    init: vi.fn(({ judge }: { judge: boolean }) => {
      h.calls.push(`vaultScan.init(${judge ? 'judge' : 'real'})`);
      if (h.vault === 'fail') return Promise.reject(new Error('vault unreadable'));
      if (h.vault === 'hang') return new Promise(() => {});
      return Promise.resolve();
    }),
    setFuzzyThreshold: vi.fn((x: number) => { h.calls.push(`setFuzzyThreshold(${x})`); }),
  },
}));

async function loadBoot() {
  vi.resetModules();
  await import('./ai/tripwire-install'); // main.tsx line 1
  return import('./boot'); // main.tsx line 2
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(() => {
  h.calls.length = 0;
  h.active = {};
  h.observers = [];
  h.vault = 'ok';
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('module evaluation (ARCH §15.1 steps 1–2, AC-291)', () => {
  it('tripwire first, then initializeApp → debug flag → App Check → Auth (+ sign-in) → AI, then Remote Config', async () => {
    await loadBoot();
    expect(h.calls).toEqual([
      'initializeApp(fetch wrapped)', 'debugFlag', 'initializeAppCheck(flag set)', 'getAuth', 'signInAnonymously', 'getAI',
      'getRemoteConfig',
    ]);
  });
  it("main.tsx imports './ai/tripwire-install' first and './boot' second, and renders only through boot()", () => {
    const src = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
    const imports = src.split('\n').filter((l) => /^\s*import\b/.test(l)).map((l) => l.trim());
    expect(imports[0].startsWith("import './ai/tripwire-install'")).toBe(true);
    expect(imports[1].startsWith("import { boot, isJudgeBoot } from './boot'")).toBe(true);
    expect(src.match(/createRoot\(/g)).toHaveLength(1);
    expect(src.indexOf('createRoot(')).toBeGreaterThan(src.indexOf('void boot({'));
  });
});

describe('boot() steps 3–5', () => {
  it('Remote Config → fuzzy threshold → vault scanner → render, once each', async () => {
    const { boot } = await loadBoot();
    h.calls.length = 0;
    const render = vi.fn(() => { h.calls.push('render'); });
    const r = await boot({ judge: false, render });
    expect(r).toEqual({ judge: false, config: 'ok', vault: 'ok' });
    expect(h.calls).toEqual([
      'ensureInitialized', 'fetchAndActivate', 'onConfigUpdate', 'setFuzzyThreshold(0.8)', 'vaultScan.init(real)', 'render',
    ]);
    expect(Object.isFrozen(r)).toBe(true);
    const { cfg, DEFAULT_CONFIG } = await import('./firebase/remoteConfig');
    expect(cfg()).toEqual(DEFAULT_CONFIG); // offline first start: the template defaults, no warning
  });

  it('uses the cached RC threshold, and follows a real-time change of it (only when it changes)', async () => {
    h.active = { fuzzy_threshold: '0.9' };
    const { boot } = await loadBoot();
    await boot({ judge: false, render: () => {} });
    expect(h.calls).toContain('setFuzzyThreshold(0.9)');
    const { activate } = await import('firebase/remote-config');
    vi.mocked(activate).mockImplementation(() => { h.active = { fuzzy_threshold: '0.7' }; return Promise.resolve(true); });
    h.observers[0].next({ getUpdatedKeys: () => new Set(['fuzzy_threshold']) });
    await flush();
    expect(h.calls.at(-1)).toBe('setFuzzyThreshold(0.7)');
    const n = h.calls.length;
    vi.mocked(activate).mockImplementation(() => { h.active = { fuzzy_threshold: '0.7', kill_switch: 'true' }; return Promise.resolve(true); });
    h.observers[0].next({ getUpdatedKeys: () => new Set(['kill_switch']) });
    await flush();
    expect(h.calls.length).toBe(n); // the kill switch changed, the threshold did not
  });

  it('boots Judge Mode without the real vault: vaultScan.init({ judge: true })', async () => {
    const { boot } = await loadBoot();
    const r = await boot({ judge: true, render: () => {} });
    expect(r.judge).toBe(true);
    expect(h.calls).toContain('vaultScan.init(judge)');
    expect(h.calls).not.toContain('vaultScan.init(real)');
  });

  it('renders even when the real vault cannot be read (the scanner stays blocking: fail closed)', async () => {
    h.vault = 'fail';
    const { boot } = await loadBoot();
    const render = vi.fn();
    const r = await boot({ judge: false, render });
    expect(render).toHaveBeenCalledTimes(1);
    expect(r.vault).toBe('failed');
  });

  it('renders after BOOT_STEP_TIMEOUT_MS when the vault step hangs', async () => {
    vi.useFakeTimers();
    h.vault = 'hang';
    const { boot, BOOT_STEP_TIMEOUT_MS } = await loadBoot();
    const render = vi.fn();
    const p = boot({ judge: false, render });
    await vi.advanceTimersByTimeAsync(BOOT_STEP_TIMEOUT_MS - 1);
    expect(render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(render).toHaveBeenCalledTimes(1);
    await expect(p).resolves.toEqual({ judge: false, config: 'ok', vault: 'timeout' });
  });

  it('runs once per page load: a second call returns the same promise', async () => {
    const { boot } = await loadBoot();
    const render = vi.fn();
    const a = boot({ judge: false, render });
    const b = boot({ judge: true, render });
    expect(b).toBe(a);
    await a;
    expect(render).toHaveBeenCalledTimes(1);
    expect(h.calls.filter((c) => c.startsWith('vaultScan.init'))).toEqual(['vaultScan.init(real)']);
  });
});

describe('isJudgeBoot (ARCH §15.1 step 4)', () => {
  it.each([
    ['?judge=1', '', true], ['?debug=1&judge=1', '', true], ['', '#/judge', true], ['', '#/JUDGE', true], ['', '#/judge?x=1', true],
    ['?judge=0', '', false], ['?judge=true', '', false], ['', '#/judge/extra', false], ['', '#/vault', false], ['', '#judge', false],
    ['', '', false],
  ])('search %j hash %j → %s', async (search, hash, want) => {
    const { isJudgeBoot } = await import('./boot');
    expect(isJudgeBoot({ search, hash })).toBe(want);
  });
});
