// web/src/vault/vaultStore.ts: CRUD over the sealed vault (ARCH §16.3/§16.4, SPEC SCR-04/SCR-19, D-23, D-31).
// The whole vault is one sealed record `vault:v1` in IndexedDB 'se-vault-data'. Vault data never leaves the device.
// Every committed change is announced (vault/sync.ts), so the in-memory index of this tab and of every other tab is
// rebuilt (ARCH §8.4). No logging in this folder (SR-15).
import { get, set, type UseStore } from 'idb-keyval';
import { closableStore } from './idb';
import { announceVaultChange } from './sync';
import { alnum, GENERIC_PIN_LABELS, normalize } from '../tier0/fuzzy';
import { PIN_KINDS, VAULT_KINDS, VAULT_LABEL_MAX, VAULT_MAX_ITEMS, type Pin, type VaultItem, type VaultKind } from '../core/types';
import {
  burnPending, BURN_RETRY_TIMEOUT_MS, clearBurnPending, deleteDatabase, DELETE_BLOCKED_TIMEOUT_MS, deleteVaultKey,
  ensureVaultKey, getVaultKey, isSealed, listedDatabases, pendingDeletion, seal, unseal, withVaultLock, VaultCorruptError,
  VaultLockedError, type VaultLock,
} from './crypto';

export const DATA_DB = 'se-vault-data';
export const SESSIONS_DB = 'se-sessions';
export const LEDGER_DB = 'se-ledger';
/** Every database a burn deletes, in order (ARCH §16.4 steps 2–3). se-vault-keys stays: step 1 deletes only the key. */
const BURN_DBS = [DATA_DB, SESSIONS_DB, LEDGER_DB] as const;
const RECORD = 'vault:v1';
/** Aliases per item (T-054 review): labels and aliases are joined into on-device prompts, which D-23 keeps small. */
export const VAULT_ALIASES_MAX = 5;
/** Vault item ids are newVaultId()'s shape only: they reach the unsealed ledger (blocked.vaultId), so never free text. */
export const VAULT_ID_RE = /^vi_[0-9a-f]{12}$/;
/** Pin sources allowed in the REAL vault ('synthetic' is Judge Mode only). */
const REAL_PIN_SOURCES: readonly Pin['source'][] = ['geolocation', 'manual'];

let dataStore: UseStore | null = null;
const data = () => (dataStore ??= closableStore(DATA_DB, 'items'));

export type VaultValidationCode =
  | 'full' | 'label_too_long' | 'alias_too_long' | 'too_many_aliases' | 'label_required' | 'bad_kind' | 'pin_required'
  | 'pin_not_allowed' | 'bad_pin' | 'bad_id' | 'duplicate_id' | 'bad_link' | 'bad_timestamp' | 'not_found'
  /** A field of the wrong type from an untyped caller (aliases not a list of strings, an item or patch not an object). */
  | 'bad_item';

export class VaultValidationError extends Error {
  readonly code: VaultValidationCode;
  constructor(code: VaultValidationCode) { super(`vault: ${code}`); this.name = 'VaultValidationError'; this.code = code; }
}

export const isPinKind = (k: VaultKind) => PIN_KINDS.includes(k);
const validTime = (t: unknown): boolean => typeof t === 'number' && Number.isFinite(t) && t >= 0;

/** The only fields a stored item may have (core/types VaultItem): nothing unvalidated is ever sealed (T-054 final review). */
const ITEM_KEYS: ReadonlySet<string> = new Set(['id', 'kind', 'label', 'aliases', 'pin', 'linkedPinId', 'createdAt']);
/** The only fields a stored pin may have (core/types Pin; round-5 verifier: extra pin fields were sealed as given). */
const PIN_KEYS: ReadonlySet<string> = new Set(['lat', 'lng', 'accuracyM', 'capturedAt', 'source']);

function validPin(p: Pin): boolean {
  return typeof p === 'object' && p !== null && !Array.isArray(p) && Object.keys(p).every((k) => PIN_KEYS.has(k))
    && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && Number.isFinite(p.accuracyM) && p.accuracyM >= 0
    && validTime(p.capturedAt) && REAL_PIN_SOURCES.includes(p.source);
}

/**
 * A vault string that protects nothing, so it is never a term (AC-088, D-36): empty once normalised, or a generic place
 * word (GENERIC_PIN_LABELS: "Home", "Work", "School", "Place" …). ai/vaultScan.ts termsOf drops every such label and
 * alias, of every kind; validateItem refuses one as a text item's label (label_required). Lives here, not in vaultScan,
 * because vaultScan imports this module.
 */
export function isGenericVaultString(s: string): boolean {
  const n = normalize(s);
  return (n === '' && alnum(s) === '') || GENERIC_PIN_LABELS.has(n);
}

/**
 * Throws VaultValidationError if one item breaks a vault rule (D-23: labels ≤ 40 chars; ≤ VAULT_ALIASES_MAX aliases),
 * also for a field of the wrong type from an untyped caller (never a TypeError, so the UI always gets a `code`).
 * Lengths count Unicode code points of the string as given (no normalisation). A text item's label must contribute a
 * term: an empty or generic label ("Work" for an employer) would protect nothing (AC-088), so it is refused
 * (label_required); a generic alias is allowed and simply contributes nothing. A pin's label may be empty or generic
 * (D-36: its coordinates still protect it). linkedPinId is for area_name only; validateVault checks what it points at.
 */
/**
 * The value exactly as seal() will store it (a JSON round trip), so what is validated IS what is sealed: an inherited
 * toJSON (a Date-based pin), a getter or a class instance can no longer pass validation and then be stored as
 * something else (round-6 verifier). A value JSON cannot hold (BigInt, a cycle) is bad_item, never a TypeError.
 */
function asSealed<T>(x: T): T {
  let json: string | undefined;
  try { json = JSON.stringify(x); } catch { throw new VaultValidationError('bad_item'); }
  if (json === undefined) throw new VaultValidationError('bad_item');
  return JSON.parse(json) as T;
}

export function validateItem(item: VaultItem): void {
  if (typeof item !== 'object' || item === null) throw new VaultValidationError('bad_item');
  if (Object.keys(item).some((k) => !ITEM_KEYS.has(k))) throw new VaultValidationError('bad_item');   // nothing unvalidated is sealed
  if (typeof item.id !== 'string' || !VAULT_ID_RE.test(item.id)) throw new VaultValidationError('bad_id');
  if (!(VAULT_KINDS as readonly string[]).includes(item.kind)) throw new VaultValidationError('bad_kind');
  if (!validTime(item.createdAt)) throw new VaultValidationError('bad_timestamp');
  if (typeof item.label !== 'string') throw new VaultValidationError('label_required');
  // Array.from turns holes into undefined: Array.prototype.some skips holes, so a sparse [, 'Ottie'] would pass, be
  // stored, read back as [null, …] and then break termsOf on every load (T-054 final review).
  if (!Array.isArray(item.aliases) || Array.from(item.aliases).some((a) => typeof a !== 'string')) throw new VaultValidationError('bad_item');
  if ([...item.label].length > VAULT_LABEL_MAX) throw new VaultValidationError('label_too_long');
  if (item.aliases.length > VAULT_ALIASES_MAX) throw new VaultValidationError('too_many_aliases');
  if (item.aliases.some((a) => [...a].length > VAULT_LABEL_MAX)) throw new VaultValidationError('alias_too_long');
  if (isPinKind(item.kind)) {
    if (!item.pin) throw new VaultValidationError('pin_required');
    if (!validPin(item.pin)) throw new VaultValidationError('bad_pin');
  } else {
    if (item.pin !== undefined) throw new VaultValidationError('pin_not_allowed');   // null, '' or 0 too (round-5 verifier)
    if (isGenericVaultString(item.label)) throw new VaultValidationError('label_required');   // = termsOf's test
  }
  if (item.linkedPinId !== undefined && (item.kind !== 'area_name' || !VAULT_ID_RE.test(item.linkedPinId))) {
    throw new VaultValidationError('bad_link');
  }
}

/** Every item is valid, ids are unique, and every linkedPinId names a home_pin in the same vault (SCR-04, D-63). */
export function validateVault(items: readonly VaultItem[]): void {
  if (items.length > VAULT_MAX_ITEMS) throw new VaultValidationError('full');
  const byId = new Map<string, VaultItem>();
  for (const item of items) {
    validateItem(item);
    if (byId.has(item.id)) throw new VaultValidationError('duplicate_id');
    byId.set(item.id, item);
  }
  for (const item of items) {
    if (item.linkedPinId !== undefined && byId.get(item.linkedPinId)?.kind !== 'home_pin') throw new VaultValidationError('bad_link');
  }
}

/** Read the vault (under the vault lock, so it never observes a half-finished burn). */
export function loadVault(): Promise<VaultItem[]> {
  return withVaultLock(loadUnlocked);
}

/**
 * - An interrupted burn (BURN_PENDING) is finished first, and the vault reads empty. While it still cannot finish,
 *   the load rejects (e.g. BurnPendingError) and the index stays blocked.
 * - No record, or no key (burned): empty.
 * - A record this build does not recognise, or that does not decrypt: VaultCorruptError (fail closed; never overwritten).
 */
async function loadUnlocked(lock: VaultLock): Promise<VaultItem[]> {
  if (await finishBurnUnlocked(lock)) return [];
  const rec = await get<unknown>(RECORD, data());
  if (rec === undefined) return [];
  if (!isSealed(rec)) throw new VaultCorruptError();
  const key = await getVaultKey();
  if (!key) return []; // key burned: whatever ciphertext remains is unreadable
  return unseal<VaultItem[]>(rec, key); // VaultCorruptError if it does not decrypt
}

async function saveUnlocked(items: VaultItem[], key: CryptoKey): Promise<void> {
  validateVault(items);
  await set(RECORD, await seal(items, key), data());
  announceVaultChange();
}

export function newVaultId(): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return 'vi_' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

type NewItem = Omit<VaultItem, 'id' | 'createdAt'> & Partial<Pick<VaultItem, 'id' | 'createdAt'>>;

export function addItem(input: NewItem): Promise<VaultItem> {
  return addItems([input]).then(([item]) => item);
}

/**
 * Add one or more items in one write (e.g. a home pin plus its linked area_name item, SCR-04: give the pin an id from
 * newVaultId() and the area that id as linkedPinId). All or nothing: the whole new vault is checked before the key is
 * touched, so a refused add writes nothing and, on a fresh device, creates no key. Adding nothing writes nothing.
 * Adding is the only vault operation that may create the key (AC-270).
 */
export function addItems(inputs: NewItem[]): Promise<VaultItem[]> {
  return withVaultLock(async (lock) => {
    if (inputs.length === 0) return [];
    const items = await loadUnlocked(lock);
    if (items.length + inputs.length > VAULT_MAX_ITEMS) throw new VaultValidationError('full');
    const now = Date.now();
    const added = inputs.map((x) => asSealed({ ...x, id: x.id ?? newVaultId(), createdAt: x.createdAt ?? now }));
    const next = [...items, ...added];
    validateVault(next);
    const key = await ensureVaultKey(lock);
    await saveUnlocked(next, key);
    return added;
  });
}

/**
 * Change one item. A patch field that is undefined means "no change" (TypeScript allows `{ label: undefined }` here):
 * it is dropped before merging, so it can neither erase a field nor surface as a TypeError. So an optional field
 * (linkedPinId) cannot be removed here; removeItem unlinks an area from a removed pin. Every other bad value is a
 * VaultValidationError (validateItem), and a refused update writes nothing.
 */
export function updateItem(id: string, patch: Partial<Omit<VaultItem, 'id' | 'createdAt'>>): Promise<VaultItem> {
  return withVaultLock(async (lock) => {
    // An array patch or an unknown field ends up as an unknown item field, which validateItem refuses (ITEM_KEYS).
    if (typeof patch !== 'object' || patch === null) throw new VaultValidationError('bad_item');
    const items = await loadUnlocked(lock);
    const i = items.findIndex((x) => x.id === id);
    if (i < 0) throw new VaultValidationError('not_found');
    const key = await getVaultKey();
    if (!key) throw new VaultLockedError();
    const changes = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    // id and createdAt never change, even if a runtime caller slips them into the patch.
    const next: VaultItem = asSealed({ ...items[i], ...changes, id: items[i].id, createdAt: items[i].createdAt });
    const all = items.map((x, j) => (j === i ? next : x));
    validateVault(all);
    await saveUnlocked(all, key);
    return next;
  });
}

/** Remove one item. An area_name linked to a removed pin stays (it still means the home area) and loses its link. */
export function removeItem(id: string): Promise<void> {
  return withVaultLock(async (lock) => {
    const items = await loadUnlocked(lock);
    if (!items.some((x) => x.id === id)) throw new VaultValidationError('not_found');
    const key = await getVaultKey();
    if (!key) throw new VaultLockedError();
    const next = items.filter((x) => x.id !== id).map((x) => {
      if (x.linkedPinId !== id) return x;
      const unlinked = { ...x };
      delete unlinked.linkedPinId;
      return unlinked;
    });
    await saveUnlocked(next, key);
  });
}

/**
 * ARCH §16.4 steps 1–3. Every deletion is requested even if an earlier one fails; the marker goes only when all succeed.
 * Each deletion may take `timeoutMs` before BurnPendingError (it stays queued): DELETE_BLOCKED_TIMEOUT_MS for the user's
 * own Burn vault, BURN_RETRY_TIMEOUT_MS for a retry. A retry skips a database indexedDB.databases() no longer lists:
 * it is already gone (an earlier, queued deletion completed). Without that, deletions that are merely slow would time
 * out on every retry, and each completion would announce another retry, forever (T-054 review round 4). The user's own
 * Burn vault always requests all three. On failure, the deletions still queued in this tab are watched
 * (announceWhenDeleted).
 */
async function burnUnlocked(lock: VaultLock, timeoutMs: number, retry: boolean): Promise<void> {
  await deleteVaultKey(lock);   // FIRST, with the BURN_PENDING marker in the same transaction (AC-271)
  const listed = retry ? await listedDatabases() : null;
  const dbs = listed ? BURN_DBS.filter((db) => listed.has(db)) : BURN_DBS;
  const results = await Promise.allSettled(dbs.map((db) => deleteDatabase(db, timeoutMs)));
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) {
    announceWhenDeleted();
    throw failed.reason;
  }
  await clearBurnPending(lock);
}

/** Queued deletions already watched by announceWhenDeleted: each is announced once, whatever the number of failed retries. */
const watched = new WeakSet<Promise<void>>();

/**
 * A burn step failed while some of this tab's deletions are still queued (they timed out, or an earlier one was still
 * pending). When ALL of them have completed, announce a vault change once: every index (this tab's and every other
 * tab's) reloads, and that load finishes the burn. Without this, a boot whose deletions were merely slow (longer than
 * BURN_RETRY_TIMEOUT_MS, not blocked) stayed blocked until some later vault operation (T-054 review round 4).
 * Never announces a failure (a deletion that fails, or never completes): every announcement makes every index reload,
 * and that reload retries the burn, so announcing failures loops (the round-2 storm). Announces nothing either when no
 * deletion of this tab is still queued.
 */
function announceWhenDeleted(): void {
  const queued = BURN_DBS.map((db) => pendingDeletion(db)).filter((p): p is Promise<void> => p !== undefined);
  if (queued.every((p) => watched.has(p))) return;
  for (const p of queued) watched.add(p);
  Promise.all(queued).then(announceVaultChange, () => undefined);
}

/**
 * If a burn was interrupted (BURN_PENDING), finish it now: true once finished. Announced when it really finished, so
 * other tabs' blocked indexes reload once. A retry that fails rejects and announces nothing now: every index answers an
 * announcement with a load, and that load retries the burn, so announcing a failure set off an endless cross-tab retry
 * storm (T-054 review round 2: ~830 loads/s). It announces later only if its queued deletions complete
 * (announceWhenDeleted). Each deletion waits at most BURN_RETRY_TIMEOUT_MS: every open tab retries under the
 * cross-tab vault lock after a failed burn (T-054 review round 3). Reads no vault data and never unseals (D-37); on a
 * fresh profile it opens and creates no database (crypto.burnPending, AC-241).
 */
async function finishBurnUnlocked(lock: VaultLock): Promise<boolean> {
  if (!(await burnPending())) return false;
  await burnUnlocked(lock, BURN_RETRY_TIMEOUT_MS, true);
  announceVaultChange();
  return true;
}

/**
 * Boot step for EVERY mode (ARCH §15.1, D-37): finish an interrupted burn without reading the vault. Judge-Mode boot
 * never loads the real vault, so without this a burn interrupted before a Judge-Mode visit would leave the old
 * sessions and ledger on disk. Unseals nothing, and on a fresh profile creates no database (AC-241), also where
 * indexedDB.databases() is missing or fails. Rejects (e.g. BurnPendingError after BURN_RETRY_TIMEOUT_MS) while a
 * deletion is still queued; the marker then stays, a vault change is announced once that deletion completes, and the
 * next boot or load retries.
 */
export function finishPendingBurn(): Promise<void> {
  return withVaultLock(async (lock) => { await finishBurnUnlocked(lock); });
}

/**
 * Burn vault (D-31, ARCH §16.4): delete the KEY FIRST, so an interruption leaves nothing decryptable (AC-271);
 * then the vault, sessions/queue and ledger databases. There is no partial option.
 * Runs under the vault lock, so an add/update/remove can never resurrect pre-burn items. If it is interrupted after the
 * key, the next load finishes it. Rejects with BurnPendingError when a deletion has not completed within
 * DELETE_BLOCKED_TIMEOUT_MS (e.g. another connection keeps the database open).
 * The Tesseract cache ('keyval-store') is never touched. A new key is created only when the next item is added (AC-270).
 * Every tab's vault index is told (vault/sync.ts), whether or not the burn finished. The UI calls vault/burn.ts
 * performBurn(), which also empties this tab's index at once (ARCH §16.4 step 4).
 */
export function burnVault(): Promise<void> {
  return withVaultLock(async (lock) => {
    try {
      await burnUnlocked(lock, DELETE_BLOCKED_TIMEOUT_MS, false);
    } finally {
      announceVaultChange();
    }
  });
}
