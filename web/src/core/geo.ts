// web/src/core/geo.ts — distances are code, never the LLM (invariant 5; SPEC §10.1, D-10; ARCH §12.2; API-NOTES §5.6).
// Only band words ever reach the UI: never metres, never a map pin or an address for the attacker's guess (SR-07).
import type { BandThresholdsM, DistanceBand, AdversaryHypothesis, Pin, PinBand } from './types';
import { t as lookup, type StringId, type Translate } from './strings'; // aliased: `t` is the thresholds parameter below

/** RC `bands_m` defaults (ARCH §13). city and country are placeholders (U-35). Frozen: a stray write would move every band. */
export const DEFAULT_BANDS_M: BandThresholdsM = Object.freeze({ street: 250, neighbourhood: 1000, district: 5000, city: 30000, country: 500000 });
const R = 6_371_008.8; // mean Earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Upper bounds are inclusive (250 → street, 250.01 → neighbourhood). NaN, ±Infinity and negatives → `none`. */
export function bandFor(m: number, t: BandThresholdsM = DEFAULT_BANDS_M): DistanceBand {
  if (!Number.isFinite(m) || m < 0) return 'none';
  return m <= t.street ? 'street' : m <= t.neighbourhood ? 'neighbourhood' : m <= t.district ? 'district'
    : m <= t.city ? 'city' : m <= t.country ? 'country' : 'none';
}

const THRESHOLD_KEYS = ['street', 'neighbourhood', 'district', 'city', 'country'] as const;

/**
 * RC `bands_m` (already JSON-parsed) → thresholds. ARCH §13: five finite metres, > 0 and strictly increasing.
 * Anything else falls back to DEFAULT_BANDS_M, because a non-increasing table would silently skip bands.
 * D-77: street, neighbourhood and district are LOCKED to 250 / 1000 / 5000 m, because the band words name them
 * ("within 250 m", "within 1 km", "within 5 km"). Only city and country (placeholders, U-35) are tunable; a table
 * that moves a named threshold falls back, so the UI can never claim "within 250 m" about 300 m.
 */
export function bandThresholdsOrDefault(raw: unknown): BandThresholdsM {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_BANDS_M;
  const o = raw as Record<string, unknown>;
  let prev = 0;
  for (const k of THRESHOLD_KEYS) {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= prev) return DEFAULT_BANDS_M;
    prev = v;
  }
  if (o.street !== DEFAULT_BANDS_M.street || o.neighbourhood !== DEFAULT_BANDS_M.neighbourhood || o.district !== DEFAULT_BANDS_M.district) {
    return DEFAULT_BANDS_M; // D-77: the words name these three thresholds
  }
  return { street: o.street as number, neighbourhood: o.neighbourhood as number, district: o.district as number,
    city: o.city as number, country: o.country as number };
}

/** What a stranger effectively knows about this pin from one hypothesis: they search a disc of radius r around the
 *  centre. If the pin is inside, their precision is r; if outside, their error is d. So effective = max(d, r). */
export function effectiveMeters(h: AdversaryHypothesis, p: Pin): number {
  return Math.max(haversineMeters(h.lat, h.lng, p.lat, p.lng), h.radiusKm * 1000);
}

const BAND_ORDER: DistanceBand[] = ['street', 'neighbourhood', 'district', 'city', 'country', 'none'];
export const bandRank = (b: DistanceBand) => BAND_ORDER.indexOf(b);

/**
 * Conservative: the CLOSEST band over all hypotheses (pass B is capped at 3 by parse.ts), regardless of the
 * adversary's ranking. Closest means the smallest effective distance e = max(d, r), not the nearest centre.
 * A hypothesis with a non-finite e (NaN coordinates or radius) is skipped, so it can never mask a closer valid one.
 * Ties keep the earlier hypothesis: the adversary's own ranking (D-77; confidence is display-only, ARCH §12.3).
 */
export function pinBand(vaultId: string, pin: Pin, hs: AdversaryHypothesis[], t: BandThresholdsM = DEFAULT_BANDS_M): PinBand {
  let best: PinBand = { vaultId, band: 'none', hypothesisId: null, confidence: null, effectiveKm: null };
  for (const h of hs) {
    const m = effectiveMeters(h, pin);
    if (!Number.isFinite(m)) continue;
    if (best.effectiveKm === null || m / 1000 < best.effectiveKm) {
      best = { vaultId, band: bandFor(m, t), hypothesisId: h.id, confidence: h.confidence, effectiveKm: m / 1000 };
    }
  }
  return best;
}

/**
 * Copy IDs for SPEC §10.1's "Verdict words" column. `ui.*`, because SPEC gives these words outside §11 (strings.ts).
 * The words name the band's fixed SPEC threshold ("within 1 km (neighbourhood)"); they never carry a measured distance.
 */
export const BAND_WORD_IDS: Readonly<Record<DistanceBand, StringId>> = Object.freeze({
  street: 'ui.band.street',
  neighbourhood: 'ui.band.neighbourhood',
  district: 'ui.band.district',
  city: 'ui.band.city',
  country: 'ui.band.country',
  none: 'ui.band.none',
});

// The app's lookup. BAND_WORD_IDS is typed StringId, so a band word missing from en.json fails tsc (no cast).
const appT: Translate = (id, params) => lookup(id as StringId, params); // Translate takes string ids (test lookups)

/** SPEC band words for a band, from shared/strings/en.json. An unknown band (a bad cast) gets the `none` words. */
export function bandWords(band: DistanceBand, tr: Translate = appT): string {
  return tr(Object.hasOwn(BAND_WORD_IDS, band) ? BAND_WORD_IDS[band] : BAND_WORD_IDS.none);
}

/** Band words for an effective distance: the metres pick the band and are then dropped (SR-07: bands, never metres). */
export function distanceWords(m: number, th: BandThresholdsM = DEFAULT_BANDS_M, tr: Translate = appT): string {
  return bandWords(bandFor(m, th), tr);
}
