import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'idb-keyval';
import { addItem, addItems, burnVault, loadVault, removeItem, updateItem, validateItem, VaultValidationError, DATA_DB } from './vaultStore';
import { deleteDatabase, ensureVaultKey, getVaultKey, KEYS_DB, seal, unseal, VaultCorruptError, VaultLockedError, withVaultLock } from './crypto';
import { closableStore } from './idb';
import { VAULT_MAX_ITEMS, type VaultItem } from '../core/types';

const pin = { lat: 52.52, lng: 13.405, accuracyM: 12, capturedAt: 1, source: 'manual' as const };
const tick = () => new Promise<void>((r) => setImmediate(r));

async function reset() {
  await deleteDatabase(KEYS_DB);
  await deleteDatabase(DATA_DB);
}

describe('vault crypto', () => {
  beforeEach(reset);

  it('creates a non-extractable AES-GCM key once and reuses it', async () => {
    expect(await getVaultKey()).toBeUndefined();
    const k1 = await ensureVaultKey();
    const k2 = await ensureVaultKey();
    expect(k1.extractable).toBe(false);
    expect(k1.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    await expect(crypto.subtle.exportKey('raw', k2)).rejects.toThrow();
  });

  it('round-trips with a fresh IV per seal', async () => {
    const key = await ensureVaultKey();
    const a = await seal({ label: 'Lucas' }, key);
    const b = await seal({ label: 'Lucas' }, key);
    expect(Array.from(a.iv)).not.toEqual(Array.from(b.iv));
    expect(await unseal(a)).toEqual({ label: 'Lucas' });
  });

  it('refuses to unseal without a key, and reports data that does not decrypt', async () => {
    const s = await seal({ x: 1 }, await ensureVaultKey());
    await deleteDatabase(KEYS_DB);
    await expect(unseal(s)).rejects.toBeInstanceOf(VaultLockedError);
    await ensureVaultKey(); // a different key
    await expect(unseal(s)).rejects.toBeInstanceOf(VaultCorruptError);
  });

  it('concurrent first-time key creation yields ONE persisted key (review privacy-correctness-2)', async () => {
    for (let d = 0; d < 10; d++) {
      await reset();
      const p1 = ensureVaultKey();
      for (let k = 0; k < d; k++) await tick();
      const p2 = ensureVaultKey();
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
    expect(() => validateItem({ id: 'a', kind: 'child_name', label: 'x'.repeat(41), aliases: [], createdAt: 0 })).toThrow(VaultValidationError);
    expect(() => validateItem({ id: 'a', kind: 'child_name', label: 'ok', aliases: ['y'.repeat(41)], createdAt: 0 })).toThrow(VaultValidationError);
    expect(() => validateItem({ id: 'a', kind: 'home_pin', label: 'Home', aliases: [], createdAt: 0 })).toThrow(/pin_required/);
    expect(() => validateItem({ id: 'a', kind: 'employer', label: 'X', aliases: [], pin, createdAt: 0 })).toThrow(/pin_not_allowed/);
    expect(() => validateItem({ id: 'a', kind: 'home_pin', label: '', aliases: [], pin: { ...pin, lat: 91 }, createdAt: 0 })).toThrow(/bad_pin/);
    expect(() => validateItem({ id: 'a', kind: 'nope' as VaultItem['kind'], label: '', aliases: [], createdAt: 0 })).toThrow(/bad_kind/);
    expect(() => validateItem({ id: 'a', kind: 'self_name', label: 'Me', aliases: [], createdAt: 0 })).not.toThrow();
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

  it('a vault add racing another sealed write on a fresh device never bricks the vault', async () => {
    for (let d = 0; d < 12; d++) {
      await reset();
      const p = addItem({ kind: 'child_name', label: 'Lucas', aliases: [] });
      for (let k = 0; k < d; k++) await tick();
      const q = ensureVaultKey().then((k) => seal({ session: 'x' }, k)); // what sessionsStore/offlineQueue will do
      const [, sealed] = await Promise.all([p, q]);
      expect((await loadVault()).map((i) => i.label)).toEqual(['Lucas']);
      expect(await unseal(sealed)).toEqual({ session: 'x' });
      await addItem({ kind: 'employer', label: 'X', aliases: [] });
    }
  });
});
