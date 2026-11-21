import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { performBurn, type BurnDeps } from './burn';
import { set } from 'idb-keyval';
import { addItem, burnVault, finishPendingBurn, loadVault, DATA_DB, LEDGER_DB, SESSIONS_DB } from './vaultStore';
import {
  BURN_PENDING, burnPending, BurnPendingError, BURN_RETRY_TIMEOUT_MS, deleteDatabase, DELETE_BLOCKED_TIMEOUT_MS, getVaultKey,
  KEY_ID, KEYS_DB, seal, withVaultLock,
} from './crypto';
import { onVaultChange } from './sync';
import { closableStore } from './idb';
import { dumpIdb, spyIdbDeletes } from './idb.testutil';
import { createVaultScan, TEMPLATE_CANARY, vaultScan, VAULT_UNAVAILABLE } from '../ai/vaultScan';
import { render, segmentsText } from '../ai/prompts';
import type { VaultScanner } from '../ai/tripwire';
import type { VaultItem } from '../core/types';

async function reset() {
  vi.restoreAllMocks();
  await deleteDatabase(KEYS_DB);
  await deleteDatabase(DATA_DB);
}
const lucasInput = { kind: 'child_name' as const, label: 'Lucas', aliases: ['Luke'] };
const nanoText = () => segmentsText(render('nanoVaultText.v1', { TEXTS_JSON: [{ id: 'w1', text: 'BUS' }], VAULT_JSON: [] }));

/** A vaultScan over the REAL vault store with the registered tripwire scanner captured, and the burn deps wired to it. */
function realIndex() {
  const registered: VaultScanner[] = [];
  const vs = createVaultScan({ loadReal: loadVault, register: (fn) => { registered.push(fn); } });
  const deps: BurnDeps = { burnStorage: burnVault, clearIndex: () => vs.clearReal(), reloadIndex: () => vs.refresh() };
  return { vs, deps, scanner: () => registered[registered.length - 1] };
}

describe('performBurn: storage first, then memory (SPEC SCR-19, ARCH §16.4 step 4)', () => {
  beforeEach(reset);
  afterEach(() => { vi.restoreAllMocks(); });

  it('clears the index only after storage is burned', async () => {
    const log: string[] = [];
    await performBurn({
      burnStorage: async () => { log.push('storage:start'); await Promise.resolve(); log.push('storage:done'); },
      clearIndex: () => { log.push('clear'); },
      reloadIndex: async () => { log.push('reload'); },
    });
    expect(log).toEqual(['storage:start', 'storage:done', 'clear']);
  });

  it('a failed storage burn reloads the index (never blindly empties it) and rethrows', async () => {
    const log: string[] = [];
    const deps: BurnDeps = {
      burnStorage: async () => { log.push('storage'); throw new Error('quota'); },
      clearIndex: () => { log.push('clear'); },
      reloadIndex: async () => { log.push('reload'); throw new Error('also broken'); },   // swallowed: the index stays blocked
    };
    await expect(performBurn(deps)).rejects.toThrow('quota');
    expect(log).toEqual(['storage', 'reload']);
  });

  it('clears the in-memory ledger and sent images after storage, on success AND on failure (SCR-19)', async () => {
    const log: string[] = [];
    await performBurn({ burnStorage: async () => { log.push('storage'); }, clearIndex: () => { log.push('clear'); }, reloadIndex: async () => undefined, clearMemory: () => { log.push('memory'); } });
    expect(log).toEqual(['storage', 'clear', 'memory']);
    const log2: string[] = [];
    await expect(performBurn({ burnStorage: async () => { throw new Error('quota'); }, clearIndex: () => { log2.push('clear'); }, reloadIndex: async () => { log2.push('reload'); }, clearMemory: () => { log2.push('memory'); } })).rejects.toThrow('quota');
    expect(log2).toEqual(['reload', 'memory']);
  });

  it('app wiring: key record, then se-vault-data, se-sessions, se-ledger, then vaultScan.clearReal (AC-271)', async () => {
    const lucas = await addItem(lucasInput);
    await vaultScan.init({ judge: false });
    expect(vaultScan.activeTerms().map((t) => t.text)).toEqual(['Lucas', 'Luke']);
    const { log } = spyIdbDeletes();
    const clearReal = vaultScan.clearReal;
    vi.spyOn(vaultScan, 'clearReal').mockImplementation(() => { log.push('clearReal'); clearReal(); });
    await performBurn();
    expect(log).toEqual([
      `delete ${KEYS_DB}/keys/${KEY_ID}`,
      `committed ${KEYS_DB}/keys/${KEY_ID}`,
      `deleteDatabase ${DATA_DB}`,
      `deleteDatabase ${SESSIONS_DB}`,
      `deleteDatabase ${LEDGER_DB}`,
      `delete ${KEYS_DB}/keys/${BURN_PENDING}`,
      `committed ${KEYS_DB}/keys/${BURN_PENDING}`,
      'clearReal',
    ]);
    expect(log).not.toContain('deleteDatabase keyval-store');   // the Tesseract cache is never touched
    expect(vaultScan.mode()).toBe('real');
    expect(vaultScan.activeTerms()).toEqual([]);
    expect(vaultScan.activePins()).toEqual([]);
    expect(vaultScan.scanText('Lucas')).toBeNull();
    expect(await getVaultKey()).toBeUndefined();
    expect(await loadVault()).toEqual([]);
    expect(lucas.label).toBe('Lucas');
  });

  it('the registered tripwire scanner forgets the vault at once but keeps the template canary', async () => {
    const lucas = await addItem(lucasInput);
    const { vs, deps, scanner } = realIndex();
    await vs.init({ judge: false });
    expect(scanner()(['a LUCAS name tag'])).toEqual({ vaultId: lucas.id });
    await performBurn(deps);
    expect(vs.activeTerms()).toEqual([]);
    expect(scanner()(['a LUCAS name tag'])).toBeNull();
    expect(scanner()([nanoText()])).toEqual({ vaultId: TEMPLATE_CANARY });
  });

  it('interrupted after the key: the reloaded index is empty, never stale; the key is gone', async () => {
    await addItem(lucasInput);
    const { vs, deps, scanner } = realIndex();
    await vs.init({ judge: false });
    const { drop } = spyIdbDeletes();
    drop.mockImplementationOnce(() => { throw new Error('tab closed'); });
    await expect(performBurn(deps)).rejects.toThrow('tab closed');
    await vs.ready;
    expect(await getVaultKey()).toBeUndefined();
    expect(vs.activeTerms()).toEqual([]);
    expect(scanner()(['a LUCAS name tag'])).toBeNull();
  });

  it('interrupted before the key: the vault still decrypts, so its terms stay in force', async () => {
    const lucas = await addItem(lucasInput);
    const { vs, deps, scanner } = realIndex();
    await vs.init({ judge: false });
    const { del } = spyIdbDeletes();
    del.mockImplementationOnce(() => { throw new Error('disk error'); });
    await expect(performBurn(deps)).rejects.toThrow('disk error');
    await vs.ready;
    expect(await getVaultKey()).toBeDefined();
    expect(vs.activeTerms().map((t) => t.vaultId)).toEqual([lucas.id, lucas.id]);
    expect(scanner()(['a LUCAS name tag'])).toEqual({ vaultId: lucas.id });
  });

  it('a reload that cannot read the vault leaves the scanner blocked (fail closed)', async () => {
    const registered: VaultScanner[] = [];
    let fail = false;
    const vs = createVaultScan({ loadReal: async () => { if (fail) throw new Error('corrupt'); return []; }, register: (fn) => { registered.push(fn); } });
    await vs.init({ judge: false });
    fail = true;
    await expect(performBurn({ burnStorage: async () => { throw new Error('quota'); }, clearIndex: () => vs.clearReal(), reloadIndex: () => vs.refresh() }))
      .rejects.toThrow('quota');
    expect(registered[registered.length - 1](['anything'])).toEqual({ vaultId: VAULT_UNAVAILABLE });
  });

  it('AC-270: after the burn, refreshing the index creates no key; the next add does, and the index picks it up', async () => {
    await addItem(lucasInput);
    const { vs, deps } = realIndex();
    await vs.init({ judge: false });
    await performBurn(deps);
    await vs.refresh();
    expect(await getVaultKey()).toBeUndefined();
    const ella = await addItem({ kind: 'child_name', label: 'Ella', aliases: [] });
    await vs.refresh();
    expect(await getVaultKey()).toBeDefined();
    expect(vs.activeTerms().map((t) => [t.vaultId, t.text])).toEqual([[ella.id, 'Ella']]);
  });
});

// ---------- T-054 review round 2 ----------
/** 'resolved', the rejection's name, or 'pending' if `p` has not settled within `ms`. */
async function outcome(p: Promise<unknown>, ms: number): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<string>((res) => { timer = setTimeout(() => res('pending'), ms); });
  try {
    return await Promise.race([p.then(() => 'resolved', (e: unknown) => (e instanceof Error ? e.name : String(e))), late]);
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

describe('a blocked deletion never holds the vault lock forever (T-054 review round 2)', () => {
  beforeEach(reset);
  afterEach(() => { vi.restoreAllMocks(); });

  it('burnVault rejects BurnPendingError; loadVault, addItem, a second burn and performBurn then settle too; the lock is free; closing the blocker lets the next load finish', async () => {
    await addItem(lucasInput);
    await vaultScan.init({ judge: false });              // the app's index, subscribed to vault changes
    const blocker = await openBlocker(LEDGER_DB);
    try {
      expect(await outcome(burnVault(), DELETE_BLOCKED_TIMEOUT_MS + 1000)).toBe('BurnPendingError');
      // Every later operation retries the burn while the first ledger deletion is still queued. Each must settle
      // (the old code queued a second request that never got `blocked`, so its timer never started: lock held forever).
      const bound = DELETE_BLOCKED_TIMEOUT_MS + 1000;
      expect(await outcome(loadVault(), bound)).toBe('BurnPendingError');
      expect(await outcome(addItem({ kind: 'employer', label: 'Wrenfield Clinic', aliases: [] }), bound)).toBe('BurnPendingError');
      expect(await outcome(burnVault(), bound)).toBe('BurnPendingError');
      expect(await outcome(performBurn(), bound)).toBe('BurnPendingError');   // APP_DEPS: burnVault + vaultScan reload
      expect(await outcome(withVaultLock(async () => 'free'), 500)).toBe('resolved');
      expect(await outcome(vaultScan.ready, 500)).toBe('BurnPendingError');   // the index stays blocked (fail closed)
      expect(vaultScan.activeTerms()).toEqual([]);
      expect(await getVaultKey()).toBeUndefined();
      expect(await burnPending()).toBe(true);
    } finally {
      blocker.close();
    }
    // The queued deletion completes once the blocker is gone; the next load finishes the burn and unblocks the index.
    await vi.waitFor(async () => expect(await dbNames()).not.toContain(LEDGER_DB));
    expect(await loadVault()).toEqual([]);
    expect(await burnPending()).toBe(false);
    await vaultScan.ready;
    expect(vaultScan.mode()).toBe('real');
    expect(vaultScan.activeTerms()).toEqual([]);
    const { dbs, records } = await dumpIdb();
    expect(Object.keys(dbs)).not.toContain(SESSIONS_DB);
    expect(Object.keys(dbs)).not.toContain(LEDGER_DB);
    expect(records).toEqual([]);                         // no key, no marker, no vault record (the reload re-opened an empty se-vault-data)
  }, 20_000);

  it('Judge-Mode boot finishes an interrupted burn and never unseals the real vault (D-37)', async () => {
    await vaultScan.init({ judge: true });               // the app's index must not finish the burn by a real load
    await addItem(lucasInput);
    const key = await getVaultKey();
    if (!key) throw new Error('no key');
    await set('session:s1', await seal({ s: 1 }, key), closableStore(SESSIONS_DB, 'items'));
    await set(1, { kind: 'GATE', n: 1 }, closableStore(LEDGER_DB, 'entries'));
    const { drop } = spyIdbDeletes();
    drop.mockImplementation(() => { throw new Error('tab closed'); });   // killed right after the key went
    await expect(burnVault()).rejects.toThrow('tab closed');
    vi.restoreAllMocks();
    expect(await burnPending()).toBe(true);

    const decrypt = vi.spyOn(crypto.subtle, 'decrypt');
    const reads: string[] = [];
    const get = IDBObjectStore.prototype.get;
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, k: IDBValidKey | IDBKeyRange) {
      reads.push(`${this.transaction.db.name}/${String(k)}`);
      return get.call(this, k);
    });
    await vaultScan.init({ judge: true });               // next boot, straight into Judge Mode
    expect(vaultScan.mode()).toBe('judge');
    expect(decrypt).not.toHaveBeenCalled();
    expect(reads).toEqual([`${KEYS_DB}/${BURN_PENDING}`]);   // the marker only: never the vault record or the key
    vi.restoreAllMocks();
    expect(await burnPending()).toBe(false);
    const { dbs } = await dumpIdb();
    expect(Object.keys(dbs)).not.toContain(SESSIONS_DB);
    expect(Object.keys(dbs)).not.toContain(LEDGER_DB);
    expect(Object.keys(dbs)).not.toContain(DATA_DB);
  });
});

// ---------- T-054 review round 3 ----------
/** A fresh browser profile: every database deleted. */
async function wipeAll(): Promise<void> {
  for (const { name } of await indexedDB.databases()) if (name) await deleteDatabase(name);
}

/** Every IndexedDB `get` (as "db/key") and every decrypt while `fn` runs. */
async function watchReads(fn: () => Promise<unknown>): Promise<{ reads: string[]; decrypts: number }> {
  const reads: string[] = [];
  const get = IDBObjectStore.prototype.get;
  const getSpy = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, k: IDBValidKey | IDBKeyRange) {
    reads.push(`${this.transaction.db.name}/${String(k)}`);
    return get.call(this, k);
  });
  const decrypt = vi.spyOn(crypto.subtle, 'decrypt');
  try {
    await fn();
    return { reads, decrypts: decrypt.mock.calls.length };
  } finally {
    getSpy.mockRestore();
    decrypt.mockRestore();
  }
}

describe('performBurn does not wait for the reload, and the index is blocked before it rejects (T-054 review round 3)', () => {
  beforeEach(reset);
  afterEach(() => { vi.restoreAllMocks(); });

  it('a failed burn rejects while the reload is still running; the scanner is already block-all when it does', async () => {
    const kid: VaultItem = { id: 'vi_0123456789ab', kind: 'child_name', label: 'Lucas', aliases: [], createdAt: 1 };
    const registered: VaultScanner[] = [];
    let release: (items: readonly VaultItem[]) => void = () => {};
    let loads = 0;
    const vs = createVaultScan({
      loadReal: () => (loads++ === 0 ? Promise.resolve([kid]) : new Promise((res) => { release = res; })),
      register: (fn) => { registered.push(fn); },
    });
    await vs.init({ judge: false });
    const last = () => registered[registered.length - 1];
    expect(last()(['a LUCAS name tag'])).toEqual({ vaultId: kid.id });
    let atReject: unknown = 'not rejected';
    const burning = performBurn({
      burnStorage: async () => { throw new BurnPendingError(LEDGER_DB); },
      clearIndex: () => vs.clearReal(),
      reloadIndex: () => vs.refresh(),
    }).catch((e: unknown) => { atReject = last()(['a LUCAS name tag']); throw e; });
    // The reload queues for the cross-tab vault lock behind every other tab's burn retry; here it never finishes.
    expect(await outcome(burning, 1000)).toBe('BurnPendingError');
    expect(loads).toBe(2);                                   // the reload was started...
    expect(atReject).toEqual({ vaultId: VAULT_UNAVAILABLE });  // ...and had blocked the index before the rejection
    expect(vs.activeTerms()).toEqual([]);
    release([kid]);                                          // it finishes later: the terms come back in force
    await vs.ready;
    expect(last()(['a LUCAS name tag'])).toEqual({ vaultId: kid.id });
  });
});

describe('Judge-Mode boot reads nothing of the real vault and creates nothing (T-054 review round 3, D-37, AC-241)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await vaultScan.ready.catch(() => undefined);           // no reload of an earlier test still running
    await wipeAll();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await wipeAll();
  });

  it('a live vault and no burn pending (the usual Judge boot): only the burn-pending marker is read, nothing is unsealed, every byte stays', async () => {
    const lucas = await addItem(lucasInput);
    await vaultScan.ready.catch(() => undefined);           // the add's own reload (if the index is in real mode)
    const before = await dumpIdb();
    const { reads, decrypts } = await watchReads(() => vaultScan.init({ judge: true }));
    expect(vaultScan.mode()).toBe('judge');
    expect(vaultScan.activeTerms()).toEqual([]);
    expect(decrypts).toBe(0);
    expect(reads).toEqual([`${KEYS_DB}/${BURN_PENDING}`]);   // never the vault record, never the key
    expect(await dumpIdb()).toEqual(before);                 // the real vault is byte-identical
    expect(await loadVault()).toEqual([lucas]);
  });

  it('a fresh profile: Judge-Mode boot reads nothing and creates no database', async () => {
    expect(await dbNames()).toEqual([]);
    const { reads, decrypts } = await watchReads(() => vaultScan.init({ judge: true }));
    expect(vaultScan.mode()).toBe('judge');
    expect(reads).toEqual([]);
    expect(decrypts).toBe(0);
    expect(await dbNames()).toEqual([]);                      // se-vault-keys used to be created just to read the marker
  });

  for (const variant of ['is missing', 'fails'] as const) {
    it(`where indexedDB.databases() ${variant}, the marker is read anyway: Judge-Mode boot still finishes an interrupted burn`, async () => {
      await vaultScan.init({ judge: true });               // the app's index must not finish the burn by a real load
      await addItem(lucasInput);
      await set(1, { kind: 'GATE', n: 1 }, closableStore(LEDGER_DB, 'entries'));
      const { drop } = spyIdbDeletes();
      drop.mockImplementation(() => { throw new Error('tab closed'); });   // killed right after the key went
      await expect(burnVault()).rejects.toThrow('tab closed');
      vi.restoreAllMocks();
      expect(await burnPending()).toBe(true);
      if (variant === 'is missing') Object.defineProperty(indexedDB, 'databases', { value: undefined, configurable: true });
      else vi.spyOn(indexedDB, 'databases').mockRejectedValue(new Error('SecurityError'));
      try {
        await vaultScan.init({ judge: true });
      } finally {
        if (variant === 'is missing') delete (indexedDB as unknown as { databases?: unknown }).databases;
        vi.restoreAllMocks();
      }
      expect(vaultScan.mode()).toBe('judge');
      expect(await burnPending()).toBe(false);
      const names = await dbNames();
      expect(names).not.toContain(LEDGER_DB);
      expect(names).not.toContain(DATA_DB);
    });
  }
});

// ---------- T-054 review round 4 ----------
const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

/**
 * Every database deletion is slow but never blocked: the real request runs and completes at once, and its outcome
 * reaches the caller `ms` later. With `fail`, no request is made and it fails `ms` later instead.
 */
function slowDeletes(ms: number, fail = false) {
  const orig = indexedDB.deleteDatabase.bind(indexedDB);
  return vi.spyOn(indexedDB, 'deleteDatabase').mockImplementation((name: string) => {
    const r = { error: null as DOMException | null, onsuccess: null as ((e: Event) => void) | null, onerror: null as ((e: Event) => void) | null };
    if (fail) {
      setTimeout(() => { r.error = new DOMException('backing store', 'UnknownError'); r.onerror?.(new Event('error')); }, ms);
    } else {
      const real = orig(name);
      real.onsuccess = (e) => { setTimeout(() => r.onsuccess?.(e), ms); };
      real.onerror = (e) => { setTimeout(() => { r.error = real.error; r.onerror?.(e); }, ms); };
    }
    return r as unknown as IDBOpenDBRequest;
  });
}

/** A burn killed right after its first step (the key and the marker): no database deletion was ever requested. */
async function interruptBurn(): Promise<void> {
  const { drop } = spyIdbDeletes();
  drop.mockImplementation(() => { throw new Error('tab closed'); });
  await expect(burnVault()).rejects.toThrow('tab closed');
  vi.restoreAllMocks();
  expect(await burnPending()).toBe(true);
}

describe('a burn retry whose deletions complete late announces it, so no index stays blocked (T-054 review round 4)', () => {
  const offs: Array<() => void> = [];
  beforeEach(async () => {
    vi.restoreAllMocks();
    await vaultScan.init({ judge: true });   // the app's index never reloads (and so never retries) behind these tests
    await wipeAll();
  });
  afterEach(async () => {
    for (const off of offs.splice(0)) off();
    vi.restoreAllMocks();
    await wipeAll();
  });

  it('a real-mode boot whose deletions are slow but not blocked recovers by itself: no further vault operation, then quiet', async () => {
    await addItem(lucasInput);
    await set(1, { kind: 'GATE', n: 1 }, closableStore(LEDGER_DB, 'entries'));
    await interruptBurn();
    const late = BURN_RETRY_TIMEOUT_MS + 150;   // longer than a retry waits; never blocked
    slowDeletes(late);
    const registered: VaultScanner[] = [];
    let loads = 0;
    const vs = createVaultScan({
      loadReal: () => { loads++; return loadVault(); },
      register: (fn) => { registered.push(fn); },
      onVaultChange: (listener) => { offs.push(onVaultChange(listener)); },
      finishPendingBurn,
    });
    const scanner = () => registered[registered.length - 1];
    expect(await outcome(vs.init({ judge: false }), 2000)).toBe('BurnPendingError');   // the boot's retry gave up
    expect(scanner()(['hello'])).toEqual({ vaultId: VAULT_UNAVAILABLE });
    // Nothing else touches the vault. The queued deletions complete, that is announced, and the reload finishes the burn.
    await vi.waitFor(async () => { expect(await outcome(vs.ready, 50)).toBe('resolved'); }, { timeout: 3000, interval: 50 });
    expect(scanner()(['hello'])).toBeNull();
    expect(vs.activeTerms()).toEqual([]);
    expect(await burnPending()).toBe(false);
    expect(await dbNames()).not.toContain(LEDGER_DB);
    // Then quiet: that retry skipped the databases already gone, so no deletion timed out (and announced) again.
    const settled = loads;
    await sleep(3 * late);
    expect(loads).toBe(settled);
    expect(loads).toBeLessThanOrEqual(3);
  });

  it('a queued deletion is announced once when it completes, however many retries failed on it meanwhile', async () => {
    await addItem(lucasInput);
    await interruptBurn();
    const blocker = await openBlocker(DATA_DB);   // ignores versionchange: the deletion stays queued until it closes
    let announced = 0;
    offs.push(onVaultChange(() => { announced++; }));
    try {
      // The first retry times out; the next two find this tab's deletion still queued and reject at once.
      for (let i = 0; i < 3; i++) expect(await outcome(loadVault(), 2000)).toBe('BurnPendingError');
      await sleep(50);
      expect(announced).toBe(0);                  // a failed retry announces nothing
    } finally {
      blocker.close();
    }
    await vi.waitFor(() => { expect(announced).toBe(1); });
    await sleep(100);
    expect(announced).toBe(1);                    // once, not once per failed retry
    expect(await loadVault()).toEqual([]);        // a load (here, ours) finishes the burn and announces that
    expect(announced).toBe(2);
    expect(await burnPending()).toBe(false);
  });

  it('a queued deletion that FAILS announces nothing (it would only set off another failing retry)', async () => {
    await addItem(lucasInput);
    await interruptBurn();
    let announced = 0;
    offs.push(onVaultChange(() => { announced++; }));
    slowDeletes(BURN_RETRY_TIMEOUT_MS + 150, true);
    expect(await outcome(finishPendingBurn(), 2000)).toBe('BurnPendingError');
    await sleep(BURN_RETRY_TIMEOUT_MS + 400);     // the queued deletion has failed by now
    expect(announced).toBe(0);
    vi.restoreAllMocks();
    expect(await burnPending()).toBe(true);       // the marker stays; the next load or boot retries
    await finishPendingBurn();
    expect(await burnPending()).toBe(false);
  });
});

describe('where indexedDB.databases() is missing or fails, boot still creates no database (T-054 review round 4, AC-241)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await vaultScan.ready.catch(() => undefined);
    await wipeAll();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await wipeAll();
  });

  /** Run `fn` while indexedDB.databases() is missing (older browsers) or rejects, then restore it. */
  async function withoutDatabases<T>(variant: 'is missing' | 'fails', fn: () => Promise<T>): Promise<T> {
    if (variant === 'is missing') Object.defineProperty(indexedDB, 'databases', { value: undefined, configurable: true });
    else vi.spyOn(indexedDB, 'databases').mockRejectedValue(new Error('SecurityError'));
    try {
      return await fn();
    } finally {
      if (variant === 'is missing') delete (indexedDB as unknown as { databases?: unknown }).databases;
      vi.restoreAllMocks();
    }
  }

  for (const variant of ['is missing', 'fails'] as const) {
    it(`databases() ${variant}: a fresh profile's Judge-Mode boot and burnPending() leave the database list empty`, async () => {
      expect(await dbNames()).toEqual([]);
      const { reads, decrypts } = await withoutDatabases(variant, () => watchReads(async () => {
        await vaultScan.init({ judge: true });
        expect(await burnPending()).toBe(false);
      }));
      expect(vaultScan.mode()).toBe('judge');
      expect(reads).toEqual([]);
      expect(decrypts).toBe(0);
      expect(await dbNames()).toEqual([]);          // se-vault-keys used to be created just to look for the marker
    });

    it(`databases() ${variant}: on a live vault the check leaves no connection open, so a deletion is never blocked by it`, async () => {
      const lucas = await addItem(lucasInput);
      await withoutDatabases(variant, async () => {
        await vaultScan.init({ judge: true });
        expect(await burnPending()).toBe(false);
      });
      expect(vaultScan.mode()).toBe('judge');
      expect(await loadVault()).toEqual([lucas]);   // nothing read or changed
      // Every connection this module holds closes on versionchange; a leaked probe connection would block this.
      expect(await outcome(deleteDatabase(KEYS_DB, 500), 1000)).toBe('resolved');
    });

    // Round-5 verifier: databaseExists's reject branch (an open of an EXISTING se-vault-keys fails) had no test; a
    // version that answered "absent" there would let a boot skip an interrupted burn.
    it(`databases() ${variant}: when checking an existing se-vault-keys fails, nothing assumes "no burn" (fail closed)`, async () => {
      await addItem(lucasInput); // se-vault-keys exists
      const realOpen = indexedDB.open.bind(indexedDB);
      await withoutDatabases(variant, async () => {
        vi.spyOn(indexedDB, 'open').mockImplementation((name: string, version?: number) => {
          if (name !== KEYS_DB) return realOpen(name, version);
          const req = {} as { error: DOMException | null; onerror: ((e: { preventDefault(): void }) => void) | null };
          req.onerror = null;
          setTimeout(() => {
            req.error = new DOMException('disk', 'UnknownError');
            req.onerror?.({ preventDefault() {} });
          }, 0);
          return req as unknown as IDBOpenDBRequest;
        });
        await expect(burnPending()).rejects.toMatchObject({ name: 'UnknownError' });
        await expect(finishPendingBurn()).rejects.toMatchObject({ name: 'UnknownError' });
        const judge = createVaultScan({ loadReal: loadVault, register: () => {}, finishPendingBurn });
        await judge.init({ judge: true });
        expect(judge.mode()).toBe('judge');           // Judge Mode still boots (D-80)
        const real = createVaultScan({ loadReal: loadVault, register: () => {}, finishPendingBurn });
        await expect(real.init({ judge: false })).rejects.toMatchObject({ name: 'UnknownError' }); // real mode fails closed
      });
    });
  }
});
