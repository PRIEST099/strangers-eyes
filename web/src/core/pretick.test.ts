// AC-112 (P0, unit): Standard pre-ticks exactly as in the SPEC SCR-06 table, on a fixture clue set; Strict (P1) too.
import { describe, expect, it } from 'vitest';
import { applyPreTick, DEFAULT_AUTO_MASK_TYPES, preTickOf } from './pretick';
import type { Clue } from './types';

const clue = (id: string, over: Partial<Clue>): Clue => ({
  id, source: 'nano_prescreen', readers: 'nano', type: 'other', box: { x: 10, y: 10, w: 20, h: 20 }, boxPrecision: 'exact',
  severity: 'high', removable: true, vaultHits: [], masked: false, userUnmasked: false, ...over,
});

/** One clue per table row (and the edge cases between rows). [clue, Standard, Strict]. */
const FIXTURE: Array<[Clue, { masked: boolean; reason?: string; flag: string; approximate: boolean }, { masked: boolean; reason?: string }]> = [
  // Row 1: faces, any detection ≥ 0.3 (Tier-0 keeps only those), any severity
  [clue('face', { source: 'tier0_face', readers: 'tier0', type: 'face' }), { masked: true, reason: 'face', flag: 'none', approximate: false }, { masked: true, reason: 'face' }],
  [clue('face-low', { source: 'tier0_face', readers: 'tier0', type: 'face', severity: 'low' }), { masked: true, reason: 'face', flag: 'none', approximate: false }, { masked: true, reason: 'face' }],
  // Row 2: vault hits, Tier-0 matcher and Nano W3b (a W3b hit with no OCR box: its grid cell, still masked)
  [clue('vault-t0', { source: 'tier0_ocr_vault', readers: 'tier0', type: 'name_text', vaultHits: ['v1'] }), { masked: true, reason: 'vault_text', flag: 'none', approximate: false }, { masked: true, reason: 'vault_text' }],
  [clue('vault-w3b-cell', { source: 'nano_vault_text', type: 'name_text', severity: 'medium', vaultHits: ['v2'], boxPrecision: 'grid_cell' }), { masked: true, reason: 'vault_text', flag: 'none', approximate: true }, { masked: true, reason: 'vault_text' }],
  // Rows 3–4: regex plates, phones and house numbers
  [clue('plate', { source: 'tier0_regex', readers: 'tier0', type: 'plate' }), { masked: true, reason: 'regex', flag: 'none', approximate: false }, { masked: true, reason: 'regex' }],
  [clue('phone', { source: 'tier0_regex', readers: 'tier0', type: 'other' }), { masked: true, reason: 'regex', flag: 'none', approximate: false }, { masked: true, reason: 'regex' }],
  [clue('house', { source: 'tier0_regex', readers: 'tier0', type: 'house_number', severity: 'low' }), { masked: true, reason: 'regex', flag: 'none', approximate: false }, { masked: true, reason: 'regex' }],
  // Row 5: high-severity auto_mask_types clues located by OCR (every default type)
  ...DEFAULT_AUTO_MASK_TYPES.map((type): (typeof FIXTURE)[number] => [clue(`auto-${type}`, { type, readers: 'both' }), { masked: true, reason: 'auto_type', flag: 'none', approximate: false }, { masked: true, reason: 'auto_type' }]),
  // Row 6: the same, grid cell only → flagged dashed (Standard), masked (Strict)
  [clue('auto-cell', { type: 'mail_or_document', boxPrecision: 'grid_cell' }), { masked: false, flag: 'high', approximate: true }, { masked: true, reason: 'strict' }],
  // Row 7: other high-severity clues → flagged
  [clue('high-other', { type: 'street_sign' }), { masked: false, flag: 'high', approximate: false }, { masked: true, reason: 'strict' }],
  [clue('high-other-cell', { type: 'landmark', boxPrecision: 'grid_cell' }), { masked: false, flag: 'high', approximate: true }, { masked: true, reason: 'strict' }],
  // Row 8: medium / low severity → flagged amber, even of an auto type located by OCR
  [clue('medium-lanyard', { type: 'uniform_or_lanyard', severity: 'medium' }), { masked: false, flag: 'possible', approximate: false }, { masked: true, reason: 'strict' }],
  [clue('low-sign', { type: 'street_sign', severity: 'low' }), { masked: false, flag: 'possible', approximate: false }, { masked: true, reason: 'strict' }],
  [clue('medium-auto', { type: 'name_text', severity: 'medium' }), { masked: false, flag: 'possible', approximate: false }, { masked: true, reason: 'strict' }],
  // A user-drawn mask is always masked
  [clue('manual', { source: 'manual', readers: 'user', severity: 'low' }), { masked: true, reason: 'user', flag: 'none', approximate: false }, { masked: true, reason: 'user' }],
];

describe('core/pretick: SPEC SCR-06 pre-tick table (AC-112)', () => {
  it.each(FIXTURE.map(([c, std]) => [c.id, c, std] as const))('Standard: %s', (_, c, std) => {
    const p = preTickOf(c, 'standard');
    expect({ masked: p.masked, reason: p.maskReason, flag: p.flag, approximate: p.approximate }).toEqual({ ...std, reason: std.reason });
  });

  it.each(FIXTURE.map(([c, , strict]) => [c.id, c, strict] as const))('Strict: %s', (_, c, strict) => {
    const p = preTickOf(c, 'strict');
    expect({ masked: p.masked, reason: p.maskReason }).toEqual({ masked: strict.masked, reason: strict.reason });
    expect(p.flag).toBe('none');
  });

  it('RC auto_mask_types decides row 5: a type outside it is only flagged; an empty list masks no Nano clue', () => {
    const sign = clue('sign', { type: 'street_sign' });
    expect(preTickOf(sign, 'standard', ['street_sign']).maskReason).toBe('auto_type');
    expect(preTickOf(clue('name', { type: 'name_text' }), 'standard', []).masked).toBe(false);
    expect(preTickOf(clue('name', { type: 'name_text' }), 'standard', [])).toMatchObject({ flag: 'high' });
  });

  it('applyPreTick sets masked/maskReason, clears a stale reason and resets userUnmasked', () => {
    const face = applyPreTick(clue('f', { type: 'face', masked: false, userUnmasked: true }), 'standard');
    expect(face).toMatchObject({ masked: true, userUnmasked: false, maskReason: 'face' });
    const flagged = applyPreTick(clue('s', { type: 'street_sign', masked: true, maskReason: 'strict', userUnmasked: true }), 'standard');
    expect(flagged.masked).toBe(false);
    expect(flagged.userUnmasked).toBe(false);
    expect('maskReason' in flagged).toBe(false);
  });
});
