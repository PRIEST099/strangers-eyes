import { describe, expect, it } from 'vitest';
import { bandFor, DEFAULT_BANDS_M, effectiveMeters, haversineMeters, pinBand } from './geo';
import type { AdversaryHypothesis, Pin } from './types';

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
