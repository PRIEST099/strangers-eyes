// T-055: the Vault UI's behaviour through its own hooks (no DOM in Vitest). React's hooks are replaced by a tiny
// single-instance runtime (as in ui/checkState.test.ts): a component is called as a plain function, its effects are
// committed like React would, and the element tree it returns is read and its handlers are called.
//   1. Burn vault: a 1.5 s hold (keyboard or pointer) fires exactly once; an early release never burns; BurnPendingError
//      shows the pending state with a retry and never copy.burn.done, and turns to done once a load succeeds after a
//      vault change (D-93); any other failure is an error with a retry.
//   2. Vault: the list loads on mount and again on every vault change (another tab), the latest load wins, and the
//      subscription ends on unmount; a 21st item is refused with copy.vault.full (AC-082).
//   3. Item form: manual coordinates accept "52.52, 13.405" and reject "95, 10" and "abc" (AC-084); the saved pin is
//      exactly what was entered; a label over 40 characters is refused inline (AC-082); a store refusal shows its copy.
//   4. PinButton: denied → copy.vault.pinDenied, timeout → copy.vault.pinTimeout, a fix → onPin; nothing after unmount.
// T-055 review (D-99): sliding off the button abandons the hold; an outcome while the sheet is closed leaves the next
// open at the confirm step; an assistive-technology click gets an explicit second confirmation; the delete flow.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../core/strings';
import type { Pin, VaultItem } from '../core/types';
import { BurnPendingError, VaultCorruptError } from '../vault/crypto';
import { GeolocationFailure } from '../vault/geolocation';
import { addItems, VaultValidationError } from '../vault/vaultStore';
import { BurnVaultDialog, type BurnDialogDeps } from './components/BurnVaultDialog';
import { Button } from './components/Button';
import { PinButton } from './components/PinButton';
import { Sheet } from './components/Sheet';
import { VaultItemForm } from './components/VaultItemForm';
import { Vault, type VaultDeps } from './screens/Vault';

const rt = vi.hoisted(() => {
  type Deps = readonly unknown[] | undefined;
  type Eff = { deps: Deps; cleanup: (() => void) | undefined; ran: boolean };
  let slots: Array<{ v: unknown }> = [];
  let at = 0;
  let queue: Array<{ e: Eff; fn: () => unknown; deps: Deps }> = [];
  let effs: Eff[] = [];
  let ids = 0;
  let dirty = false;
  const slot = <T>(init: () => T): { v: T } => {
    const k = at++;
    slots[k] ??= { v: init() };
    return slots[k] as { v: T };
  };
  const same = (a: Deps, b: Deps) => a !== undefined && b !== undefined && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const memo = (make: () => unknown, deps: Deps) => {
    const m = slot(() => ({ set: false, deps: undefined as Deps, value: undefined as unknown })).v;
    if (!m.set || !same(deps, m.deps)) Object.assign(m, { set: true, deps, value: make() });
    return m.value;
  };
  const hooks = {
    useState: (init: unknown) => {
      const box = slot(() => {
        const b = {
          value: typeof init === 'function' ? (init as () => unknown)() : init,
          set: (next: unknown) => {
            const v = typeof next === 'function' ? (next as (p: unknown) => unknown)(b.value) : next;
            if (!Object.is(v, b.value)) { b.value = v; dirty = true; }
          },
        };
        return b;
      }).v;
      return [box.value, box.set];
    },
    useRef: (init: unknown) => slot(() => ({ current: init })).v,
    useMemo: (make: () => unknown, deps: Deps) => memo(make, deps),
    useCallback: (fn: unknown, deps: Deps) => memo(() => fn, deps),
    useEffect: (fn: () => unknown, deps: Deps) => {
      const e = slot(() => { const x: Eff = { deps: undefined, cleanup: undefined, ran: false }; effs.push(x); return x; }).v;
      if (!e.ran || !same(deps, e.deps)) queue.push({ e, fn, deps });
    },
    useId: () => slot(() => `id${ids++}`).v,
  };
  const render = <P, R>(c: (p: P) => R, p: P): R => { at = 0; queue = []; dirty = false; return c(p); };
  const commit = () => {
    const run = queue.splice(0);
    for (const { e } of run) { const c = e.cleanup; e.cleanup = undefined; c?.(); }
    for (const { e, fn, deps } of run) {
      const c = fn();
      Object.assign(e, { ran: true, deps, cleanup: typeof c === 'function' ? c : undefined });
    }
  };
  const unmount = () => { for (const e of effs) { const c = e.cleanup; e.cleanup = undefined; c?.(); } };
  const reset = () => { unmount(); slots = []; effs = []; queue = []; at = 0; dirty = false; };
  return { hooks, render, commit, unmount, reset, dirty: () => dirty };
});

vi.mock('react', async (importOriginal) => ({ ...(await importOriginal<typeof import('react')>()), ...rt.hooks }));
vi.mock('../vault/vaultStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../vault/vaultStore')>()),
  addItems: vi.fn(async (items: unknown[]) => items),
  updateItem: vi.fn(async () => ({})),
}));

// ---------- element-tree helpers ----------
type El = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
const isEl = (x: unknown): x is El => typeof x === 'object' && x !== null && 'type' in x && 'props' in x;
function walk(node: unknown, visit: (el: El) => void): void {
  if (Array.isArray(node)) for (const n of node) walk(n, visit);
  else if (isEl(node)) { visit(node); walk(node.props.children, visit); }
}
const all = (tree: unknown, pred: (el: El) => boolean): El[] => { const out: El[] = []; walk(tree, (el) => { if (pred(el)) out.push(el); }); return out; };
const one = (tree: unknown, pred: (el: El) => boolean): El => {
  const found = all(tree, pred);
  if (found.length !== 1) throw new Error(`expected one element, found ${found.length}`);
  return found[0];
};
const text = (node: unknown): string =>
  Array.isArray(node) ? node.map(text).join('')
    : typeof node === 'string' || typeof node === 'number' ? String(node)
    : isEl(node) ? text(node.props.children) : '';
const button = (tree: unknown, label: string) => one(tree, (el) => el.type === Button && text(el.props.children) === label);
const fn = (el: El, name: string) => el.props[name] as (...a: unknown[]) => unknown;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function mount<P>(c: (p: P) => unknown, initial: P) {
  rt.reset();
  let props = initial;
  let tree = rt.render(c, props);
  rt.commit();
  const rerender = () => { tree = rt.render(c, props); rt.commit(); return tree; };
  return {
    get tree() { return tree; },
    rerender,
    /** New props (e.g. the parent closing the sheet), then a render. */
    setProps(next: Partial<P>) { props = { ...props, ...next }; return rerender(); },
    /** Let promises settle, then re-render until no state changed. */
    async settle() {
      for (let i = 0; i < 10; i++) {
        await flush();
        rerender();
        if (!rt.dirty()) { await flush(); if (!rt.dirty()) return; }
      }
    },
  };
}

const key = (k: string, repeat = false) => ({ key: k, repeat, preventDefault: vi.fn() });
const pointer = () => ({ button: 0, pointerId: 1, currentTarget: { setPointerCapture: vi.fn() } });

afterEach(() => { rt.reset(); vi.useRealTimers(); vi.clearAllMocks(); });

// ---------- 1. Burn vault ----------
describe('BurnVaultDialog', () => {
  let listener: (() => void) | null;
  const off = vi.fn();
  const deps = (burn: () => Promise<void>, check: () => Promise<unknown> = () => Promise.reject(new BurnPendingError('se-ledger'))) => ({
    burn: vi.fn(burn),
    watch: vi.fn((l: () => void) => { listener = l; return off; }),
    check: vi.fn(check),
  }) satisfies BurnDialogDeps;
  const holdButton = (tree: unknown) => one(tree, (el) => el.type === Button && typeof el.props.onKeyDown === 'function');
  const status = (tree: unknown) => text(one(tree, (el) => el.props.role === 'status').props.children);

  beforeEach(() => {
    listener = null;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  });

  it('fires once after a 1.5 s keyboard hold; key auto-repeat does not restart it', () => {
    const d = deps(() => new Promise(() => {}));
    const m = mount(BurnVaultDialog, { open: true, onClose: () => {}, deps: d });
    const hold = holdButton(m.tree);
    const down = key(' ');
    fn(hold, 'onKeyDown')(down);
    expect(down.preventDefault).toHaveBeenCalled();   // no page scroll, no synthetic click
    vi.advanceTimersByTime(1000);
    fn(hold, 'onKeyDown')(key(' ', true));
    vi.advanceTimersByTime(499);
    expect(d.burn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(d.burn).toHaveBeenCalledTimes(1);
    fn(hold, 'onKeyUp')(key(' '));
    vi.advanceTimersByTime(5000);
    expect(d.burn).toHaveBeenCalledTimes(1);
  });

  it('never burns on a release before 1.5 s, on blur, or on a pointer cancel', () => {
    const d = deps(() => new Promise(() => {}));
    const m = mount(BurnVaultDialog, { open: true, onClose: () => {}, deps: d });
    const hold = holdButton(m.tree);
    fn(hold, 'onKeyDown')(key('Enter'));
    vi.advanceTimersByTime(1499);
    fn(hold, 'onKeyUp')(key('Enter'));
    fn(hold, 'onPointerDown')(pointer());
    vi.advanceTimersByTime(800);
    fn(hold, 'onBlur')();
    fn(hold, 'onPointerDown')(pointer());
    vi.advanceTimersByTime(800);
    fn(hold, 'onPointerCancel')();
    vi.advanceTimersByTime(10_000);
    expect(d.burn).not.toHaveBeenCalled();
  });

  it('fires after a 1.5 s pointer hold, and ignores a non-primary button and a hold while closed', () => {
    const d = deps(() => new Promise(() => {}));
    const m = mount(BurnVaultDialog, { open: true, onClose: () => {}, deps: d });
    fn(holdButton(m.tree), 'onPointerDown')({ ...pointer(), button: 2 });
    vi.advanceTimersByTime(2000);
    expect(d.burn).not.toHaveBeenCalled();
    const p = pointer();
    fn(holdButton(m.tree), 'onPointerDown')(p);
    expect(p.currentTarget.setPointerCapture).toHaveBeenCalledWith(1);
    vi.advanceTimersByTime(1500);
    expect(d.burn).toHaveBeenCalledTimes(1);

    const closed = deps(() => new Promise(() => {}));
    const c = mount(BurnVaultDialog, { open: false, onClose: () => {}, deps: closed });
    fn(holdButton(c.tree), 'onKeyDown')(key(' '));
    vi.advanceTimersByTime(2000);
    expect(closed.burn).not.toHaveBeenCalled();
  });

  it('success shows copy.burn.done', async () => {
    const d = deps(() => Promise.resolve());
    const m = mount(BurnVaultDialog, { open: true, onClose: () => {}, deps: d });
    fn(holdButton(m.tree), 'onKeyDown')(key(' '));
    vi.advanceTimersByTime(1500);
    await m.settle();
    expect(status(m.tree)).toBe(t('copy.burn.done'));
    expect(button(m.tree, t('ui.close'))).toBeTruthy();
  });

  it('BurnPendingError: pending with a retry, never copy.burn.done, until a load succeeds after a vault change (D-93)', async () => {
    const d = deps(() => Promise.reject(new BurnPendingError('se-sessions')));
    const m = mount(BurnVaultDialog, { open: true, onClose: () => {}, deps: d });
    fn(holdButton(m.tree), 'onKeyDown')(key(' '));
    vi.advanceTimersByTime(1500);
    await m.settle();
    expect(status(m.tree)).toBe(t('ui.burn.pending'));
    expect(text(m.tree)).not.toContain(t('copy.burn.done'));
    expect(t('ui.burn.pending')).not.toMatch(/\btabs?\b/i);   // never blames other tabs alone (T-054)
    expect(d.watch).toHaveBeenCalledTimes(1);
    expect(d.check).toHaveBeenCalledTimes(1);                 // checked once on entry

    // Retry: burns again; still pending.
    fn(button(m.tree, t('ui.burn.retry')), 'onClick')();
    expect(d.burn).toHaveBeenCalledTimes(2);
    await m.settle();
    expect(status(m.tree)).toBe(t('ui.burn.pending'));

    // A vault change whose load still fails: still pending.
    listener?.();
    await m.settle();
    expect(status(m.tree)).toBe(t('ui.burn.pending'));

    // The queued deletions completed: the announced change's load succeeds → done.
    d.check.mockImplementation(() => Promise.resolve([]));
    listener?.();
    await m.settle();
    expect(status(m.tree)).toBe(t('copy.burn.done'));
    expect(off).toHaveBeenCalled();   // the pending watch ended
  });

  it('any other failure is an error with a retry, never done', async () => {
    const d = deps(() => Promise.reject(new Error('deleteVaultKey failed')));
    const m = mount(BurnVaultDialog, { open: true, onClose: () => {}, deps: d });
    fn(holdButton(m.tree), 'onKeyDown')(key(' '));
    vi.advanceTimersByTime(1500);
    await m.settle();
    expect(status(m.tree)).toBe(t('ui.burn.failed'));
    expect(d.watch).not.toHaveBeenCalled();
    d.burn.mockImplementation(() => Promise.resolve());
    fn(button(m.tree, t('ui.burn.retry')), 'onClick')();
    await m.settle();
    expect(status(m.tree)).toBe(t('copy.burn.done'));
  });

  it('sliding the pointer off the button abandons the hold; coming back does not resume it (MAJOR 1)', () => {
    const d = deps(() => new Promise(() => {}));
    const m = mount(BurnVaultDialog, { open: true, onClose: () => {}, deps: d });
    const hold = holdButton(m.tree);
    const target = { setPointerCapture: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 44 }) };
    const at = (clientX: number, clientY: number) => ({ clientX, clientY, currentTarget: target });
    fn(hold, 'onPointerDown')({ button: 0, pointerId: 1, currentTarget: target });
    vi.advanceTimersByTime(500);
    fn(hold, 'onPointerMove')(at(50, 20));    // still on the button
    vi.advanceTimersByTime(500);
    fn(hold, 'onPointerMove')(at(150, 20));   // slid off (the pointer is captured, so the button still sees it)
    vi.advanceTimersByTime(600);
    fn(hold, 'onPointerMove')(at(50, 20));    // back on: no new press, no hold
    fn(hold, 'onPointerUp')();
    fn(hold, 'onClick')();                    // the click after a pointer press means nothing
    vi.advanceTimersByTime(5000);
    m.rerender();
    expect(d.burn).not.toHaveBeenCalled();
    expect(text(m.tree)).not.toContain(t('ui.burn.atConfirm'));

    const again = holdButton(m.tree);
    fn(again, 'onPointerDown')({ button: 0, pointerId: 2, currentTarget: target });
    fn(again, 'onPointerMove')(at(99, 43));   // moving within the box is fine
    vi.advanceTimersByTime(1500);
    expect(d.burn).toHaveBeenCalledTimes(1);
  });

  it('closed mid-burn (Escape): a later success is reported and the next open is the confirm step with its hold button (MAJOR 2)', async () => {
    let finishBurn: () => void = () => {};
    const d = deps(() => new Promise<void>((r) => { finishBurn = r; }));
    const onOutcome = vi.fn();
    const onClose = vi.fn();
    const m = mount(BurnVaultDialog, { open: true, onClose, onOutcome, deps: d });
    fn(holdButton(m.tree), 'onKeyDown')(key(' '));
    vi.advanceTimersByTime(1500);
    await m.settle();
    fn(one(m.tree, (el) => el.type === Sheet), 'onClose')();   // Escape: the sheet's own close
    expect(onClose).toHaveBeenCalled();
    m.setProps({ open: false });
    finishBurn();
    await m.settle();
    expect(onOutcome).toHaveBeenCalledWith('done', false);
    m.setProps({ open: true });
    expect(text(m.tree)).not.toContain(t('copy.burn.done'));
    expect(text(holdButton(m.tree).props.children)).toContain(t('ui.burn.action'));
    expect(holdButton(m.tree).props['aria-disabled']).toBeUndefined();
  });

  it('closed while pending: reopening shows the retry; once the burn finishes while closed, the next open is the confirm step', async () => {
    const d = deps(() => Promise.reject(new BurnPendingError('se-ledger')));
    const onOutcome = vi.fn();
    const m = mount(BurnVaultDialog, { open: true, onClose: () => {}, onOutcome, deps: d });
    fn(holdButton(m.tree), 'onKeyDown')(key(' '));
    vi.advanceTimersByTime(1500);
    await m.settle();
    expect(onOutcome).toHaveBeenLastCalledWith('pending', true);
    fn(one(m.tree, (el) => el.type === Sheet), 'onClose')();
    m.setProps({ open: false });
    m.setProps({ open: true });
    expect(status(m.tree)).toBe(t('ui.burn.pending'));      // still pending: its retry survives a close
    m.setProps({ open: false });
    d.check.mockImplementation(() => Promise.resolve([]));
    listener?.();                                            // the queued deletions completed
    await m.settle();
    expect(onOutcome).toHaveBeenLastCalledWith('done', false);
    m.setProps({ open: true });
    expect(text(m.tree)).not.toContain(t('copy.burn.done'));
    expect(holdButton(m.tree)).toBeTruthy();
  });

  it('closing after done or an error starts over at the confirm step', async () => {
    for (const burn of [() => Promise.resolve(), () => Promise.reject(new Error('x'))]) {
      const d = deps(burn);
      const m = mount(BurnVaultDialog, { open: true, onClose: () => {}, deps: d });
      fn(holdButton(m.tree), 'onKeyDown')(key(' '));
      vi.advanceTimersByTime(1500);
      await m.settle();
      expect(all(m.tree, (el) => el.type === Button && typeof el.props.onKeyDown === 'function')).toHaveLength(0);
      fn(one(m.tree, (el) => el.type === Sheet), 'onClose')();
      await m.settle();
      expect(holdButton(m.tree)).toBeTruthy();
      expect(status(m.tree)).toBe('');
    }
  });

  it('pending: a load that succeeds while a retry is already running never claims done (busy guard)', async () => {
    const d = deps(() => Promise.reject(new BurnPendingError('se-ledger')));
    const m = mount(BurnVaultDialog, { open: true, onClose: () => {}, deps: d });
    fn(holdButton(m.tree), 'onKeyDown')(key(' '));
    vi.advanceTimersByTime(1500);
    await m.settle();
    let loaded: (v: unknown) => void = () => {};
    d.check.mockImplementation(() => new Promise((r) => { loaded = r; }));
    listener?.();                                            // a load is in flight
    d.burn.mockImplementation(() => new Promise(() => {}));
    fn(button(m.tree, t('ui.burn.retry')), 'onClick')();     // the retry starts before that load returns
    loaded([]);
    await m.settle();
    expect(status(m.tree)).toBe(t('ui.burn.burning'));
    expect(d.burn).toHaveBeenCalledTimes(2);
  });

  it('an assistive-technology click (no press before it) gets an explicit second confirmation, never a burn at once', async () => {
    const d = deps(() => new Promise(() => {}));
    const m = mount(BurnVaultDialog, { open: true, onClose: () => {}, deps: d });
    fn(holdButton(m.tree), 'onClick')();
    await m.settle();
    expect(text(m.tree)).toContain(t('ui.burn.atConfirm'));
    expect(d.burn).not.toHaveBeenCalled();
    fn(button(m.tree, t('ui.vault.cancel')), 'onClick')();
    await m.settle();
    expect(text(m.tree)).not.toContain(t('ui.burn.atConfirm'));
    expect(d.burn).not.toHaveBeenCalled();
    fn(holdButton(m.tree), 'onClick')();
    await m.settle();
    fn(button(m.tree, t('ui.burn.atYes')), 'onClick')();
    expect(d.burn).toHaveBeenCalledTimes(1);
    expect(text(m.tree)).not.toMatch(/checkbox/i);
  });

  it('a hold while a burn is running starts no second burn', async () => {
    const d = deps(() => new Promise(() => {}));
    const m = mount(BurnVaultDialog, { open: true, onClose: () => {}, deps: d });
    fn(holdButton(m.tree), 'onKeyDown')(key(' '));
    vi.advanceTimersByTime(1500);
    await m.settle();
    const hold = holdButton(m.tree);
    expect(hold.props['aria-disabled']).toBe(true);
    expect(text(hold.props.children)).toContain(t('ui.burn.burning'));
    fn(hold, 'onKeyUp')(key(' '));
    fn(hold, 'onKeyDown')(key(' '));
    vi.advanceTimersByTime(3000);
    expect(d.burn).toHaveBeenCalledTimes(1);
  });
});

// ---------- 2. Vault list ----------
const pin: Pin = { lat: 1, lng: 2, accuracyM: 30, capturedAt: 1, source: 'geolocation' };
const mk = (n: number, over: Partial<VaultItem> = {}): VaultItem => ({
  id: `vi_${n.toString(16).padStart(12, '0')}`, kind: 'child_name', label: `Name ${n}`, aliases: [], createdAt: 1, ...over,
});

describe('Vault screen', () => {
  type Pending = { res: (v: VaultItem[]) => void; rej: (e: unknown) => void };
  let loads: Pending[];
  let listener: (() => void) | null;
  const off = vi.fn();
  const deps = (): VaultDeps & { load: ReturnType<typeof vi.fn>; watch: ReturnType<typeof vi.fn> } => ({
    load: vi.fn(() => new Promise<VaultItem[]>((res, rej) => loads.push({ res, rej }))),
    remove: vi.fn(async () => {}),
    watch: vi.fn((l: () => void) => { listener = l; return off; }),
  });
  const groups = (tree: unknown) => all(tree, (el) => Array.isArray(el.props.items)).map((el) => (el.props.items as VaultItem[]).map((x) => x.id));

  beforeEach(() => { loads = []; listener = null; });

  it('loads on mount and again on every vault change (another tab); the latest load wins; unsubscribes on unmount', async () => {
    const d = deps();
    const m = mount(Vault, { deps: d });
    expect(d.load).toHaveBeenCalledTimes(1);
    expect(d.watch).toHaveBeenCalledTimes(1);
    loads[0].res([mk(1, { kind: 'home_pin', pin })]);
    await m.settle();
    expect(groups(m.tree)).toEqual([[mk(1).id], []]);

    listener?.();
    expect(d.load).toHaveBeenCalledTimes(2);
    loads[1].res([mk(1, { kind: 'home_pin', pin }), mk(2)]);
    await m.settle();
    expect(groups(m.tree)).toEqual([[mk(1).id], [mk(2).id]]);
    expect(text(m.tree)).toContain('2 / 20');

    listener?.();
    listener?.();
    loads[3].res([mk(9)]);
    loads[2].res([mk(8)]);   // older, resolved last: ignored
    await m.settle();
    expect(groups(m.tree)).toEqual([[], [mk(9).id]]);

    rt.unmount();
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('a burned (empty) vault shows copy.vault.empty and no groups (AC-270)', async () => {
    const d = deps();
    const m = mount(Vault, { deps: d });
    loads[0].res([]);
    await m.settle();
    expect(text(m.tree)).toContain(t('copy.vault.empty'));
    expect(groups(m.tree)).toEqual([]);
    expect(text(m.tree)).toContain('0 / 20');
  });

  it('refuses a 21st item with copy.vault.full and opens no form (AC-082)', async () => {
    const d = deps();
    const m = mount(Vault, { deps: d });
    loads[0].res(Array.from({ length: 20 }, (_, i) => mk(i + 1)));
    await m.settle();
    expect(text(m.tree)).toContain('20 / 20');
    fn(button(m.tree, t('ui.vault.addPlace')), 'onClick')();
    await m.settle();
    expect(text(one(m.tree, (el) => el.props.role === 'status').props.children)).toBe(t('copy.vault.full'));
    const formSheet = all(m.tree, (el) => el.type === Sheet)[0];
    expect(formSheet.props.open).toBe(false);
  });

  it('delete asks first, removes exactly that item, and announces it; a refusal stays in the sheet; Cancel removes nothing', async () => {
    const d = deps();
    const m = mount(Vault, { deps: d });
    const a = mk(1);
    const b = mk(2);
    loads[0].res([a, b]);
    await m.settle();
    const details = () => one(m.tree, (el) => el.props.titleId === 'ui.vault.details');
    const deleteSheet = () => one(m.tree, (el) => el.type === Sheet && el.props.title === t('ui.vault.deleteTitle'));

    fn(details(), 'onDelete')(b);
    await m.settle();
    expect(deleteSheet().props.open).toBe(true);
    expect(text(deleteSheet().props.children)).toContain('Name 2');
    fn(button(deleteSheet(), t('ui.vault.cancel')), 'onClick')();
    await m.settle();
    expect(deleteSheet().props.open).toBe(false);
    expect(d.remove).not.toHaveBeenCalled();

    vi.mocked(d.remove).mockRejectedValueOnce(new VaultValidationError('not_found'));
    fn(details(), 'onDelete')(b);
    await m.settle();
    fn(button(deleteSheet(), t('ui.vault.delete')), 'onClick')();
    await m.settle();
    expect(deleteSheet().props.open).toBe(true);
    expect(text(one(deleteSheet(), (el) => el.props.role === 'alert').props.children)).toBe(t('ui.vault.error.notFound'));

    fn(button(deleteSheet(), t('ui.vault.delete')), 'onClick')();
    await m.settle();
    expect(d.remove).toHaveBeenLastCalledWith(b.id);
    expect(deleteSheet().props.open).toBe(false);
    expect(groups(m.tree)).toEqual([[], [a.id]]);
    expect(text(one(m.tree, (el) => el.props.role === 'status').props.children)).toBe(t('ui.vault.deleted'));
  });

  it('a vault change clears the old status line; a burn the closed sheet could not show is announced here (D-99)', async () => {
    const d = deps();
    const m = mount(Vault, { deps: d });
    loads[0].res([mk(1)]);
    await m.settle();
    const statusLine = () => text(one(m.tree, (el) => el.props.role === 'status').props.children);
    fn(one(m.tree, (el) => el.props.titleId === 'ui.vault.details'), 'onDelete')(mk(1));
    await m.settle();
    fn(button(one(m.tree, (el) => el.type === Sheet && el.props.title === t('ui.vault.deleteTitle')), t('ui.vault.delete')), 'onClick')();
    await m.settle();
    expect(statusLine()).toBe(t('ui.vault.deleted'));
    listener?.();   // e.g. a burn, or another tab
    m.rerender();
    expect(statusLine()).toBe('');

    const dialog = () => one(m.tree, (el) => el.type === BurnVaultDialog);
    fn(dialog(), 'onOutcome')('done', true);
    m.rerender();
    expect(statusLine()).toBe('');
    fn(dialog(), 'onOutcome')('done', false);
    m.rerender();
    expect(statusLine()).toBe(t('copy.burn.done'));
  });

  it('opens the add form below 20, and shows a load failure with its copy', async () => {
    const d = deps();
    const m = mount(Vault, { deps: d });
    loads[0].res([mk(1)]);
    await m.settle();
    fn(button(m.tree, t('ui.vault.addDetail')), 'onClick')();
    await m.settle();
    expect(all(m.tree, (el) => el.type === Sheet)[0].props.open).toBe(true);
    expect(all(m.tree, (el) => el.type === VaultItemForm)[0].props.group).toBe('detail');

    const e = deps();
    const n = mount(Vault, { deps: e });
    loads[1].rej(new VaultCorruptError());
    await n.settle();
    expect(text(one(n.tree, (el) => el.props.role === 'alert').props.children)).toBe(t('ui.vault.error.corrupt'));
  });
});

// ---------- 3. Item form ----------
describe('VaultItemForm', () => {
  const add = vi.mocked(addItems);
  const fieldErrors = (tree: unknown) => all(tree, (el) => 'copy' in el.props).map((el) => el.props.copy).filter(Boolean);
  const manualInput = (tree: unknown) => one(tree, (el) => el.type === 'input' && el.props.inputMode === 'decimal');
  const typeInto = (el: El, value: string) => fn(el, 'onChange')({ target: { value } });
  const submit = async (tree: unknown) => fn(one(tree, (el) => el.type === 'form'), 'onSubmit')({ preventDefault: () => {} });

  it('manual coordinates: rejects "95, 10" and "abc", accepts "52.52, 13.405", and saves exactly that pin (AC-083/084)', async () => {
    const onSaved = vi.fn();
    const m = mount(VaultItemForm, { group: 'place', onSaved, onCancel: () => {} });
    fn(button(m.tree, t('ui.vault.manual.link')), 'onClick')();
    await m.settle();

    typeInto(manualInput(m.tree), '95, 10');
    m.rerender();
    fn(button(m.tree, t('ui.vault.manual.use')), 'onClick')();
    m.rerender();
    expect(fieldErrors(m.tree)).toEqual(['ui.vault.manual.range']);

    typeInto(manualInput(m.tree), 'abc');
    m.rerender();
    fn(manualInput(m.tree), 'onKeyDown')({ key: 'Enter', preventDefault: () => {} });
    m.rerender();
    expect(fieldErrors(m.tree)).toEqual(['ui.vault.manual.format']);
    await submit(m.tree);
    expect(add).not.toHaveBeenCalled();

    typeInto(manualInput(m.tree), '52.52, 13.405');
    m.rerender();
    fn(button(m.tree, t('ui.vault.manual.use')), 'onClick')();
    m.rerender();
    expect(fieldErrors(m.tree)).toEqual([]);
    expect(text(m.tree)).toContain(t('ui.vault.pin.manualSet'));
    expect(text(m.tree)).not.toMatch(/52[.,]52|13[.,]405/);   // shown text never echoes the coordinates (D-92)

    await submit(m.tree);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0][0]).toEqual([{
      id: expect.stringMatching(/^vi_[0-9a-f]{12}$/), kind: 'home_pin', label: '', aliases: [],
      pin: { lat: 52.52, lng: 13.405, accuracyM: 0, capturedAt: expect.any(Number), source: 'manual' },
    }]);
    expect(onSaved).toHaveBeenCalledWith('added');
  });

  it('Save applies typed coordinates that were not applied yet, and refuses a place with no pin', async () => {
    const m = mount(VaultItemForm, { group: 'place', onSaved: () => {}, onCancel: () => {} });
    await submit(m.tree);
    m.rerender();
    expect(fieldErrors(m.tree)).toEqual(['ui.vault.error.pinRequired']);
    expect(add).not.toHaveBeenCalled();

    fn(button(m.tree, t('ui.vault.manual.link')), 'onClick')();
    await m.settle();
    typeInto(manualInput(m.tree), '-33.9, 151.2');
    m.rerender();
    await submit(m.tree);
    expect(add.mock.calls[0][0]).toMatchObject([{ pin: { lat: -33.9, lng: 151.2, source: 'manual' } }]);
  });

  it('a fix from Pin this place is kept with its accuracy; worse than 250 m shows copy.vault.lowAccuracy', async () => {
    const m = mount(VaultItemForm, { group: 'place', onSaved: () => {}, onCancel: () => {} });
    const far: Pin = { lat: 1, lng: 2, accuracyM: 912.4, capturedAt: 3, source: 'geolocation' };
    fn(one(m.tree, (el) => el.type === PinButton), 'onPin')(far);
    m.rerender();
    expect(text(m.tree)).toContain(t('ui.vault.pin.got', { m: 913 }));          // 912.4 m, rounded up (D-99)
    expect(text(m.tree)).toContain(t('copy.vault.lowAccuracy', { m: 913 }));
    await submit(m.tree);
    expect(add.mock.calls[0][0]).toMatchObject([{ kind: 'home_pin', pin: far }]);
  });

  it('a home pin with an area saves both in one call, the area linked to that pin; a full vault says the area counts', async () => {
    const m = mount(VaultItemForm, { group: 'place', onSaved: () => {}, onCancel: () => {} });
    fn(one(m.tree, (el) => el.type === PinButton), 'onPin')({ lat: 1, lng: 2, accuracyM: 20, capturedAt: 3, source: 'geolocation' });
    m.rerender();
    typeInto(one(m.tree, (el) => el.type === 'input' && String(el.props.id).endsWith('-area')), 'Elm Quarter');
    m.rerender();
    await submit(m.tree);
    const [items] = add.mock.calls[0] as [Array<{ id?: string; kind: string; linkedPinId?: string }>];
    expect(items.map((x) => x.kind)).toEqual(['home_pin', 'area_name']);
    expect(items[0].id).toMatch(/^vi_[0-9a-f]{12}$/);
    expect(items[1].linkedPinId).toBe(items[0].id);

    add.mockRejectedValueOnce(new VaultValidationError('full'));
    const n = mount(VaultItemForm, { group: 'place', onSaved: () => {}, onCancel: () => {} });
    fn(one(n.tree, (el) => el.type === PinButton), 'onPin')({ lat: 1, lng: 2, accuracyM: 20, capturedAt: 3, source: 'geolocation' });
    n.rerender();
    typeInto(one(n.tree, (el) => el.type === 'input' && String(el.props.id).endsWith('-area')), 'Elm Quarter');
    n.rerender();
    await submit(n.tree);
    await n.settle();
    expect(fieldErrors(n.tree)).toEqual(['ui.vault.error.fullWithArea']);
  });

  it('a pin failure reveals the manual field', async () => {
    const m = mount(VaultItemForm, { group: 'place', onSaved: () => {}, onCancel: () => {} });
    expect(all(m.tree, (el) => el.type === 'input' && el.props.inputMode === 'decimal')).toHaveLength(0);
    fn(one(m.tree, (el) => el.type === PinButton), 'onFailure')('denied');
    await m.settle();
    expect(manualInput(m.tree)).toBeTruthy();
  });

  it('refuses a label over 40 characters inline, before any store call (AC-082)', async () => {
    const m = mount(VaultItemForm, { group: 'detail', onSaved: () => {}, onCancel: () => {} });
    const label = one(m.tree, (el) => el.type === 'input' && el.props.type === 'text' && el.props.inputMode === undefined
      && String(el.props.id).endsWith('-label'));
    typeInto(label, 'x'.repeat(41));
    m.rerender();
    expect(fieldErrors(m.tree)).toEqual(['ui.vault.error.labelTooLong']);
    await submit(m.tree);
    expect(add).not.toHaveBeenCalled();
  });

  it('shows a store refusal with its copy (a 21st item from a race: copy.vault.full)', async () => {
    add.mockRejectedValueOnce(new VaultValidationError('full'));
    const onSaved = vi.fn();
    const m = mount(VaultItemForm, { group: 'detail', onSaved, onCancel: () => {} });
    const label = one(m.tree, (el) => el.type === 'input' && String(el.props.id).endsWith('-label'));
    typeInto(label, 'Lucas');
    m.rerender();
    await submit(m.tree);
    await m.settle();
    expect(text(one(m.tree, (el) => el.props.role === 'alert').props.children)).toBe(t('copy.vault.full'));
    expect(onSaved).not.toHaveBeenCalled();
  });
});

// ---------- 4. PinButton ----------
describe('PinButton', () => {
  const live = (tree: unknown) => text(one(tree, (el) => el.props['aria-live'] === 'polite').props.children);

  it.each([
    ['denied', 'copy.vault.pinDenied'],
    ['timeout', 'copy.vault.pinTimeout'],
    ['unavailable', 'copy.vault.pinTimeout'],
  ] as const)('%s → %s, and onFailure', async (reason, copy) => {
    const onFailure = vi.fn();
    const onPin = vi.fn();
    const m = mount(PinButton, { onPin, onFailure, locate: () => Promise.reject(new GeolocationFailure(reason)) });
    fn(button(m.tree, t('ui.vault.pin.button')), 'onClick')();
    m.rerender();
    expect(text(m.tree)).toContain(t('ui.vault.pin.locating'));
    await m.settle();
    expect(live(m.tree)).toBe(t(copy));
    expect(onFailure).toHaveBeenCalledWith(reason);
    expect(onPin).not.toHaveBeenCalled();
  });

  it('nothing is reported after unmount (the sheet closed while locating)', async () => {
    let answer: (p: Pin) => void = () => {};
    let fail: (e: unknown) => void = () => {};
    const onPin = vi.fn();
    const onFailure = vi.fn();
    const m = mount(PinButton, { onPin, onFailure, locate: () => new Promise<Pin>((r, j) => { answer = r; fail = j; }) });
    fn(button(m.tree, t('ui.vault.pin.button')), 'onClick')();
    rt.unmount();
    answer({ lat: 5, lng: 6, accuracyM: 12, capturedAt: 7, source: 'geolocation' });
    fail(new GeolocationFailure('denied'));
    await flush();
    expect(onPin).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('a fix goes to onPin; a second press while locating reads the position only once', async () => {
    const fix: Pin = { lat: 5, lng: 6, accuracyM: 12, capturedAt: 7, source: 'geolocation' };
    let resolve: (p: Pin) => void = () => {};
    const locate = vi.fn(() => new Promise<Pin>((r) => { resolve = r; }));
    const onPin = vi.fn();
    const m = mount(PinButton, { onPin, locate });
    fn(button(m.tree, t('ui.vault.pin.button')), 'onClick')();
    m.rerender();
    fn(button(m.tree, t('ui.vault.pin.locating')), 'onClick')();
    expect(locate).toHaveBeenCalledTimes(1);
    resolve(fix);
    await m.settle();
    expect(onPin).toHaveBeenCalledWith(fix);
    expect(live(m.tree)).toBe('');
  });
});
