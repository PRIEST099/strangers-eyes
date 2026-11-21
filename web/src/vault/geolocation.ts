// web/src/vault/geolocation.ts: "Pin this place" and manual coordinates (SPEC SCR-04 steps 3–4, API-NOTES §5.7).
// One read of the device position: high accuracy, 15 s timeout, never a cached fix (maximumAge 0). The browser's own
// location service is the only source: no map, no address search, no reverse geocoding, no tile server, no request
// of ours at all. A pin goes straight to the sealed vault (vaultStore) and is never shown back as coordinates, only
// its accuracy (D-92). No logging in this folder (SR-15).
import type { StringId } from '../core/strings';
import type { Pin } from '../core/types';

/** SPEC SCR-04 step 3, verbatim. Passed as a fresh copy on every call. */
export const PIN_OPTIONS: Readonly<PositionOptions> = Object.freeze({ enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
/** Worse than this (metres) shows copy.vault.lowAccuracy (SCR-04 step 3). */
export const LOW_ACCURACY_M = 250;
/** Longest manual "lat, lng" text considered (anything longer is not a coordinate pair). */
export const MANUAL_MAX_CHARS = 64;
/**
 * App-level watchdog (D-99): the browser's 15 s timeout only starts once permission is granted, so an unanswered
 * permission prompt would leave "Getting your location…" forever. After this long the read fails as `timeout`; a late
 * answer is ignored (pressing Pin again asks again).
 */
export const PIN_WATCHDOG_MS = 30_000;

export type GeoFailureReason = 'denied' | 'timeout' | 'unavailable';

/** SCR-04 States: permission denied → pinDenied; unavailable or timed out → pinTimeout. */
export const GEO_FAILURE_COPY: Readonly<Record<GeoFailureReason, StringId>> = {
  denied: 'copy.vault.pinDenied',
  timeout: 'copy.vault.pinTimeout',
  unavailable: 'copy.vault.pinTimeout',
};

export class GeolocationFailure extends Error {
  readonly reason: GeoFailureReason;
  constructor(reason: GeoFailureReason) { super(`geolocation: ${reason}`); this.name = 'GeolocationFailure'; this.reason = reason; }
}

/** The part of navigator.geolocation used here (injectable for tests). */
export interface GeoLike {
  getCurrentPosition(ok: PositionCallback, err?: PositionErrorCallback | null, options?: PositionOptions): void;
}

/** GeolocationPositionError codes (API-NOTES §5.7): 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT. */
function reasonOf(e: { code?: unknown } | null | undefined): GeoFailureReason {
  if (e?.code === 1) return 'denied';
  if (e?.code === 3) return 'timeout';
  return 'unavailable';
}

const inRange = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** A position the vault accepts (vaultStore validPin), or null. */
export function pinFromPosition(p: Pick<GeolocationPosition, 'coords'> | null | undefined, capturedAt: number): Pin | null {
  const c = p?.coords;
  if (!c) return null;
  const { latitude: lat, longitude: lng, accuracy } = c;
  if (!inRange(lat, lng) || !Number.isFinite(accuracy) || accuracy < 0) return null;
  return { lat, lng, accuracyM: accuracy, capturedAt, source: 'geolocation' };
}

/**
 * Read the device position once (SCR-04 "Pin this place"). Resolves with a geolocation Pin, or rejects with a
 * GeolocationFailure: never a raw error, never a synchronous throw. Missing geolocation, a throwing implementation or a
 * fix the vault would refuse are all `unavailable`; no answer within `watchdogMs` (an ignored permission prompt) is
 * `timeout`. It settles exactly once: whatever the browser reports after that is ignored.
 */
export function currentPin(
  geo: GeoLike | undefined = globalThis.navigator?.geolocation,
  now: () => number = Date.now,
  watchdogMs: number = PIN_WATCHDOG_MS,
): Promise<Pin> {
  return new Promise<Pin>((resolve, reject) => {
    if (!geo || typeof geo.getCurrentPosition !== 'function') {
      reject(new GeolocationFailure('unavailable'));
      return;
    }
    let settled = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (watchdog !== undefined) clearTimeout(watchdog);
      fn();
    };
    watchdog = setTimeout(() => settle(() => reject(new GeolocationFailure('timeout'))), watchdogMs);
    try {
      geo.getCurrentPosition(
        (p) => settle(() => {
          const pin = pinFromPosition(p, now());
          if (pin) resolve(pin);
          else reject(new GeolocationFailure('unavailable'));
        }),
        (e) => settle(() => reject(new GeolocationFailure(reasonOf(e)))),
        { ...PIN_OPTIONS },
      );
    } catch {
      settle(() => reject(new GeolocationFailure('unavailable')));
    }
  });
}

/** Worse than LOW_ACCURACY_M (or not a number): show copy.vault.lowAccuracy. */
export const isLowAccuracy = (accuracyM: number): boolean => !(accuracyM <= LOW_ACCURACY_M);

/**
 * Whole metres for display ({m} in copy.vault.lowAccuracy / ui.vault.pin.*), rounded UP: an uncertainty is never shown
 * smaller than it is, and a fix just over 250 m never reads "±250 m" next to the low-accuracy warning. At least 1.
 */
export const accuracyMetres = (accuracyM: number): number => Math.max(1, Math.ceil(accuracyM));

export type ManualCoords =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: 'format' | 'range' };

/** One decimal number: optional sign, digits, and an optional fraction with digits on both sides of the point (D-99). */
const NUM = String.raw`[+-]?\d+(?:\.\d+)?`;
/** "lat, lng": a comma (spaces around it optional) or plain whitespace between the two numbers. */
const MANUAL_RE = new RegExp(String.raw`^(${NUM})\s*(?:,\s*|\s+)(${NUM})$`);

/**
 * Parse the manual "latitude, longitude" field (SCR-04 step 4, AC-084): "52.52, 13.405" is accepted; "95, 10" is out
 * of range and "abc" is not a pair. A Unicode minus (U+2212) counts as "-". Nothing is looked up: the numbers are the
 * pin.
 */
export function parseManualCoords(input: string): ManualCoords {
  if (typeof input !== 'string' || input.length > MANUAL_MAX_CHARS) return { ok: false, reason: 'format' };
  const m = MANUAL_RE.exec(input.trim().replace(/−/g, '-'));
  if (!m) return { ok: false, reason: 'format' };
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: 'format' };
  if (!inRange(lat, lng)) return { ok: false, reason: 'range' };
  return { ok: true, lat, lng };
}

/** Copy for a refused manual entry. */
export const MANUAL_ERROR_COPY: Readonly<Record<'format' | 'range', StringId>> = {
  format: 'ui.vault.manual.format',
  range: 'ui.vault.manual.range',
};

/** A pin from manual coordinates: accuracy 0 by convention (core/types Pin), source `manual`. */
export function manualPin(lat: number, lng: number, capturedAt: number): Pin {
  return { lat, lng, accuracyM: 0, capturedAt, source: 'manual' };
}
