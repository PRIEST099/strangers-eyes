// T-061: the UI capability hook. Rendered statically in Node (no DOM, so effects do not run): the first render must
// fail closed, a fresh UI snapshot must show at once, and "Download Gemini Nano" must reach the browser's download
// request synchronously from the click (user activation, AC-073).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_CACHE_MS, capabilityOf, type NanoState, type UiCapabilities } from '../../ai/capabilities';
import {
  POLL_MS,
  chipStateOf,
  createCapabilitiesController,
  pctOf,
  type CapabilitiesView,
  type ControllerDeps,
  type DownloadState,
  type UseCapabilitiesOptions,
} from './useCapabilities';

type G = { LanguageModel?: unknown };
const g = globalThis as G;
const asksImage = (o: unknown) =>
  Boolean((o as { expectedInputs?: { type: string }[] }).expectedInputs?.some((i) => i.type === 'image'));

afterEach(() => {
  delete g.LanguageModel;
});

describe('chipStateOf (SPEC §8.2 header chip)', () => {
  const cap = (text: NanoState, image: NanoState, nanoEnabled = true) => capabilityOf({ text, image, nanoEnabled, online: true });
  const idle: DownloadState = { kind: 'idle' };
  it.each([
    ['(a)', cap('available', 'available'), idle, { kind: 'nano' }],
    ["(a′)", cap('available', 'unavailable'), idle, { kind: 'nanoTextOnly' }],
    ["(a′) while the image model downloads", cap('available', 'downloading'), { kind: 'running', pct: 40 }, { kind: 'nanoTextOnly' }],
    ['(b) downloadable, nothing started', cap('downloadable', 'downloadable'), idle, { kind: 'rulesOnly' }],
    ['(b) our download at 43 %', cap('downloadable', 'downloadable'), { kind: 'running', pct: 43 }, { kind: 'downloading', pct: 43 }],
    ["(b) Chrome's own download", cap('downloading', 'downloading'), idle, { kind: 'downloading', pct: 0 }],
    ['(b) ours finished, Chrome still installing', cap('downloading', 'downloading'), { kind: 'done' }, { kind: 'downloading', pct: 100 }],
    ['(b) after a failed download', cap('downloadable', 'downloadable'), { kind: 'failed' }, { kind: 'rulesOnly' }],
    ['(c) no API', cap('no-api', 'no-api'), idle, { kind: 'rulesOnly' }],
    ['(c) Nano off', cap('available', 'available', false), idle, { kind: 'rulesOnly' }],
  ] as const)('%s', (_name, c, d, chip) => {
    expect(chipStateOf(c, d)).toEqual(chip);
  });
});

describe('pctOf', () => {
  it.each([
    [0, 0],
    [0.049, 4],
    [0.437, 43],
    [0.999, 99],
    [1, 100],
    [1.5, 100],
    [-0.2, 0],
    [Number.NaN, 0],
  ])('%s → %s', (f, pct) => expect(pctOf(f)).toBe(pct));
});

describe('useCapabilities (static render)', () => {
  // A fresh module graph per test: the UI snapshot cache is module state shared by the hook and ai/capabilities.
  let hook: typeof import('./useCapabilities');
  let caps: typeof import('../../ai/capabilities');
  beforeEach(async () => {
    vi.resetModules();
    caps = await import('../../ai/capabilities');
    hook = await import('./useCapabilities');
  });

  const probe = (opts: UseCapabilitiesOptions): CapabilitiesView => {
    let view: CapabilitiesView | undefined;
    const Probe = () => {
      view = hook.useCapabilities(opts);
      return null;
    };
    renderToStaticMarkup(createElement(Probe));
    if (!view) throw new Error('probe did not render');
    return view;
  };
  const answer = (text: NanoState, image: NanoState, extra: object = {}) => {
    g.LanguageModel = { availability: (o: unknown) => Promise.resolve(asksImage(o) ? image : text), ...extra };
  };

  it('fails closed before the first check, even when Nano is available: (c), Rules-only', () => {
    answer('available', 'available');
    const v = probe({ online: true });
    expect(v.checked).toBe(false);
    expect(v.capability.state).toBe('c');
    expect(v.chip).toEqual({ kind: 'rulesOnly' });
    expect(v.download).toEqual({ kind: 'idle' });
    expect(v.chromeDesktop).toBe(false); // Node
    expect(v.swReady).toBe(false);
  });

  it('shows a fresh UI snapshot on the first render (no flash of (c) on a remount)', async () => {
    answer('available', 'unavailable');
    await caps.uiCapabilities();
    const v = probe({ online: false });
    expect(v.checked).toBe(true);
    expect(v.capability).toMatchObject({ state: 'a-prime', offline: true });
    expect(v.chip).toEqual({ kind: 'nanoTextOnly' });
  });

  it('nanoEnabled=false is (c) whatever Chrome says', async () => {
    answer('available', 'available');
    await caps.uiCapabilities();
    const v = probe({ online: true, nanoEnabled: false });
    expect(v.capability).toMatchObject({ state: 'c', noNano: 'disabled' });
    expect(v.chip).toEqual({ kind: 'rulesOnly' });
  });

  it('startDownload reaches create() synchronously, once, for the io that can be fetched', async () => {
    const create = vi.fn(() => new Promise(() => undefined)); // a download that never finishes
    answer('downloadable', 'downloadable', { create });
    await caps.uiCapabilities();
    const v = probe({ online: true });
    expect(v.capability).toMatchObject({ state: 'b', downloadIo: 'image' });
    v.startDownload();
    expect(create).toHaveBeenCalledTimes(1); // in the click's own task: user activation holds
    expect(asksImage(create.mock.calls[0])).toBe(false);
    expect(asksImage((create.mock.calls[0] as unknown[])[0])).toBe(true);
    v.startDownload(); // a second click while running is ignored
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("startDownload builds the per-io SDK initializer in the click and downloads through it, not create()", async () => {
    const create = vi.fn();
    answer('downloadable', 'unavailable', { create });
    await caps.uiCapabilities();
    const init = vi.fn(() => Promise.resolve());
    const initFor = vi.fn(() => init);
    const v = probe({ online: true, initializeDeviceModel: initFor });
    expect(v.capability.downloadIo).toBe('text');
    v.startDownload();
    expect(initFor).toHaveBeenCalledWith('text'); // the initializer must match the io being fetched (D-91)
    expect(init).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('startDownload does nothing when there is nothing to download', async () => {
    const create = vi.fn();
    answer('available', 'available', { create });
    await caps.uiCapabilities();
    probe({ online: true }).startDownload();
    expect(create).not.toHaveBeenCalled();
  });
});

// ---------- the controller: every timing rule, with fake timers (T-061 review, D-100) ----------

type Avail = Pick<UiCapabilities, 'text' | 'image'>;
/** A scripted world: uiCapabilities answers `next` (or rejects / hangs), a download settles on demand. */
function world() {
  const calls: boolean[] = [];
  const state = {
    next: { text: 'available', image: 'available' } as Avail,
    ageMs: 0, // how old the snapshot handed back already is
    mode: 'resolve' as 'resolve' | 'reject' | 'hang',
  };
  const hung: ((s: UiCapabilities) => void)[] = [];
  const uiCapabilities = vi.fn((force: boolean): Promise<UiCapabilities> => {
    calls.push(force);
    if (state.mode === 'reject') return Promise.reject(new Error('boom'));
    if (state.mode === 'hang') return new Promise((res) => hung.push(res));
    return Promise.resolve({ at: Date.now() - state.ageMs, ...state.next });
  });
  let dl: { ok: () => void; fail: (e: unknown) => void; progress: (f: number) => void } | null = null;
  const enableDeviceModel = vi.fn(
    (_io: unknown, onProgress: (f: number) => void, _init?: unknown) =>
      new Promise<void>((ok, fail) => {
        dl = { ok, fail, progress: onProgress };
      }),
  );
  const docL = new Set<() => void>();
  const doc = {
    visibilityState: 'visible',
    addEventListener: (_t: string, l: () => void) => docL.add(l),
    removeEventListener: (_t: string, l: () => void) => docL.delete(l),
  };
  const swL = new Set<() => void>();
  const sw = {
    controller: null as unknown,
    addEventListener: (_t: string, l: () => void) => swL.add(l),
    removeEventListener: (_t: string, l: () => void) => swL.delete(l),
  };
  const deps: ControllerDeps = {
    uiCapabilities,
    enableDeviceModel,
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
    doc,
    sw,
  };
  return {
    deps,
    calls,
    state,
    hung,
    enableDeviceModel,
    dl: () => {
      if (!dl) throw new Error('no download started');
      return dl;
    },
    docL,
    swL,
    sw,
    setVisible(v: 'visible' | 'hidden') {
      doc.visibilityState = v;
      for (const l of docL) l();
    },
  };
}
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('createCapabilitiesController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-22T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('start runs the first check (unforced) and publishes it', async () => {
    const w = world();
    const c = createCapabilitiesController(w.deps);
    const seen = vi.fn();
    c.subscribe(seen);
    expect(c.getState().snap).toBeNull();
    expect(w.calls).toEqual([]);
    c.start();
    await flush();
    expect(w.calls).toEqual([false]);
    expect(c.getState().snap).toMatchObject({ text: 'available', image: 'available' });
    expect(seen).toHaveBeenCalled();
  });

  it('never shows a snapshot past its 30 s life while visible (SPEC §5.1)', async () => {
    const w = world();
    const c = createCapabilitiesController(w.deps);
    c.start();
    await flush();
    await vi.advanceTimersByTimeAsync(UI_CACHE_MS - 1);
    expect(w.calls).toEqual([false]);
    await vi.advanceTimersByTimeAsync(1);
    expect(w.calls).toEqual([false, false]);
    await vi.advanceTimersByTimeAsync(UI_CACHE_MS);
    expect(w.calls).toEqual([false, false, false]);
  });

  it('times the re-check from when the snapshot was taken, not from when it arrived', async () => {
    const w = world();
    w.state.ageMs = 20_000; // a cached snapshot that is already 20 s old
    const c = createCapabilitiesController(w.deps);
    c.start();
    await flush();
    await vi.advanceTimersByTimeAsync(10_000 - 1);
    expect(w.calls).toEqual([false]);
    await vi.advanceTimersByTimeAsync(1);
    expect(w.calls).toEqual([false, false]);
  });

  it('hidden at expiry: no check; showing the tab forces one; hiding never checks', async () => {
    const w = world();
    const c = createCapabilitiesController(w.deps);
    c.start();
    await flush();
    w.setVisible('hidden');
    await vi.advanceTimersByTimeAsync(UI_CACHE_MS * 3);
    expect(w.calls).toEqual([false]);
    w.setVisible('visible');
    await flush();
    expect(w.calls).toEqual([false, true]);
  });

  it('a rejected first check is retried after 30 s instead of pinning (c)', async () => {
    const w = world();
    w.state.mode = 'reject';
    const c = createCapabilitiesController(w.deps);
    c.start();
    await flush();
    expect(c.getState().snap).toBeNull();
    w.state.mode = 'resolve';
    await vi.advanceTimersByTimeAsync(UI_CACHE_MS);
    expect(w.calls).toEqual([false, false]);
    expect(c.getState().snap).toMatchObject({ text: 'available' });
  });

  it('a slow first check is applied when it lands, then expires normally', async () => {
    const w = world();
    w.state.mode = 'hang';
    const c = createCapabilitiesController(w.deps);
    c.start();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(c.getState().snap).toBeNull();
    w.hung[0]({ at: Date.now(), text: 'downloadable', image: 'downloadable' });
    await flush();
    expect(c.getState().snap).toMatchObject({ text: 'downloadable' });
  });

  it("polls every 2 s (forced) while Chrome reports a download, and stops when it's done", async () => {
    const w = world();
    w.state.next = { text: 'downloading', image: 'downloading' };
    const c = createCapabilitiesController(w.deps);
    c.start();
    await flush();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(w.calls).toEqual([false, true]);
    w.setVisible('hidden');
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(w.calls).toEqual([false, true]); // no polling while hidden
    w.state.next = { text: 'available', image: 'available' };
    w.setVisible('visible'); // forced re-check → available
    await flush();
    expect(c.getState().snap).toMatchObject({ text: 'available' });
    const n = w.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    expect(w.calls.length).toBe(n); // polling stopped
  });

  it('download: synchronous request, progress, success → done, then a forced re-check', async () => {
    const w = world();
    w.state.next = { text: 'downloadable', image: 'downloadable' };
    const c = createCapabilitiesController(w.deps);
    c.start();
    await flush();
    const seen = vi.fn();
    c.subscribe(seen);
    c.startDownload('image');
    expect(w.enableDeviceModel).toHaveBeenCalledTimes(1); // before startDownload returned: user activation holds
    expect(w.enableDeviceModel.mock.calls[0][0]).toBe('image');
    expect(c.getState().download).toEqual({ kind: 'running', pct: 0 });
    w.dl().progress(0.42);
    expect(c.getState().download).toEqual({ kind: 'running', pct: 42 });
    const notified = seen.mock.calls.length;
    w.dl().progress(0.425); // same whole percent: no re-render
    expect(seen.mock.calls.length).toBe(notified);
    await vi.advanceTimersByTimeAsync(POLL_MS); // our running download polls too
    expect(w.calls.at(-1)).toBe(true);
    const before = w.calls.length;
    w.state.next = { text: 'available', image: 'available' };
    w.dl().ok();
    await flush();
    expect(c.getState().download).toEqual({ kind: 'done' });
    expect(w.calls.slice(before)).toEqual([true]); // the after-download re-check is forced
    expect(c.getState().snap).toMatchObject({ text: 'available' });
  });

  it('download failure → failed (never done), a forced re-check, and a second click while running is ignored', async () => {
    const w = world();
    w.state.next = { text: 'downloadable', image: 'unavailable' };
    const c = createCapabilitiesController(w.deps);
    c.start();
    await flush();
    c.startDownload('text');
    c.startDownload('text');
    expect(w.enableDeviceModel).toHaveBeenCalledTimes(1);
    const before = w.calls.length;
    w.dl().fail(new Error('NotAllowedError'));
    await flush();
    expect(c.getState().download).toEqual({ kind: 'failed' });
    expect(w.calls.slice(before)).toEqual([true]);
    c.startDownload('text'); // a retry is allowed once it has settled
    expect(w.enableDeviceModel).toHaveBeenCalledTimes(2);
  });

  it('a download that throws synchronously reports failed; the initializer is passed through', async () => {
    const w = world();
    const c = createCapabilitiesController({
      ...w.deps,
      enableDeviceModel: () => {
        throw new Error('sync');
      },
    });
    c.start();
    await flush();
    c.startDownload('image');
    await flush();
    expect(c.getState().download).toEqual({ kind: 'failed' });

    const w2 = world();
    const c2 = createCapabilitiesController(w2.deps);
    const init = vi.fn(() => Promise.resolve());
    c2.startDownload('image', init);
    expect(w2.enableDeviceModel.mock.calls[0][2]).toBe(init);
  });

  it('stop removes every listener and timer, and later results are ignored', async () => {
    const w = world();
    w.state.next = { text: 'downloading', image: 'downloading' };
    const c = createCapabilitiesController(w.deps);
    c.start();
    await flush();
    expect(vi.getTimerCount()).toBe(2); // expiry + poll
    expect(w.docL.size).toBe(1);
    expect(w.swL.size).toBe(1);
    w.state.mode = 'hang';
    await vi.advanceTimersByTimeAsync(POLL_MS); // a forced poll that will land after stop
    c.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(w.docL.size).toBe(0);
    expect(w.swL.size).toBe(0);
    const snap = c.getState().snap;
    w.hung[0]({ at: Date.now(), text: 'available', image: 'available' });
    await flush();
    expect(c.getState().snap).toBe(snap);
    expect(vi.getTimerCount()).toBe(0);
    c.panelShown();
    expect(w.calls.length).toBe(2); // panelShown does nothing while stopped
  });

  it('start re-reads the service worker (it may take control after the first render) and follows controllerchange', async () => {
    const w = world();
    const c = createCapabilitiesController(w.deps);
    expect(c.getState().swReady).toBe(false);
    w.sw.controller = {};
    c.start();
    expect(c.getState().swReady).toBe(true);
    w.sw.controller = null;
    for (const l of w.swL) l();
    expect(c.getState().swReady).toBe(false);
  });

  it('StrictMode start → stop → start keeps one listener and one poll', async () => {
    const w = world();
    w.state.next = { text: 'downloading', image: 'downloading' };
    const c = createCapabilitiesController(w.deps);
    c.start();
    c.stop();
    c.start();
    c.start(); // idempotent: no second check
    await flush();
    expect(w.calls).toEqual([false, false]); // one per real start
    expect(w.docL.size).toBe(1);
    const n = w.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(w.calls.length - n).toBe(1);
  });

  it('panelShown re-checks unforced', async () => {
    const w = world();
    const c = createCapabilitiesController(w.deps);
    c.start();
    await flush();
    c.panelShown();
    await flush();
    expect(w.calls).toEqual([false, false]);
  });
});
