// T-091, T-092, T-094: behaviour of Welcome, App's gate, AppShell's new wiring and Settings, driven through the real
// components with no DOM. React's hooks are replaced by a tiny single-instance runtime (as in checkState.test.ts): a
// component is called as a plain function and the element tree it returns is read; the props it hands its children ARE
// its behaviour here. Effects are not run (AppShell's only touch document and window).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capabilityOf } from '../ai/capabilities';
import { DEFAULT_SETTINGS, SIMS_NONE, localPrefs, type Settings as SettingsT, type Simulations } from '../core/localPrefs';
import { t } from '../core/strings';
import type { CapabilitiesView } from './hooks/useCapabilities';
import type { AppRoute } from './router';
import type { ShellApi } from './shellContext';

const rt = vi.hoisted(() => {
  type Slot = { v: unknown };
  let slots: Slot[] = [];
  let at = 0;
  const slot = (init: () => unknown): Slot => {
    const k = at++;
    slots[k] ??= { v: init() };
    return slots[k];
  };
  const state = {
    route: { name: 'home' } as unknown,
    supported: true,
    ack: false,
    settings: undefined as unknown,
    sims: undefined as unknown,
    capUsed: 0,
    online: true,
    context: null as unknown,
    caps: undefined as unknown,
  };
  return {
    state,
    reset() { slots = []; at = 0; },
    render<P, R>(component: (p: P) => R, props: P): R { at = 0; return component(props); },
    hooks: {
      useState: (init: unknown) => {
        const s = slot(() => (typeof init === 'function' ? (init as () => unknown)() : init));
        return [s.v, (x: unknown) => { s.v = typeof x === 'function' ? (x as (p: unknown) => unknown)(s.v) : x; }];
      },
      useRef: (init: unknown) => slot(() => ({ current: init })).v,
      useEffect: () => { at++; },
      useId: () => { at++; return ':id:'; },
      useCallback: (fn: unknown) => fn,
      useMemo: (fn: () => unknown) => fn(),
      useContext: () => state.context,
      useSyncExternalStore: (_s: unknown, get: () => unknown) => get(),
    },
    useCapabilities: vi.fn(),
  };
});
vi.mock('react', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...rt.hooks }));
vi.mock('./hooks/useRoute', () => ({ useRoute: () => rt.state.route }));
vi.mock('./hooks/useBrowserSupport', () => ({ useBrowserSupport: () => rt.state.supported }));
vi.mock('./hooks/usePrefs', () => ({
  useAck18: () => rt.state.ack,
  useSettings: () => rt.state.settings,
  useSimulations: () => rt.state.sims,
  useCapUsed: () => rt.state.capUsed,
}));
vi.mock('./hooks/useOnline', () => ({ useOnline: () => rt.state.online }));
vi.mock('./hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('./hooks/useCapabilities', () => ({ useCapabilities: rt.useCapabilities }));

// Imported after the mocks (vi.mock is hoisted anyway; this keeps the order obvious).
const { default: App } = await import('../App');
const { AppShell } = await import('./components/AppShell');
const { Sheet } = await import('./components/Sheet');
const { Toggle } = await import('./components/Toggle');
const { Button } = await import('./components/Button');
const { UnsupportedPage } = await import('./components/UnsupportedPage');
const { Welcome } = await import('./screens/Welcome');
const { Settings } = await import('./screens/Settings');
const { ShellContext } = await import('./shellContext');
const { parseHash } = await import('./router');

interface El { type: unknown; props: Record<string, unknown> & { children?: unknown } }
function find(node: unknown, pred: (el: El) => boolean, out: El[] = []): El[] {
  if (Array.isArray(node)) { for (const n of node) find(n, pred, out); return out; }
  if (node === null || typeof node !== 'object' || !('props' in node)) return out;
  const el = node as El;
  if (pred(el)) out.push(el);
  find(el.props.children, pred, out);
  return out;
}
const ofType = (tree: unknown, type: unknown) => find(tree, (e) => e.type === type);
/** All text in a tree (strings and numbers), joined. */
function text(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (node === null || typeof node !== 'object' || !('props' in node)) return '';
  return text((node as El).props.children);
}

function view(over: Partial<CapabilitiesView> = {}): CapabilitiesView {
  return {
    checked: true,
    capability: capabilityOf({ text: 'no-api', image: 'no-api', nanoEnabled: true, online: true }),
    chip: { kind: 'rulesOnly' },
    download: { kind: 'idle' },
    startDownload: vi.fn(),
    onPanelShown: () => {},
    chromeDesktop: false,
    swReady: false,
    ...over,
  };
}

const route = (hash: string) => parseHash(hash, { dev: false });

beforeEach(() => {
  rt.reset();
  Object.assign(rt.state, {
    route: route('#/'), supported: true, ack: false, settings: DEFAULT_SETTINGS as SettingsT, sims: SIMS_NONE as Simulations,
    capUsed: 0, online: true, context: null, caps: view(),
  });
  rt.useCapabilities.mockReset();
  rt.useCapabilities.mockImplementation(() => rt.state.caps);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Welcome (SCR-01, AC-070)', () => {
  type Box = { onChange: (e: { target: { checked: boolean } }) => void; checked: boolean };
  const box = (tree: unknown) => find(tree, (e) => e.type === 'input' && e.props.name === 'age')[0].props as unknown as Box;
  const cont = (tree: unknown) => ofType(tree, Button)[0].props as { disabled: boolean; type: string };
  const form = (tree: unknown) => ofType(tree, 'form')[0].props as { onSubmit: (e: { preventDefault: () => void }) => void };

  it('Continue stays disabled until the box is ticked, and unticking disables it again', () => {
    const onContinue = vi.fn();
    let tree = rt.render(Welcome, { onContinue });
    expect(box(tree).checked).toBe(false);
    expect(cont(tree)).toMatchObject({ disabled: true, type: 'submit' });
    box(tree).onChange({ target: { checked: true } });
    tree = rt.render(Welcome, { onContinue });
    expect(box(tree).checked).toBe(true);
    expect(cont(tree).disabled).toBe(false);
    box(tree).onChange({ target: { checked: false } });
    tree = rt.render(Welcome, { onContinue });
    expect(cont(tree).disabled).toBe(true);
  });

  it('submitting (Enter) before the box is ticked does nothing; after, it continues once', () => {
    const onContinue = vi.fn();
    const preventDefault = vi.fn();
    let tree = rt.render(Welcome, { onContinue });
    form(tree).onSubmit({ preventDefault });
    expect(onContinue).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled(); // never a page reload
    box(tree).onChange({ target: { checked: true } });
    tree = rt.render(Welcome, { onContinue });
    form(tree).onSubmit({ preventDefault });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

describe("App's gate (ui/gate.ts)", () => {
  it('an unsupported browser gets only the full-page message', () => {
    rt.state.supported = false;
    rt.state.ack = true;
    const tree = rt.render(App, {}) as El;
    expect(tree.type).toBe(UnsupportedPage);
  });

  it('a fresh profile gets Welcome on any product route; with the acknowledgement, the shell (a reload skips SCR-01)', () => {
    for (const h of ['#/', '#/vault', '#/settings', '#/about', '#/check']) {
      rt.reset();
      rt.state.route = route(h);
      rt.state.ack = false;
      expect((rt.render(App, {}) as El).type).toBe(Welcome);
      rt.reset();
      rt.state.ack = true;
      const shell = rt.render(App, {}) as El;
      expect(shell.type).toBe(AppShell);
      expect(shell.props.capabilityOnStart).toBe(false);
    }
  });

  it('AC-071: Continue on #/judge stores the acknowledgement and mounts the shell with SCR-02 open', () => {
    rt.state.route = route('#/judge'); // main.tsx has already turned ?judge=1 into #/judge
    const order: string[] = [];
    const ack = vi.spyOn(localPrefs, 'setAck18').mockImplementation(() => { order.push('ack'); rt.state.ack = true; return true; });
    const welcome = rt.render(App, {}) as El;
    expect(welcome.type).toBe(Welcome);
    (welcome.props.onContinue as () => void)();
    expect(ack).toHaveBeenCalledTimes(1);
    const shell = rt.render(App, {}) as El;
    expect(shell.type).toBe(AppShell);
    expect(shell.props.capabilityOnStart).toBe(true);
    expect(shell.props.route).toEqual({ name: 'judge' });
  });

  it('the flag is set BEFORE the acknowledgement, so an unbatched update still mounts the shell with it', () => {
    rt.state.route = route('#/judge');
    let mountedWith: unknown = 'not rendered';
    vi.spyOn(localPrefs, 'setAck18').mockImplementation(() => {
      rt.state.ack = true;
      mountedWith = (rt.render(App, {}) as El).props.capabilityOnStart; // an unbatched re-render, right now
      return true;
    });
    ((rt.render(App, {}) as El).props.onContinue as () => void)();
    expect(mountedWith).toBe(true);
  });

  it('Continue on any other route does not open SCR-02', () => {
    rt.state.route = route('#/vault');
    vi.spyOn(localPrefs, 'setAck18').mockImplementation(() => { rt.state.ack = true; return true; });
    ((rt.render(App, {}) as El).props.onContinue as () => void)();
    expect((rt.render(App, {}) as El).props.capabilityOnStart).toBe(false);
  });

  it('when storage refuses the acknowledgement, the session still continues', () => {
    rt.state.route = route('#/');
    vi.spyOn(localPrefs, 'setAck18').mockImplementation(() => { rt.state.ack = true; return false; });
    ((rt.render(App, {}) as El).props.onContinue as () => void)();
    expect((rt.render(App, {}) as El).type).toBe(AppShell);
  });
});

describe('AppShell wiring', () => {
  const capSheet = (tree: unknown) => ofType(tree, Sheet).find((s) => s.props.title === t('copy.cap.title')) as El;
  const shell = (r: AppRoute, capabilityOnStart?: boolean) => rt.render(AppShell, { route: r, capabilityOnStart, children: null });

  it('capabilityOnStart opens SCR-02 on mount; without it, it starts closed', () => {
    expect(capSheet(shell(route('#/judge'), true)).props.open).toBe(true);
    rt.reset();
    expect(capSheet(shell(route('#/judge'))).props.open).toBe(false);
  });

  it('a SCR-02 link to the route already shown closes the sheet (Try Judge Mode on #/judge: the third click)', () => {
    class FakeElement {
      href: string | null;
      constructor(href: string | null) { this.href = href; }
      closest() { return this.href === null ? null : { getAttribute: () => this.href }; }
    }
    vi.stubGlobal('Element', FakeElement);
    const r = route('#/judge');
    let tree = shell(r, true);
    const wrap = () => find(tree, (e) => typeof e.props.onClickCapture === 'function')[0].props.onClickCapture as (e: { target: unknown }) => void;
    wrap()({ target: new FakeElement('#/vault') }); // navigates away: the route change closes it, not this
    tree = shell(r, true);
    expect(capSheet(tree).props.open).toBe(true);
    wrap()({ target: new FakeElement(null) }); // not a link
    tree = shell(r, true);
    expect(capSheet(tree).props.open).toBe(true);
    wrap()({ target: new FakeElement('#/judge') });
    tree = shell(r, true);
    expect(capSheet(tree).props.open).toBe(false);
  });

  it('ShellContext gives screens the same capability view and a way to open SCR-02', () => {
    const r = route('#/settings');
    let tree = shell(r);
    const provider = ofType(tree, ShellContext.Provider)[0];
    const api = provider.props.value as ShellApi;
    expect(api.caps).toBe(rt.state.caps);
    expect(capSheet(tree).props.open).toBe(false);
    api.openCapability();
    tree = shell(r);
    expect(capSheet(tree).props.open).toBe(true);
  });

  it('"Use Gemini Nano" off, or simulated no Nano, turns Nano off in the capability view; simulated offline is offline', () => {
    const r = route('#/');
    shell(r);
    expect(rt.useCapabilities).toHaveBeenLastCalledWith({ online: true, nanoEnabled: true });
    rt.reset();
    rt.state.settings = { ...DEFAULT_SETTINGS, useNano: false };
    shell(r);
    expect(rt.useCapabilities).toHaveBeenLastCalledWith({ online: true, nanoEnabled: false });
    rt.reset();
    rt.state.settings = DEFAULT_SETTINGS;
    rt.state.sims = { noNano: true, offline: false };
    shell(r);
    expect(rt.useCapabilities).toHaveBeenLastCalledWith({ online: true, nanoEnabled: false });
    rt.reset();
    rt.state.sims = { noNano: false, offline: true };
    const tree = shell(r);
    expect(rt.useCapabilities).toHaveBeenLastCalledWith({ online: false, nanoEnabled: true });
    // …and the header shows Offline.
    const header = find(tree, (e) => typeof e.props.connectivity === 'string')[0];
    expect(header.props.connectivity).toBe('offline');
  });

  it('simulations can only downgrade: with every simulation off, a real offline stays offline', () => {
    rt.state.online = false;
    shell(route('#/'));
    expect(rt.useCapabilities).toHaveBeenLastCalledWith({ online: false, nanoEnabled: true });
  });
});

describe('Settings behaviour (SCR-20)', () => {
  const NONE = { clearHistory: null, receipt: null, copyText: vi.fn(async () => {}) };
  const status = (tree: unknown) => text(find(tree, (e) => e.type === 'p' && e.props.role === 'status')[0]);
  const toggles = (tree: unknown) => ofType(tree, Toggle).map((x) => x.props as { label: string; checked: boolean; onChange: (on: boolean) => void });
  const button = (tree: unknown, label: string) => ofType(tree, Button).find((b) => text(b) === label)?.props as { onClick?: () => void } | undefined;

  it('"Use Gemini Nano" writes the setting; when storage cannot keep it, the status says "this visit only" (AC-275)', () => {
    const upd = vi.spyOn(localPrefs, 'updateSettings').mockReturnValueOnce(false).mockReturnValueOnce(true);
    let tree = rt.render(Settings, { deps: NONE, debug: false });
    const nano = toggles(tree).find((x) => x.label === t('ui.settings.useNano'));
    expect(nano?.checked).toBe(true);
    nano?.onChange(false);
    expect(upd).toHaveBeenLastCalledWith({ useNano: false });
    tree = rt.render(Settings, { deps: NONE, debug: false });
    expect(status(tree)).toBe(t('ui.settings.notSaved'));
    toggles(tree)[0].onChange(true);
    tree = rt.render(Settings, { deps: NONE, debug: false });
    expect(status(tree)).toBe('');
  });

  it('the switch shows the stored value', () => {
    rt.state.settings = { ...DEFAULT_SETTINGS, useNano: false };
    expect(toggles(rt.render(Settings, { deps: NONE, debug: false }))[0].checked).toBe(false);
  });

  it('Developer switches set the simulations', () => {
    const sim = vi.spyOn(localPrefs, 'setSimulation').mockReturnValue(true);
    const tree = rt.render(Settings, { deps: NONE, debug: true });
    const [, noNano, offline] = toggles(tree);
    expect(noNano.label).toBe(t('ui.settings.dev.noNano'));
    noNano.onChange(true);
    offline.onChange(true);
    expect(sim.mock.calls).toEqual([['noNano', true], ['offline', true]]);
  });

  it('Developer stays visible while a simulation is on, even without ?debug=1 (it can always be turned off)', () => {
    rt.state.sims = { noNano: false, offline: true };
    const tree = rt.render(Settings, { deps: NONE, debug: false });
    expect(toggles(tree).map((x) => x.label)).toContain(t('ui.settings.dev.offline'));
  });

  it('usage reads the local counter and the cap', () => {
    rt.state.capUsed = 7;
    const tree = rt.render(Settings, { deps: NONE, debug: false });
    expect(text(tree)).toContain(t('ui.settings.usage.today', { used: 7, cap: 20 }));
  });

  it('On-device AI: the Download button appears in state (b) and starts the download from the click', () => {
    const startDownload = vi.fn();
    const caps = view({ capability: capabilityOf({ text: 'downloadable', image: 'downloadable', nanoEnabled: true, online: true }), startDownload });
    const openCapability = vi.fn();
    rt.state.context = { caps, openCapability } satisfies ShellApi;
    const tree = rt.render(Settings, { deps: NONE, debug: false });
    button(tree, t('ui.cap.download'))?.onClick?.();
    expect(startDownload).toHaveBeenCalledTimes(1);
    button(tree, t('ui.settings.device.details'))?.onClick?.();
    expect(openCapability).toHaveBeenCalledTimes(1);
  });

  it('no Download button while downloading is already running (aria-disabled, no handler) or in (c)', () => {
    const running = view({
      capability: capabilityOf({ text: 'downloadable', image: 'downloadable', nanoEnabled: true, online: true }),
      download: { kind: 'running', pct: 40 },
    });
    rt.state.context = { caps: running, openCapability: () => {} } satisfies ShellApi;
    const b = ofType(rt.render(Settings, { deps: NONE, debug: false }), Button).find((x) => text(x) === t('ui.cap.download'));
    expect(b?.props['aria-disabled']).toBe(true);
    expect(b?.props.onClick).toBeUndefined();
    rt.reset();
    rt.state.context = { caps: view(), openCapability: () => {} } satisfies ShellApi;
    expect(button(rt.render(Settings, { deps: NONE, debug: false }), t('ui.cap.download'))).toBeUndefined();
  });

  it('Clear history: confirm in a sheet, then clear; success and failure each say so', async () => {
    const clearHistory = vi.fn<() => Promise<void>>().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('x'));
    const deps = { ...NONE, clearHistory };
    const sheet = (tree: unknown) => ofType(tree, Sheet).find((s) => s.props.title === t('ui.settings.clearHistory')) as El;
    let tree = rt.render(Settings, { deps, debug: false });
    expect(sheet(tree).props.open).toBe(false);
    button(tree, t('ui.settings.clearHistory'))?.onClick?.();
    tree = rt.render(Settings, { deps, debug: false });
    expect(sheet(tree).props.open).toBe(true);
    expect(clearHistory).not.toHaveBeenCalled(); // opening the sheet clears nothing
    const confirm = () => ofType(sheet(tree), Button).find((b) => text(b) === t('ui.settings.clearHistory'))?.props.onClick as () => void;
    confirm()();
    await vi.waitFor(() => expect(clearHistory).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    tree = rt.render(Settings, { deps, debug: false });
    expect(status(tree)).toBe(t('ui.settings.clearHistory.done'));
    expect(sheet(tree).props.open).toBe(false);
    button(tree, t('ui.settings.clearHistory'))?.onClick?.();
    tree = rt.render(Settings, { deps, debug: false });
    confirm()();
    await vi.waitFor(() => expect(clearHistory).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    tree = rt.render(Settings, { deps, debug: false });
    expect(status(tree)).toBe(t('ui.settings.clearHistory.failed'));
  });

  it('Copy ledger receipt copies the receipt text', async () => {
    const copyText = vi.fn(async () => {});
    const deps = { ...NONE, receipt: () => 'RECEIPT', copyText };
    let tree = rt.render(Settings, { deps, debug: false });
    button(tree, t('ui.settings.receipt'))?.onClick?.();
    await vi.waitFor(() => expect(copyText).toHaveBeenCalledWith('RECEIPT'));
    await Promise.resolve();
    tree = rt.render(Settings, { deps, debug: false });
    expect(status(tree)).toBe(t('ui.settings.receipt.copied'));
  });
});
