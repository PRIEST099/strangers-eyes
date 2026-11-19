// web/src/vault/crypto.ts: the vault key, seal/unseal and the vault lock (ARCH §16.3, API-NOTES §5.4).
// A NON-EXTRACTABLE AES-GCM-256 CryptoKey lives in its own IndexedDB database. exportKey/wrapKey throw.
// Every write uses a fresh random 96-bit IV. Ported from research/day1-artifacts/web-ref/src/lib/vault.ts.
// No logging in this folder: vault data must never reach a console or a remote log (SR-15).
//
// Concurrency rules (review findings privacy-correctness-1/2/7):
// - Every read-modify-write of sealed data and Burn vault runs inside withVaultLock(): one queue per tab,
//   plus navigator.locks across tabs. Never nest withVaultLock() calls (it would deadlock).
// - seal() never creates a key. Only ensureVaultKey() does, single-flight and add-if-absent, and every caller
//   then uses the key that actually persisted.
import { del, get, type UseStore } from 'idb-keyval';
import { closableStore } from './idb';

export const KEYS_DB = 'se-vault-keys';
export const KEY_ID = 'vault-key-v1';
export const VAULT_LOCK = 'se-vault';

// idb-keyval allows one object store per database. Never use its default store:
// tesseract.js caches eng.traineddata there.
let keyStore: UseStore | null = null;
const keys = () => (keyStore ??= closableStore(KEYS_DB, 'keys'));

export interface Sealed { v: 1; iv: Uint8Array<ArrayBuffer>; ct: ArrayBuffer }

// ---------- lock ----------
let chain: Promise<unknown> = Promise.resolve();

type LockManagerLike = { request<T>(name: string, cb: () => Promise<T>): Promise<T> };

/** Run fn exclusively: serialised within this tab, and across tabs when the Web Locks API exists. */
export function withVaultLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = (): Promise<T> => {
    const locks = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator?.locks;
    return locks ? locks.request(VAULT_LOCK, fn) : fn();
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

/** Return the vault key, creating it once if needed. Concurrent callers (and other tabs) all get the persisted key. */
export function ensureVaultKey(): Promise<CryptoKey> {
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

/** Delete the key. Ciphertext sealed with it becomes unrecoverable. Burn vault calls this FIRST (AC-271). */
export async function deleteVaultKey(): Promise<void> {
  await del(KEY_ID, keys());
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

/** Ciphertext exists but does not decrypt with the stored key. Shown to the user; the fix is Burn vault. */
export class VaultCorruptError extends Error {
  constructor() { super('vault data does not decrypt with the stored key'); this.name = 'VaultCorruptError'; }
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

/** Delete a whole IndexedDB database. Resolves on success or when blocked (the deletion completes once tabs close). */
export function deleteDatabase(name: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
    r.onblocked = () => resolve();
  });
}
