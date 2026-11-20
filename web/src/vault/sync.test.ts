// T-054 review: the in-memory vault index follows every vault change, in this tab and in every other tab
// (ARCH §8.4 "rebuilt on every vault edit, emptied by burn"; §16.4 step 4). Two vaultScan instances over the same
// IndexedDB stand in for two tabs; a raw BroadcastChannel stands in for another tab's end of the wire.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { set } from 'idb-keyval';
import { addItem, burnVault, loadVault, removeItem, updateItem, DATA_DB, LEDGER_DB } from './vaultStore';
import { burnPending, deleteDatabase, getVaultKey, KEYS_DB, seal, withVaultLock } from './crypto';
import { closableStore } from './idb';
import { performBurn } from './burn';
import { onVaultChange, VAULT_CHANNEL } from './sync';
import { createVaultScan, vaultScan } from '../ai/vaultScan';
import type { VaultScanner } from '../ai/tripwire';
import type { VaultItem } from '../core/types';

async function reset() {
  await deleteDatabase(KEYS_DB);
  await deleteDatabase(DATA_DB);
}

/** One "tab": its own index over the shared vault, subscribed like the app's instance. */
function tab() {
  const registered: VaultScanner[] = [];
  const vs = createVaultScan({ loadReal: loadVault, register: (fn) => { registered.push(fn); }, onVaultChange });
  return { vs, scanner: () => registered[registered.length - 1] };
}
const texts = (vs: ReturnType<typeof createVaultScan>) => vs.activeTerms().map((t) => t.text);

/** The other end of the wire: what another tab's listener receives. */
function otherTab() {
  const ch = new BroadcastChannel(VAULT_CHANNEL);
  const got: unknown[] = [];
  ch.onmessage = (e: MessageEvent) => { got.push(e.data); };
  return { ch, got };
}

/** Resolves on the next vault-change notification in this process (local or from the channel). */
const nextChange = () => new Promise<void>((resolve) => { const off = onVaultChange(() => { off(); resolve(); }); });

describe('vault changes reach every tab (T-054 review, cross-tab index)', () => {
  beforeEach(reset);
  afterEach(() => { vi.restoreAllMocks(); });

  it('every committed add, update, remove and burn is announced to other tabs; the message holds no vault data', async () => {
    const { ch, got } = otherTab();
    try {
      const kid = await addItem({ kind: 'child_name', label: 'Ottoline', aliases: ['Ottie'] });
      await vi.waitFor(() => expect(got).toHaveLength(1));
      await updateItem(kid.id, { label: 'Ottoline B.' });
      await vi.waitFor(() => expect(got).toHaveLength(2));
      await expect(addItem({ kind: 'child_name', label: 'x'.repeat(41), aliases: [] })).rejects.toMatchObject({ code: 'label_too_long' });
      await removeItem(kid.id);
      await vi.waitFor(() => expect(got).toHaveLength(3));   // the refused add announced nothing
      await burnVault();
      await vi.waitFor(() => expect(got).toHaveLength(4));
      await new Promise((r) => setTimeout(r, 20));
      expect(got).toHaveLength(4);   // exactly one per committed change: the refused add announced nothing
      expect(new Set(got)).toEqual(new Set(['vault-changed']));
      expect(JSON.stringify(got)).not.toMatch(/Ottoline|Ottie|vi_/);
    } finally {
      ch.close();
    }
  });

  it('two tabs: an add in tab A reaches tab B\'s masks, prompt scan and tripwire; a burn in A empties B at once', async () => {
    await addItem({ kind: 'child_name', label: 'Lucas', aliases: [] });
    const A = tab();
    const B = tab();
    await Promise.all([A.vs.init({ judge: false }), B.vs.init({ judge: false })]);
    const otto = await addItem({ kind: 'child_name', label: 'Ottoline', aliases: [] });   // no manual refresh anywhere
    await Promise.all([A.vs.ready, B.vs.ready]);
    expect(texts(A.vs)).toEqual(['Lucas', 'Ottoline']);
    expect(texts(B.vs)).toEqual(['Lucas', 'Ottoline']);
    expect(B.vs.matchWords([{ text: 'OTTOLINE' }]).map((h) => h.term.vaultId)).toEqual([otto.id]);
    expect(B.vs.scanText('for Ottoline')?.vaultId).toBe(otto.id);
    expect(B.scanner()(['a OTTOLINE name tag'])).toEqual({ vaultId: otto.id });

    await performBurn({ burnStorage: burnVault, clearIndex: () => A.vs.clearReal(), reloadIndex: () => A.vs.refresh() });
    expect(B.vs.activeTerms()).toEqual([]);   // the burned terms are gone from B's memory immediately
    expect(B.vs.activePins()).toEqual([]);
    await B.vs.ready;
    expect(B.vs.activeTerms()).toEqual([]);
    expect(B.vs.scanText('Lucas')).toBeNull();
    expect(B.scanner()(['a LUCAS name tag'])).toBeNull();
  });

  it('a message from another tab rebuilds this tab\'s index (an edit there, then a burn there)', async () => {
    const lucas = await addItem({ kind: 'child_name', label: 'Lucas', aliases: [] });
    const B = tab();
    await B.vs.init({ judge: false });
    // Tab A writes the vault without this process hearing about it, as another tab would.
    const ella: VaultItem = { id: 'vi_0000000e11a0', kind: 'child_name', label: 'Ella', aliases: [], createdAt: 1 };
    await withVaultLock(async () => {
      const key = await getVaultKey();
      if (!key) throw new Error('no key');
      await set('vault:v1', await seal([lucas, ella], key), closableStore(DATA_DB, 'items'));
    });
    expect(texts(B.vs)).toEqual(['Lucas']);   // stale until told
    const { ch } = otherTab();
    try {
      let heard = nextChange();
      ch.postMessage('vault-changed');
      await heard;
      await B.vs.ready;
      expect(texts(B.vs)).toEqual(['Lucas', 'Ella']);
      expect(B.vs.scanText('for Ella')?.vaultId).toBe(ella.id);

      // Tab A burns (storage only, as seen from here), then tells everyone.
      await deleteDatabase(KEYS_DB);
      await deleteDatabase(DATA_DB);
      heard = nextChange();
      ch.postMessage('vault-changed');
      await heard;
      expect(B.vs.activeTerms()).toEqual([]);   // dropped at once, before the reload finishes
      await B.vs.ready;
      expect(B.vs.activeTerms()).toEqual([]);
      expect(B.scanner()(['Lucas and Ella'])).toBeNull();
    } finally {
      ch.close();
    }
  });

  it('the app\'s own vaultScan is rebuilt by a plain addItem once booted (no caller has to remember refresh)', async () => {
    await vaultScan.init({ judge: false });
    expect(vaultScan.activeTerms()).toEqual([]);
    const kid = await addItem({ kind: 'child_name', label: 'Ottoline', aliases: [] });
    await vaultScan.ready;
    expect(vaultScan.scanText('for Ottoline')?.vaultId).toBe(kid.id);
    await removeItem(kid.id);
    await vaultScan.ready;
    expect(vaultScan.scanText('for Ottoline')).toBeNull();
  });

  it('a burn that keeps failing is retried once per tab, never in a cross-tab loop (T-054 review round 2)', async () => {
    await addItem({ kind: 'child_name', label: 'Lucas', aliases: [] });
    // The ledger exists, as in the app: a retry skips a database indexedDB.databases() no longer lists (round 4).
    await set(1, { kind: 'GATE', n: 1 }, closableStore(LEDGER_DB, 'entries'));
    const loads = { A: 0, B: 0 };
    const mk = (n: 'A' | 'B') => createVaultScan({ loadReal: () => { loads[n]++; return loadVault(); }, register: () => {}, onVaultChange });
    const A = mk('A');
    const B = mk('B');
    await Promise.all([A.init({ judge: false }), B.init({ judge: false })]);
    loads.A = 0;
    loads.B = 0;
    let announced = 0;
    const off = onVaultChange(() => { announced++; });
    // The backing store refuses to delete se-ledger, every time (not `blocked`: an outright error).
    const drop = indexedDB.deleteDatabase.bind(indexedDB);
    vi.spyOn(indexedDB, 'deleteDatabase').mockImplementation((name: string) => {
      if (name !== LEDGER_DB) return drop(name);
      const r = {} as { error: DOMException | null; onerror: ((e: Event) => void) | null };
      setTimeout(() => { r.error = new DOMException('backing store', 'UnknownError'); r.onerror?.(new Event('error')); }, 0);
      return r as unknown as IDBOpenDBRequest;
    });
    try {
      await expect(burnVault()).rejects.toMatchObject({ name: 'UnknownError' });
      await new Promise((r) => setTimeout(r, 500));
      // Burn vault announced once; each index re-read once, retried the burn, failed, and announced nothing.
      // (The old code announced every failed retry: ~830 loads/s, forever.)
      expect(announced).toBe(1);
      expect(loads.A).toBeGreaterThanOrEqual(1);
      expect(loads.A).toBeLessThanOrEqual(2);
      expect(loads.B).toBeGreaterThanOrEqual(1);
      expect(loads.B).toBeLessThanOrEqual(2);
      await expect(A.ready).rejects.toMatchObject({ name: 'UnknownError' });   // blocked: fail closed
      expect(await burnPending()).toBe(true);
    } finally {
      off();
      vi.restoreAllMocks();
    }
    // Once the store recovers, one load finishes the burn and its announcement unblocks every index.
    expect(await loadVault()).toEqual([]);
    expect(await burnPending()).toBe(false);
    await Promise.all([A.ready, B.ready]);
    expect(A.activeTerms()).toEqual([]);
    expect(B.activeTerms()).toEqual([]);
  });

  it('Judge Mode ignores real-vault changes (the real vault is never loaded there, D-37)', async () => {
    const loads: number[] = [];
    const vs = createVaultScan({ loadReal: async () => { loads.push(1); return []; }, register: () => {}, onVaultChange });
    await vs.init({ judge: true });
    await addItem({ kind: 'child_name', label: 'Ottoline', aliases: [] });
    await vs.ready;
    expect(loads).toEqual([]);
    expect(vs.mode()).toBe('judge');
  });
});

describe('vault/sync.ts', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('a page restored from the back/forward cache counts as a change (it missed every message while frozen)', async () => {
    const handlers: Array<(e: { persisted?: boolean }) => void> = [];
    vi.stubGlobal('addEventListener', (type: string, fn: (e: { persisted?: boolean }) => void) => { if (type === 'pageshow') handlers.push(fn); });
    vi.resetModules();
    const fresh = await import('./sync');
    let n = 0;
    fresh.onVaultChange(() => { n++; });
    fresh.onVaultChange(() => { n++; });
    expect(handlers).toHaveLength(1);   // hooked once
    handlers[0]({ persisted: false });
    expect(n).toBe(0);
    handlers[0]({ persisted: true });
    expect(n).toBe(2);
  });

  it('a throwing listener does not stop the others; unsubscribe works', async () => {
    vi.resetModules();
    const fresh = await import('./sync');
    let n = 0;
    fresh.onVaultChange(() => { throw new Error('boom'); });
    const off = fresh.onVaultChange(() => { n++; });
    fresh.announceVaultChange();
    expect(n).toBe(1);
    off();
    fresh.announceVaultChange();
    expect(n).toBe(1);
  });
});
