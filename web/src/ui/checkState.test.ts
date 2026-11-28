// T-053 fix round 3: the Check screen's import state, driven through the real components (no DOM in Vitest).
//   1. checkReducer: selecting a step never touches the import status; only an importStatus action replaces it.
//   2. Check itself (its hooks, its props to StepperNav and ImportDropzone): a step round trip keeps the status.
//   3. ImportDropzone itself: the parent gets the settled status even when the dropzone unmounted mid-import.
// React's hooks are replaced by a tiny single-instance runtime (below), so a component is called as a plain function
// and its returned element tree is read: the props it hands its children ARE its behaviour here. Nothing is rendered.
// Fix round 4: every Check render is committed (rt.draw), so an effect Check registers runs exactly as React would run
// it (an effect that reset the status on a step change passed before), and a dropzone is unmounted after its import
// SETTLED too (a cleanup that reported `idle` on unmount passed before).
// T-068 (D-121): selectStep only revisits a step already reached; Import → Pre-screen is `continue`, and only while a
// photo is held; a new import attempt drops the pre-screen and every later step. The pre-screen's own transitions are
// pinned in check/prescreenState.test.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GpsPinLike } from '../tier0/gpsWarning';
import type { ImportedPhoto, ImportResult } from '../tier0/importPhoto';
import { CHECK_START, FIX_IDLE, FLOW_IDLE, PRESCREEN_IDLE, REATTACK_IDLE, checkReducer, type CheckState } from './checkState';
import { Button } from './components/Button';
import { ImportDropzone, type ImportDropzoneProps } from './components/ImportDropzone';
import { PrescreenPanel } from './components/PrescreenPanel';
import { StepperNav } from './components/StepperNav';
import { IMPORT_IDLE, resultStatus, type ImportStatus } from './importTransfer';
import { STEPPER_START } from './layout';
import { Check } from './screens/Check';

/**
 * One component instance's hook slots, in call order, like React's own (the rules of hooks make this sound). Effects,
 * callbacks and memos keep React's dependency semantics: an effect runs at the commit after a render whose deps
 * changed (its previous cleanup first), and a callback keeps its identity while its deps are unchanged.
 */
const rt = vi.hoisted(() => {
  type Slot = { v: unknown };
  type Deps = readonly unknown[] | undefined;
  type Effect = () => void | (() => void);
  type EffectSlot = { ran: boolean; deps: Deps; cleanup: (() => void) | undefined };
  type MemoSlot = { set: boolean; deps: Deps; value: unknown };
  let slots: Slot[] = [];
  let at = 0;
  let pending: Array<{ e: EffectSlot; fn: Effect; deps: Deps }> = [];
  let effects: EffectSlot[] = [];
  let dirty = false; // a state update since the last render
  let refObjs: Array<{ current: unknown }> = []; // every useRef object of this instance, so tests can read a ref
  const slot = (init: () => unknown): Slot => {
    const k = at++;
    slots[k] ??= { v: init() };
    return slots[k];
  };
  const same = (a: Deps, b: Deps) => a !== undefined && b !== undefined && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const memo = (make: () => unknown, deps: Deps) => {
    const m = slot(() => ({ set: false, deps: undefined, value: undefined })).v as MemoSlot;
    if (!m.set || !same(deps, m.deps)) Object.assign(m, { set: true, deps, value: make() });
    return m.value;
  };
  const update = (s: Slot, next: unknown) => { if (!Object.is(next, s.v)) { s.v = next; dirty = true; } };
  const unmount = () => { for (const e of effects) { const c = e.cleanup; e.cleanup = undefined; c?.(); } };
  const render = <P, R>(component: (p: P) => R, props: P): R => { at = 0; pending = []; return component(props); };
  /** Run the effects of the last render whose deps changed (their previous cleanups first), as React does at a commit. */
  const commit = () => {
    const run = pending.splice(0);
    for (const { e } of run) { const c = e.cleanup; e.cleanup = undefined; c?.(); }
    for (const { e, fn, deps } of run) {
      const c = fn();
      Object.assign(e, { ran: true, deps, cleanup: typeof c === 'function' ? c : undefined });
    }
  };
  return {
    /** A new instance: every hook starts from its initial value. */
    reset() { unmount(); slots = []; effects = []; at = 0; pending = []; dirty = false; refObjs = []; },
    /** The instance's useRef objects, in creation order. */
    refs: () => refObjs,
    render,
    commit,
    /** render + commit, repeated while the commit's effects updated state (React re-renders then): the settled tree. */
    draw<P, R>(component: (p: P) => R, props: P): R {
      for (let n = 0; n < 10; n++) {
        dirty = false;
        const tree = render(component, props);
        commit();
        if (!dirty) return tree;
      }
      throw new Error('effects keep updating state: a render loop');
    },
    unmount,
    hooks: {
      useRef: (init: unknown) => slot(() => { const ref = { current: init }; refObjs.push(ref); return ref; }).v,
      useState: (init: unknown) => {
        const s = slot(() => (typeof init === 'function' ? (init as () => unknown)() : init));
        return [s.v, (x: unknown) => update(s, typeof x === 'function' ? (x as (p: unknown) => unknown)(s.v) : x)];
      },
      useReducer: (reducer: (s: unknown, a: unknown) => unknown, init: unknown) => {
        const s = slot(() => init);
        return [s.v, (a: unknown) => update(s, reducer(s.v, a))];
      },
      useCallback: (fn: unknown, deps?: readonly unknown[]) => memo(() => fn, deps),
      useMemo: (fn: () => unknown, deps?: readonly unknown[]) => memo(fn, deps),
      useEffect: (fn: Effect, deps?: readonly unknown[]) => {
        const e = slot(() => {
          const fresh: EffectSlot = { ran: false, deps: undefined, cleanup: undefined };
          effects.push(fresh);
          return fresh;
        }).v as EffectSlot;
        if (!e.ran || deps === undefined || !same(deps, e.deps)) pending.push({ e, fn, deps });
      },
      useId: () => { at++; return ':r0:'; },
      // D-182: Check reads the connection and the Ledger (store hooks): the static-render snapshot, as on a server.
      useSyncExternalStore: (_subscribe: unknown, get: () => unknown, server?: () => unknown) => (server ?? get)(),
    },
    importPhoto: vi.fn<(file: unknown, opts: { pins: readonly GpsPinLike[] }) => Promise<ImportResult>>(),
    runPrescreen: vi.fn((..._args: unknown[]) => new Promise<never>(() => {})), // Tier-0 never settles here: the step shows its progress
  };
});
vi.mock('react', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...rt.hooks }));
vi.mock('./hooks/useOcrWarm', () => ({ useOcrWarm: () => undefined })); // no Tesseract worker in Node
vi.mock('./check/runPrescreen', () => ({ runPrescreen: rt.runPrescreen })); // no MediaPipe or Tesseract in Node
vi.mock('../tier0/importPhoto', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), importPhoto: rt.importPhoto }));

interface El { type: unknown; props: Record<string, unknown> & { children?: unknown } }
/** Every element of `type` in a tree returned by a component (function components are not entered). */
function find(node: unknown, type: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) { for (const n of node) find(n, type, out); return out; }
  if (node === null || typeof node !== 'object' || !('props' in node)) return out;
  const el = node as El;
  if (el.type === type) out.push(el);
  find(el.props.children, type, out);
  return out;
}
function only(node: unknown, type: unknown): El {
  const all = find(node, type);
  expect(all).toHaveLength(1);
  return all[0];
}

/** The Import step's "Continue to pre-screen" button. */
function continueButton(tree: unknown): El {
  const all = find(tree, Button).filter((b) => b.props['data-action'] === 'continue');
  expect(all).toHaveLength(1);
  return all[0];
}

const PIN: GpsPinLike = { kind: 'home_pin', lat: 10, lng: 20 };
const NEAR_HOME: ImportedPhoto['gpsWarning'] = { near: [{ band: 'street', kind: 'home_pin', kindDisplay: 'HOME' }] };
const photo = (): ImportedPhoto => ({
  ok: true, master: {} as HTMLCanvasElement, jpeg: new Blob([]), width: 100, height: 200, sha256: '0'.repeat(64),
  format: 'jpeg', hadGps: true, orientation: null, gpsWarning: NEAR_HOME,
});
const READY = resultStatus(photo());
const BUSY: ImportStatus = { kind: 'busy' };
const HEIC_ERROR: ImportStatus = { kind: 'error', copyId: 'copy.import.heic' };

afterEach(() => {
  rt.reset();
  rt.importPhoto.mockReset();
  rt.runPrescreen.mockClear();
  vi.unstubAllGlobals();
});

describe('checkReducer: the step and the import status are independent', () => {
  it('selectStep revisits a reached step and keeps the import status, whatever it is', () => {
    for (const importStatus of [IMPORT_IDLE, BUSY, HEIC_ERROR, READY]) {
      const s: CheckState = { pos: { current: 'prescreen', reached: 'prescreen' }, importStatus, prescreen: PRESCREEN_IDLE, epoch: 0, flow: FLOW_IDLE, fix: FIX_IDLE, reattack: REATTACK_IDLE };
      const back = checkReducer(s, { type: 'selectStep', step: 'import' });
      expect(back.pos).toEqual({ current: 'import', reached: 'prescreen' }); // a revisit keeps `reached`
      expect(back.importStatus).toBe(importStatus);
      const again = checkReducer(back, { type: 'selectStep', step: 'prescreen' });
      expect(again.pos).toEqual({ current: 'prescreen', reached: 'prescreen' });
      expect(again.importStatus).toBe(importStatus);
    }
  });

  it('selectStep never jumps ahead of the furthest step reached (D-121)', () => {
    for (const importStatus of [IMPORT_IDLE, BUSY, HEIC_ERROR, READY]) {
      const s: CheckState = { pos: STEPPER_START, importStatus, prescreen: PRESCREEN_IDLE, epoch: 0, flow: FLOW_IDLE, fix: FIX_IDLE, reattack: REATTACK_IDLE };
      for (const step of ['prescreen', 'send', 'attack'] as const) expect(checkReducer(s, { type: 'selectStep', step })).toBe(s);
    }
  });

  it('continue moves Import → Pre-screen only while a photo is ready', () => {
    for (const importStatus of [IMPORT_IDLE, BUSY, HEIC_ERROR]) {
      const s: CheckState = { pos: STEPPER_START, importStatus, prescreen: PRESCREEN_IDLE, epoch: 0, flow: FLOW_IDLE, fix: FIX_IDLE, reattack: REATTACK_IDLE };
      expect(checkReducer(s, { type: 'continue' })).toBe(s);
    }
    const ready: CheckState = { pos: STEPPER_START, importStatus: READY, prescreen: PRESCREEN_IDLE, epoch: 0, flow: FLOW_IDLE, fix: FIX_IDLE, reattack: REATTACK_IDLE };
    expect(checkReducer(ready, { type: 'continue' }).pos).toEqual({ current: 'prescreen', reached: 'prescreen' });
  });

  it('importStatus replaces the status and drops every step after Import (a new photo; D-121)', () => {
    const s: CheckState = { pos: { current: 'import', reached: 'send' }, importStatus: READY, prescreen: PRESCREEN_IDLE, epoch: 0, flow: FLOW_IDLE, fix: FIX_IDLE, reattack: REATTACK_IDLE };
    const busy = checkReducer(s, { type: 'importStatus', status: BUSY });
    expect(busy).toEqual({ pos: STEPPER_START, importStatus: BUSY, prescreen: PRESCREEN_IDLE, epoch: 1, flow: { ...FLOW_IDLE, run: 1 }, fix: FIX_IDLE, reattack: { ...REATTACK_IDLE, run: 1 } });
    expect(checkReducer(busy, { type: 'importStatus', status: HEIC_ERROR }).importStatus).toBe(HEIC_ERROR);
  });

  it('a new Check starts on Import, idle', () => {
    expect(CHECK_START).toEqual({ pos: STEPPER_START, importStatus: IMPORT_IDLE, prescreen: PRESCREEN_IDLE, epoch: 0, flow: FLOW_IDLE, fix: FIX_IDLE, reattack: REATTACK_IDLE });
    expect(Object.isFrozen(CHECK_START)).toBe(true);
  });
});

describe("Check's own state: the import status survives a step round trip (the dropzone unmounts meanwhile)", () => {
  const draw = () => rt.draw(Check, {}); // render + commit: Check's effects run, as in the browser

  it('Import → ready (with the GPS warning) → another step → Import: the remounted dropzone gets the same status', () => {
    let tree = draw();
    let dz = only(tree, ImportDropzone).props as unknown as ImportDropzoneProps;
    expect(dz.status).toBe(IMPORT_IDLE);
    dz.onPhoto(photo()); // the dropzone settles: the photo, then its status
    dz.onStatus(READY);
    tree = draw();
    expect((only(tree, ImportDropzone).props as unknown as ImportDropzoneProps).status).toBe(READY);
    // Check's own invariant: `ready` exactly while the master ref is set (final review: pinned only by a regex before).
    const master = rt.refs().find((x) => x.current !== null && typeof x.current === 'object' && 'sha256' in x.current);
    expect(master?.current).toMatchObject({ sha256: '0'.repeat(64) });

    (continueButton(tree).props.onClick as () => void)(); // "Continue to pre-screen"
    tree = draw();
    expect(find(tree, ImportDropzone)).toHaveLength(0); // another step: no dropzone
    expect(only(tree, StepperNav).props).toMatchObject({ current: 'prescreen', reached: 'prescreen' });
    expect(rt.runPrescreen).toHaveBeenCalledTimes(1); // Tier-0 started on the held photo (AC-100)
    expect((rt.runPrescreen.mock.calls[0][2] as { isCurrent: () => boolean }).isCurrent()).toBe(true);
    expect(only(tree, PrescreenPanel).props.state).toMatchObject({ kind: 'running', run: 1, sha256: '0'.repeat(64) }); // the run number is the epoch (D-133)

    (only(tree, StepperNav).props.onSelect as (s: string) => void)('import');
    tree = draw();
    dz = only(tree, ImportDropzone).props as unknown as ImportDropzoneProps;
    expect(dz.status).toBe(READY); // the panel for the photo Check still holds, not an idle dropzone
    expect(master?.current).toMatchObject({ sha256: '0'.repeat(64) }); // …and Check still holds that photo
    expect(only(tree, StepperNav).props).toMatchObject({ current: 'import', reached: 'prescreen' });
    // Back on Pre-screen: the run in progress is kept, never started twice.
    (only(tree, StepperNav).props.onSelect as (s: string) => void)('prescreen');
    tree = draw();
    expect(rt.runPrescreen).toHaveBeenCalledTimes(1);
    (only(tree, StepperNav).props.onSelect as (s: string) => void)('import');
    tree = draw();
    dz = only(tree, ImportDropzone).props as unknown as ImportDropzoneProps;

    // A new attempt replaces it: the dropzone clears the photo and reports busy; the later steps are gone.
    dz.onPhoto(null);
    dz.onStatus(BUSY);
    tree = draw();
    expect((only(tree, ImportDropzone).props as unknown as ImportDropzoneProps).status).toEqual(BUSY);
    expect(master?.current).toBeNull();
    expect(only(tree, StepperNav).props).toMatchObject({ current: 'import', reached: 'import' });
    // the run of the replaced photo is told it is superseded (D-133): its readers not started yet are skipped
    const opts = rt.runPrescreen.mock.calls[0][2] as { isCurrent: () => boolean };
    expect(opts.isCurrent()).toBe(false);
    expect(find(tree, Button).filter((b) => b.props['data-action'] === 'continue')).toHaveLength(0); // no photo, no Continue
  });

  it('a busy import survives the round trip too, so the remounted step still refuses a second photo', () => {
    (only(draw(), ImportDropzone).props as unknown as ImportDropzoneProps).onStatus(BUSY);
    for (const step of ['attack', 'import']) (only(draw(), StepperNav).props.onSelect as (s: string) => void)(step);
    expect((only(draw(), ImportDropzone).props as unknown as ImportDropzoneProps).status).toBe(BUSY);
  });

  it("Check sends importStatus only from the dropzone's onStatus, never from an effect or a step change (source pin)", () => {
    const src = readFileSync(fileURLToPath(new URL('./screens/Check.tsx', import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''); // the comments name importStatus too
    // Every dispatch( call, by the action type it sends (a non-literal action is listed as such, and fails).
    const sent = [...src.matchAll(/\bdispatch\s*\(\s*(?:\{\s*type:\s*'(\w+)')?/g)].map((m) => m[1] ?? '(not a literal action)');
    expect(sent.sort()).toEqual([
      'applyFix', 'attackDone', 'cancelFix', 'cancelResend', 'cancelSend', 'continue', 'edit', 'importStatus', 'preflightDone', 'preflightStart',
      'prescreenDone', 'prescreenStart', 'prescreenStep', 'reattackDone', 'reattackSettle', 'reflightDone', 'reflightStart', 'resent', 'retry',
      'retryAttack', 'retryReattack', 'selectStep', 'sent', 'toFix', 'toReattack', 'toSend', 'toVerdict', 'toggleFixCrop', 'toggleFixMask',
    ]);
    expect(src.match(/type:\s*'importStatus'/g)).toHaveLength(1); // only onImportStatus sends it
    expect(src).toMatch(/\bonImportStatus\s*=\s*useCallback\(\s*\(\s*status(?:\s*:\s*ImportStatus)?\s*\)\s*=>\s*dispatch\(\{\s*type:\s*'importStatus',\s*status\s*\}\)/);
    expect(src).toMatch(/\bonStatus=\{onImportStatus\}/);
  });
});

describe('ImportDropzone: the parent always gets the settled status, even after the dropzone unmounted mid-import', () => {
  const file = { type: 'image/jpeg', name: 'a.jpg' } as unknown as File;
  const drop = { preventDefault() {}, stopPropagation() {}, dataTransfer: { files: [file], items: [], types: ['Files'] } };
  const flush = () => new Promise<void>((r) => setTimeout(r, 0));

  /** Mount, drop a file, (optionally) unmount before importPhoto settles, then settle it. The parent's calls, in order. */
  async function dropThen(settle: (r: { ok: (v: ImportResult) => void; fail: (e: unknown) => void }) => void, leave: boolean) {
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    let ok!: (v: ImportResult) => void;
    let fail!: (e: unknown) => void;
    rt.importPhoto.mockImplementationOnce(() => new Promise<ImportResult>((res, rej) => { ok = res; fail = rej; }));
    const calls: unknown[] = [];
    const props: ImportDropzoneProps = {
      getPins: async () => [PIN], status: IMPORT_IDLE,
      onStatus: (s) => { calls.push(['status', s]); }, onPhoto: (p) => { calls.push(['photo', p]); },
    };
    const tree = rt.render(ImportDropzone, props);
    rt.commit(); // mounted
    (only(tree, 'button').props.onDrop as (e: unknown) => void)(drop);
    expect(calls).toEqual([['photo', null], ['status', BUSY]]);
    await flush(); // getPins resolved; importPhoto is pending
    expect(rt.importPhoto).toHaveBeenCalledTimes(1);
    expect(rt.importPhoto.mock.calls[0].slice(0, 2)).toEqual([file, { pins: [PIN] }]);
    if (leave) rt.unmount(); // the user opened another step: Check unmounts the dropzone
    settle({ ok, fail });
    await flush();
    return calls;
  }

  // Fix round 4: leaving the step AFTER the import settled (or with no import at all) must not touch the parent's
  // status or photo: an unmount cleanup that reported `idle` would wipe "Photo ready" while Check still holds the photo.
  it.each([
    ['ready', READY],
    ['idle', IMPORT_IDLE],
    ['a HEIC error', HEIC_ERROR],
    ['busy (remounted after a round trip mid-import)', BUSY], // final review: a mount-time reset of busy survived
  ] as Array<[string, ImportStatus]>)('unmounting a settled dropzone (%s) calls neither onStatus nor onPhoto', (_, status) => {
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const calls: unknown[] = [];
    rt.render(ImportDropzone, {
      getPins: async () => [PIN], status,
      onStatus: (s) => { calls.push(['status', s]); }, onPhoto: (p) => { calls.push(['photo', p]); },
    } satisfies ImportDropzoneProps);
    rt.commit(); // mounted: its window listeners are added
    rt.unmount(); // the user opened another step
    expect(calls).toEqual([]);
    expect(rt.importPhoto).not.toHaveBeenCalled();
  });

  it('an import that settled while mounted: leaving the step afterwards reports nothing more', async () => {
    const p = photo();
    const calls = await dropThen((r) => r.ok(p), false);
    const settled = [...calls];
    rt.unmount();
    expect(calls).toEqual(settled);
    expect(settled).toEqual([['photo', null], ['status', BUSY], ['photo', p], ['status', READY]]);
  });

  for (const leave of [false, true]) {
    const when = leave ? 'after the step was left' : 'while mounted';
    it(`success ${when}: onPhoto(photo), then onStatus(ready)`, async () => {
      const p = photo();
      expect(await dropThen((r) => r.ok(p), leave)).toEqual([['photo', null], ['status', BUSY], ['photo', p], ['status', READY]]);
    });
    it(`a typed error ${when}: onStatus(error), no photo`, async () => {
      const calls = await dropThen((r) => r.ok({ ok: false, code: 'heic', copyId: 'copy.import.heic' }), leave);
      expect(calls).toEqual([['photo', null], ['status', BUSY], ['status', HEIC_ERROR]]);
    });
    it(`importPhoto throws ${when}: onStatus(unsupported), no photo`, async () => {
      const calls = await dropThen((r) => r.fail(new Error('boom')), leave);
      expect(calls).toEqual([['photo', null], ['status', BUSY], ['status', { kind: 'error', copyId: 'copy.import.unsupported' }]]);
    });
  }
});
