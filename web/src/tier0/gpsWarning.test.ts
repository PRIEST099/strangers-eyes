// T-053 P1 (AC-102): the GPS-found warning, computed in code from the EXIF point and the vault pins (S0).
// Synthetic points only (an empty patch of the globe), no real homes.
import { describe, expect, it, vi } from 'vitest';
import { exifApp1, minimalJpeg } from '../dev/fixtures/exifFixture';
import { haversineMeters } from '../core/geo';
import { kindDisplay } from '../core/kinds';
import { t } from '../core/strings';
import type { VaultKind } from '../core/types';
import { createVaultScan } from '../ai/vaultScan';
import type { VaultItem } from '../core/types';
import { gpsWarningCopy, gpsWarningFor, pinsWhenReady, type GpsPinLike, type PinSource } from './gpsWarning';
import { readExifFacts } from './importPhoto';

const M_PER_DEG_LAT = (6_371_008.8 * Math.PI) / 180; // core/geo's Earth radius
const HOME: GpsPinLike = { kind: 'home_pin', lat: 10, lng: 20 };
const north = (m: number) => ({ latitude: HOME.lat + m / M_PER_DEG_LAT, longitude: HOME.lng });
const render = (msgs: ReturnType<typeof gpsWarningCopy>) => msgs.map((m) => t(m.id, m.params));

describe('AC-102: GPS warning from an EXIF byte fixture (exifr in Node)', () => {
  it('reads Orientation=6 and GPS from the original bytes', async () => {
    const p = north(200);
    const bytes = minimalJpeg(200, 100, [exifApp1({ orientation: 6, gps: { lat: p.latitude, lng: p.longitude } })]);
    const facts = await readExifFacts(bytes);
    expect(facts.orientation).toBe(6);
    expect(facts.gps).toBeDefined();
    expect(Math.abs(facts.gps!.latitude - p.latitude)).toBeLessThan(1e-6);
    expect(Math.abs(facts.gps!.longitude - p.longitude)).toBeLessThan(1e-6);
  });

  it('a point 200 m from a home pin → copy.import.gpsFound + copy.import.gpsNear with band street', async () => {
    const p = north(200);
    const facts = await readExifFacts(minimalJpeg(200, 100, [exifApp1({ gps: { lat: p.latitude, lng: p.longitude } })]));
    expect(haversineMeters(facts.gps!.latitude, facts.gps!.longitude, HOME.lat, HOME.lng)).toBeCloseTo(200, 0);
    const w = gpsWarningFor(facts.gps!, [HOME]);
    expect(w.near).toEqual([{ band: 'street', kind: 'home_pin', kindDisplay: 'HOME' }]);
    const copy = gpsWarningCopy(w);
    expect(copy.map((m) => m.id)).toEqual(['copy.import.gpsFound', 'copy.import.gpsNear']);
    expect(render(copy)[1]).toBe('That GPS point is within 250 m (street level) of your HOME. It has been removed.');
  });

  it('no GPS in the file → nothing to warn about', async () => {
    const facts = await readExifFacts(minimalJpeg(10, 10, [exifApp1({ gps: null, orientation: 1 })]));
    expect(facts).toEqual({ gps: undefined, orientation: 1 });
    expect(await readExifFacts(minimalJpeg(10, 10))).toEqual({ gps: undefined, orientation: null });
  });

  it('formats exifr cannot read (text, truncated bytes) mean "nothing read", never a throw', async () => {
    expect(await readExifFacts(new TextEncoder().encode('not a photo at all'))).toEqual({ gps: undefined, orientation: null });
    expect(await readExifFacts(new Uint8Array([0xff, 0xd8, 0xff]))).toEqual({ gps: undefined, orientation: null });
  });
});

describe('gpsWarningFor: the band to each pin (district or closer)', () => {
  it('> 5 km → gpsFound only', () => {
    const w = gpsWarningFor(north(5_200), [HOME]);
    expect(w.near).toEqual([]);
    expect(gpsWarningCopy(w).map((m) => m.id)).toEqual(['copy.import.gpsFound']);
  });

  it('no pins → gpsFound only', () => {
    expect(gpsWarningCopy(gpsWarningFor(north(200), [])).map((m) => m.id)).toEqual(['copy.import.gpsFound']);
  });

  it('neighbourhood and district are near; the boundaries are inclusive like core/geo', () => {
    expect(gpsWarningFor(north(600), [HOME]).near[0]?.band).toBe('neighbourhood');
    expect(gpsWarningFor(north(3_000), [HOME]).near[0]?.band).toBe('district');
    expect(gpsWarningFor(north(4_990), [HOME]).near[0]?.band).toBe('district');
  });

  it('names EVERY pin within district range, closest first, each with its {KIND} display name', () => {
    const work: GpsPinLike = { kind: 'work_pin', lat: north(3_400).latitude, lng: HOME.lng };
    const w = gpsWarningFor(north(3_000), [HOME, work]); // 3 km from home, 400 m from work
    expect(w.near).toEqual([
      { band: 'neighbourhood', kind: 'work_pin', kindDisplay: 'WORKPLACE' },
      { band: 'district', kind: 'home_pin', kindDisplay: 'HOME' },
    ]);
    expect(render(gpsWarningCopy(w)).slice(1)).toEqual([
      'That GPS point is within 1 km (neighbourhood) of your WORKPLACE. It has been removed.',
      'That GPS point is within 5 km (district) of your HOME. It has been removed.',
    ]);
  });

  it('home 200 m away and a school pin 800 m away: both are named (SCR-05 step 2: the band to each pin)', () => {
    const school: GpsPinLike = { kind: 'school_pin', lat: north(1_000).latitude, lng: HOME.lng };
    const copy = gpsWarningCopy(gpsWarningFor(north(200), [school, HOME])); // 200 m from home, 800 m from school
    expect(copy.map((m) => m.id)).toEqual(['copy.import.gpsFound', 'copy.import.gpsNear', 'copy.import.gpsNear']);
    expect(render(copy).slice(1)).toEqual([
      'That GPS point is within 250 m (street level) of your HOME. It has been removed.',
      'That GPS point is within 1 km (neighbourhood) of your SCHOOL. It has been removed.',
    ]);
  });

  it('one line per {KIND} display name (the closest), and pins beyond district are not named', () => {
    const gymA: GpsPinLike = { kind: 'place_pin', lat: north(300).latitude, lng: HOME.lng, label: 'Gym' };
    const gymB: GpsPinLike = { kind: 'place_pin', lat: north(900).latitude, lng: HOME.lng, label: 'gym' };
    const pool: GpsPinLike = { kind: 'place_pin', lat: north(900).latitude, lng: HOME.lng, label: 'Pool' };
    const far: GpsPinLike = { kind: 'work_pin', lat: north(20_000).latitude, lng: HOME.lng };
    const w = gpsWarningFor(north(0), [gymB, far, pool, gymA]);
    expect(w.near.map((n) => [n.kindDisplay, n.band])).toEqual([['GYM', 'neighbourhood'], ['POOL', 'neighbourhood']]);
    expect(w.near[0]).toEqual({ band: 'neighbourhood', kind: 'place_pin', kindDisplay: 'GYM' });
  });

  it('skips invalid pins and non-pin kinds; an invalid point names no pin', () => {
    const junk: GpsPinLike[] = [
      { kind: 'home_pin', lat: Number.NaN, lng: 20 },
      { kind: 'home_pin', lat: 95, lng: 20 },
      { kind: 'child_name' as VaultKind, lat: HOME.lat, lng: HOME.lng },
    ];
    expect(gpsWarningFor(north(200), junk).near).toEqual([]);
    expect(gpsWarningFor({ latitude: Number.NaN, longitude: 20 }, [HOME]).near).toEqual([]);
    expect(gpsWarningFor({ latitude: 10, longitude: 200 }, [HOME]).near).toEqual([]);
  });

  it('is pure: no console output (S0: vault pins never reach a log)', () => {
    const spies = (['log', 'info', 'debug', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    gpsWarningCopy(gpsWarningFor(north(200), [HOME]));
    for (const s of spies) { expect(s).not.toHaveBeenCalled(); s.mockRestore(); }
  });
});

describe('kindDisplay (SPEC §17.3, from enums.v1.json KIND_DISPLAY)', () => {
  it('pin kinds', () => {
    expect(kindDisplay('home_pin')).toBe('HOME');
    expect(kindDisplay('work_pin')).toBe('WORKPLACE');
    expect(kindDisplay('school_pin')).toBe('SCHOOL');
  });
  it("place_pin shows the user's label in capitals, or PLACE", () => {
    expect(kindDisplay('place_pin', ' Gym ')).toBe('GYM');
    expect(kindDisplay('place_pin', '')).toBe('PLACE');
    expect(kindDisplay('place_pin')).toBe('PLACE');
    expect(gpsWarningFor(north(100), [{ kind: 'place_pin', lat: HOME.lat, lng: HOME.lng }]).near[0]?.kindDisplay).toBe('PLACE');
    expect(gpsWarningFor(north(100), [{ kind: 'place_pin', lat: HOME.lat, lng: HOME.lng, label: 'Gym' }]).near[0]?.kindDisplay).toBe('GYM');
  });
  it('other kinds, and an unknown kind falls back to VAULT ITEM', () => {
    expect(kindDisplay('child_name')).toBe("CHILD'S NAME");
    expect(kindDisplay('nope' as VaultKind)).toBe('VAULT ITEM');
  });
});

describe('pinsWhenReady: the import waits for the vault index (no race with the unseal), and never hangs', () => {
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
  const homeItem: VaultItem = {
    id: 'vi_home', kind: 'home_pin', label: 'Home', aliases: [], createdAt: 0,
    pin: { lat: HOME.lat, lng: HOME.lng, accuracyM: 0, capturedAt: 0, source: 'synthetic' },
  };

  it('a photo dropped while the real vault is still unsealing gets the pins once the index is built (gpsNear fires)', async () => {
    const d = deferred<readonly VaultItem[]>();
    const vs = createVaultScan({ loadReal: () => d.promise, register: () => {} });
    void vs.init({ judge: false });
    expect(vs.activePins()).toEqual([]); // what a synchronous read saw before: no pins, so no gpsNear
    const pending = pinsWhenReady(vs);
    d.resolve([homeItem]);
    const pins = await pending;
    expect(pins.map((p) => p.kind)).toEqual(['home_pin']);
    expect(gpsWarningCopy(gpsWarningFor(north(200), pins)).map((m) => m.id)).toEqual(['copy.import.gpsFound', 'copy.import.gpsNear']);
  });

  it('before boot has chosen a vault (`ready` would never settle): [] at once', async () => {
    const vs = createVaultScan({ loadReal: async () => [homeItem], register: () => {} });
    expect(vs.mode()).toBe('unset');
    expect(await pinsWhenReady(vs, 10_000)).toEqual([]);
  });

  it('a vault that cannot be read, or one that never answers: [] (gpsFound only), never a throw or a hang', async () => {
    const broken = createVaultScan({ loadReal: async () => { throw new Error('VaultCorruptError'); }, register: () => {} });
    void broken.init({ judge: false });
    expect(await pinsWhenReady(broken)).toEqual([]);
    const stuck = createVaultScan({ loadReal: () => new Promise<never>(() => {}), register: () => {} });
    void stuck.init({ judge: false });
    expect(await pinsWhenReady(stuck, 20)).toEqual([]);
  });

  it('a switch while waiting (a newer `ready`) is followed: the newer index wins', async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    let ready = first.promise;
    let pins: readonly GpsPinLike[] = [];
    const src: PinSource = { mode: () => 'real', get ready() { return ready; }, activePins: () => pins };
    const pending = pinsWhenReady(src);
    ready = second.promise; // e.g. a vault edit started a rebuild
    first.resolve();
    await Promise.resolve();
    pins = [HOME];
    second.resolve();
    expect(await pending).toEqual([HOME]);
  });
});
