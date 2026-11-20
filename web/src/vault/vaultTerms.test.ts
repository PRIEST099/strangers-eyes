// T-054 names a `vaultTerms()`: it is ai/vaultScan.ts termsOf(vault) (pure; the active index is vaultScan.activeTerms()).
// These tests pin the T-054 contract on it (labels and aliases only, never coordinates; D-36, AC-088) and AC-086
// (an empty vault is valid, and every vault-dependent job built so far works with zero items).
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  coordinatesNearPins, createVaultScan, echoScan, pinsOf, scanText, TEMPLATE_CANARY, termsOf, tripwireScanner,
} from '../ai/vaultScan';
import { render, segmentsText } from '../ai/prompts';
import { DEFAULT_FUZZY_THRESHOLD, matchWords } from '../tier0/fuzzy';
import { loadVault, removeItem, updateItem, DATA_DB } from './vaultStore';
import { deleteDatabase, getVaultKey, KEYS_DB } from './crypto';
import type { VaultScanner } from '../ai/tripwire';
import type { Pin, VaultItem, VaultKind } from '../core/types';

/** Synthetic pins in the open Atlantic, with distinctive numbers to search for. */
const pinAt = (lat: number, lng: number): Pin => ({ lat, lng, accuracyM: 17.25, capturedAt: 1700000000123, source: 'synthetic' });
const it_ = (id: string, kind: VaultKind, label: string, aliases: string[] = [], extra: Partial<VaultItem> = {}): VaultItem =>
  ({ id, kind, label, aliases, createdAt: 1, ...extra });

describe('vaultTerms = termsOf: labels and aliases only, never coordinates (T-054, D-36, AC-088)', () => {
  const home = it_('vi_home', 'home_pin', 'Home', ['Wrenfield House'], { pin: pinAt(0.51234, -30.56789) });
  const work = it_('vi_work', 'work_pin', 'Riverside Depot', ['RD Depot'], { pin: pinAt(0.61234, -30.66789) });
  const unnamed = it_('vi_place', 'place_pin', '', ['Gran Cottage'], { pin: pinAt(0.71234, -30.76789) });
  const school = it_('vi_school', 'school_pin', 'School', [], { pin: pinAt(0.81234, -30.86789) });
  const kid = it_('vi_kid', 'child_name', 'Ottoline', ['Otti']);
  const door = it_('vi_door', 'house_number', '4417');
  const area = it_('vi_area', 'area_name', 'Lindqvist Heights', [], { linkedPinId: home.id });
  const vault = [home, work, unnamed, school, kid, door, area];
  const terms = termsOf(vault);

  it('emits exactly the labels and aliases of non-generic items, in vault order', () => {
    expect(terms.map((t) => [t.vaultId, t.text, t.digit])).toEqual([
      [work.id, 'Riverside Depot', false], [work.id, 'RD Depot', false],
      [kid.id, 'Ottoline', false], [kid.id, 'Otti', false],
      [door.id, '4417', true],
      [area.id, 'Lindqvist Heights', false],
    ]);
  });

  it('a term carries {vaultId, kind, text, digit} only: no pin, coordinates, accuracy, timestamps or links', () => {
    for (const t of terms) expect(Object.keys(t).sort()).toEqual(['digit', 'kind', 'text', 'vaultId']);
    const dump = JSON.stringify(terms);
    for (const p of vault.flatMap((v) => (v.pin ? [v.pin] : []))) {
      for (const n of [p.lat, Math.abs(p.lng), p.accuracyM, p.capturedAt]) expect(dump).not.toContain(String(n));
    }
    expect(dump).not.toContain('synthetic');
    // a generic or empty pin label silences the whole pin, aliases included, and nothing points at it
    for (const s of ['Wrenfield', 'Gran Cottage', home.id, unnamed.id, school.id]) expect(dump).not.toContain(s);
  });

  it('pin coordinates are only in pinsOf (PIN_IN_PROMPT), generic labels included', () => {
    expect(pinsOf(vault).map((p) => p.vaultId)).toEqual([home.id, work.id, unnamed.id, school.id]);
  });
});

describe('AC-086: an empty vault is valid, and every vault-dependent job works with zero items', () => {
  beforeEach(async () => {
    await deleteDatabase(KEYS_DB);
    await deleteDatabase(DATA_DB);
  });

  it('a fresh device reads an empty vault; reading, updating and removing create no key', async () => {
    expect(await loadVault()).toEqual([]);
    await expect(updateItem('vi_x', { label: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(removeItem('vi_x')).rejects.toMatchObject({ code: 'not_found' });
    expect(await getVaultKey()).toBeUndefined();
  });

  it('the pure scans accept zero terms and zero pins', () => {
    const text = 'Lucas at 0.51234, -30.56789 near the depot';
    expect(termsOf([])).toEqual([]);
    expect(pinsOf([])).toEqual([]);
    expect(scanText(text, [])).toBeNull();
    expect(coordinatesNearPins(text, [])).toBeNull();
    expect(matchWords([{ text: 'LUCAS' }, { text: 'DEPOT' }], [], DEFAULT_FUZZY_THRESHOLD, 'image')).toEqual([]);
    expect(echoScan({ sceneSummary: text, clues: [{ evidence: 'Lucas' }], hypotheses: [{ label: 'Depot' }], inferences: [] }, [])).toEqual([]);
  });

  it('the device prompts render with an empty VAULT list, and the empty-vault tripwire scanner still has its canary', () => {
    const nano = segmentsText(render('nanoVaultText.v1', { TEXTS_JSON: [{ id: 'w1', text: 'BUS' }], VAULT_JSON: [] }));
    const ref = segmentsText(render('nanoRef.v1', { CLAIMS_JSON: [], VAULT_JSON: [] }));
    const scan = tripwireScanner(termsOf([]), pinsOf([]));
    expect(scan(['describe the scene', 'Lucas at 0.51234, -30.56789'])).toBeNull();
    expect(scan([nano])).toEqual({ vaultId: TEMPLATE_CANARY });
    expect(scan([ref])).toEqual({ vaultId: TEMPLATE_CANARY });
  });

  it('vaultScan boots on an empty real vault: ready, scanner registered, bound helpers empty, no key created', async () => {
    const registered: VaultScanner[] = [];
    const vs = createVaultScan({ loadReal: loadVault, register: (fn) => { registered.push(fn); } });
    await vs.init({ judge: false });
    await vs.ready;
    expect(vs.mode()).toBe('real');
    expect(vs.activeTerms()).toEqual([]);
    expect(vs.activePins()).toEqual([]);
    expect(registered).toHaveLength(2);   // fail-closed placeholder while loading, then the real (empty) scanner
    expect(registered[1](['Lucas at 0.51234, -30.56789'])).toBeNull();
    expect(vs.scanText('Lucas')).toBeNull();
    expect(vs.coordinatesNearPins('0.51234, -30.56789')).toBeNull();
    expect(vs.matchWords([{ text: 'LUCAS' }])).toEqual([]);
    expect(vs.echoScan({ sceneSummary: 'Lucas', clues: [], hypotheses: [], inferences: [] })).toEqual([]);
    await vs.refresh();
    vs.clearReal();
    expect(await getVaultKey()).toBeUndefined();
  });
});
