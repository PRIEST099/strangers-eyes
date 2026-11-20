import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, set } from 'idb-keyval';
import {
  addItem, addItems, burnVault, finishPendingBurn, loadVault, newVaultId, removeItem, updateItem, validateItem, VaultValidationError,
  DATA_DB, LEDGER_DB, SESSIONS_DB, VAULT_ALIASES_MAX,
} from './vaultStore';
import { onVaultChange } from './sync';
import {
  BURN_PENDING, burnPending, BurnPendingError, BURN_RETRY_TIMEOUT_MS, deleteDatabase, DELETE_BLOCKED_TIMEOUT_MS, ensureVaultKey,
  getVaultKey, isSealed, KEY_ID, KEYS_DB, seal, unseal, VaultCorruptError, VaultLockedError, VaultLockNotHeldError, withVaultLock,
  type Sealed, type VaultLock,
} from './crypto';
import { closableStore } from './idb';
import { dumpIdb, spyIdbDeletes, textViews } from './idb.testutil';
import { VAULT_MAX_ITEMS, type VaultItem } from '../core/types';

const pin = { lat: 52.52, lng: 13.405, accuracyM: 12, capturedAt: 1, source: 'manual' as const };
const tick = () => new Promise<void>((r) => setImmediate(r));
/** The vault key, created if needed, the only legal way: inside the vault lock. */
const lockedKey = () => withVaultLock((lock) => ensureVaultKey(lock));

async function reset() {
  await deleteDatabase(KEYS_DB);
  await deleteDatabase(DATA_DB);
}

describe('vault crypto', () => {
  beforeEach(reset);

  it('creates a non-extractable AES-GCM key once and reuses it', async () => {
    expect(await getVaultKey()).toBeUndefined();
    const k1 = await lockedKey();
    const k2 = await lockedKey();
    expect(k1.extractable).toBe(false);
    expect(k1.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    await expect(crypto.subtle.exportKey('raw', k2)).rejects.toThrow();
  });

  it('round-trips with a fresh IV per seal', async () => {
    const key = await lockedKey();
    const a = await seal({ label: 'Lucas' }, key);
    const b = await seal({ label: 'Lucas' }, key);
    expect(Array.from(a.iv)).not.toEqual(Array.from(b.iv));
    expect(await unseal(a)).toEqual({ label: 'Lucas' });
  });

  it('refuses to unseal without a key, and reports data that does not decrypt', async () => {
    const s = await seal({ x: 1 }, await lockedKey());
    await deleteDatabase(KEYS_DB);
    await expect(unseal(s)).rejects.toBeInstanceOf(VaultLockedError);
    await lockedKey(); // a different key
    await expect(unseal(s)).rejects.toBeInstanceOf(VaultCorruptError);
  });

  it('concurrent first-time key creation yields ONE persisted key (review privacy-correctness-2)', async () => {
    for (let d = 0; d < 10; d++) {
      await reset();
      const p1 = lockedKey();
      for (let k = 0; k < d; k++) await tick();
      const p2 = d % 2 ? lockedKey() : withVaultLock(async (lock) => (await Promise.all([ensureVaultKey(lock), ensureVaultKey(lock)]))[1]);
      const [k1, k2] = await Promise.all([p1, p2]);
      const a = await seal({ x: 'A' }, k1);
      const b = await seal({ x: 'B' }, k2);
      expect(await unseal(a)).toEqual({ x: 'A' });
      expect(await unseal(b)).toEqual({ x: 'B' });
    }
  });

  it('withVaultLock runs callbacks one at a time, in order, even after a failure', async () => {
    const log: string[] = [];
    const slow = withVaultLock(async () => { log.push('a1'); await tick(); await tick(); log.push('a2'); });
    const fail = withVaultLock(async () => { log.push('b'); throw new Error('x'); });
    const last = withVaultLock(async () => { log.push('c'); return 7; });
    await expect(fail).rejects.toThrow('x');
    expect(await last).toBe(7);
    await slow;
    expect(log).toEqual(['a1', 'a2', 'b', 'c']);
  });
});

describe('vault store', () => {
  beforeEach(reset);

  it('adds, loads, updates and removes items', async () => {
    const home = await addItem({ kind: 'home_pin', label: 'Home', aliases: [], pin });
    const kid = await addItem({ kind: 'child_name', label: 'Lucas', aliases: ['Luke'] });
    expect((await loadVault()).map((i) => i.id)).toEqual([home.id, kid.id]);
    await updateItem(kid.id, { label: 'Lucas M.' });
    expect((await loadVault()).find((i) => i.id === kid.id)?.label).toBe('Lucas M.');
    await removeItem(home.id);
    expect((await loadVault()).map((i) => i.id)).toEqual([kid.id]);
  });

  it('adds a pin and its linked area item in one write', async () => {
    const [p, a] = await addItems([
      { kind: 'home_pin', label: 'Home', aliases: [], pin },
      { kind: 'area_name', label: 'Mitte', aliases: [] },
    ]);
    expect((await loadVault()).map((i) => i.id)).toEqual([p.id, a.id]);
  });

  it('stores only ciphertext (no plaintext labels on disk)', async () => {
    await addItem({ kind: 'employer', label: 'City General Hospital', aliases: [] });
    const raw = await get('vault:v1', closableStore(DATA_DB, 'items'));
    const bytes = new Uint8Array((raw as { ct: ArrayBuffer }).ct);
    expect(new TextDecoder('latin1').decode(bytes)).not.toContain('City General');
    expect(JSON.stringify(raw)).not.toContain('City General');
  });

  it('enforces D-23 limits and pin rules', async () => {
    const id = 'vi_00000000000a';
    expect(() => validateItem({ id, kind: 'child_name', label: 'x'.repeat(41), aliases: [], createdAt: 0 })).toThrow(VaultValidationError);
    expect(() => validateItem({ id, kind: 'child_name', label: 'ok', aliases: ['y'.repeat(41)], createdAt: 0 })).toThrow(VaultValidationError);
    expect(() => validateItem({ id, kind: 'home_pin', label: 'Home', aliases: [], createdAt: 0 })).toThrow(/pin_required/);
    expect(() => validateItem({ id, kind: 'employer', label: 'X', aliases: [], pin, createdAt: 0 })).toThrow(/pin_not_allowed/);
    expect(() => validateItem({ id, kind: 'home_pin', label: '', aliases: [], pin: { ...pin, lat: 91 }, createdAt: 0 })).toThrow(/bad_pin/);
    expect(() => validateItem({ id, kind: 'nope' as VaultItem['kind'], label: '', aliases: [], createdAt: 0 })).toThrow(/bad_kind/);
    expect(() => validateItem({ id, kind: 'self_name', label: 'Me', aliases: [], createdAt: 0 })).not.toThrow();
    for (let i = 0; i < VAULT_MAX_ITEMS; i++) await addItem({ kind: 'other_text', label: `t${i}`, aliases: [] });
    await expect(addItem({ kind: 'other_text', label: 'one too many', aliases: [] })).rejects.toThrow(/full/);
  });

  it('burns the key first; the vault reads empty; a new key appears only on the next add', async () => {
    await addItem({ kind: 'child_name', label: 'Lucas', aliases: [] });
    expect(await getVaultKey()).toBeDefined();
    await burnVault();
    expect(await getVaultKey()).toBeUndefined();
    expect(await loadVault()).toEqual([]);
    expect(await getVaultKey()).toBeUndefined(); // AC-270: no key until the next add
    await addItem({ kind: 'child_name', label: 'Ella', aliases: [] });
    expect((await loadVault()).map((i) => i.label)).toEqual(['Ella']);
  });

  it('concurrent adds never lose items (review privacy-correctness-7)', async () => {
    for (let d = 0; d < 12; d++) {
      await reset();
      const p1 = addItem({ kind: 'child_name', label: 'Lucas', aliases: [] });
      for (let k = 0; k < d; k++) await tick();
      const p2 = addItem({ kind: 'employer', label: 'City General', aliases: [] });
      await Promise.all([p1, p2]);
      expect((await loadVault()).map((i) => i.label).sort()).toEqual(['City General', 'Lucas']);
    }
  });

  it('an add racing Burn vault can never resurrect pre-burn items (review privacy-correctness-1)', async () => {
    for (let d = 0; d < 30; d++) {
      await reset();
      await addItem({ kind: 'child_name', label: 'Lucas', aliases: [] });
      const p = addItem({ kind: 'employer', label: 'City General', aliases: [] });
      for (let k = 0; k < d; k++) await tick();
      await Promise.allSettled([p, burnVault()]);
      expect(await loadVault()).toEqual([]);
      expect(await getVaultKey()).toBeUndefined();
    }
  });

  it('a sealed non-vault write racing a vault add takes the lock, never creates the key, and never bricks the vault (AC-270)', async () => {
    // What sessionsStore/offlineQueue must do: inside the lock, seal with the key that exists, or write nothing.
    const sessionWrite = () => withVaultLock(async () => {
      const key = await getVaultKey();
      return key ? seal({ session: 'x' }, key) : null;
    });
    for (let d = 0; d < 12; d++) {
      await reset();
      const q0 = sessionWrite();   // before any add: there is no key, and the session write must not create one
      const p = addItem({ kind: 'child_name', label: 'Lucas', aliases: [] });
      for (let k = 0; k < d; k++) await tick();
      const q = sessionWrite();
      const [nothing, , sealed] = await Promise.all([q0, p, q]);
      expect(nothing).toBeNull();
      expect((await loadVault()).map((i) => i.label)).toEqual(['Lucas']);
      if (!sealed) throw new Error('the session write queued after the add must find the key');
      expect(await unseal(sealed)).toEqual({ session: 'x' });
      await addItem({ kind: 'employer', label: 'X', aliases: [] });
    }
  });

  it('the key can be created only inside the vault lock: no lock, a forged token or a finished lock all refuse (T-054 review)', async () => {
    await expect(ensureVaultKey(undefined as unknown as VaultLock)).rejects.toBeInstanceOf(VaultLockNotHeldError);
    await expect(ensureVaultKey({ vaultLock: true })).rejects.toBeInstanceOf(VaultLockNotHeldError);
    let leaked: VaultLock | undefined;
    await withVaultLock(async (lock) => { leaked = lock; });
    if (!leaked) throw new Error('no token');
    await expect(ensureVaultKey(leaked)).rejects.toBeInstanceOf(VaultLockNotHeldError);
    // e.g. a session write right after a burn: refused, and the device still has no key (AC-270)
    await addItem({ kind: 'child_name', label: 'Lucas', aliases: [] });
    await burnVault();
    await expect(ensureVaultKey(leaked)).rejects.toBeInstanceOf(VaultLockNotHeldError);
    expect(await getVaultKey()).toBeUndefined();
  });
});

// ---------- T-054: storage layout, IVs, limits, burn order ----------
/** A synthetic pin in the open Atlantic, with distinctive numbers to search for. */
const SYN = { lat: 0.51234, lng: -30.56789, accuracyM: 17.25, capturedAt: 1700000000123, source: 'geolocation' as const };
const TESSERACT_DB = 'keyval-store';   // tesseract.js's idb-keyval default store: the vault never touches it
const rawData = closableStore(DATA_DB, 'items');
const rawVault = () => get<Sealed>('vault:v1', rawData);
const ivOf = (r: Sealed | undefined) => Array.from(r?.iv ?? []);
/** A connection that ignores `versionchange` (what idb-keyval's createStore does): it blocks deleteDatabase until closed. */
async function openRaw(name: string): Promise<IDBDatabase> {
  const open = indexedDB.open(name);
  open.onupgradeneeded = () => { open.result.createObjectStore('entries'); };
  return new Promise<IDBDatabase>((res, rej) => { open.onsuccess = () => res(open.result); open.onerror = () => rej(open.error); });
}
type Patch = Parameters<typeof updateItem>[1];

const SECRET_ITEMS = [
  { kind: 'work_pin' as const, label: 'Wrenfield Clinic', aliases: ['Wrenfield Med Ctr'], pin: SYN },
  { kind: 'child_name' as const, label: 'Ottoline Zoë', aliases: ['Ottie Ærø'] },
  { kind: 'house_number' as const, label: '4417', aliases: [] },
];
const SECRETS = ['Wrenfield', 'Med Ctr', 'Ottoline', 'Zoë', 'Ottie', 'Ærø', '4417', '0.51234', '30.56789', '17.25', '1700000000123',
  'geolocation', 'work_pin', 'child_name', 'house_number', 'label', 'aliases', 'createdAt', 'accuracyM'];

describe('T-054: storage layout and ciphertext only (ARCH §16.3, SCR-04 Storage, AC-080, AC-081)', () => {
  beforeEach(reset);

  it('one object store per database: only se-vault-keys/keys and se-vault-data/items; the record is {v, iv, ct} only', async () => {
    await addItems(SECRET_ITEMS);
    const { dbs, records } = await dumpIdb();
    expect(dbs).toEqual({ [KEYS_DB]: ['keys'], [DATA_DB]: ['items'] });   // never idb-keyval's default 'keyval-store'
    expect(records.map((r) => `${r.db}/${r.store}/${String(r.key)}`).sort()).toEqual([`${DATA_DB}/items/vault:v1`, `${KEYS_DB}/keys/${KEY_ID}`]);
    const data = records.find((r) => r.db === DATA_DB)?.value as Sealed;
    expect(Object.keys(data).sort()).toEqual(['ct', 'iv', 'v']);
    expect(isSealed(data)).toBe(true);
    expect(data.iv.byteLength).toBe(12);   // 96-bit IV
    const key = records.find((r) => r.db === KEYS_DB)?.value as CryptoKey;
    expect(key).toBeInstanceOf(CryptoKey);
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect([...key.usages].sort()).toEqual(['decrypt', 'encrypt']);
  });

  it('no label, alias, kind, field name or coordinate is readable anywhere in IndexedDB, in any encoding', async () => {
    // the scanner is not vacuous: plaintext in any of these encodings would be seen
    expect(textViews({ b: new TextEncoder().encode('x Wrenfield').buffer }).some((v) => v.includes('Wrenfield'))).toBe(true);
    expect(textViews({ b: new Uint8Array([0, ...new Uint8Array(Buffer.from('Ottie Ærø', 'utf16le'))]) }).some((v) => v.includes('Ærø'))).toBe(true);
    await addItems(SECRET_ITEMS);
    await addItem({ kind: 'area_name', label: 'Lindqvist Heights', aliases: [] });
    const views = (await dumpIdb()).records.flatMap((r) => [String(r.key), ...textViews(r.value)]);
    expect(views).toContain('vault:v1');   // record names are visible (they hold no vault data) ...
    expect(views).toContain(KEY_ID);
    for (const s of [...SECRETS, 'Lindqvist']) expect(views.filter((v) => v.includes(s)), s).toEqual([]);   // ... vault data is not
  });

  it('AC-080: a written item reads back deep-equal; the stored key is non-extractable (raw and jwk export throw)', async () => {
    const [p, a] = await addItems([
      { id: 'vi_0000000a0e01', kind: 'home_pin', label: 'Wrenfield House', aliases: ['WH'], pin: SYN },
      { kind: 'area_name', label: 'Ærø Heights 🏡', aliases: ['ÆH'], linkedPinId: 'vi_0000000a0e01' },
    ]);
    expect(await loadVault()).toEqual([p, a]);
    expect(p.pin).toEqual(SYN);
    const stored = await get<CryptoKey>(KEY_ID, closableStore(KEYS_DB, 'keys'));
    if (!stored) throw new Error('no key stored');
    expect(stored.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', stored)).rejects.toThrow();
    await expect(crypto.subtle.exportKey('jwk', stored)).rejects.toThrow();
  });

  it('AC-081: every write seals with a fresh 12-byte IV, even when the content is unchanged', async () => {
    const kid = await addItem({ kind: 'child_name', label: 'Ottoline', aliases: [] });
    const ivs = new Set<string>();
    const cts = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const r = await rawVault();
      if (!r) throw new Error('no record');
      expect(r.iv.byteLength).toBe(12);
      ivs.add(ivOf(r).join(','));
      cts.add(Array.from(new Uint8Array(r.ct)).join(','));
      await updateItem(kid.id, {});   // the same item, written again
    }
    expect(ivs.size).toBe(12);
    expect(cts.size).toBe(12);
    expect(await loadVault()).toEqual([kid]);
  });
});

describe('T-054: limits (D-23) and all-or-nothing writes', () => {
  beforeEach(reset);
  const base = { id: 'vi_00000000000a', kind: 'child_name' as const, aliases: [] as string[], createdAt: 0 };

  it('labels and aliases are measured in code points: 40 accepted, 41 refused', () => {
    const e40 = '𝒜'.repeat(40);   // an astral LETTER: a text label must still yield a term
    expect(e40.length).toBe(80);   // 80 UTF-16 code units, 40 characters
    expect(() => validateItem({ ...base, label: e40 })).not.toThrow();
    expect(() => validateItem({ ...base, label: 'x'.repeat(40) })).not.toThrow();
    expect(() => validateItem({ ...base, label: e40 + 'x' })).toThrow(/label_too_long/);
    expect(() => validateItem({ ...base, label: 'ok', aliases: [e40] })).not.toThrow();
    expect(() => validateItem({ ...base, label: 'ok', aliases: ['x', e40 + 'x'] })).toThrow(/alias_too_long/);
  });

  it('the 21st item is refused by addItem and by addItems, and a refused add writes nothing', async () => {
    const t = (label: string) => ({ kind: 'other_text' as const, label, aliases: [] });
    await addItems(Array.from({ length: VAULT_MAX_ITEMS - 1 }, (_, i) => t(`t${i}`)));
    const before = await rawVault();
    await expect(addItems([t('a'), t('b')])).rejects.toMatchObject({ name: 'VaultValidationError', code: 'full' });
    expect(ivOf(await rawVault())).toEqual(ivOf(before));   // not rewritten
    expect(await loadVault()).toHaveLength(VAULT_MAX_ITEMS - 1);
    await addItem(t('twentieth'));
    await expect(addItem(t('one too many'))).rejects.toMatchObject({ code: 'full' });
    await expect(addItems([t('one too many')])).rejects.toMatchObject({ code: 'full' });
    expect(await loadVault()).toHaveLength(VAULT_MAX_ITEMS);
  });

  it('addItems is all or nothing; on a fresh device a refused or empty add creates no key (AC-270)', async () => {
    const ok = { kind: 'child_name' as const, label: 'Ottoline', aliases: [] };
    await expect(addItems([ok, { kind: 'employer', label: 'x'.repeat(41), aliases: [] }])).rejects.toMatchObject({ code: 'label_too_long' });
    await expect(addItem({ kind: 'home_pin', label: 'Home', aliases: [] })).rejects.toMatchObject({ code: 'pin_required' });
    expect(await addItems([])).toEqual([]);
    expect(await getVaultKey()).toBeUndefined();
    expect(await loadVault()).toEqual([]);
    const [kid] = await addItems([ok]);
    await expect(addItems([ok, { kind: 'work_pin', label: 'Depot', aliases: [] }])).rejects.toMatchObject({ code: 'pin_required' });
    expect(await loadVault()).toEqual([kid]);
  });

  it('updateItem cannot exceed the limits or change id/createdAt, and a refused update writes nothing', async () => {
    const kid = await addItem({ kind: 'child_name', label: 'Ottoline', aliases: ['Ottie'] });
    const before = await rawVault();
    const refused: Array<[unknown, string]> = [
      [{ label: 'x'.repeat(41) }, 'label_too_long'],
      [{ aliases: ['Ottie', 'y'.repeat(41)] }, 'alias_too_long'],
      [{ kind: 'home_pin' }, 'pin_required'],
      [{ pin: SYN }, 'pin_not_allowed'],
      [{ kind: 'nope' }, 'bad_kind'],
    ];
    for (const [patch, code] of refused) await expect(updateItem(kid.id, patch as Patch)).rejects.toMatchObject({ code });
    await expect(updateItem('vi_missing', { label: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    expect(ivOf(await rawVault())).toEqual(ivOf(before));
    expect(await loadVault()).toEqual([kid]);
    const next = await updateItem(kid.id, { label: 'Ottoline B.', id: 'vi_other', createdAt: 5 } as unknown as Patch);
    expect(next).toEqual({ ...kid, label: 'Ottoline B.' });
    expect(await loadVault()).toEqual([next]);
  });
});

describe('T-054: Burn vault storage order (AC-271, AC-270, D-31, ARCH §16.4)', () => {
  beforeEach(reset);
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const db of [TESSERACT_DB, SESSIONS_DB, LEDGER_DB]) await deleteDatabase(db);
  });

  it('deletes the key record and waits for its commit, then se-vault-data, se-sessions, se-ledger; keyval-store untouched', async () => {
    await addItem({ kind: 'child_name', label: 'Ottoline', aliases: [] });
    const key = await getVaultKey();
    if (!key) throw new Error('no key');
    await set('./eng.traineddata', 'cached-model', closableStore(TESSERACT_DB, 'keyval'));
    await set('session:s1', await seal({ s: 1 }, key), closableStore(SESSIONS_DB, 'items'));
    await set(1, { kind: 'GATE', n: 1 }, closableStore(LEDGER_DB, 'entries'));
    const { log } = spyIdbDeletes();
    await burnVault();
    expect(log).toEqual([
      `delete ${KEYS_DB}/keys/${KEY_ID}`,
      `committed ${KEYS_DB}/keys/${KEY_ID}`,
      `deleteDatabase ${DATA_DB}`,
      `deleteDatabase ${SESSIONS_DB}`,
      `deleteDatabase ${LEDGER_DB}`,
      `delete ${KEYS_DB}/keys/${BURN_PENDING}`,   // the burn-pending marker goes last, once every database is gone
      `committed ${KEYS_DB}/keys/${BURN_PENDING}`,
    ]);
    const { dbs, records } = await dumpIdb();
    expect(dbs).toEqual({ [KEYS_DB]: ['keys'], [TESSERACT_DB]: ['keyval'] });
    expect(records).toEqual([{ db: TESSERACT_DB, store: 'keyval', key: './eng.traineddata', value: 'cached-model' }]);
  });

  it('an interruption right after the key leaves ciphertext nothing can decrypt (AC-271); burning again finishes', async () => {
    await addItem({ kind: 'child_name', label: 'Ottoline', aliases: [] });
    const { drop } = spyIdbDeletes();
    drop.mockImplementationOnce(() => { throw new Error('tab closed'); });
    await expect(burnVault()).rejects.toThrow('tab closed');
    expect(await getVaultKey()).toBeUndefined();
    const left = await rawVault();
    if (!left) throw new Error('expected the ciphertext to survive the interruption');
    expect(isSealed(left)).toBe(true);
    await expect(unseal(left)).rejects.toBeInstanceOf(VaultLockedError);
    await burnVault();
    expect(await rawVault()).toBeUndefined();
  });

  it('a burn killed after the key is finished by the next load: data, sessions and ledger go, keyval-store stays (AC-270, T-054 review)', async () => {
    await addItem({ kind: 'child_name', label: 'Ottoline', aliases: [] });
    const key = await getVaultKey();
    if (!key) throw new Error('no key');
    await set('./eng.traineddata', 'cached-model', closableStore(TESSERACT_DB, 'keyval'));
    await set('session:s1', await seal({ s: 1 }, key), closableStore(SESSIONS_DB, 'items'));
    await set(1, { kind: 'GATE', n: 1 }, closableStore(LEDGER_DB, 'entries'));
    // The tab dies right after step 1: the key transaction committed, no database deletion was ever requested.
    const { drop } = spyIdbDeletes();
    drop.mockImplementation(() => { throw new Error('tab closed'); });
    await expect(burnVault()).rejects.toThrow('tab closed');
    vi.restoreAllMocks();
    expect(await getVaultKey()).toBeUndefined();
    expect((await dumpIdb()).records.map((r) => `${r.db}/${String(r.key)}`).sort()).toEqual([
      `${KEYS_DB}/${BURN_PENDING}`, `${LEDGER_DB}/1`, `${SESSIONS_DB}/session:s1`, `${DATA_DB}/vault:v1`, `${TESSERACT_DB}/./eng.traineddata`,
    ].sort());
    // Next boot: the first load finishes the burn before it reads anything.
    expect(await loadVault()).toEqual([]);
    const { dbs, records } = await dumpIdb();
    expect(Object.keys(dbs)).not.toContain(SESSIONS_DB);
    expect(Object.keys(dbs)).not.toContain(LEDGER_DB);
    expect(records.map((r) => `${r.db}/${String(r.key)}`)).toEqual([`${TESSERACT_DB}/./eng.traineddata`]);
    // ...and before a new add creates the new key, so nothing old can be read with it
    const ella = await addItem({ kind: 'child_name', label: 'Ella', aliases: [] });
    expect(await loadVault()).toEqual([ella]);
  });

  it('an add after an interrupted burn finishes the burn first, then creates the new key', async () => {
    await addItem({ kind: 'child_name', label: 'Ottoline', aliases: [] });
    const key = await getVaultKey();
    if (!key) throw new Error('no key');
    await set('session:s1', await seal({ s: 1 }, key), closableStore(SESSIONS_DB, 'items'));
    await set(1, { kind: 'GATE', n: 1 }, closableStore(LEDGER_DB, 'entries'));
    const { drop } = spyIdbDeletes();
    drop.mockImplementation(() => { throw new Error('tab closed'); });
    await expect(burnVault()).rejects.toThrow('tab closed');
    vi.restoreAllMocks();
    const { log } = spyIdbDeletes();
    const ella = await addItem({ kind: 'child_name', label: 'Ella', aliases: [] });
    expect(log.filter((l) => l.startsWith('deleteDatabase'))).toEqual([`deleteDatabase ${DATA_DB}`, `deleteDatabase ${SESSIONS_DB}`, `deleteDatabase ${LEDGER_DB}`]);
    expect(await loadVault()).toEqual([ella]);
  });

  it('Burn does not report success while another connection still holds a database open (T-054 review)', async () => {
    await addItem({ kind: 'child_name', label: 'Ottoline', aliases: [] });
    // A connection that ignores `versionchange` (what idb-keyval's createStore does), holding a ledger record.
    const open = indexedDB.open(LEDGER_DB);
    open.onupgradeneeded = () => { open.result.createObjectStore('entries'); };
    const raw = await new Promise<IDBDatabase>((res, rej) => { open.onsuccess = () => res(open.result); open.onerror = () => rej(open.error); });
    await new Promise<void>((res) => { const tx = raw.transaction('entries', 'readwrite'); tx.objectStore('entries').put({ kind: 'GATE' }, 1); tx.oncomplete = () => res(); });
    let settled = false;
    const burning = burnVault().then(() => { settled = true; });
    for (let i = 0; i < 20; i++) await tick();
    expect(settled).toBe(false);   // the old code resolved on `blocked`, while the ledger was still readable
    raw.close();                   // the blocking connection goes away: the queued deletion completes
    await burning;
    expect(Object.keys((await dumpIdb()).dbs)).not.toContain(LEDGER_DB);
  });

  it('a deletion that stays blocked rejects with BurnPendingError after the timeout', async () => {
    const open = indexedDB.open(LEDGER_DB);
    open.onupgradeneeded = () => { open.result.createObjectStore('entries'); };
    const raw = await new Promise<IDBDatabase>((res, rej) => { open.onsuccess = () => res(open.result); open.onerror = () => rej(open.error); });
    const err = await deleteDatabase(LEDGER_DB, 30).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BurnPendingError);
    expect((err as BurnPendingError).db).toBe(LEDGER_DB);
    raw.close();
    await vi.waitFor(() => deleteDatabase(LEDGER_DB));   // the queued deletion completes once the blocker is gone
  });

  it('round 2: a retry while this tab\'s deletion is still pending rejects at once and queues no second request', async () => {
    const raw = await openRaw(LEDGER_DB);
    const { drop } = spyIdbDeletes();
    const first = deleteDatabase(LEDGER_DB, 30).catch((e: unknown) => e);
    expect(await first).toBeInstanceOf(BurnPendingError);
    const t0 = Date.now();
    const again = await deleteDatabase(LEDGER_DB).catch((e: unknown) => e);   // default timeout: 3 s if it queued
    expect(again).toBeInstanceOf(BurnPendingError);
    expect(Date.now() - t0).toBeLessThan(500);
    expect(drop).toHaveBeenCalledTimes(1);
    raw.close();
    await vi.waitFor(() => deleteDatabase(LEDGER_DB));   // once the first completes, a new request is made and succeeds
    expect(drop.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('round 2: the timeout starts when the request is made, so a request that never hears `blocked` still settles', async () => {
    // A request queued behind another tab's pending deletion of the same database gets no event until that one completes.
    const r = {} as { onsuccess: ((e: Event) => void) | null };
    vi.spyOn(indexedDB, 'deleteDatabase').mockImplementation(() => r as unknown as IDBOpenDBRequest);
    const err = await deleteDatabase(SESSIONS_DB, 30).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BurnPendingError);
    expect((err as BurnPendingError).db).toBe(SESSIONS_DB);
    expect(await deleteDatabase(SESSIONS_DB).catch((e: unknown) => e)).toBeInstanceOf(BurnPendingError);   // still pending
    r.onsuccess?.(new Event('success'));                 // the other tab's deletion completes, then ours
    vi.restoreAllMocks();
    await vi.waitFor(() => deleteDatabase(SESSIONS_DB));
  });

  it('round 2: finishPendingBurn finishes an interrupted burn without reading the vault, and announces only success', async () => {
    let announced = 0;
    const off = onVaultChange(() => { announced++; });
    try {
      await addItem({ kind: 'child_name', label: 'Ottoline', aliases: [] });
      announced = 0;
      await finishPendingBurn();                           // nothing pending: does nothing
      expect(announced).toBe(0);
      const { drop } = spyIdbDeletes();
      drop.mockImplementation(() => { throw new Error('tab closed'); });
      await expect(burnVault()).rejects.toThrow('tab closed');
      expect(announced).toBe(1);                           // Burn vault itself always tells every tab
      await expect(finishPendingBurn()).rejects.toThrow('tab closed');
      await expect(loadVault()).rejects.toThrow('tab closed');
      expect(announced).toBe(1);                           // a failed retry announces nothing (no reload storm)
      vi.restoreAllMocks();
      const decrypt = vi.spyOn(crypto.subtle, 'decrypt');
      await finishPendingBurn();
      expect(announced).toBe(2);                           // finished: every tab's blocked index reloads once
      expect(decrypt).not.toHaveBeenCalled();
      expect(await burnPending()).toBe(false);
      expect(await rawVault()).toBeUndefined();
    } finally {
      off();
    }
  });

  it('round 3: the user\'s own Burn vault waits up to DELETE_BLOCKED_TIMEOUT_MS for a connection to close; a retry gives up after BURN_RETRY_TIMEOUT_MS', async () => {
    const closeAfter = DELETE_BLOCKED_TIMEOUT_MS / 3;
    expect(BURN_RETRY_TIMEOUT_MS).toBeLessThan(closeAfter);
    const holdOpen = async () => { const raw = await openRaw(LEDGER_DB); setTimeout(() => raw.close(), closeAfter); };
    // The user's own Burn vault: a connection that closes within the timeout delays it, but the burn completes.
    await addItem({ kind: 'child_name', label: 'Ottoline', aliases: [] });
    await holdOpen();
    let t0 = Date.now();
    await burnVault();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(closeAfter - 50);
    expect(await burnPending()).toBe(false);
    // A retry (every load and boot, in every tab) holds the cross-tab lock only briefly: it gives up before that close.
    await addItem({ kind: 'child_name', label: 'Ottoline', aliases: [] });
    const { drop } = spyIdbDeletes();
    drop.mockImplementation(() => { throw new Error('tab closed'); });
    await expect(burnVault()).rejects.toThrow('tab closed');
    vi.restoreAllMocks();
    await holdOpen();
    t0 = Date.now();
    await expect(loadVault()).rejects.toBeInstanceOf(BurnPendingError);
    expect(Date.now() - t0).toBeLessThan(closeAfter);
    expect(await burnPending()).toBe(true);
    await vi.waitFor(async () => expect((await indexedDB.databases()).map((d) => d.name)).not.toContain(LEDGER_DB), { timeout: 3000 });
    expect(await loadVault()).toEqual([]);                 // the queued deletion completed; the next load finishes the burn
    expect(await burnPending()).toBe(false);
  });

  it('after a burn nothing creates a key (load, update, remove, empty add) until the next real add (AC-270)', async () => {
    const kid = await addItem({ kind: 'child_name', label: 'Ottoline', aliases: [] });
    const old = await rawVault();
    if (!old) throw new Error('no record');
    await burnVault();
    expect(await loadVault()).toEqual([]);
    await expect(updateItem(kid.id, { label: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(removeItem(kid.id)).rejects.toMatchObject({ code: 'not_found' });
    expect(await addItems([])).toEqual([]);
    expect(await getVaultKey()).toBeUndefined();
    await addItem({ kind: 'employer', label: 'Wrenfield Clinic', aliases: [] });
    expect(await getVaultKey()).toBeDefined();
    await expect(unseal(old)).rejects.toBeInstanceOf(VaultCorruptError);   // a NEW key: pre-burn ciphertext stays dead
  });
});

// ---------- T-054 review: fail closed on unknown records; ids, links and item rules ----------
describe('T-054 review: a stored record this build does not recognise fails closed and is never overwritten', () => {
  beforeEach(reset);

  it.each([
    ['a newer format (v: 2)', (r: Sealed) => ({ ...r, v: 2 })],
    ['a wrong iv type', (r: Sealed) => ({ ...r, iv: Array.from(r.iv) })],
    ['not an object', () => 'garbage'],
  ])('%s: loadVault throws VaultCorruptError, and add/update/remove refuse to write', async (_name, mutate) => {
    const lucas = await addItem({ kind: 'child_name', label: 'Lucas', aliases: [] });
    const rec = await rawVault();
    if (!rec) throw new Error('no record');
    const planted = mutate(rec);
    await set('vault:v1', planted, rawData);
    await expect(loadVault()).rejects.toBeInstanceOf(VaultCorruptError);
    await expect(addItem({ kind: 'employer', label: 'New Corp', aliases: [] })).rejects.toBeInstanceOf(VaultCorruptError);
    await expect(updateItem(lucas.id, { label: 'x' })).rejects.toBeInstanceOf(VaultCorruptError);
    await expect(removeItem(lucas.id)).rejects.toBeInstanceOf(VaultCorruptError);
    expect(await get('vault:v1', rawData)).toEqual(planted);   // the stored vault is untouched
  });

  it('the index stays blocked on such a record (no vault term silently stops protecting)', async () => {
    const { createVaultScan, VAULT_UNAVAILABLE } = await import('../ai/vaultScan');
    await addItem({ kind: 'child_name', label: 'Ottoline', aliases: [] });
    const rec = await rawVault();
    if (!rec) throw new Error('no record');
    await set('vault:v1', { ...rec, v: 2 }, rawData);
    const registered: Array<(t: string[]) => unknown> = [];
    const vs = createVaultScan({ loadReal: loadVault, register: (fn) => { registered.push(fn); } });
    await expect(vs.init({ judge: false })).rejects.toBeInstanceOf(VaultCorruptError);
    expect(registered[registered.length - 1](['for Ottoline'])).toEqual({ vaultId: VAULT_UNAVAILABLE });
  });
});

describe('T-054 review: ids are newVaultId()-shaped and unique; links point at a home pin', () => {
  beforeEach(reset);
  const kid = (label: string, id?: string) => ({ kind: 'child_name' as const, label, aliases: [], ...(id === undefined ? {} : { id }) });

  it('newVaultId() ids are accepted; free-text, empty or malformed ids are refused (they reach the unsealed ledger)', async () => {
    expect(newVaultId()).toMatch(/^vi_[0-9a-f]{12}$/);
    for (const id of ['Lucas', '', 'vi_x', 'vi_ABCDEF012345', 'vi_0123456789abc', ' vi_0123456789ab']) {
      await expect(addItem(kid('Ann', id)), id).rejects.toMatchObject({ code: 'bad_id' });
    }
    expect(await getVaultKey()).toBeUndefined();   // a refused add creates no key (AC-270)
    const id = newVaultId();
    expect((await addItem(kid('Ann', id))).id).toBe(id);
  });

  it('a repeated id is refused, in the vault and within one batch; removeItem can never take two items', async () => {
    const a = await addItem(kid('Ann', 'vi_00000000000a'));
    await expect(addItem({ kind: 'employer', label: 'Bcorp', aliases: [], id: a.id })).rejects.toMatchObject({ code: 'duplicate_id' });
    await expect(addItems([kid('B', 'vi_00000000000b'), kid('C', 'vi_00000000000b')])).rejects.toMatchObject({ code: 'duplicate_id' });
    expect(await loadVault()).toEqual([a]);
  });

  it('linkedPinId must name a home_pin in the vault or the same batch, and only an area_name may carry one', async () => {
    const homeId = newVaultId();
    const area = (linkedPinId: string) => ({ kind: 'area_name' as const, label: 'Lindqvist Heights', aliases: [], linkedPinId });
    await expect(addItem(area('vi_00000000dead'))).rejects.toMatchObject({ code: 'bad_link' });   // dangling
    await expect(addItem(area('Lucas'))).rejects.toMatchObject({ code: 'bad_link' });
    const work = await addItem({ kind: 'work_pin', label: 'Depot', aliases: [], pin });
    await expect(addItem(area(work.id))).rejects.toMatchObject({ code: 'bad_link' });                 // not a home pin
    await expect(addItem({ ...kid('Ann'), linkedPinId: work.id })).rejects.toMatchObject({ code: 'bad_link' });
    const [home, a] = await addItems([{ id: homeId, kind: 'home_pin', label: 'Home', aliases: [], pin }, area(homeId)]);
    expect(a.linkedPinId).toBe(home.id);
    await expect(updateItem(home.id, { kind: 'work_pin' })).rejects.toMatchObject({ code: 'bad_link' });   // would dangle
    expect(await loadVault()).toEqual([work, home, a]);
  });

  it('removing a home pin keeps its area item (it still means the home area) and drops the link', async () => {
    const homeId = newVaultId();
    const [, a] = await addItems([
      { id: homeId, kind: 'home_pin', label: 'Home', aliases: [], pin },
      { kind: 'area_name', label: 'Lindqvist Heights', aliases: [], linkedPinId: homeId },
    ]);
    await removeItem(homeId);
    const left = await loadVault();
    expect(left).toEqual([{ id: a.id, kind: 'area_name', label: 'Lindqvist Heights', aliases: [], createdAt: a.createdAt }]);
    expect(left[0]).not.toHaveProperty('linkedPinId');
  });
});

describe('T-054 review: item rules that keep the round trip exact and every item useful', () => {
  beforeEach(reset);
  const id = 'vi_00000000000a';

  it(`at most ${VAULT_ALIASES_MAX} aliases per item`, async () => {
    const aliases = (n: number) => Array.from({ length: n }, (_, i) => `alias ${i}`);
    expect(() => validateItem({ id, kind: 'employer', label: 'City General', aliases: aliases(VAULT_ALIASES_MAX), createdAt: 0 })).not.toThrow();
    await expect(addItem({ kind: 'employer', label: 'City General', aliases: aliases(VAULT_ALIASES_MAX + 1) })).rejects.toMatchObject({ code: 'too_many_aliases' });
    await expect(addItem({ kind: 'employer', label: 'City General', aliases: aliases(5000) })).rejects.toMatchObject({ code: 'too_many_aliases' });
    expect(await getVaultKey()).toBeUndefined();
  });

  it('a text item needs a label that yields a term; a pin label may be empty or generic (D-36)', async () => {
    for (const label of ['', '   ', '!!!', '­']) {
      await expect(addItem({ kind: 'child_name', label, aliases: ['Ottie'] }), JSON.stringify(label)).rejects.toMatchObject({ code: 'label_required' });
    }
    // T-054 review round 4 (AC-088): a generic label is never a term, so as a text item's only label it would protect
    // nothing. Refused; a generic ALIAS is allowed and simply contributes no term.
    for (const [kind, label] of [['employer', 'Work'], ['area_name', 'HOME'], ['school_name', 'School'], ['other_text', 'my home'], ['other_text', 'Place']] as const) {
      expect(() => validateItem({ id, kind, label, aliases: ['Wrenfield'], createdAt: 0 }), label).toThrow(/label_required/);
    }
    await expect(addItem({ kind: 'employer', label: 'Office', aliases: [] })).rejects.toMatchObject({ code: 'label_required' });
    expect(() => validateItem({ id, kind: 'employer', label: 'Wrenfield Clinic', aliases: ['Work', 'Office'], createdAt: 0 })).not.toThrow();
    expect(() => validateItem({ id, kind: 'house_number', label: '4B', aliases: [], createdAt: 0 })).not.toThrow();
    expect(() => validateItem({ id, kind: 'home_pin', label: '', aliases: [], pin, createdAt: 0 })).not.toThrow();
    expect(() => validateItem({ id, kind: 'home_pin', label: 'Home', aliases: [], pin, createdAt: 0 })).not.toThrow();
  });

  it('updateItem: a field set to undefined means "no change"; a field of the wrong type is a VaultValidationError, never a TypeError (T-054 review round 4)', async () => {
    const kid = await addItem({ kind: 'child_name', label: 'Ottoline', aliases: ['Ottie'] });
    expect(await updateItem(kid.id, { label: undefined, aliases: undefined, kind: undefined, pin: undefined, linkedPinId: undefined })).toEqual(kid);
    const renamed = await updateItem(kid.id, { label: 'Ottoline B.', aliases: undefined });
    expect(renamed).toEqual({ ...kid, label: 'Ottoline B.' });
    expect(await loadVault()).toEqual([renamed]);
    const before = await rawVault();
    const refused: Array<[unknown, string]> = [
      [{ label: null }, 'label_required'], [{ label: 42 }, 'label_required'],
      [{ aliases: null }, 'bad_item'], [{ aliases: 'Ottie' }, 'bad_item'], [{ aliases: ['Ottie', 7] }, 'bad_item'],
      [{ kind: 'home_pin', pin: 'x' }, 'bad_pin'], [null, 'bad_item'], ['Ottoline', 'bad_item'], [undefined, 'bad_item'],
      // T-054 final review: a sparse array passed Array.prototype.some (it skips holes), an array patch and unknown
      // fields were sealed unvalidated.
      // eslint-disable-next-line no-sparse-arrays
      [{ aliases: [, 'Ottie'] }, 'bad_item'], [['x'], 'bad_item'], [{ note: 'secret street 12' }, 'bad_item'],
    ];
    for (const [patch, code] of refused) {
      const e = await updateItem(kid.id, patch as Patch).catch((x: unknown) => x);
      expect(e, JSON.stringify(patch)).toBeInstanceOf(VaultValidationError);
      expect(e, JSON.stringify(patch)).toMatchObject({ code });
    }
    expect(ivOf(await rawVault())).toEqual(ivOf(before));   // a refused update writes nothing
    // The same for an add from an untyped caller.
    const added: Array<[unknown, string]> = [
      [{ kind: 'child_name', aliases: [] }, 'label_required'],
      [{ kind: 'child_name', label: 'Ann' }, 'bad_item'],
      [{ kind: 'child_name', label: 'Ann', aliases: 'Annie' }, 'bad_item'],
      // eslint-disable-next-line no-sparse-arrays
      [{ kind: 'child_name', label: 'Ann', aliases: [, 'Annie'] }, 'bad_item'],
      [{ kind: 'child_name', label: 'Ann', aliases: [], note: 'secret street 12' }, 'bad_item'],
    ];
    for (const [input, code] of added) {
      const e = await addItem(input as Parameters<typeof addItem>[0]).catch((x: unknown) => x);
      expect(e, JSON.stringify(input)).toBeInstanceOf(VaultValidationError);
      expect(e, JSON.stringify(input)).toMatchObject({ code });
    }
    // A hole in the list given to addItems is a bad item too (never a TypeError).
    // eslint-disable-next-line no-sparse-arrays
    const holes = await addItems([, { kind: 'child_name', label: 'Ann', aliases: [] }] as never).catch((x: unknown) => x);
    expect(holes).toBeInstanceOf(VaultValidationError);
    expect(holes).toMatchObject({ code: 'bad_item' });
    expect(await loadVault()).toEqual([renamed]);
    expect(ivOf(await rawVault())).toEqual(ivOf(before));
  });

  it('a pin may hold only the Pin fields, and a text item no pin at all, not even null (round-5 verifier)', async () => {
    const extra = { ...pin, note: 'secret street 12' };
    await expect(addItem({ kind: 'home_pin', label: 'Home', aliases: [], pin: extra as typeof pin })).rejects.toMatchObject({ code: 'bad_pin' });
    await expect(addItem({ kind: 'home_pin', label: 'Home', aliases: [], pin: [] as unknown as typeof pin })).rejects.toMatchObject({ code: 'bad_pin' });
    for (const bogus of [null, '', 0, false]) {
      await expect(addItem({ kind: 'child_name', label: 'Ann', aliases: [], pin: bogus as unknown as typeof pin })).rejects.toMatchObject({ code: 'pin_not_allowed' });
    }
    expect(await getVaultKey()).toBeUndefined(); // nothing was written, no key created
    const home = await addItem({ kind: 'home_pin', label: 'Home', aliases: [], pin });
    await expect(updateItem(home.id, { pin: extra as typeof pin })).rejects.toMatchObject({ code: 'bad_pin' });
    expect(await loadVault()).toEqual([home]);
    // An input that spells a field as undefined is fine (pin: undefined on a text item).
    await expect(addItem({ kind: 'child_name', label: 'Ann', aliases: [], pin: undefined })).resolves.toMatchObject({ label: 'Ann' });
  });

  it('what is validated is what is sealed: a Date-based pin or a BigInt is refused, never stored as something else (round-6 verifier)', async () => {
    const datePin = Object.assign(new Date(0), pin); // passes a shallow check; JSON (seal) would store "1970-01-01…"
    await expect(addItem({ kind: 'home_pin', label: '', aliases: [], pin: datePin as unknown as typeof pin })).rejects.toMatchObject({ code: 'bad_pin' });
    const big = await addItem({ kind: 'child_name', label: 1n as unknown as string, aliases: [] }).catch((e: unknown) => e);
    expect(big).toBeInstanceOf(VaultValidationError);
    expect(big).toMatchObject({ code: 'bad_item' });
    expect(await getVaultKey()).toBeUndefined();
    const home = await addItem({ kind: 'home_pin', label: '', aliases: [], pin });
    await expect(updateItem(home.id, { pin: datePin as unknown as typeof pin })).rejects.toMatchObject({ code: 'bad_pin' });
    expect(await loadVault()).toEqual([home]);
    // The next write still works: nothing unreadable was sealed.
    await expect(addItem({ kind: 'employer', label: 'Wrenfield Clinic', aliases: [] })).resolves.toMatchObject({ kind: 'employer' });
  });

  it('timestamps must be finite (NaN would read back as null and break AC-080)', async () => {
    await expect(addItem({ kind: 'child_name', label: 'Ann', aliases: [], createdAt: NaN })).rejects.toMatchObject({ code: 'bad_timestamp' });
    await expect(addItem({ kind: 'child_name', label: 'Ann', aliases: [], createdAt: Infinity })).rejects.toMatchObject({ code: 'bad_timestamp' });
    await expect(addItem({ kind: 'home_pin', label: 'Home', aliases: [], pin: { ...pin, capturedAt: NaN } })).rejects.toMatchObject({ code: 'bad_pin' });
    await expect(addItem({ kind: 'home_pin', label: 'Home', aliases: [], pin: { ...pin, capturedAt: -1 } })).rejects.toMatchObject({ code: 'bad_pin' });
    expect(await getVaultKey()).toBeUndefined();
  });

  it("the real vault takes pins from 'geolocation' or 'manual' only ('synthetic' is Judge Mode only)", async () => {
    for (const source of ['synthetic', 'bogus']) {
      await expect(addItem({ kind: 'home_pin', label: 'Home', aliases: [], pin: { ...pin, source: source as 'manual' } }), source)
        .rejects.toMatchObject({ code: 'bad_pin' });
    }
    const g = await addItem({ kind: 'home_pin', label: 'Home', aliases: [], pin: { ...pin, source: 'geolocation' } });
    expect(await loadVault()).toEqual([g]);
  });
});
