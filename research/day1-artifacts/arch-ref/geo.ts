// web/src/core/geo.ts — distances are code, never the LLM
import type { BandThresholdsM, DistanceBand, AdversaryHypothesis, Pin, PinBand, Confidence } from './types';

export const DEFAULT_BANDS_M: BandThresholdsM = { street: 250, neighbourhood: 1000, district: 5000, city: 30000, country: 500000 };
const R = 6_371_008.8; // mean Earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bandFor(m: number, t: BandThresholdsM = DEFAULT_BANDS_M): DistanceBand {
  if (!Number.isFinite(m) || m < 0) return 'none';
  return m <= t.street ? 'street' : m <= t.neighbourhood ? 'neighbourhood' : m <= t.district ? 'district'
    : m <= t.city ? 'city' : m <= t.country ? 'country' : 'none';
}

/** What a stranger effectively knows about this pin from one hypothesis: they search a disc of radius r around the
 *  centre. If the pin is inside, their precision is r; if outside, their error is d. So effective = max(d, r). */
export function effectiveMeters(h: AdversaryHypothesis, p: Pin): number {
  return Math.max(haversineMeters(h.lat, h.lng, p.lat, p.lng), h.radiusKm * 1000);
}

const BAND_ORDER: DistanceBand[] = ['street', 'neighbourhood', 'district', 'city', 'country', 'none'];
export const bandRank = (b: DistanceBand) => BAND_ORDER.indexOf(b);

/** Conservative: the CLOSEST band over all (≤3) hypotheses, regardless of the adversary's ranking. */
export function pinBand(vaultId: string, pin: Pin, hs: AdversaryHypothesis[], t: BandThresholdsM = DEFAULT_BANDS_M): PinBand {
  let best: PinBand = { vaultId, band: 'none', hypothesisId: null, confidence: null, effectiveKm: null };
  for (const h of hs) {
    const m = effectiveMeters(h, pin);
    const b = bandFor(m, t);
    if (best.effectiveKm === null || m / 1000 < best.effectiveKm) {
      best = { vaultId, band: b, hypothesisId: h.id, confidence: h.confidence as Confidence, effectiveKm: m / 1000 };
    }
  }
  return best;
}
