import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normaliseBox2d, parseAdvB, ParseError } from './parse';

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(root(`shared/prompts/fixtures/${name}`), 'utf8')) as Record<string, unknown>;

describe('parseAdvB over the shared fixtures', () => {
  it('ok: keeps everything, converts snake_case', () => {
    const r = parseAdvB(fixture('advB.v1.ok.json'));
    expect(r.status).toBe('ok');
    expect(r.clues.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(r.clues[0].box2d).toEqual([120, 610, 380, 760]);
    expect(r.hypotheses.map((h) => [h.id, h.clueIds])).toEqual([['h1', ['c1', 'c2']], ['h2', ['c1', 'c4']]]);
    expect(r.hypotheses[0].radiusKm).toBeGreaterThanOrEqual(0.1);
    expect(r.inferences.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(r.repairs).toEqual([]);
  });

  it('declined and no_location_signal: empty arrays, reason kept', () => {
    const d = parseAdvB(fixture('advB.v1.declined.json'));
    expect(d.status).toBe('declined');
    expect(d.declineReason).toMatch(/private/);
    expect([d.clues, d.hypotheses, d.inferences]).toEqual([[], [], []]);
    const n = parseAdvB(fixture('advB.v1.no_signal.json'));
    expect(n.status).toBe('no_location_signal');
    expect([n.clues, n.hypotheses, n.inferences]).toEqual([[], [], []]);
  });

  it('bad_ids: first of each duplicate id kept, dangling clue_ids dropped (D-72)', () => {
    const r = parseAdvB(fixture('advB.v1.bad_ids.json'));
    expect(r.clues.map((c) => [c.id, c.type])).toEqual([['c1', 'transit_sign']]);
    expect(r.hypotheses.map((h) => [h.id, h.level, h.clueIds])).toEqual([['h1', 'city', ['c1']]]);
    expect(r.inferences.map((i) => [i.id, i.kind, i.clueIds])).toEqual([['i1', 'transit_line', ['c1']]]);
    expect(r.repairs.join('\n')).toMatch(/duplicate id/);
    expect(r.repairs.join('\n')).toMatch(/dangling clue_ids c9/);
  });

  it('swapped_boxes: swap, clamp, drop zero-area clues and their references, floor radius', () => {
    const r = parseAdvB(fixture('advB.v1.swapped_boxes.json'));
    expect(r.clues.map((c) => [c.id, c.box2d])).toEqual([['c1', [100, 200, 500, 800]], ['c2', [0, 100, 1000, 300]]]);
    expect(r.hypotheses[0].clueIds).toEqual(['c1', 'c2']);
    expect(r.hypotheses[0].radiusKm).toBe(0.1);
  });

  it('truncated: the raw text is not valid JSON, so the caller never reaches parseAdvB', () => {
    const t = fixture('advB.v1.truncated.json');
    expect(() => JSON.parse(t.raw as string)).toThrow();
  });
});

describe('parseAdvB rejects malformed output', () => {
  const base = () => fixture('advB.v1.ok.json');
  it.each([
    ['not an object', () => []],
    ['bad status', () => ({ ...base(), audit_status: 'maybe' })],
    ['missing clues', () => { const b = base(); delete b.clues; return b; }],
    ['enum value outside the schema', () => { const b = base(); (b.clues as Record<string, unknown>[])[0].type = 'face'; return b; }],
    ['string coordinate', () => { const b = base(); (b.hypotheses as Record<string, unknown>[])[0].lat = '48.8'; return b; }],
    ['box with 3 values', () => { const b = base(); (b.clues as Record<string, unknown>[])[0].box_2d = [1, 2, 3]; return b; }],
  ])('%s → ParseError', (_name, make) => {
    expect(() => parseAdvB(make())).toThrow(ParseError);
  });

  it('drops a hypothesis with out-of-range lat/lng but keeps the rest', () => {
    const b = fixture('advB.v1.ok.json');
    (b.hypotheses as Record<string, unknown>[])[0].lat = 123;
    const r = parseAdvB(b);
    expect(r.hypotheses.map((h) => h.id)).toEqual(['h2']);
  });

  it('caps arrays at the schema limits', () => {
    const b = fixture('advB.v1.ok.json');
    const c0 = (b.clues as Record<string, unknown>[])[0];
    b.clues = Array.from({ length: 15 }, (_, i) => ({ ...c0, id: `c${i + 1}` }));
    const r = parseAdvB(b);
    expect(r.clues).toHaveLength(12);
  });
});

describe('normaliseBox2d', () => {
  it('rounds, clamps and swaps', () => {
    expect(normaliseBox2d([10.4, 20.6, -5, 1200], 'b')).toEqual([0, 21, 10, 1000]);
  });
  it('returns null for zero area', () => {
    expect(normaliseBox2d([5, 5, 5, 9], 'b')).toBeNull();
  });
});
