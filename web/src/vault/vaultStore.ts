// web/src/vault/vaultStore.ts: CRUD over the sealed vault (ARCH §16.3/§16.4, SPEC SCR-04/SCR-19, D-23, D-31).
// The whole vault is one sealed record `vault:v1` in IndexedDB 'se-vault-data'. Vault data never leaves the device.
// No logging in this folder (SR-15).
import { get, set, type UseStore } from 'idb-keyval';
import { closableStore } from './idb';
import { PIN_KINDS, VAULT_KINDS, VAULT_LABEL_MAX, VAULT_MAX_ITEMS, type Pin, type VaultItem, type VaultKind } from '../core/types';
import {
  deleteDatabase, deleteVaultKey, ensureVaultKey, getVaultKey, isSealed, seal, unseal, withVaultLock,
  VaultLockedError, type Sealed,
} from './crypto';

export const DATA_DB = 'se-vault-data';
export const SESSIONS_DB = 'se-sessions';
export const LEDGER_DB = 'se-ledger';
const RECORD = 'vault:v1';

let dataStore: UseStore | null = null;
const data = () => (dataStore ??= closableStore(DATA_DB, 'items'));

export class VaultValidationError extends Error {
  readonly code: 'full' | 'label_too_long' | 'alias_too_long' | 'bad_kind' | 'pin_required' | 'pin_not_allowed' | 'bad_pin' | 'not_found';
  constructor(code: VaultValidationError['code']) { super(`vault: ${code}`); this.name = 'VaultValidationError'; this.code = code; }
}

export const isPinKind = (k: VaultKind) => PIN_KINDS.includes(k);

function validPin(p: Pin): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
    && Number.isFinite(p.accuracyM) && p.accuracyM >= 0;
}

/** Throws VaultValidationError if the item breaks a vault rule (D-23: ≤ 20 items, labels ≤ 40 chars). */
export function validateItem(item: VaultItem): void {
  if (!(VAULT_KINDS as readonly string[]).includes(item.kind)) throw new VaultValidationError('bad_kind');
  if ([...item.label].length > VAULT_LABEL_MAX) throw new VaultValidationError('label_too_long');
  if (item.aliases.some((a) => [...a].length > VAULT_LABEL_MAX)) throw new VaultValidationError('alias_too_long');
  if (isPinKind(item.kind)) {
    if (!item.pin) throw new VaultValidationError('pin_required');
    if (!validPin(item.pin)) throw new VaultValidationError('bad_pin');
  } else if (item.pin) {
    throw new VaultValidationError('pin_not_allowed');
  }
}

/** Read the vault (under the vault lock, so it never observes a half-finished burn). */
export function loadVault(): Promise<VaultItem[]> {
  return withVaultLock(loadUnlocked);
}

async function loadUnlocked(): Promise<VaultItem[]> {
  const rec = await get<Sealed>(RECORD, data());
  if (!rec || !isSealed(rec)) return [];
  const key = await getVaultKey();
  if (!key) return []; // key burned: whatever ciphertext remains is unreadable
  return unseal<VaultItem[]>(rec, key); // VaultCorruptError if it does not decrypt
}

async function saveUnlocked(items: VaultItem[], key: CryptoKey): Promise<void> {
  if (items.length > VAULT_MAX_ITEMS) throw new VaultValidationError('full');
  items.forEach(validateItem);
  await set(RECORD, await seal(items, key), data());
}

export function newVaultId(): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return 'vi_' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function addItem(input: Omit<VaultItem, 'id' | 'createdAt'> & Partial<Pick<VaultItem, 'id' | 'createdAt'>>): Promise<VaultItem> {
  return withVaultLock(async () => {
    const items = await loadUnlocked();
    if (items.length >= VAULT_MAX_ITEMS) throw new VaultValidationError('full');
    const item: VaultItem = { ...input, id: input.id ?? newVaultId(), createdAt: input.createdAt ?? Date.now() };
    validateItem(item);
    // Adding is the only vault operation that may create the key (AC-270).
    const key = await ensureVaultKey();
    await saveUnlocked([...items, item], key);
    return item;
  });
}

/** Add several items in one write (e.g. a pin plus its linked area_name item, SCR-04). All or nothing. */
export function addItems(inputs: Array<Omit<VaultItem, 'id' | 'createdAt'> & Partial<Pick<VaultItem, 'id' | 'createdAt'>>>): Promise<VaultItem[]> {
  return withVaultLock(async () => {
    const items = await loadUnlocked();
    if (items.length + inputs.length > VAULT_MAX_ITEMS) throw new VaultValidationError('full');
    const now = Date.now();
    const added = inputs.map((x) => ({ ...x, id: x.id ?? newVaultId(), createdAt: x.createdAt ?? now }));
    added.forEach(validateItem);
    const key = await ensureVaultKey();
    await saveUnlocked([...items, ...added], key);
    return added;
  });
}

export function updateItem(id: string, patch: Partial<Omit<VaultItem, 'id' | 'createdAt'>>): Promise<VaultItem> {
  return withVaultLock(async () => {
    const items = await loadUnlocked();
    const i = items.findIndex((x) => x.id === id);
    if (i < 0) throw new VaultValidationError('not_found');
    const key = await getVaultKey();
    if (!key) throw new VaultLockedError();
    const next = { ...items[i], ...patch };
    validateItem(next);
    items[i] = next;
    await saveUnlocked(items, key);
    return next;
  });
}

export function removeItem(id: string): Promise<void> {
  return withVaultLock(async () => {
    const items = await loadUnlocked();
    const next = items.filter((x) => x.id !== id);
    if (next.length === items.length) throw new VaultValidationError('not_found');
    const key = await getVaultKey();
    if (!key) throw new VaultLockedError();
    await saveUnlocked(next, key);
  });
}

/**
 * Burn vault (D-31, ARCH §16.4): delete the KEY FIRST, so an interruption leaves nothing decryptable (AC-271);
 * then the vault, sessions/queue and ledger databases. There is no partial option.
 * Runs under the vault lock, so an add/update/remove can never resurrect pre-burn items.
 * The Tesseract cache ('keyval-store') is never touched. A new key is created only when the next item is added (AC-270).
 */
export function burnVault(): Promise<void> {
  return withVaultLock(async () => {
    await deleteVaultKey();
    await deleteDatabase(DATA_DB);
    await deleteDatabase(SESSIONS_DB);
    await deleteDatabase(LEDGER_DB);
  });
}
