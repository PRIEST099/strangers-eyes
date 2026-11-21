// T-055: "Pin this place" and manual coordinates (SPEC SCR-04 steps 3–4, AC-083, AC-084; API-NOTES §5.7).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  accuracyMetres, currentPin, GEO_FAILURE_COPY, GeolocationFailure, isLowAccuracy, LOW_ACCURACY_M, MANUAL_ERROR_COPY,
  MANUAL_MAX_CHARS, manualPin, parseManualCoords, PIN_OPTIONS, PIN_WATCHDOG_MS, pinFromPosition, type GeoLike,
} from './geolocation';
import { validateItem } from './vaultStore';

const position = (latitude: number, longitude: number, accuracy: number) => ({ coords: { latitude, longitude, accuracy } }) as GeolocationPosition;
const geoOk = (p: GeolocationPosition): GeoLike & { calls: PositionOptions[] } => {
  const calls: PositionOptions[] = [];
  return { calls, getCurrentPosition: (ok, _err, o) => { calls.push(o ?? {}); ok(p); } };
};
const geoErr = (code: number): GeoLike => ({ getCurrentPosition: (_ok, err) => err?.({ code } as GeolocationPositionError) });
const reasonOf = (p: Promise<unknown>) => p.then(() => 'resolved', (e: unknown) => (e instanceof GeolocationFailure ? e.reason : `raw:${String(e)}`));

describe('parseManualCoords (AC-084)', () => {
  it('accepts "52.52, 13.405" and rejects "95, 10" (range) and "abc" (format)', () => {
    expect(parseManualCoords('52.52, 13.405')).toEqual({ ok: true, lat: 52.52, lng: 13.405 });
    expect(parseManualCoords('95, 10')).toEqual({ ok: false, reason: 'range' });
    expect(parseManualCoords('abc')).toEqual({ ok: false, reason: 'format' });
  });

  it.each([
    ['52.52,13.405', 52.52, 13.405],
    ['  52.52 ,  13.405  ', 52.52, 13.405],
    ['52.52 13.405', 52.52, 13.405],
    ['-33.9, -70.1', -33.9, -70.1],
    ['+10, +20', 10, 20],
    ['−33.9, 151.2', -33.9, 151.2],   // a Unicode minus, as some keyboards and pages produce
    ['90, 180', 90, 180],
    ['-90, -180', -90, -180],
    ['0, 0', 0, 0],
  ])('accepts %j', (input, lat, lng) => {
    expect(parseManualCoords(input)).toEqual({ ok: true, lat, lng });
  });

  it.each([
    ['90.0001, 0', 'range'],
    ['0, 180.5', 'range'],
    ['-91, 0', 'range'],
    ['0, -181', 'range'],
    ['', 'format'],
    ['52.52', 'format'],
    ['52.52,', 'format'],
    ['52.52, 13.405, 7', 'format'],
    ['52,52, 13,405', 'format'],   // decimal commas are ambiguous: refused, never guessed
    ['1.2.3, 4', 'format'],
    ['52.52N, 13.405E', 'format'],
    ['1e2, 3', 'format'],
    ['Infinity, 0', 'format'],
    ['0x10, 0', 'format'],
    ['Berlin', 'format'],
    ['.5, 0', 'format'],      // D-99: digits on both sides of a decimal point
    ['52 .5', 'format'],      // was read as (52, 0.5)
    ['52. 52', 'format'],     // was read as (52, 52)
    ['52., 13.', 'format'],
  ])('rejects %j as %s', (input, reason) => {
    expect(parseManualCoords(input)).toEqual({ ok: false, reason });
  });

  it('refuses over-long input and non-strings without trying to parse them', () => {
    const padded = `${' '.repeat(MANUAL_MAX_CHARS)}1, 2`;
    expect(parseManualCoords(padded)).toEqual({ ok: false, reason: 'format' });
    expect(parseManualCoords(undefined as unknown as string)).toEqual({ ok: false, reason: 'format' });
  });

  it('maps each refusal to its inline copy', () => {
    expect(MANUAL_ERROR_COPY).toEqual({ format: 'ui.vault.manual.format', range: 'ui.vault.manual.range' });
  });

  it('builds a manual pin the vault accepts (accuracy 0, source manual)', () => {
    const r = parseManualCoords('52.52, 13.405');
    if (!r.ok) throw new Error('expected ok');
    const pin = manualPin(r.lat, r.lng, 1_700_000_000_000);
    expect(pin).toEqual({ lat: 52.52, lng: 13.405, accuracyM: 0, capturedAt: 1_700_000_000_000, source: 'manual' });
    expect(() => validateItem({ id: 'vi_0123456789ab', kind: 'home_pin', label: '', aliases: [], pin, createdAt: 1 })).not.toThrow();
  });
});

describe('currentPin (SCR-04 "Pin this place", API-NOTES §5.7)', () => {
  it('asks for one fresh high-accuracy fix with a 15 s timeout, exactly as SPEC says', async () => {
    const geo = geoOk(position(10, 20, 35));
    await currentPin(geo, () => 5);
    expect(geo.calls).toEqual([{ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }]);
    expect(PIN_OPTIONS).toEqual({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    expect(Object.isFrozen(PIN_OPTIONS)).toBe(true);
  });

  it('passes a fresh options object, so the browser can never mutate the shared one', async () => {
    let seen: PositionOptions | undefined;
    await currentPin({ getCurrentPosition: (ok, _e, o) => { seen = o; ok(position(1, 2, 3)); } });
    expect(seen).not.toBe(PIN_OPTIONS);
  });

  it('resolves lat, lng and accuracy as a geolocation pin the vault accepts (AC-083)', async () => {
    const pin = await currentPin(geoOk(position(48.1, 11.5, 42.4)), () => 1234);
    expect(pin).toEqual({ lat: 48.1, lng: 11.5, accuracyM: 42.4, capturedAt: 1234, source: 'geolocation' });
    expect(() => validateItem({ id: 'vi_0123456789ab', kind: 'work_pin', label: 'Work', aliases: [], pin, createdAt: 1 })).not.toThrow();
  });

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
    [99, 'unavailable'],
  ])('maps error code %i to %s', async (code, reason) => {
    await expect(reasonOf(currentPin(geoErr(code)))).resolves.toBe(reason);
  });

  it('fails closed as `unavailable`: no geolocation, a throwing one, or a fix the vault would refuse', async () => {
    await expect(reasonOf(currentPin(undefined))).resolves.toBe('unavailable');
    await expect(reasonOf(currentPin({} as GeoLike))).resolves.toBe('unavailable');
    await expect(reasonOf(currentPin({ getCurrentPosition: () => { throw new Error('boom'); } }))).resolves.toBe('unavailable');
    await expect(reasonOf(currentPin(geoOk(position(91, 0, 5))))).resolves.toBe('unavailable');
    await expect(reasonOf(currentPin(geoOk(position(0, 0, Number.NaN))))).resolves.toBe('unavailable');
    await expect(reasonOf(currentPin(geoOk(position(0, 0, -1))))).resolves.toBe('unavailable');
    await expect(reasonOf(currentPin(geoErr(1)))).resolves.not.toMatch(/^raw:/);
  });

  it('does not touch the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await currentPin(geoOk(position(1, 2, 3)));
    parseManualCoords('52.52, 13.405');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  describe('watchdog (D-99): an unanswered permission prompt never leaves the read hanging', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('fails as `timeout` after 30 s without an answer, and ignores a late answer', async () => {
      vi.useFakeTimers();
      let late: PositionCallback = () => {};
      const p = reasonOf(currentPin({ getCurrentPosition: (ok) => { late = ok; } }));
      expect(PIN_WATCHDOG_MS).toBe(30_000);
      await vi.advanceTimersByTimeAsync(29_999);
      let settled = false;
      void p.then(() => { settled = true; });
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(p).resolves.toBe('timeout');
      expect(() => late(position(1, 2, 3))).not.toThrow();   // the promise is settled: nothing changes
    });

    it('an answer in time clears the watchdog (no timer left behind)', async () => {
      vi.useFakeTimers();
      await currentPin(geoOk(position(1, 2, 3)));
      await currentPin(geoErr(1)).catch(() => undefined);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it('pinFromPosition refuses a missing position', () => {
    expect(pinFromPosition(undefined, 1)).toBeNull();
    expect(pinFromPosition({ coords: undefined } as unknown as GeolocationPosition, 1)).toBeNull();
  });
});

describe('accuracy display (SCR-04: show the accuracy, warn above 250 m)', () => {
  it('warns only when worse than 250 m', () => {
    expect(LOW_ACCURACY_M).toBe(250);
    expect(isLowAccuracy(0)).toBe(false);
    expect(isLowAccuracy(250)).toBe(false);
    expect(isLowAccuracy(250.01)).toBe(true);
    expect(isLowAccuracy(1200)).toBe(true);
    expect(isLowAccuracy(Number.NaN)).toBe(true);
  });

  it('rounds UP to whole metres (never shows less uncertainty than there is), at least 1', () => {
    expect(accuracyMetres(42)).toBe(42);
    expect(accuracyMetres(42.4)).toBe(43);
    expect(accuracyMetres(0.2)).toBe(1);
    expect(accuracyMetres(0)).toBe(1);
    // A fix just over 250 m is low accuracy and must not read "±250 m" next to the warning.
    expect(isLowAccuracy(250.2) && accuracyMetres(250.2)).toBe(251);
    expect(accuracyMetres(250)).toBe(250);
  });

  it('maps denied to pinDenied, and timeout or unavailable to pinTimeout (SCR-04 States)', () => {
    expect(GEO_FAILURE_COPY).toEqual({ denied: 'copy.vault.pinDenied', timeout: 'copy.vault.pinTimeout', unavailable: 'copy.vault.pinTimeout' });
  });
});
