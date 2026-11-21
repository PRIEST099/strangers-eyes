// AC-291: Firebase initialises in the order initializeApp → (debug flag, DEV only) → initializeAppCheck → getAuth → getAI.
// Every firebase/* module is mocked: no network, no real SDK. The debug flag is observed through a setter on the global
// the App Check SDK reads; its VALUE is never printed (it may be a real debug token in a developer's environment).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const calls: string[] = [];
  let flag: unknown;
  const g = globalThis as unknown as Record<string, unknown>;
  g.self = globalThis; // init.ts reads `self.location` and writes `self.FIREBASE_APPCHECK_DEBUG_TOKEN`
  g.location = { search: '' };
  Object.defineProperty(globalThis, 'FIREBASE_APPCHECK_DEBUG_TOKEN', {
    configurable: true,
    get: () => flag,
    set: (v: unknown) => { calls.push('debugFlag'); flag = v; },
  });
  const auth: { currentUser: { uid: string } | null } = { currentUser: null };
  const signIn = { mode: 'ok' as 'ok' | 'fail' | 'hang', n: 0 };
  return { calls, auth, signIn, flagSet: () => flag !== undefined, resetFlag: () => { flag = undefined; } };
});

vi.mock('firebase/app', () => ({
  getApps: vi.fn(() => { h.calls.push('getApps'); return []; }),
  initializeApp: vi.fn((options: unknown) => { h.calls.push('initializeApp'); return { name: '[DEFAULT]', options }; }),
}));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: vi.fn(() => { h.calls.push(h.flagSet() ? 'initializeAppCheck(flag set)' : 'initializeAppCheck'); return {}; }),
  ReCaptchaEnterpriseProvider: vi.fn(function (this: { siteKey: string }, siteKey: string) { this.siteKey = siteKey; }),
}));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => { h.calls.push('getAuth'); return h.auth; }),
  signInAnonymously: vi.fn(() => {
    h.calls.push('signInAnonymously');
    h.signIn.n++;
    if (h.signIn.mode === 'hang') return new Promise(() => {});
    if (h.signIn.mode === 'fail') return Promise.reject(new Error('auth/network-request-failed'));
    h.auth.currentUser = { uid: `uid-${h.signIn.n}` };
    return Promise.resolve({ user: h.auth.currentUser });
  }),
}));
vi.mock('firebase/ai', () => ({
  getAI: vi.fn(() => { h.calls.push('getAI'); return { ai: true }; }),
  GoogleAIBackend: vi.fn(function (this: { kind: string }) { this.kind = 'google'; }),
}));

async function loadInit() {
  vi.resetModules();
  return import('./init');
}

beforeEach(() => {
  h.calls.length = 0;
  h.auth.currentUser = null;
  h.signIn.mode = 'ok';
  h.signIn.n = 0;
  h.resetFlag();
  (globalThis as unknown as { location: { search: string } }).location = { search: '' };
});
afterEach(() => vi.clearAllMocks());

describe('firebase/init (AC-291)', () => {
  it('runs initializeApp → debug flag → initializeAppCheck → getAuth → signInAnonymously → getAI, each once', async () => {
    expect(import.meta.env.DEV).toBe(true); // Vitest runs in DEV mode, so the debug branch is live here
    await loadInit();
    expect(h.calls).toEqual([
      'getApps', 'initializeApp', 'debugFlag', 'initializeAppCheck(flag set)', 'getAuth', 'signInAnonymously', 'getAI',
    ]);
  });

  it('builds App Check with the committed reCAPTCHA Enterprise site key and auto-refresh on, and the AI with GoogleAIBackend', async () => {
    const m = await loadInit();
    const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
    const { getAI, GoogleAIBackend } = await import('firebase/ai');
    const { RECAPTCHA_ENTERPRISE_SITE_KEY } = await import('./config');
    expect(ReCaptchaEnterpriseProvider).toHaveBeenCalledWith(RECAPTCHA_ENTERPRISE_SITE_KEY);
    const [appArg, opts] = vi.mocked(initializeAppCheck).mock.calls[0] as unknown as [unknown, { provider: unknown; isTokenAutoRefreshEnabled: boolean }];
    expect(appArg).toBe(m.app);
    expect(opts.isTokenAutoRefreshEnabled).toBe(true);
    expect(opts.provider).toBeInstanceOf(ReCaptchaEnterpriseProvider);
    const [aiApp, aiOpts] = vi.mocked(getAI).mock.calls[0] as unknown as [unknown, { backend: unknown; useLimitedUseAppCheckTokens?: boolean }];
    expect(aiApp).toBe(m.app);
    expect(aiOpts.backend).toBeInstanceOf(GoogleAIBackend);
    expect(aiOpts.useLimitedUseAppCheckTokens).toBeUndefined(); // replay protection stays off (API-NOTES §2.2)
  });

  it('reuses an existing app on hot reload instead of initialising a second one', async () => {
    const { getApps } = await import('firebase/app');
    vi.mocked(getApps).mockImplementationOnce(() => { h.calls.push('getApps'); return [{ name: 'hot' }] as never; });
    const m = await loadInit();
    expect(m.app).toEqual({ name: 'hot' });
    expect(h.calls).toEqual(['getApps', 'debugFlag', 'initializeAppCheck(flag set)', 'getAuth', 'signInAnonymously', 'getAI']);
  });

  it('skips the debug flag with ?appcheck-debug=off (DEV enforcement test) and keeps the order', async () => {
    (globalThis as unknown as { location: { search: string } }).location = { search: '?appcheck-debug=off' };
    const m = await loadInit();
    expect(m.appCheckDebugSkipped).toBe(true);
    expect(h.calls).toEqual(['getApps', 'initializeApp', 'initializeAppCheck', 'getAuth', 'signInAnonymously', 'getAI']);
  });

  it('sets the debug flag only inside an import.meta.env.DEV branch (dead code in production builds)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./init.ts', import.meta.url), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    const writes = [...src.matchAll(/FIREBASE_APPCHECK_DEBUG_TOKEN\s*=/g)];
    expect(writes).toHaveLength(1);
    const before = src.slice(0, writes[0].index);
    expect(before.slice(before.lastIndexOf('if (')).startsWith('if (import.meta.env.DEV && !skipDebugToken)')).toBe(true);
    expect((src.match(/VITE_APPCHECK_DEBUG_TOKEN/g) ?? [])).toHaveLength(1); // read once, on that same line
  });
});

describe('ensureAuth / authReady', () => {
  it('authReady resolves the anonymous UID', async () => {
    const m = await loadInit();
    await expect(m.authReady).resolves.toBe('uid-1');
    await expect(m.ensureAuth()).resolves.toBe('uid-1'); // signed in: no second sign-in
    expect(h.signIn.n).toBe(1);
  });

  it('resolves null when sign-in fails (offline), never rejects, and the NEXT call retries (D-110)', async () => {
    h.signIn.mode = 'fail';
    const m = await loadInit();
    await expect(m.authReady).resolves.toBeNull();
    await expect(m.ensureAuth()).resolves.toBeNull();
    expect(h.signIn.n).toBe(2);
    h.signIn.mode = 'ok'; // back online
    await expect(m.ensureAuth()).resolves.toBe('uid-3');
    await expect(m.authReady).resolves.toBeNull(); // the first attempt's promise stays what it was
  });

  it('shares one in-flight sign-in between concurrent callers', async () => {
    h.signIn.mode = 'hang';
    const m = await loadInit();
    const a = m.ensureAuth();
    const b = m.ensureAuth();
    expect(a).toBe(b);
    expect(a).toBe(m.authReady);
    expect(h.signIn.n).toBe(1);
  });
});
