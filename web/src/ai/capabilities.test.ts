// T-061: the capability module over fake LanguageModel globals. AC-001 (table-driven state mapping), AC-007 (the
// gate path never caches; only the UI snapshot does, for 30 s), AC-005 at module level (downloadable/downloading is
// never "ready"), and the Download action (synchronous create for user activation, progress, session cleanup).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AVAILABILITY_TIMEOUT_MS,
  NANO_IMAGE_IO,
  NANO_TEXT_IO,
  UI_CACHE_MS,
  availabilityNow,
  capabilityOf,
  deviceReadyNow,
  enableDeviceModel,
  expectedRoutes,
  ioOptions,
  isChromeDesktop,
  type CapState,
  type NanoState,
  type NoNanoReason,
} from './capabilities';

type G = { LanguageModel?: unknown };
const g = globalThis as G;
const install = (lm: unknown) => {
  g.LanguageModel = lm;
};
const uninstall = () => {
  delete g.LanguageModel;
};

/** Image createOptions ask for image input (structural, so it also holds for a vi.resetModules() copy). */
const asksImage = (o: unknown) =>
  Boolean((o as { expectedInputs?: { type: string }[] }).expectedInputs?.some((i) => i.type === 'image'));
/** A fake whose availability answers per io and counts calls. */
function fakeLm(answers: { text: unknown; image: unknown }) {
  const availability = vi.fn((o: unknown) => Promise.resolve(asksImage(o) ? answers.image : answers.text));
  return { availability, answers };
}

afterEach(() => {
  uninstall();
  vi.useRealTimers();
});

const ALL: NanoState[] = ['no-api', 'unavailable', 'downloadable', 'downloading', 'available'];
const fetchable = (s: NanoState) => s === 'downloadable' || s === 'downloading';

describe('capabilityOf: SPEC §5.2 states (AC-001)', () => {
  // [text, image, nanoEnabled, online] → [state, noNano, downloadIo, downloading]
  const ROWS: [NanoState, NanoState, boolean, boolean, CapState, NoNanoReason | null, 'text' | 'image' | null, boolean][] = [
    ['available', 'available', true, true, 'a', null, null, false],
    ['available', 'unavailable', true, true, 'a-prime', null, null, false],
    ['available', 'downloadable', true, true, 'a-prime', null, 'image', false],
    ['available', 'downloading', true, true, 'a-prime', null, 'image', true],
    ['downloadable', 'downloadable', true, true, 'b', null, 'image', false],
    ['downloadable', 'unavailable', true, true, 'b', null, 'text', false],
    ['downloading', 'downloading', true, true, 'b', null, 'image', true],
    ['downloading', 'unavailable', true, true, 'b', null, 'text', true],
    ['downloadable', 'downloading', true, true, 'b', null, 'image', true],
    ['downloadable', 'available', true, true, 'b', null, 'text', false],
    ['unavailable', 'unavailable', true, true, 'c', 'unavailable', null, false],
    ['unavailable', 'downloadable', true, true, 'c', 'unavailable', null, false],
    ['unavailable', 'available', true, true, 'c', 'unavailable', null, false],
    ['no-api', 'no-api', true, true, 'c', 'no-api', null, false],
    ['available', 'no-api', true, true, 'c', 'no-api', null, false],
    ['available', 'available', false, true, 'c', 'disabled', null, false],
    ['downloading', 'downloading', false, true, 'c', 'disabled', null, false],
    ['no-api', 'no-api', false, true, 'c', 'disabled', null, false],
    ['available', 'available', true, false, 'a', null, null, false],
    ['unavailable', 'unavailable', true, false, 'c', 'unavailable', null, false],
  ];
  it.each(ROWS)('text=%s image=%s enabled=%s online=%s → (%s)', (text, image, nanoEnabled, online, state, noNano, downloadIo, downloading) => {
    expect(capabilityOf({ text, image, nanoEnabled, online })).toEqual({ state, offline: !online, noNano, downloadIo, downloading });
  });

  it('maps every one of the 100 signal combinations to exactly one state, plus the (d) flag', () => {
    let n = 0;
    for (const text of ALL)
      for (const image of ALL)
        for (const nanoEnabled of [true, false])
          for (const online of [true, false]) {
            n++;
            const c = capabilityOf({ text, image, nanoEnabled, online });
            const hasLM = text !== 'no-api' && image !== 'no-api';
            expect(['a', 'a-prime', 'b', 'c']).toContain(c.state);
            expect(c.offline).toBe(!online); // (d) is independent of (a)–(c)
            expect(capabilityOf({ text, image, nanoEnabled, online: !online }).state).toBe(c.state);
            // (a)/(a′) iff Nano is on, the API exists and text is available; (a) needs the image model too.
            expect(c.state === 'a' || c.state === 'a-prime').toBe(nanoEnabled && hasLM && text === 'available');
            expect(c.state === 'a').toBe(nanoEnabled && hasLM && text === 'available' && image === 'available');
            expect(c.state === 'b').toBe(nanoEnabled && hasLM && fetchable(text));
            // (c) carries its reason, nothing else does.
            expect(c.noNano !== null).toBe(c.state === 'c');
            if (!nanoEnabled) expect(c.noNano).toBe('disabled');
            else if (!hasLM) expect(c.noNano).toBe('no-api');
            // A Download button only where something can be fetched, and never in (a) or (c).
            if (c.state === 'a' || c.state === 'c') expect(c.downloadIo).toBeNull();
            if (c.state === 'b') expect(c.downloadIo).not.toBeNull();
            if (c.downloadIo) expect(fetchable(c.downloadIo === 'image' ? image : text)).toBe(true);
          }
    expect(n).toBe(100);
  });
});

describe('expectedRoutes: SPEC §5.3 per state (display only)', () => {
  const cap = (text: NanoState, image: NanoState, online = true, nanoEnabled = true) => capabilityOf({ text, image, nanoEnabled, online });
  it.each([
    ['(a)', cap('available', 'available'), { S0: 'ON_DEVICE', S1: 'ON_DEVICE', S2: 'ON_DEVICE', S3: 'IN_CLOUD', S4: 'ON_DEVICE' }],
    ["(a′)", cap('available', 'unavailable'), { S0: 'ON_DEVICE', S1: 'RULES_ONLY', S2: 'ON_DEVICE', S3: 'IN_CLOUD', S4: 'ON_DEVICE' }],
    ['(b)', cap('downloading', 'downloading'), { S0: 'RULES_ONLY', S1: 'RULES_ONLY', S2: 'IN_CLOUD', S3: 'IN_CLOUD', S4: 'IN_CLOUD' }],
    ['(c)', cap('no-api', 'no-api'), { S0: 'RULES_ONLY', S1: 'RULES_ONLY', S2: 'IN_CLOUD', S3: 'IN_CLOUD', S4: 'IN_CLOUD' }],
    ['(c) Nano off', cap('available', 'available', true, false), { S0: 'RULES_ONLY', S1: 'RULES_ONLY', S2: 'IN_CLOUD', S3: 'IN_CLOUD', S4: 'IN_CLOUD' }],
    ['(a)+(d)', cap('available', 'available', false), { S0: 'ON_DEVICE', S1: 'ON_DEVICE', S2: 'ON_DEVICE', S3: 'QUEUED', S4: 'ON_DEVICE' }],
    ['(c)+(d)', cap('no-api', 'no-api', false), { S0: 'RULES_ONLY', S1: 'RULES_ONLY', S2: 'RULES_ONLY', S3: 'QUEUED', S4: 'RULES_ONLY' }],
  ] as const)('%s', (_name, c, routes) => {
    expect(expectedRoutes(c)).toEqual(routes);
  });

  it('never shows S0 or S1 in the cloud, in any state', () => {
    for (const text of ALL)
      for (const image of ALL)
        for (const online of [true, false]) {
          const r = expectedRoutes(capabilityOf({ text, image, nanoEnabled: true, online }));
          expect(['ON_DEVICE', 'RULES_ONLY']).toContain(r.S0);
          expect(['ON_DEVICE', 'RULES_ONLY']).toContain(r.S1);
        }
  });
});

describe('the createOptions objects (one source for the gate and the models, D-86)', () => {
  it('are deep-frozen and fully specified, so neither callers nor the SDK can make them drift', () => {
    for (const io of [NANO_TEXT_IO, NANO_IMAGE_IO]) {
      expect(Object.isFrozen(io)).toBe(true);
      expect(Object.isFrozen(io.expectedInputs)).toBe(true);
      expect(Object.isFrozen(io.expectedInputs?.[0])).toBe(true);
      expect(io.expectedInputs?.length).toBeGreaterThan(0);
      expect(io.expectedOutputs).toEqual([{ type: 'text', languages: ['en'] }]);
      expect(() => {
        (io as { expectedInputs?: unknown }).expectedInputs = [];
      }).toThrow(TypeError);
    }
    expect(NANO_TEXT_IO.expectedInputs).toEqual([{ type: 'text', languages: ['en'] }]);
    expect(NANO_IMAGE_IO.expectedInputs).toEqual([{ type: 'text', languages: ['en'] }, { type: 'image' }]);
    expect(ioOptions('text')).toBe(NANO_TEXT_IO);
    expect(ioOptions('image')).toBe(NANO_IMAGE_IO);
  });
});

describe('availabilityNow / deviceReadyNow: the gate path', () => {
  it("returns 'no-api' when the global is absent, null, or its getter throws", async () => {
    uninstall();
    expect(await availabilityNow('text')).toBe('no-api');
    install(null);
    expect(await availabilityNow('image')).toBe('no-api');
    Object.defineProperty(globalThis, 'LanguageModel', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    expect(await availabilityNow('text')).toBe('no-api');
    expect(await deviceReadyNow('text')).toBe(false);
  });

  it.each(['unavailable', 'downloadable', 'downloading', 'available'] as const)("passes '%s' through; ready only when 'available' (AC-005)", async (a) => {
    install(fakeLm({ text: a, image: a }));
    expect(await availabilityNow('text')).toBe(a);
    expect(await availabilityNow('image')).toBe(a);
    expect(await deviceReadyNow('text')).toBe(a === 'available');
    expect(await deviceReadyNow('image')).toBe(a === 'available');
  });

  it("fails closed to 'unavailable' on a throw, a rejection, a missing method or an unknown answer", async () => {
    install({ availability: () => { throw new Error('sync'); } });
    expect(await availabilityNow('text')).toBe('unavailable');
    install({ availability: () => Promise.reject(new Error('async')) });
    expect(await availabilityNow('text')).toBe('unavailable');
    install({});
    expect(await availabilityNow('text')).toBe('unavailable');
    for (const odd of ['readily', 'after-download', 'no', '', 42, undefined, null, { state: 'available' }]) {
      install({ availability: () => Promise.resolve(odd) });
      expect(await availabilityNow('text')).toBe('unavailable');
      expect(await deviceReadyNow('text')).toBe(false);
    }
  });

  it("fails closed when availability() hangs: 'unavailable' after the timeout, not before", async () => {
    vi.useFakeTimers();
    install({ availability: () => new Promise(() => undefined) });
    let out: NanoState | undefined;
    void availabilityNow('text').then((s) => (out = s));
    await vi.advanceTimersByTimeAsync(AVAILABILITY_TIMEOUT_MS - 1);
    expect(out).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(out).toBe('unavailable');
  });

  it('clears its 5 s timer once availability() answers, rejects or throws (no timer left behind)', async () => {
    vi.useFakeTimers();
    install(fakeLm({ text: 'available', image: 'downloadable' }));
    expect(await availabilityNow('text')).toBe('available');
    expect(vi.getTimerCount()).toBe(0);
    expect(await deviceReadyNow('image')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    install({ availability: () => Promise.reject(new Error('x')) });
    expect(await availabilityNow('image')).toBe('unavailable');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('asks with the exact createOptions object of each io, as a method call', async () => {
    const seen: unknown[] = [];
    const lm = {
      tag: 'lm',
      availability(this: { tag: string }, o: unknown) {
        seen.push([this.tag, o]);
        return Promise.resolve(o === NANO_IMAGE_IO ? 'unavailable' : 'available');
      },
    };
    install(lm);
    expect(await availabilityNow('text')).toBe('available');
    expect(await availabilityNow('image')).toBe('unavailable');
    expect(seen[0]).toEqual(['lm', NANO_TEXT_IO]);
    expect((seen[0] as unknown[])[1]).toBe(NANO_TEXT_IO);
    expect((seen[1] as unknown[])[1]).toBe(NANO_IMAGE_IO);
    expect(await deviceReadyNow('text')).toBe(true);
    expect(await deviceReadyNow('image')).toBe(false); // (a′): text jobs on the device, the image pre-screen rules-only
  });

  it('never caches: every call asks again and sees a change at once (AC-007)', async () => {
    const lm = fakeLm({ text: 'available', image: 'available' });
    install(lm);
    expect(await deviceReadyNow('text')).toBe(true);
    lm.answers.text = 'downloadable';
    expect(await deviceReadyNow('text')).toBe(false);
    lm.answers.text = 'available';
    expect(await availabilityNow('text')).toBe('available');
    uninstall();
    expect(await availabilityNow('text')).toBe('no-api');
    expect(lm.availability).toHaveBeenCalledTimes(3);
  });
});

describe('uiCapabilities: the UI snapshot, cached 30 s (AC-007)', () => {
  // A fresh module per test: the cache is module state.
  let mod: typeof import('./capabilities');
  beforeEach(async () => {
    vi.resetModules();
    mod = await import('./capabilities');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-22T10:00:00Z'));
  });

  it('reuses one snapshot for up to 30 s, then asks again; force asks at once', async () => {
    const lm = fakeLm({ text: 'available', image: 'unavailable' });
    install(lm);
    const first = await mod.uiCapabilities();
    expect(first).toMatchObject({ text: 'available', image: 'unavailable' });
    expect(lm.availability).toHaveBeenCalledTimes(2); // text + image
    vi.advanceTimersByTime(UI_CACHE_MS - 1);
    lm.answers.text = 'downloadable';
    expect(await mod.uiCapabilities()).toBe(first);
    expect(mod.peekUiCapabilities()).toBe(first);
    expect(lm.availability).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(mod.peekUiCapabilities()).toBeNull();
    expect(await mod.uiCapabilities()).toMatchObject({ text: 'downloadable' });
    expect(lm.availability).toHaveBeenCalledTimes(4);
    lm.answers.text = 'available';
    expect(await mod.uiCapabilities(true)).toMatchObject({ text: 'available' });
    expect(lm.availability).toHaveBeenCalledTimes(6);
  });

  it('the gate path ignores the UI cache entirely', async () => {
    const lm = fakeLm({ text: 'available', image: 'available' });
    install(lm);
    await mod.uiCapabilities();
    lm.answers.text = 'downloading';
    expect(await mod.availabilityNow('text')).toBe('downloading');
    expect(await mod.deviceReadyNow('text')).toBe(false);
    expect((await mod.uiCapabilities()).text).toBe('available'); // the chip may lag ≤30 s; the gate never does
  });

  it('shares one in-flight check between concurrent callers', async () => {
    const lm = fakeLm({ text: 'available', image: 'available' });
    install(lm);
    const [x, y] = await Promise.all([mod.uiCapabilities(), mod.uiCapabilities()]);
    expect(x).toBe(y);
    expect(lm.availability).toHaveBeenCalledTimes(2);
  });

  it('never lets a slow older check overwrite a newer one', async () => {
    const pending: ((v: string) => void)[] = [];
    install({ availability: () => new Promise<string>((res) => pending.push(res)) });
    const older = mod.uiCapabilities(true);
    const newer = mod.uiCapabilities(true);
    // newer resolves first with 'available', then older with 'unavailable'
    pending[2]('available');
    pending[3]('available');
    await newer;
    pending[0]('unavailable');
    pending[1]('unavailable');
    expect((await older).text).toBe('available');
    expect(mod.peekUiCapabilities()?.text).toBe('available');
  });

  it('a clock that jumps backwards invalidates the snapshot rather than freezing it', async () => {
    const lm = fakeLm({ text: 'available', image: 'available' });
    install(lm);
    await mod.uiCapabilities();
    vi.setSystemTime(new Date('2026-11-22T09:00:00Z'));
    expect(mod.peekUiCapabilities()).toBeNull();
    await mod.uiCapabilities();
    expect(lm.availability).toHaveBeenCalledTimes(4);
  });
});

/** A fake monitor target plus a create() that captures it and resolves on demand. */
function fakeDownloader() {
  const listeners: ((e: { loaded?: unknown }) => void)[] = [];
  const session = { destroy: vi.fn() };
  let resolve!: (s: unknown) => void;
  let reject!: (e: unknown) => void;
  const create = vi.fn((opts: { monitor?: (m: unknown) => void }) => {
    opts.monitor?.({ addEventListener: (_t: string, l: (e: { loaded?: unknown }) => void) => listeners.push(l) });
    return new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
  });
  return {
    create,
    session,
    emit: (loaded: unknown) => listeners.forEach((l) => l({ loaded })),
    finish: () => resolve(session),
    fail: (e: unknown) => reject(e),
  };
}

describe('enableDeviceModel: "Download Gemini Nano" (SPEC SCR-02, AC-073)', () => {
  it('reaches create() synchronously (user activation), with the io options plus a monitor', () => {
    const d = fakeDownloader();
    install({ availability: vi.fn(), create: d.create });
    void enableDeviceModel('image', () => undefined).catch(() => undefined);
    expect(d.create).toHaveBeenCalledTimes(1); // before any await: same task as the click
    const opts = d.create.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.expectedInputs).toBe(NANO_IMAGE_IO.expectedInputs);
    expect(opts.expectedOutputs).toBe(NANO_IMAGE_IO.expectedOutputs);
    expect(typeof opts.monitor).toBe('function');
    expect(opts).not.toBe(NANO_IMAGE_IO);
    expect('monitor' in NANO_IMAGE_IO).toBe(false);
  });

  it('relays progress clamped and monotonic, ends at 1, and destroys the session', async () => {
    const d = fakeDownloader();
    install({ create: d.create });
    const seen: number[] = [];
    const done = enableDeviceModel('text', (f) => seen.push(f));
    expect((d.create.mock.calls[0][0] as { expectedInputs: unknown }).expectedInputs).toBe(NANO_TEXT_IO.expectedInputs);
    for (const v of [0, 0.05, 0.25, 0.2, Number.NaN, 'x', undefined, 0.6, 1.4]) d.emit(v);
    d.finish();
    await done;
    expect(seen).toEqual([0, 0.05, 0.25, 0.6, 1]);
    expect(d.session.destroy).toHaveBeenCalledTimes(1);
  });

  it('reports 1 at the end even when Chrome fires no progress events (model already on disk)', async () => {
    const d = fakeDownloader();
    install({ create: d.create });
    const seen: number[] = [];
    const done = enableDeviceModel('image', (f) => seen.push(f));
    d.emit(0.4);
    d.finish();
    await done;
    expect(seen).toEqual([0.4, 1]);
  });

  it('still resolves when destroy() throws or create() returns no session', async () => {
    install({ create: () => Promise.resolve({ destroy: () => { throw new Error('gone'); } }) });
    await expect(enableDeviceModel('text', () => undefined)).resolves.toBeUndefined();
    install({ create: () => Promise.resolve(undefined) });
    await expect(enableDeviceModel('text', () => undefined)).resolves.toBeUndefined();
  });

  it('rejects (never throws) without the API, or when Chrome refuses', async () => {
    const seen: number[] = [];
    uninstall();
    await expect(enableDeviceModel('image', (f) => seen.push(f))).rejects.toThrow();
    install({ availability: () => Promise.resolve('downloadable') });
    await expect(enableDeviceModel('image', (f) => seen.push(f))).rejects.toThrow();
    install({ create: () => { throw new DOMException('activation', 'NotAllowedError'); } });
    await expect(enableDeviceModel('image', (f) => seen.push(f))).rejects.toThrow();
    install({ create: () => Promise.reject(new DOMException('disk', 'QuotaExceededError')) });
    await expect(enableDeviceModel('image', (f) => seen.push(f))).rejects.toThrow();
    expect(seen).toEqual([]);
  });

  it("uses the SDK's initializeDeviceModel when one is given, and never calls create() itself", async () => {
    const d = fakeDownloader();
    install({ create: d.create });
    const init = vi.fn(async (onProgress: (f: number) => void) => {
      onProgress(0.3);
      onProgress(0.1);
      onProgress(2);
    });
    const seen: number[] = [];
    await enableDeviceModel('image', (f) => seen.push(f), init);
    expect(init).toHaveBeenCalledTimes(1);
    expect(d.create).not.toHaveBeenCalled();
    expect(seen).toEqual([0.3, 1]);
    await expect(enableDeviceModel('image', () => undefined, () => Promise.reject(new Error('API_NOT_ENABLED')))).rejects.toThrow('API_NOT_ENABLED');
  });
});

describe('isChromeDesktop (the SCR-02 how-to)', () => {
  const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';
  it.each([
    ['Chrome on macOS (UA string)', { userAgent: MAC_CHROME }, true],
    ['Chrome on Windows (UA string)', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36' }, true],
    ['Edge', { userAgent: `${MAC_CHROME} Edg/157.0.0.0` }, false],
    ['Opera', { userAgent: `${MAC_CHROME} OPR/120.0.0.0` }, false],
    ['Chrome on Android', { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36' }, false],
    ['Chrome on iOS', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/157.0 Mobile/15E148 Safari/604.1' }, false],
    ['Safari', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15' }, false],
    ['Firefox', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15.0; rv:150.0) Gecko/20100101 Firefox/150.0' }, false],
    ['UA-CH: Google Chrome, desktop', { userAgent: MAC_CHROME, userAgentData: { brands: [{ brand: 'Not.A/Brand' }, { brand: 'Chromium' }, { brand: 'Google Chrome' }], mobile: false } }, true],
    ['UA-CH: Brave (brands win over the UA string)', { userAgent: MAC_CHROME, userAgentData: { brands: [{ brand: 'Chromium' }, { brand: 'Brave' }], mobile: false } }, false],
    ['UA-CH: Google Chrome, mobile', { userAgent: MAC_CHROME, userAgentData: { brands: [{ brand: 'Google Chrome' }], mobile: true } }, false],
    ['Node (no browser)', { userAgent: 'Node.js/24' }, false],
    ['no navigator', undefined, false],
  ] as const)('%s → %s', (_name, nav, expected) => {
    expect(isChromeDesktop(nav)).toBe(expected);
  });
});
