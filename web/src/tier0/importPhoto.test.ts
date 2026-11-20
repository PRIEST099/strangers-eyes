// T-053 (AC-101, AC-103, AC-102): the import flow in Node, with the browser seams (decode, canvas, toBlob) faked.
// The real browser path (createImageBitmap, canvas pixels, Chrome's JPEG) runs in the DEV selftest "import" step.
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../core/strings';
import { exifApp1, minimalJpeg } from '../dev/fixtures/exifFixture';
import { MASTER_MAX_PX, fitWithin } from './decode';
import { assertCleanJpeg } from './exif';
import { IMPORT_ERROR_COPY, importPhoto, readExifFacts, sha256Hex, type ImportDeps, type ImportResult } from './importPhoto';
import { MAX_RIFF_CHUNKS } from './sniff';

const M_PER_DEG_LAT = (6_371_008.8 * Math.PI) / 180;
const HOME = { kind: 'home_pin' as const, lat: 10, lng: 20 };
const NEAR = { lat: HOME.lat + 200 / M_PER_DEG_LAT, lng: HOME.lng }; // 200 m north of the synthetic home pin

const be32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
const enc = (s: string) => [...s].map((c) => c.charCodeAt(0));
const box = (type: string, body: number[]) => [...be32(8 + body.length), ...enc(type), ...body];
const fullBox = (type: string, body: number[]) => box(type, [0, 0, 0, 0, ...body]);
/** A HEIC-shaped file (ftyp heic + meta/iprp/ipco/ispe), not decodable. */
const heic = (w: number, h: number) => new Uint8Array([
  ...box('ftyp', [...enc('heic'), 0, 0, 0, 0, ...enc('mif1'), ...enc('heic')]),
  ...fullBox('meta', box('iprp', box('ipco', fullBox('ispe', [...be32(w), ...be32(h)])))),
  ...box('mdat', [0, 0]),
]);

/** Fake browser seams. `decoded` is what createImageBitmap would return (already oriented, as Chrome does). */
function fakeDeps(o: { decoded?: [number, number]; decodeFails?: boolean; encoded?: Uint8Array } = {}) {
  const close = vi.fn();
  const calls = { decode: 0, renderMax: [] as number[], encodeQ: [] as number[] };
  const [w, h] = o.decoded ?? [100, 200];
  const deps: ImportDeps = {
    decode: async () => {
      calls.decode += 1;
      if (o.decodeFails) throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
      return { width: w, height: h, close } as unknown as ImageBitmap;
    },
    render: (img, maxPx) => {
      calls.renderMax.push(maxPx);
      const f = fitWithin(img.width, img.height, maxPx);
      return { width: f.width, height: f.height } as unknown as HTMLCanvasElement;
    },
    encode: async (_c, q) => {
      calls.encodeQ.push(q);
      return new Blob([(o.encoded ?? minimalJpeg(100, 200)) as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' });
    },
    assertClean: assertCleanJpeg, // the real D-19 check (in Node its segment scan decides; exifr's Blob reader needs a browser)
  };
  return { deps, close, calls };
}
const le32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
const riffChunk = (id: string, data: number[]) => [...enc(id), ...le32(data.length), ...data, ...(data.length & 1 ? [0] : [])];
/**
 * A WebP-shaped file (not decodable): VP8X with the EXIF flag (0x08), a VP8L frame header, and an `EXIF` chunk holding
 * the same TIFF (Orientation + GPS IFD) the JPEG fixture carries in APP1. `prefix`: some writers keep "Exif\0\0".
 * `junkChunks` empty JUNK chunks sit before the EXIF chunk. `withVp8x` false: a simple-format (VP8L-first) WebP.
 */
function webpWithExif(gps: { lat: number; lng: number } | null, prefix = false, junkChunks = 0, withVp8x = true): Uint8Array {
  const tiff = [...exifApp1({ orientation: 6, gps }).subarray(10)]; // APP1 = FF E1, length, "Exif\0\0", then the TIFF
  const vp8x = riffChunk('VP8X', [0x08, 0, 0, 0, 199, 0, 0, 99, 0, 0]); // 200 × 100
  const vp8l = riffChunk('VP8L', [0x2f, ...le32((199 & 0x3fff) | ((99 & 0x3fff) << 14)), 0]);
  const exif = riffChunk('EXIF', [...(prefix ? enc('Exif\0\0') : []), ...tiff]);
  const junk = new Array<number[]>(junkChunks).fill(riffChunk('JUNK', [])).flat();
  const body = [...enc('WEBP'), ...(withVp8x ? vp8x : []), ...vp8l, ...junk, ...exif];
  return new Uint8Array([...enc('RIFF'), ...le32(body.length), ...body]);
}
const blob = (b: Uint8Array, type = 'image/jpeg') => new Blob([b as Uint8Array<ArrayBuffer>], { type });
const gpsJpeg = () => blob(minimalJpeg(200, 100, [exifApp1({ orientation: 6, gps: NEAR })]));
function expectError(r: ImportResult, code: string) {
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.code).toBe(code);
    expect(r.copyId).toBe(IMPORT_ERROR_COPY[r.code]);
  }
}

describe('importPhoto: a JPEG with EXIF Orientation=6 and GPS (AC-101 flow; pixels are checked in the selftest)', () => {
  it('returns the oriented master, its clean JPEG, sha256, and the local GPS facts', async () => {
    const { deps, close, calls } = fakeDeps({ decoded: [100, 200] });
    const r = await importPhoto(gpsJpeg(), { pins: [HOME] }, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.width, r.height]).toEqual([100, 200]); // stored 200×100, rotated by the decoder
    expect(r.format).toBe('jpeg');
    expect(r.hadGps).toBe(true);
    expect(r.orientation).toBe(6);
    expect(r.gpsWarning).toEqual({ near: [{ band: 'street', kind: 'home_pin', kindDisplay: 'HOME' }] }); // AC-102
    expect(calls.renderMax).toEqual([MASTER_MAX_PX]);
    expect(calls.encodeQ).toEqual([0.9]);
    expect(close).toHaveBeenCalledTimes(1);
    const want = createHash('sha256').update(minimalJpeg(100, 200)).digest('hex');
    expect(r.sha256).toBe(want);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the result carries no coordinates: only a band and a kind', async () => {
    const r = await importPhoto(gpsJpeg(), { pins: [HOME] }, fakeDeps().deps);
    if (!r.ok) throw new Error('expected ok');
    const { master: _m, jpeg: _j, ...rest } = r;
    const text = JSON.stringify(rest);
    expect(text).not.toMatch(/lat|lng|longitude|10\.00|20\.0|"10"|"20"/i);
    expect(Object.keys(r).sort()).toEqual(['format', 'gpsWarning', 'hadGps', 'height', 'jpeg', 'master', 'ok', 'orientation', 'sha256', 'width']);
  });

  it('without pins the warning is gpsFound only; without EXIF there is no warning', async () => {
    const a = await importPhoto(gpsJpeg(), {}, fakeDeps().deps);
    expect(a.ok && a.gpsWarning).toEqual({ near: [] });
    const b = await importPhoto(blob(minimalJpeg(64, 64)), { pins: [HOME] }, fakeDeps({ decoded: [64, 64] }).deps);
    expect(b.ok && [b.hadGps, b.orientation, b.gpsWarning]).toEqual([false, null, null]);
  });

  it('a large photo is downscaled to the 2048 px master; a small one is never upscaled', () => {
    expect(fitWithin(8000, 5000, MASTER_MAX_PX)).toEqual({ width: 2048, height: 1280, scale: 0.256 });
    expect(fitWithin(5000, 8000, MASTER_MAX_PX)).toMatchObject({ width: 1280, height: 2048 });
    expect(fitWithin(640, 480, MASTER_MAX_PX)).toEqual({ width: 640, height: 480, scale: 1 });
  });
});

describe('WebP EXIF (exifr has no WebP parser): GPS in the RIFF EXIF chunk still warns (SCR-05 steps 1-2, P1)', () => {
  it('readExifFacts finds GPS and Orientation in a WebP EXIF chunk, with or without an "Exif\\0\\0" prefix', async () => {
    for (const prefix of [false, true]) {
      const facts = await readExifFacts(webpWithExif(NEAR, prefix));
      expect(facts.orientation).toBe(6);
      expect(facts.gps).toBeDefined();
      expect(Math.abs(facts.gps!.latitude - NEAR.lat)).toBeLessThan(1e-6);
      expect(Math.abs(facts.gps!.longitude - NEAR.lng)).toBeLessThan(1e-6);
    }
    expect((await readExifFacts(webpWithExif(null))).gps).toBeUndefined();
  });

  it('importPhoto on that WebP: hadGps, and gpsNear with band street for a home pin 200 m away', async () => {
    const r = await importPhoto(blob(webpWithExif(NEAR), 'image/webp'), { pins: [HOME] }, fakeDeps({ decoded: [100, 200] }).deps);
    expect(r.ok && [r.format, r.hadGps, r.gpsWarning]).toEqual(['webp', true, { near: [{ band: 'street', kind: 'home_pin', kindDisplay: 'HOME' }] }]);
  });
});

describe('importPhoto: rejections (AC-103) never decode what they reject', () => {
  it('a 35 MB file is tooLarge before a single byte is read', async () => {
    const read = vi.fn(async () => new ArrayBuffer(0));
    const big = { size: 35 * 1024 * 1024, type: 'image/jpeg', arrayBuffer: read } as unknown as Blob;
    const { deps, calls } = fakeDeps();
    expectError(await importPhoto(big, {}, deps), 'tooLarge');
    expect(read).not.toHaveBeenCalled();
    expect(calls.decode).toBe(0);
  });

  it('a non-image is unsupported, whatever its MIME type says', async () => {
    const { deps, calls } = fakeDeps();
    expectError(await importPhoto(blob(new TextEncoder().encode('hello, not a photo'), 'text/plain'), {}, deps), 'unsupported');
    expectError(await importPhoto(blob(new TextEncoder().encode('hello, not a photo'), 'image/jpeg'), {}, deps), 'unsupported');
    expectError(await importPhoto(blob(new Uint8Array(0)), {}, deps), 'unsupported');
    expect(calls.decode).toBe(0);
  });

  it('a WebP padded past MAX_RIFF_CHUNKS chunks is unsupported: never decoded, its GPS EXIF never read (fix round 2)', async () => {
    // VP8X + VP8L + junk + EXIF: MAX_RIFF_CHUNKS chunks in all is a normal import; one junk chunk more is rejected.
    const atCap = await importPhoto(blob(webpWithExif(NEAR, false, MAX_RIFF_CHUNKS - 3), 'image/webp'), { pins: [HOME] }, fakeDeps().deps);
    expect(atCap.ok && atCap.hadGps).toBe(true);
    const { deps, calls } = fakeDeps();
    expectError(await importPhoto(blob(webpWithExif(NEAR, false, MAX_RIFF_CHUNKS - 2), 'image/webp'), { pins: [HOME] }, deps), 'unsupported');
    expect(calls.decode).toBe(0);
  });

  it('fix round 3: a VP8L-first WebP (no VP8X) past MAX_RIFF_CHUNKS is unsupported too, never imported without its GPS warning', async () => {
    // VP8L + junk + EXIF, MAX_RIFF_CHUNKS chunks in all: a normal import, and its GPS EXIF (the last chunk) still warns.
    const atCap = await importPhoto(blob(webpWithExif(NEAR, false, MAX_RIFF_CHUNKS - 2, false), 'image/webp'), { pins: [HOME] }, fakeDeps().deps);
    expect(atCap.ok && [atCap.format, atCap.hadGps, atCap.gpsWarning])
      .toEqual(['webp', true, { near: [{ band: 'street', kind: 'home_pin', kindDisplay: 'HOME' }] }]);
    // One junk chunk more, or MAX_RIFF_CHUNKS of them: the GPS chunk is past the cap, so the file is rejected and never
    // decoded (before round 3 it was imported with hadGps false and no AC-102 warning).
    for (const junk of [MAX_RIFF_CHUNKS - 1, MAX_RIFF_CHUNKS]) {
      const { deps, calls } = fakeDeps();
      expectError(await importPhoto(blob(webpWithExif(NEAR, false, junk, false), 'image/webp'), { pins: [HOME] }, deps), 'unsupported');
      expect(calls.decode).toBe(0);
    }
  });

  it('a header over 40 MP is tooLarge without decoding', async () => {
    const { deps, calls } = fakeDeps();
    expectError(await importPhoto(blob(minimalJpeg(8001, 5000)), {}, deps), 'tooLarge');
    expect(calls.decode).toBe(0);
  });

  it('a decoded bitmap over 40 MP is still rejected (backstop), and the bitmap is closed', async () => {
    const { deps, close } = fakeDeps({ decoded: [9000, 5000] });
    expectError(await importPhoto(blob(minimalJpeg(64, 64)), {}, deps), 'tooLarge');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('HEIC that the browser cannot decode → copy.import.heic; any other decode failure → unsupported', async () => {
    expectError(await importPhoto(blob(heic(4032, 3024), 'image/heic'), {}, fakeDeps({ decodeFails: true }).deps), 'heic');
    expectError(await importPhoto(blob(minimalJpeg(64, 64)), {}, fakeDeps({ decodeFails: true }).deps), 'unsupported');
  });

  it('HEIC that the browser can decode (Safari) is imported like any photo', async () => {
    const r = await importPhoto(blob(heic(4032, 3024), 'image/heic'), {}, fakeDeps({ decoded: [4032, 3024] }).deps);
    expect(r.ok && [r.format, r.width, r.height]).toEqual(['heic', 2048, 1536]);
  });

  it('fails closed if the re-encoded master still carries APP1, with the import\'s own copy (ui.import.metadataFailed)', async () => {
    const dirty = minimalJpeg(100, 200, [exifApp1()]);
    const r = await importPhoto(gpsJpeg(), {}, fakeDeps({ encoded: dirty }).deps);
    expectError(r, 'metadata');
    expect(!r.ok && r.copyId).toBe('ui.import.metadataFailed');
    expect(IMPORT_ERROR_COPY.metadata).toBe('ui.import.metadataFailed');
  });

  it('fix round 4: no import error shows Egress Gate copy ("would have left this device"): nothing is sent at import', () => {
    for (const [code, id] of Object.entries(IMPORT_ERROR_COPY)) {
      expect(id, code).toMatch(/^(copy|ui)\.import\./);
      expect(t(id), code).not.toMatch(/would have left/i);
    }
    expect(t('ui.import.metadataFailed')).toMatch(/couldn't remove this photo's hidden metadata/);
  });
});

describe('sha256Hex', () => {
  it('matches Node crypto for ArrayBuffer and Uint8Array input', async () => {
    const b = new TextEncoder().encode('strangers');
    const want = createHash('sha256').update(b).digest('hex');
    expect(await sha256Hex(b)).toBe(want);
    expect(await sha256Hex(b.buffer)).toBe(want);
  });
});
