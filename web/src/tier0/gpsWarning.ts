// web/src/tier0/gpsWarning.ts: the P1 "this file carries GPS" warning (SPEC SCR-05 step 2, AC-102; T-053).
// S0: it touches vault pins, so it is pure code on this device: no AI, no logging, no storage, no network. The pins
// arrive as plain arguments (R13: tier0 never imports vault/*). Distances are code (invariant 5) and only band words
// reach the UI (SR-07). The EXIF point never leaves this module's caller: the result holds bands and kinds only.
import { bandFor, bandRank, bandWords, DEFAULT_BANDS_M, haversineMeters } from '../core/geo';
import { kindDisplay } from '../core/kinds';
import type { StringId, StringParams } from '../core/strings';
import { PIN_KINDS, type BandThresholdsM, type DistanceBand, type VaultKind } from '../core/types';

/** EXIF GPS as exifr.gps() returns it (decimal degrees). In memory only. */
export interface GpsPoint { latitude: number; longitude: number }
/** A vault pin as the active index exposes it (vaultScan.activePins(): PinRef). `label` is set for place_pin only. */
export interface GpsPinLike { kind: VaultKind; lat: number; lng: number; label?: string }

/** The bands close enough to name a pin: "district or closer" (SPEC SCR-05 step 2). */
export type NearBand = Extract<DistanceBand, 'street' | 'neighbourhood' | 'district'>;
const NEAR_LIMIT = bandRank('district');

/** One pin the GPS point is near. No coordinates, no distance: a band and a display kind only. */
export interface NearPin { band: NearBand; kind: VaultKind; kindDisplay: string }
/**
 * What the import screen shows. `near` lists every pin whose band is district or closer (SCR-05 step 2: "the band to
 * each pin"), closest first, one entry per {KIND} display name (the closest of each). Empty: gpsFound only.
 */
export interface GpsWarning { near: NearPin[] }
export interface CopyMessage { id: StringId; params?: StringParams }

const validPoint = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * The warning for a file whose EXIF carries `point`. Always a warning (gpsFound); `near` names each valid pin within
 * district range. Invalid points or pins (NaN, out of range, not a pin kind) are skipped, so they can only make the
 * warning less specific, never wrong. Equal distances keep the vault order.
 */
export function gpsWarningFor(point: GpsPoint, pins: readonly GpsPinLike[], th: BandThresholdsM = DEFAULT_BANDS_M): GpsWarning {
  if (!validPoint(point.latitude, point.longitude)) return { near: [] };
  const hits: Array<{ m: number; pin: GpsPinLike }> = [];
  for (const p of pins) {
    if (!PIN_KINDS.includes(p.kind) || !validPoint(p.lat, p.lng)) continue;
    const m = haversineMeters(point.latitude, point.longitude, p.lat, p.lng);
    if (Number.isFinite(m) && bandRank(bandFor(m, th)) <= NEAR_LIMIT) hits.push({ m, pin: p });
  }
  hits.sort((a, b) => a.m - b.m); // stable: ties keep the vault order
  const near: NearPin[] = [];
  for (const { m, pin } of hits) {
    const display = kindDisplay(pin.kind, pin.label);
    if (near.some((n) => n.kindDisplay === display)) continue; // the closest of each {KIND} only
    near.push({ band: bandFor(m, th) as NearBand, kind: pin.kind, kindDisplay: display });
  }
  return { near };
}

/** Copy for the warning, in display order: copy.import.gpsFound, then one copy.import.gpsNear per near pin. */
export function gpsWarningCopy(w: GpsWarning): CopyMessage[] {
  return [
    { id: 'copy.import.gpsFound' },
    ...w.near.map((n): CopyMessage => ({ id: 'copy.import.gpsNear', params: { 'band words': bandWords(n.band), KIND: n.kindDisplay } })),
  ];
}

/** The active vault index as the import step reads it (vaultScan satisfies this structurally; R13: no vault/* import). */
export interface PinSource {
  mode(): string;
  readonly ready: Promise<void>;
  activePins(): readonly GpsPinLike[];
}

/** How long an import waits for the vault index before it warns with gpsFound only. */
export const PIN_WAIT_MS = 5_000;

/**
 * The active vault's pins once its index is built, so a photo dropped while the vault is still being unsealed still
 * gets copy.import.gpsNear. Never hangs and never throws: before boot has chosen a vault (`unset`, whose `ready` would
 * never settle), when the index cannot be built, or after `timeoutMs`, it returns [] (the warning is then gpsFound
 * only). If a newer switch replaces `ready` while waiting, the newer one is awaited (a few times at most).
 */
export async function pinsWhenReady(src: PinSource, timeoutMs = PIN_WAIT_MS): Promise<readonly GpsPinLike[]> {
  if (src.mode() === 'unset') return [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((res) => { timer = setTimeout(() => res('timeout'), timeoutMs); });
  try {
    for (let k = 0; k < 4; k++) {
      const r = src.ready;
      // Both outcomes handled, so a rejection that lands after the timeout is never an unhandled one.
      const got = await Promise.race([r.then(() => 'ready' as const, () => 'failed' as const), timeout]);
      if (got !== 'ready') return [];
      if (r === src.ready) return src.activePins();
    }
    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
