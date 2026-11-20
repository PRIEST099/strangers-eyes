// Several tabs at once (T-054 review round 3). Each "tab" is its own module instance (vi.resetModules): its own
// per-tab lock queue, pending-deletion set, vault-change channel and index. They share what real tabs of one origin
// share: IndexedDB (fake-indexeddb), navigator.locks and the BroadcastChannel.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE_BLOCKED_TIMEOUT_MS } from './crypto';
import { VAULT_UNAVAILABLE } from '../ai/vaultScan';
import type { VaultScanner } from '../ai/tripwire';

const LUCAS = { kind: 'child_name' as const, label: 'Lucas', aliases: [] };
const unsubscribe: Array<() => void> = [];

/** A new tab: fresh modules, and an index over the real vault store that hears vault changes from every tab. */
async function openTab() {
  vi.resetModules();
  const store = await import('./vaultStore');
  const burn = await import('./burn');
  const sync = await import('./sync');
  const scan = await import('../ai/vaultScan');
  const registered: VaultScanner[] = [];
  const index = scan.createVaultScan({
    loadReal: store.loadVault,
    register: (fn) => { registered.push(fn); },
    onVaultChange: (listener) => { unsubscribe.push(sync.onVaultChange(listener)); },
    finishPendingBurn: store.finishPendingBurn,
  });
  return { store, burn, scan, index, last: () => registered[registered.length - 1] };
}

type Tab = Awaited<ReturnType<typeof openTab>>;

/** 'resolved', the rejection's message, or 'pending' if `p` has not settled within `ms`. */
async function outcome(p: Promise<unknown>, ms: number): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<string>((res) => { timer = setTimeout(() => res('pending'), ms); });
  try {
    return await Promise.race([p.then(() => 'resolved', (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e))), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** A connection that ignores `versionchange` (what idb-keyval's createStore does): it blocks deleteDatabase until closed. */
async function openBlocker(name: string): Promise<IDBDatabase> {
  const open = indexedDB.open(name);
  open.onupgradeneeded = () => { open.result.createObjectStore('entries'); };
  return new Promise<IDBDatabase>((res, rej) => { open.onsuccess = () => res(open.result); open.onerror = () => rej(open.error); });
}

const dbNames = async () => (await indexedDB.databases()).map((d) => d.name);

async function wipeAll(): Promise<void> {
  for (const { name } of await indexedDB.databases()) {
    if (name) await new Promise<void>((res) => { const r = indexedDB.deleteDatabase(name); r.onsuccess = () => res(); r.onerror = () => res(); });
  }
}

describe('a stuck burn with other tabs open (T-054 review round 3)', () => {
  beforeEach(wipeAll);
  afterEach(async () => {
    for (const off of unsubscribe.splice(0)) off();          // no tab of this test hears the next one
    vi.restoreAllMocks();
    await wipeAll();
  });

  it('four other tabs: the burning tab hears within DELETE_BLOCKED_TIMEOUT_MS; their retries and a new Judge-Mode boot then all settle within one more', async () => {
    const a = await openTab();
    await a.store.addItem(LUCAS);
    await a.index.init({ judge: false });
    const others: Tab[] = [];
    for (let i = 0; i < 4; i++) {
      const t = await openTab();
      await t.index.init({ judge: false });
      expect(t.index.activeTerms().map((x) => x.text)).toEqual(['Lucas']);
      others.push(t);
    }
    const blocker = await openBlocker(a.store.LEDGER_DB);
    try {
      let atReject: unknown = 'not rejected';
      const t0 = Date.now();
      const burned = await outcome(a.burn.performBurn({
        burnStorage: a.store.burnVault,
        clearIndex: () => a.index.clearReal(),
        reloadIndex: () => a.index.refresh(),
      }).catch((e: unknown) => { atReject = a.last()(['Lucas']); throw e; }), 6 * DELETE_BLOCKED_TIMEOUT_MS);
      const burnMs = Date.now() - t0;
      expect(burned).toMatch(/^BurnPendingError/);
      // It used to wait for its own reload, which queued for the cross-tab vault lock behind every other tab's retry
      // of the burn (3 s each): 3 s × (tabs + 1).
      expect(burnMs).toBeLessThan(DELETE_BLOCKED_TIMEOUT_MS + 500);
      expect(atReject).toEqual({ vaultId: VAULT_UNAVAILABLE });   // fail closed before the error reaches the UI

      // Every other tab retries the burn when it hears; a new tab boots into Judge Mode meanwhile. A retry holds the
      // cross-tab lock for BURN_RETRY_TIMEOUT_MS at most, so all of it fits in less than one user-burn timeout.
      const t1 = Date.now();
      const judge = await openTab();
      const settled = await Promise.allSettled([judge.index.init({ judge: true }), ...others.map((t) => t.store.loadVault())]);
      expect(Date.now() - t1).toBeLessThan(DELETE_BLOCKED_TIMEOUT_MS);
      expect(settled.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'rejected', 'rejected', 'rejected']);
      expect(judge.index.mode()).toBe('judge');
      await vi.waitFor(() => {
        for (const t of [a, ...others]) expect(t.last()(['anything'])).toEqual({ vaultId: VAULT_UNAVAILABLE });
      });
    } finally {
      blocker.close();
    }
    // Once the blocker is gone the queued deletions complete; the next load finishes the burn and every index empties.
    await vi.waitFor(async () => expect(await dbNames()).not.toContain(a.store.LEDGER_DB), { timeout: 5000 });
    expect(await a.store.loadVault()).toEqual([]);
    await vi.waitFor(async () => {
      for (const t of [a, ...others]) {
        await t.index.ready;
        expect(t.index.activeTerms()).toEqual([]);
        expect(t.last()(['Lucas'])).toBeNull();
      }
    }, { timeout: 5000 });
  }, 30_000);

  it('a page that has not booted yet (the app index is unset): a failed performBurn() rejects at once with the storage error', async () => {
    const tab = await openTab();
    await tab.store.addItem(LUCAS);
    expect(tab.scan.vaultScan.mode()).toBe('unset');
    vi.spyOn(indexedDB, 'deleteDatabase').mockImplementationOnce(() => { throw new Error('tab closed'); });
    // App wiring: the reload is vaultScan.refresh(), which used to return the boot promise, unsettled until init().
    expect(await outcome(tab.burn.performBurn(), 1000)).toBe('Error: tab closed');
    vi.restoreAllMocks();
    expect(tab.scan.vaultScan.mode()).toBe('unset');
    // Boot then finishes the interrupted burn before it loads anything.
    await tab.scan.vaultScan.init({ judge: false });
    expect(tab.scan.vaultScan.activeTerms()).toEqual([]);
    expect(await tab.store.loadVault()).toEqual([]);
  });
});
