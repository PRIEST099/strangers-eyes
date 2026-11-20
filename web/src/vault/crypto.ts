// web/src/vault/crypto.ts: the vault key, seal/unseal and the vault lock (ARCH §16.3, API-NOTES §5.4).
// A NON-EXTRACTABLE AES-GCM-256 CryptoKey lives in its own IndexedDB database. exportKey/wrapKey throw.
// Every write uses a fresh random 96-bit IV. Ported from research/day1-artifacts/web-ref/src/lib/vault.ts.
// No logging in this folder: vault data must never reach a console or a remote log (SR-15).
//
// Concurrency rules (review findings privacy-correctness-1/2/7, T-054 review):
// - Every read-modify-write of sealed data and Burn vault runs inside withVaultLock(): one queue per tab,
//   plus navigator.locks across tabs. Never nest withVaultLock() calls (it would deadlock).
// - seal() never creates a key. Only ensureVaultKey() does, single-flight and add-if-absent, and only for a caller that
//   holds the vault lock (it takes the lock's token). Only the vault's add path calls it (AC-270): other sealed writes
//   (sessions, queue) use getVaultKey() and never create a key.
// - Burn's first step deletes the key and records a burn-pending marker in ONE transaction, so an interrupted burn is
//   finished on the next load (vaultStore.loadUnlocked) or boot (vaultStore.finishPendingBurn, Judge Mode too).
// - Nothing awaited under the lock may wait forever: deleteDatabase is bounded (BurnPendingError), so the lock is
//   always released. A deletion that timed out stays queued; pendingDeletion() lets vaultStore announce a vault change
//   once it completes, so nothing stays blocked waiting for a vault operation that may never come (T-054 review round 4).
import { del, get, promisifyRequest, type UseStore } from 'idb-keyval';
import { closableStore, databaseExists } from './idb';

export const KEYS_DB = 'se-vault-keys';
export const KEY_ID = 'vault-key-v1';
/** Present in se-vault-keys from the moment the key is deleted until every vault database is gone (interrupted burn). */
export const BURN_PENDING = 'burn-pending';
export const VAULT_LOCK = 'se-vault';

// idb-keyval allows one object store per database. Never use its default store:
// tesseract.js caches eng.traineddata there.
let keyStore: UseStore | null = null;
const keys = () => (keyStore ??= closableStore(KEYS_DB, 'keys'));

export interface Sealed { v: 1; iv: Uint8Array<ArrayBuffer>; ct: ArrayBuffer }

// ---------- lock ----------
/** Proof that the caller runs inside withVaultLock(). Valid only while that callback runs; it cannot be forged. */
export type VaultLock = { readonly vaultLock: true };
const liveLocks = new WeakSet<VaultLock>();

/** A key operation was attempted outside withVaultLock() (or with a token whose callback already finished). */
export class VaultLockNotHeldError extends Error {
  constructor() { super('vault lock not held'); this.name = 'VaultLockNotHeldError'; }
}
const held = (lock: VaultLock | undefined): boolean => !!lock && liveLocks.has(lock);

let chain: Promise<unknown> = Promise.resolve();

type LockManagerLike = { request<T>(name: string, cb: () => Promise<T>): Promise<T> };

/** Run fn exclusively: serialised within this tab, and across tabs when the Web Locks API exists. */
export function withVaultLock<T>(fn: (lock: VaultLock) => Promise<T>): Promise<T> {
  const go = async (): Promise<T> => {
    const lock: VaultLock = Object.freeze({ vaultLock: true as const });
    liveLocks.add(lock);
    try {
      return await fn(lock);
    } finally {
      liveLocks.delete(lock);
    }
  };
  const run = (): Promise<T> => {
    const locks = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator?.locks;
    return locks ? locks.request(VAULT_LOCK, go) : go();
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

// ---------- key ----------
/** The stored vault key, or undefined if none exists (fresh device, or after Burn vault). Never creates one. */
export async function getVaultKey(): Promise<CryptoKey | undefined> {
  return get<CryptoKey>(KEY_ID, keys());
}

let creating: Promise<CryptoKey> | null = null;

/**
 * Return the vault key, creating it once if needed. Only for a caller inside withVaultLock() that is ADDING vault items
 * (AC-270: after a burn, a new key is created only by the next add). Concurrent callers (and other tabs) all get the
 * persisted key.
 */
export function ensureVaultKey(lock: VaultLock): Promise<CryptoKey> {
  if (!held(lock)) return Promise.reject(new VaultLockNotHeldError());
  creating ??= (async () => {
    const existing = await getVaultKey();
    if (existing) return existing;
    const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    // add() (not put) so a key written meanwhile by another tab is never overwritten.
    await keys()('readwrite', (store) => new Promise<void>((resolve) => {
      const r = store.add(fresh, KEY_ID);
      r.onsuccess = () => resolve();
      r.onerror = (e) => { e.preventDefault(); resolve(); }; // ConstraintError: someone else won; use theirs
    }));
    const stored = await getVaultKey();
    if (!stored) throw new Error('vault key was not persisted');
    return stored;
  })().finally(() => { creating = null; });
  return creating;
}

/**
 * Burn step 1 (AC-271): delete the key and record BURN_PENDING in ONE transaction, and wait for it to commit.
 * Ciphertext sealed with the key becomes unrecoverable; the marker makes the next load finish the burn.
 */
export async function deleteVaultKey(lock: VaultLock): Promise<void> {
  if (!held(lock)) throw new VaultLockNotHeldError();
  await keys()('readwrite', (store) => {
    try {
      store.put(1, BURN_PENDING);
      store.delete(KEY_ID);
    } catch (e) {
      try { store.transaction.abort(); } catch { /* already finished */ }
      throw e;
    }
    return promisifyRequest(store.transaction);
  });
}

/**
 * True while a burn has deleted the key but not yet every vault database (an interrupted burn). Reads the marker only.
 * Never CREATES se-vault-keys (AC-241, T-054 review rounds 3 and 4: every boot runs this, Judge Mode too, and opening
 * it to read the marker would create it on a fresh profile). When indexedDB.databases() works and does not list it, or
 * (where databases() is missing or fails) idb.databaseExists finds it absent without creating it, there is no marker.
 * An existing se-vault-keys is always read, so an interrupted burn is never skipped.
 */
export async function burnPending(): Promise<boolean> {
  const listed = await listedDatabases();
  if (listed ? !listed.has(KEYS_DB) : !(await databaseExists(KEYS_DB))) return false;
  return (await get(BURN_PENDING, keys())) !== undefined;
}

/** The database names indexedDB.databases() lists, or null where it is missing or fails (then nothing is ruled out). */
export async function listedDatabases(): Promise<ReadonlySet<string> | null> {
  try {
    if (typeof indexedDB.databases !== 'function') return null;
    return new Set((await indexedDB.databases()).flatMap((d) => (d.name ? [d.name] : [])));
  } catch {
    return null;
  }
}

/** The last burn step: every vault database is gone. */
export async function clearBurnPending(lock: VaultLock): Promise<void> {
  if (!held(lock)) throw new VaultLockNotHeldError();
  await del(BURN_PENDING, keys());
}

// ---------- seal ----------
/** Encrypt with an explicit key. Callers obtain the key under withVaultLock (ensureVaultKey or getVaultKey). */
export async function seal(value: unknown, key: CryptoKey): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt);
  return { v: 1, iv, ct };
}

export class VaultLockedError extends Error {
  constructor() { super('vault key missing'); this.name = 'VaultLockedError'; }
}

/**
 * Stored vault data cannot be read: it does not decrypt with the stored key, or it is not a record this build knows.
 * Shown to the user; the fix is Burn vault. Nothing is ever written over it.
 */
export class VaultCorruptError extends Error {
  constructor() { super('vault data cannot be read with the stored key'); this.name = 'VaultCorruptError'; }
}

export async function unseal<T>(rec: Sealed, key?: CryptoKey): Promise<T> {
  const k = key ?? (await getVaultKey());
  if (!k) throw new VaultLockedError();
  let pt: ArrayBuffer;
  try {
    pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, k, rec.ct);
  } catch {
    throw new VaultCorruptError();
  }
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

export function isSealed(x: unknown): x is Sealed {
  const r = x as Partial<Sealed> | null;
  return !!r && r.v === 1 && r.iv instanceof Uint8Array && r.ct instanceof ArrayBuffer;
}

/**
 * A database was not deleted in time: another connection (another tab, or code that does not close on `versionchange`)
 * may keep it open, the deletion may just be slow, or this tab's earlier deletion of it is still pending. The deletion
 * is still queued and completes on its own; when it does, a vault change is announced (vaultStore), so every index
 * reloads and that load finishes the burn. The UI must show this instead of `copy.burn.done`.
 */
export class BurnPendingError extends Error {
  readonly db: string;
  constructor(db: string) { super(`deletion of ${db} has not completed yet`); this.name = 'BurnPendingError'; this.db = db; }
}

/** How long the user's own Burn vault waits for each deletion to complete (other connections closing) before BurnPendingError. */
export const DELETE_BLOCKED_TIMEOUT_MS = 3000;
/**
 * How long a burn RETRY waits for each deletion (every load and every boot, Judge Mode too, finishes an interrupted
 * burn). Short, because each retry holds the cross-tab vault lock and every open tab retries when a burn fails: at
 * 3 s each, a stuck burn took 3 s × (tabs + 1) to report and a Judge-Mode boot waited 3 s (T-054 review round 3).
 * A deletion still blocked (or merely slow) after this stays queued; once it completes, a vault change is announced and
 * the reload it triggers finishes the burn (vaultStore, T-054 review round 4).
 */
export const BURN_RETRY_TIMEOUT_MS = 250;

/** This tab's deletion requests that have not completed yet: database name → settles when that request does. */
const deleting = new Map<string, Promise<void>>();

/**
 * This tab's deletion of `name` that has not completed yet, or undefined. A deletion that timed out (BurnPendingError)
 * stays here until it really completes: it resolves once the database is deleted and rejects if the deletion failed.
 */
export function pendingDeletion(name: string): Promise<void> | undefined {
  return deleting.get(name);
}

/**
 * Delete a whole IndexedDB database. Resolves only once it is really deleted, and never waits longer than `timeoutMs`
 * (its callers hold the vault lock, which spans tabs: an unbounded wait would freeze every vault operation everywhere):
 * - The timer starts when the request is made, not on `blocked`: a request queued behind another pending deletion of
 *   the same database (another tab's) never receives `blocked` while that one waits.
 * - While this tab's own earlier deletion of `name` is still pending, it rejects at once with BurnPendingError instead
 *   of queuing another request behind it (T-054 review round 2: that retry hung forever, holding the lock).
 * On timeout it rejects with BurnPendingError; the deletion itself stays queued (pendingDeletion) and completes when the
 * blocking connection closes. A request that cannot even be made rejects (never throws synchronously).
 */
export function deleteDatabase(name: string, timeoutMs = DELETE_BLOCKED_TIMEOUT_MS): Promise<void> {
  if (deleting.has(name)) return Promise.reject(new BurnPendingError(name));
  const deleted = new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
  deleting.set(name, deleted);
  const forget = () => { if (deleting.get(name) === deleted) deleting.delete(name); };
  deleted.then(forget, forget);
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new BurnPendingError(name)), timeoutMs);
    deleted.then(
      () => { clearTimeout(timer); resolve(); },
      (e: unknown) => { clearTimeout(timer); reject(e); },
    );
  });
}
