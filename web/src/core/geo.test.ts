import { describe, expect, it } from 'vitest';
import en from '@strings/en.json';
import vectors from '@vectors/bands.json';
import {
  BAND_WORD_IDS, bandFor, bandThresholdsOrDefault, bandWords, DEFAULT_BANDS_M, distanceWords, effectiveMeters,
  haversineMeters, pinBand,
} from './geo';
import { createT } from './strings';
import { DISTANCE_BANDS, type AdversaryHypothesis, type BandThresholdsM, type Confidence, type DistanceBand, type Pin } from './types';

const pin = (lat: number, lng: number): Pin => ({ lat, lng, accuracyM: 10, capturedAt: 0, source: 'synthetic' });
const hyp = (id: string, lat: number, lng: number, radiusKm: number): AdversaryHypothesis =>
  ({ id, lat, lng, radiusKm, confidence: 'medium' } as unknown as AdversaryHypothesis);

describe('haversineMeters', () => {
  it('is zero for the same point and symmetric', () => {
    expect(haversineMeters(10, 20, 10, 20)).toBe(0);
    expect(haversineMeters(52.52, 13.405, 48.857, 2.352)).toBeCloseTo(haversineMeters(48.857, 2.352, 52.52, 13.405), 6);
  });
  it('matches a known distance (Berlin to Paris, about 878 km)', () => {
    const m = haversineMeters(52.52, 13.405, 48.857, 2.352);
    expect(m).toBeGreaterThan(870_000);
    expect(m).toBeLessThan(885_000);
  });
  it('handles the antimeridian', () => {
    expect(haversineMeters(0, 179.9, 0, -179.9)).toBeLessThan(25_000);
  });
});

describe('bandFor', () => {
  it('uses inclusive upper bounds', () => {
    expect(bandFor(0)).toBe('street');
    expect(bandFor(DEFAULT_BANDS_M.street)).toBe('street');
    expect(bandFor(DEFAULT_BANDS_M.street + 1)).toBe('neighbourhood');
    expect(bandFor(1_000)).toBe('neighbourhood');
    expect(bandFor(5_000)).toBe('district');
    expect(bandFor(30_000)).toBe('city');
    expect(bandFor(500_000)).toBe('country');
    expect(bandFor(500_001)).toBe('none');
  });
  it('fails safe on bad input', () => {
    expect(bandFor(Number.NaN)).toBe('none');
    expect(bandFor(-1)).toBe('none');
  });
});

describe('effectiveMeters / pinBand (D-10: e = max(d, r), closest band over hypotheses)', () => {
  const home = pin(52.52, 13.405);
  it('uses the radius when the pin is inside the disc', () => {
    expect(effectiveMeters(hyp('h1', 52.52, 13.405, 2), home)).toBe(2_000);
  });
  it('uses the distance when the pin is outside the disc', () => {
    const e = effectiveMeters(hyp('h1', 52.53, 13.405, 0.1), home);
    expect(e).toBeGreaterThan(1_000);
    expect(e).toBeLessThan(1_200);
  });
  it('picks the closest hypothesis regardless of order', () => {
    const b = pinBand('v1', home, [hyp('far', 48.857, 2.352, 1), hyp('near', 52.5201, 13.405, 0.2)]);
    expect(b.hypothesisId).toBe('near');
    expect(b.band).toBe('street');
  });
  it('returns none with no hypotheses', () => {
    expect(pinBand('v1', home, []).band).toBe('none');
  });
});

// ---------- shared/testvectors/bands.json (SPEC §10.7, AC-168: XCTest runs the same file in T-121) ----------

type Num = number | string; // JSON has no NaN/Infinity: the vectors spell them as strings
interface LatLng { lat: Num; lng: Num }
interface VHyp extends LatLng { id: string; radiusKm: Num; confidence: Confidence }
type VCase =
  | { fn: 'haversine'; name: string; a: LatLng; b: LatLng; expect: { meters: number; tolM: number } }
  | { fn: 'band'; name: string; m: Num; thresholdsM?: BandThresholdsM; expect: { band: DistanceBand } }
  | { fn: 'thresholds'; name: string; raw: unknown; expect: { thresholdsM: BandThresholdsM } }
  | { fn: 'effective'; name: string; pin: LatLng; hypothesis: Omit<VHyp, 'id' | 'confidence'>; expect: { meters: number; tolM: number } }
  | { fn: 'pinBand'; name: string; pin: LatLng; hypotheses: VHyp[]; thresholdsM?: BandThresholdsM;
      expect: { band: DistanceBand; hypothesisId: string | null; confidence: Confidence | null } }
  | { fn: 'words'; name: string; band: DistanceBand; expect: { id: string; words: string } };
type Fn = VCase['fn'];

const V = vectors as unknown as { description: string; earthRadiusM: number; defaultThresholdsM: BandThresholdsM; cases: VCase[] };
const FNS: readonly Fn[] = ['haversine', 'band', 'thresholds', 'effective', 'pinBand', 'words'];
const casesOf = <F extends Fn>(fn: F) => V.cases.filter((c): c is Extract<VCase, { fn: F }> => c.fn === fn);

const NON_FINITE: Readonly<Record<string, number>> = { NaN: Number.NaN, Infinity: Number.POSITIVE_INFINITY, '-Infinity': Number.NEGATIVE_INFINITY };
function num(x: Num): number {
  if (typeof x === 'number') return x;
  if (Object.hasOwn(NON_FINITE, x)) return NON_FINITE[x];
  throw new Error(`bands.json: "${x}" is not a number or NaN/Infinity/-Infinity`);
}
const vPin = (p: LatLng) => pin(num(p.lat), num(p.lng));
const vHyp = (h: VHyp): AdversaryHypothesis =>
  ({ id: h.id, label: h.id, level: 'city', lat: num(h.lat), lng: num(h.lng), radiusKm: num(h.radiusKm), confidence: h.confidence, clueIds: [] });

describe('bands.json is well formed', () => {
  it('is self-describing, uses only known functions, and covers each of them', () => {
    expect(V.description.length).toBeGreaterThan(0);
    for (const c of V.cases) expect(FNS).toContain(c.fn);
    for (const fn of FNS) expect(casesOf(fn).length, fn).toBeGreaterThan(0);
  });
  it('names every case uniquely within its function', () => {
    for (const fn of FNS) {
      const names = casesOf(fn).map((c) => c.name);
      expect(new Set(names).size, fn).toBe(names.length);
    }
  });
  it('agrees with the code on R and the RC defaults; the defaults are frozen', () => {
    expect(haversineMeters(90, 0, -90, 0)).toBeCloseTo(Math.PI * V.earthRadiusM, 6);
    expect(DEFAULT_BANDS_M).toEqual(V.defaultThresholdsM);
    expect(Object.isFrozen(DEFAULT_BANDS_M)).toBe(true);
  });
});

describe('bands.json: haversineMeters (R = 6,371,008.8 m)', () => {
  it.each(casesOf('haversine'))('$name', (c) => {
    const there = haversineMeters(num(c.a.lat), num(c.a.lng), num(c.b.lat), num(c.b.lng));
    const back = haversineMeters(num(c.b.lat), num(c.b.lng), num(c.a.lat), num(c.a.lng));
    expect(Math.abs(there - c.expect.meters)).toBeLessThanOrEqual(c.expect.tolM);
    expect(Math.abs(back - c.expect.meters)).toBeLessThanOrEqual(c.expect.tolM);
  });
});

describe('bands.json: bandFor (band edges, NaN → none, RC thresholds)', () => {
  it.each(casesOf('band'))('$name', (c) => {
    expect(bandFor(num(c.m), c.thresholdsM ?? V.defaultThresholdsM)).toBe(c.expect.band);
    if (!c.thresholdsM) expect(bandFor(num(c.m))).toBe(c.expect.band); // the default parameter is the RC default
  });
});

describe('bands.json: bandThresholdsOrDefault (RC bands_m must be strictly increasing)', () => {
  it.each(casesOf('thresholds'))('$name', (c) => {
    expect(bandThresholdsOrDefault(c.raw)).toEqual(c.expect.thresholdsM);
  });
});

describe('bands.json: effectiveMeters (the radius effect, D-10)', () => {
  it.each(casesOf('effective'))('$name', (c) => {
    const h = vHyp({ ...c.hypothesis, id: 'h1', confidence: 'medium' });
    expect(Math.abs(effectiveMeters(h, vPin(c.pin)) - c.expect.meters)).toBeLessThanOrEqual(c.expect.tolM);
  });
});

describe('bands.json: pinBand (closest of up to 3 hypotheses by e)', () => {
  it.each(casesOf('pinBand'))('$name', (c) => {
    const r = pinBand('v1', vPin(c.pin), c.hypotheses.map(vHyp), c.thresholdsM ?? V.defaultThresholdsM);
    expect({ band: r.band, hypothesisId: r.hypothesisId, confidence: r.confidence }).toEqual(c.expect);
    expect(r.vaultId).toBe('v1');
    if (r.hypothesisId === null) expect(r.effectiveKm).toBeNull();
    else expect(bandFor((r.effectiveKm ?? Number.NaN) * 1000, c.thresholdsM ?? V.defaultThresholdsM)).toBe(r.band);
  });
});

// ---------- band words (SPEC §10.1 "Verdict words"; SR-07: bands, never metres) ----------

describe('bands.json: bandWords / distanceWords', () => {
  const wordCases = casesOf('words');
  // Tests read the SPEC words from the vectors, so they do not depend on en.json (see the en.json block below).
  const vt = createT(Object.fromEntries(wordCases.map((c) => [c.expect.id, c.expect.words])), { strict: true });
  // "Digits followed by m or km", with optional thousands separators, decimals and spacing.
  const DIST = /\d[\d,.\s]*k?m\b/gi;
  const spec = new Map(wordCases.map((c) => [c.band, c.expect.words]));

  it('has one word case per DistanceBand', () => {
    expect(wordCases.map((c) => c.band).sort()).toEqual([...DISTANCE_BANDS].sort());
  });

  it.each(wordCases)('$name: the copy ID and the SPEC words', (c) => {
    expect(BAND_WORD_IDS[c.band]).toBe(c.expect.id);
    expect(bandWords(c.band, vt)).toBe(c.expect.words);
  });

  it('an unknown band (a bad cast) gets the none words', () => {
    expect(bandWords('elsewhere' as DistanceBand, vt)).toBe(spec.get('none'));
    expect(bandWords('toString' as DistanceBand, vt)).toBe(spec.get('none'));
  });

  it('never outputs a measured distance: digits + m/km only ever appear as the band\'s fixed SPEC threshold', () => {
    // SPEC §10.1 itself names three thresholds in the words ("within 250 m", "within 1 km", "within 5 km"); those
    // are fixed copy. Any other digits + m/km would be a measured distance leaking into the UI.
    const fixed = [...new Set(wordCases.flatMap((c) => c.expect.words.match(DIST) ?? []).map((s) => s.trim()))];
    expect(fixed.sort()).toEqual(['1 km', '250 m', '5 km']);
    for (const b of ['city', 'country', 'none'] as const) expect(spec.get(b)).not.toMatch(/\d/);

    // Edges, near-edges, the vectors' own distances and a deterministic log-uniform sweep from 1 m to 20,000 km.
    const sweep: number[] = [0, 0.4, 1, 99, 249.99, 250, 250.01, 742, 999.5, 1000, 1000.01, 1234.5, 4999, 5000,
      5000.01, 12_345, 30_000, 30_000.01, 123_456, 500_000, 500_000.01, 877_465, 20_015_114,
      Number.NaN, Number.POSITIVE_INFINITY, -1, ...casesOf('band').map((c) => num(c.m))];
    let seed = 52_520_134; // Park–Miller: the product stays below 2^53, so the sequence is exact and repeatable
    for (let i = 0; i < 400; i++) {
      seed = (seed * 16_807) % 2_147_483_647;
      sweep.push(10 ** ((seed / 2_147_483_647) * 7.3)); // 1 m … 20,000 km
    }
    for (const m of sweep) {
      const out = distanceWords(m, DEFAULT_BANDS_M, vt);
      expect(out).toBe(spec.get(bandFor(m))); // a function of the band alone: the metres are dropped
      for (const tok of out.match(DIST) ?? []) expect(fixed, `${m} m → "${out}"`).toContain(tok.trim());
    }
  });

  it('follows RC thresholds: the band, not the metres, chooses the words', () => {
    const t100: BandThresholdsM = { street: 100, neighbourhood: 500, district: 2000, city: 10000, country: 100000 };
    expect(distanceWords(250, t100, vt)).toBe(spec.get('neighbourhood'));
    expect(distanceWords(250, DEFAULT_BANDS_M, vt)).toBe(spec.get('street'));
  });

  // The default lookup is core/strings.ts t() over shared/strings/en.json: pinned to the SPEC words verbatim.
  const enTable = en as Record<string, string>;
  it('en.json carries the SPEC band words, and bandWords() reads them through t()', () => {
    for (const c of wordCases) {
      expect(enTable[c.expect.id]).toBe(c.expect.words);
      expect(bandWords(c.band)).toBe(c.expect.words);
    }
  });
});
