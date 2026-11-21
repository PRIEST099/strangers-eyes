import { describe, expect, it } from 'vitest';
import { combineCrops, deterministicFix, expectedResidual, fixExplanation, fixTargets, residualAfter, selectedFix, type FixInput } from './fixPlan';
import type { AdversaryClue, AdversaryHypothesis, ImageFrame, PinBand, RefereeMatch, VaultItem } from './types';

// An 800×600 master sent uncropped at the same size, so box_2d maps 1:1 (AC-192's vector).
const FRAME: ImageFrame = { id: 'cloud', width: 800, height: 600, cropInMaster: { x: 0, y: 0, w: 800, h: 600 } };
const clue = (id: string, box2d: AdversaryClue['box2d'], over: Partial<AdversaryClue> = {}): AdversaryClue => ({
  id, type: 'street_sign', box2d, evidence: 'x', reveals: 'street', severity: 'high', removable: true, ...over,
});
const C1 = clue('c1', [100, 250, 500, 750]); // → {200, 60, 400, 240} before padding
const C2 = clue('c2', [700, 300, 860, 470], { type: 'uniform_or_lanyard', reveals: 'venue_or_organisation' });
const C3 = clue('c3', [0, 0, 100, 1000], { type: 'architecture', reveals: 'city', severity: 'low', removable: false }); // top band
const C4 = clue('c4', [600, 0, 700, 100], { type: 'vegetation_or_terrain', reveals: 'region', severity: 'medium' });
const H1: AdversaryHypothesis = { id: 'h1', label: 'x', level: 'neighbourhood', lat: 0, lng: 0, radiusKm: 1, confidence: 'medium', clueIds: ['c1', 'c3'] };
const match = (vaultId: string, strength: RefereeMatch['strength'], clueIds: string[]): RefereeMatch => ({ claimId: 'i1', vaultId, strength, reason: '', clueIds, route: 'RULES_ONLY' });
const band = (vaultId: string, b: PinBand['band'], hypothesisId: string | null = 'h1'): PinBand => ({ vaultId, band: b, hypothesisId, confidence: 'medium', effectiveKm: null });
const WORK: VaultItem = { id: 'w', kind: 'work_pin', label: 'Acme Robotics Ltd', aliases: [], pin: { lat: 0, lng: 0, accuracyM: 0, capturedAt: 0, source: 'manual' }, createdAt: 0 };
const HOME: VaultItem = { id: 'home', kind: 'home_pin', label: 'Home', aliases: [], pin: { lat: 0, lng: 0, accuracyM: 0, capturedAt: 0, source: 'manual' }, createdAt: 0 };

const input = (over: Partial<FixInput> & { clues?: AdversaryClue[] } = {}): FixInput => ({
  adv: { clues: over.clues ?? [C1, C2, C3, C4], hypotheses: [H1], sentFrame: FRAME },
  verdict: { matches: [], pinBands: [] }, vault: [WORK, HOME], width: 800, height: 600, padRatio: 0.15, ...over,
});

describe('fixTargets (SPEC §10.4)', () => {
  it('takes every match, and a hypothesis only for a pin at district or closer', () => {
    const ts = fixTargets({ matches: [match('w', 'possible', ['c2'])], pinBands: [band('home', 'district'), band('w', 'city')] }, [H1]);
    expect(ts).toEqual([{ vaultId: 'w', strong: false, clueIds: ['c2'] }, { vaultId: 'home', strong: true, clueIds: ['c1', 'c3'] }]);
  });
});

describe('deterministicFix (T-078, AC-191)', () => {
  it('with no targets masks every removable high clue, mapped from box_2d and padded (AC-192)', () => {
    const f = deterministicFix(input());
    expect(f.plan.maskClueIds).toEqual(['c1', 'c2']);
    // {200,60,400,240} padded 15% in total: 30 px each side horizontally, 18 px vertically.
    expect(f.masks[0]).toEqual({ clueId: 'c1', type: 'street_sign', box: { x: 170, y: 42, w: 460, h: 276 } });
    expect(f.plan).toMatchObject({ crop: 'none', route: 'RULES_ONLY', rulesAddedMasks: 0, expectedResidual: 'city' });
    expect(f.crop).toBeNull();
    expect(f.unremovable).toBe(false);
  });

  it('masks exactly the removable clues the targets cite, and flags a cited clue that cannot be masked', () => {
    const f = deterministicFix(input({ verdict: { matches: [match('w', 'likely', ['c2'])], pinBands: [band('home', 'neighbourhood')] } }));
    expect(f.plan.maskClueIds).toEqual(['c1', 'c2']); // c2 from the match, c1 from h1; c3 cited but not removable; c4 not cited
    expect(f.unremovable).toBe(true);
    expect(f.plan.crop).toBe('none'); // h1 also cites a removable clue
    expect(f.plan.expectedResidual).toBe('city'); // c3 (city) and c4 (region) stay visible
  });

  it('crops when a strong target cites only non-removable clues, and the cropped clue no longer counts', () => {
    const h: AdversaryHypothesis = { ...H1, clueIds: ['c3'] };
    const f = deterministicFix({ ...input({ verdict: { matches: [], pinBands: [band('home', 'street')] } }), adv: { clues: [C3, C4], hypotheses: [h], sentFrame: FRAME } });
    expect(f.plan.crop).toBe('top');
    expect(f.crop).not.toBeNull();
    expect(f.crop!.y).toBeGreaterThanOrEqual(60); // c3 ends at y = 60
    expect(f.plan.maskClueIds).toEqual([]);
    expect(f.plan.expectedResidual).toBe('region'); // c3 cropped away, c4 (region) left
    expect(f.plan.explanation).toBe('None of the clues the attacker used can be masked.');
  });

  it('gives no crop and cropTooMuch when no side fits the 40% cap (AC-196)', () => {
    const big = clue('c3', [0, 0, 600, 1000], { type: 'architecture', removable: false, reveals: 'city' });
    const f = deterministicFix({ ...input({ verdict: { matches: [match('w', 'exact', ['c3'])], pinBands: [] } }), adv: { clues: [big], hypotheses: [H1], sentFrame: FRAME } });
    expect(f.crop).toBeNull();
    expect(f.plan.crop).toBe('none');
    expect(f.cropTooMuch).toBe(true);
    expect(f.unremovable).toBe(true);
  });

  it('maps boxes through the frame the image was sent as (a scaled, cropped re-attack frame)', () => {
    const frame: ImageFrame = { id: 'cloud', width: 400, height: 200, cropInMaster: { x: 0, y: 200, w: 800, h: 400 } };
    const f = deterministicFix({ ...input(), adv: { clues: [clue('c1', [0, 0, 500, 500])], hypotheses: [], sentFrame: frame }, padRatio: 0 });
    expect(f.masks[0]!.box).toEqual({ x: 0, y: 196, w: 404, h: 208 }); // {0,200,400,200} + the 4 px minimum, clamped
  });

  it('never puts a vault label in the explanation, only KIND_PHRASE (AC-197)', () => {
    const f = deterministicFix(input({ verdict: { matches: [match('w', 'likely', ['c2'])], pinBands: [] } }));
    expect(f.plan.explanation).toBe('Masking 1 details that pointed to your workplace.');
    expect(f.plan.explanation).not.toMatch(/Acme|\bsafe\b/i);
    expect(fixExplanation(2, [])).toBe('Masking 2 details the attacker relied on.');
  });
});

describe('expectedResidual, selection and crops', () => {
  it('is the finest visible reveals; an organisation counts as street; country when nothing is left', () => {
    expect(expectedResidual([C2, C3], new Set())).toBe('street');
    expect(expectedResidual([C2, C3], new Set(['c2']))).toBe('city');
    expect(expectedResidual([C2], new Set(['c2']))).toBe('country');
  });

  it('drops unticked masks and recomputes the residual from what is applied (D-51)', () => {
    const inp = input();
    const f = deterministicFix(inp);
    const off = new Set(['c2']);
    expect(selectedFix(f, off).masks).toEqual([f.masks[0]!.box]);
    expect(residualAfter(inp, f, off)).toBe('street'); // c2 (organisation) stays visible
    expect(residualAfter(inp, f, new Set())).toBe('city');
  });

  it('combines crops to their intersection', () => {
    expect(combineCrops(null, null)).toBeNull();
    expect(combineCrops({ x: 0, y: 60, w: 800, h: 540 }, { x: 0, y: 0, w: 700, h: 600 })).toEqual({ x: 0, y: 60, w: 700, h: 540 });
  });
});
