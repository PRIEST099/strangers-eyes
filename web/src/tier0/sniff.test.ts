// T-053 (AC-103): the magic-byte sniffer. Fixtures are tiny byte arrays built here; nothing is decoded.
import { describe, expect, it, vi } from 'vitest';
import { exifApp1, minimalJpeg } from '../dev/fixtures/exifFixture';
import { readExifFacts } from './importPhoto';

/** Every argument exifr.gps / exifr.orientation received (the real exifr still answers). */
const exifrCalls = vi.hoisted(() => ({ gps: [] as unknown[], orientation: [] as unknown[] }));
vi.mock('exifr', async (importOriginal) => {
  type Fn = (x: unknown) => Promise<unknown>;
  const real = (await importOriginal<{ default: { gps: Fn; orientation: Fn } }>()).default;
  return {
    default: {
      ...real,
      gps: (x: unknown) => { exifrCalls.gps.push(x); return real.gps(x); },
      orientation: (x: unknown) => { exifrCalls.orientation.push(x); return real.orientation(x); },
    },
  };
});
import {
  MAX_BOXES_PER_LEVEL, MAX_EXIF_TIFF_BYTES, MAX_FTYP_BRANDS, MAX_IMPORT_BYTES, MAX_IMPORT_PIXELS, MAX_JPEG_SEGMENTS, MAX_RIFF_CHUNKS, MAX_SMALL_PNG_CHUNKS, detectContainer, exifTiff, exceedsByteLimit, sniffImage, webpExifPayload,
} from './sniff';

const enc = (s: string) => [...s].map((c) => c.charCodeAt(0));
const be32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
const le32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
const le24 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff];
const le16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());

// ---------------------------------------------------------------- PNG
const pngChunk = (type: string, data: number[]) => [...be32(data.length), ...enc(type), ...data, 0, 0, 0, 0]; // CRC not checked
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function png(w: number, h: number, opts: { apng?: boolean; idat?: boolean } = {}): Uint8Array {
  return bytes(
    PNG_SIG,
    pngChunk('IHDR', [...be32(w), ...be32(h), 8, 2, 0, 0, 0]),
    pngChunk('sRGB', [0]),
    opts.apng ? pngChunk('acTL', [...be32(2), ...be32(0)]) : [],
    opts.idat === false ? [] : pngChunk('IDAT', [0x78, 0x9c]),
    opts.apng ? pngChunk('fdAT', [0, 0, 0, 1]) : [],
    pngChunk('IEND', []),
  );
}

// ---------------------------------------------------------------- WebP
const riffChunk = (id: string, data: number[]) => [...enc(id), ...le32(data.length), ...data, ...(data.length & 1 ? [0] : [])];
function riff(chunks: number[][]): Uint8Array {
  const body = [...enc('WEBP'), ...chunks.flat()];
  return bytes(enc('RIFF'), le32(body.length), body);
}
const vp8 = (w: number, h: number) => riffChunk('VP8 ', [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h), 0, 0]);
const vp8l = (w: number, h: number) => riffChunk('VP8L', [0x2f, ...le32(((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14)), 0]);
const vp8x = (w: number, h: number, flags = 0) => riffChunk('VP8X', [flags, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]);

// ---------------------------------------------------------------- ISO-BMFF (HEIC, MP4, AVIF)
const box = (type: string, body: number[]) => [...be32(8 + body.length), ...enc(type), ...body];
const fullBox = (type: string, body: number[]) => box(type, [0, 0, 0, 0, ...body]);
const ftyp = (major: string, compat: string[]) => box('ftyp', [...enc(major), 0, 0, 0, 0, ...compat.flatMap(enc)]);
function heif(major: string, compat: string[], ispes: Array<[number, number]>, opts: { moov?: boolean } = {}): Uint8Array {
  const ipco = box('ipco', ispes.flatMap(([w, h]) => fullBox('ispe', [...be32(w), ...be32(h)])));
  const meta = fullBox('meta', [...fullBox('hdlr', [0, 0, 0, 0, ...enc('pict'), ...new Array(12).fill(0), 0]), ...box('iprp', ipco)]);
  return bytes(ftyp(major, compat), meta, opts.moov ? box('moov', []) : [], box('mdat', [1, 2, 3, 4]));
}
const mp4 = () => bytes(ftyp('isom', ['isom', 'iso2', 'mp41']), box('moov', []), box('mdat', [0, 0]));

describe('detectContainer (magic bytes, never file.type)', () => {
  it.each([
    ['jpeg', minimalJpeg(10, 10)],
    ['png', png(1, 1)],
    ['webp', riff([vp8(1, 1)])],
    ['heic', heif('heic', ['mif1', 'heic'], [[1, 1]])],
    ['gif', bytes(enc('GIF89a'), [1, 0, 1, 0])],
    ['gif', bytes(enc('GIF87a'), [1, 0, 1, 0])],
    ['video', mp4()],
    ['video', bytes([0x1a, 0x45, 0xdf, 0xa3, 0, 0])],
    ['video', bytes(enc('RIFF'), le32(4), enc('AVI '))],
    ['other', heif('avif', ['avif', 'mif1', 'miaf'], [[1, 1]])],
    ['other', heif('mif1', ['mif1', 'avif'], [[1, 1]])],
    ['other', new TextEncoder().encode('https://example.com/photo.jpg')],
    ['other', new Uint8Array([0x89, 0x50, 0x4e])], // a truncated signature is not a PNG
  ] as Array<[string, Uint8Array]>)('%s', (want, b) => {
    expect(detectContainer(b)).toBe(want);
  });

  it('recognises every HEIF brand from the task list', () => {
    for (const brand of ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1']) {
      expect(detectContainer(heif(brand, [brand], [[1, 1]])), brand).toBe('heic');
    }
  });
});

describe('sniffImage: header dimensions without decoding', () => {
  it('JPEG: SOF0 after APP0 and an EXIF APP1', () => {
    expect(sniffImage(minimalJpeg(640, 480, [exifApp1()]))).toEqual({ ok: true, format: 'jpeg', width: 640, height: 480 });
  });

  it('JPEG: FF C0 inside an APP1 (an EXIF thumbnail with its own SOF0) is skipped; the real SOF0 gives the size', () => {
    // A camera's EXIF APP1 carries a whole thumbnail JPEG. A scanner that looked for the first SOF bytes instead of
    // walking the segments would report the thumbnail's 160 × 120, and let a > 40 MP frame behind it through.
    const thumb = minimalJpeg(160, 120);
    const payload = [...enc('Exif'), 0, 0, ...thumb];
    const app1 = new Uint8Array([0xff, 0xe1, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload]);
    const b = minimalJpeg(4000, 3000, [app1]);
    const firstSof = b.findIndex((x, i) => x === 0xff && b[i + 1] === 0xc0);
    expect(firstSof).toBeGreaterThan(0);
    expect(firstSof).toBeLessThan(2 + 18 + app1.length); // the fixture really has FF C0 inside the APP1
    expect(sniffImage(b)).toEqual({ ok: true, format: 'jpeg', width: 4000, height: 3000 });
    expect(sniffImage(minimalJpeg(8000, 5001, [app1]))).toEqual({ ok: false, reason: 'tooLarge', container: 'jpeg', why: 'pixels' });
  });

  it('JPEG: progressive SOF2, fill bytes and an RST marker before the frame header', () => {
    const b = minimalJpeg(300, 200);
    const sofAt = b.findIndex((x, i) => x === 0xff && b[i + 1] === 0xc0);
    const p = new Uint8Array([...b.subarray(0, sofAt), 0xff, 0xff, 0xd0, ...b.subarray(sofAt)]);
    p[sofAt + 4] = 0xc2; // ff ff d0 | ff c2 …
    expect(sniffImage(p)).toEqual({ ok: true, format: 'jpeg', width: 300, height: 200 });
  });

  it('PNG IHDR', () => {
    expect(sniffImage(png(1920, 1080))).toEqual({ ok: true, format: 'png', width: 1920, height: 1080 });
  });

  it('WebP VP8, VP8L and VP8X', () => {
    expect(sniffImage(riff([vp8(800, 600)]))).toEqual({ ok: true, format: 'webp', width: 800, height: 600 });
    expect(sniffImage(riff([vp8l(1000, 700)]))).toEqual({ ok: true, format: 'webp', width: 1000, height: 700 });
    expect(sniffImage(riff([vp8x(4000, 3000, 0x10), vp8(4000 & 0x3fff, 3000)]))).toEqual({ ok: true, format: 'webp', width: 4000, height: 3000 });
  });

  it('HEIC: the largest ispe (the grid image, not its tiles or thumbnail)', () => {
    const b = heif('heic', ['mif1', 'heic'], [[512, 512], [4032, 3024], [320, 240]]);
    expect(sniffImage(b)).toEqual({ ok: true, format: 'heic', width: 4032, height: 3024 });
  });
});

describe('sniffImage: animated and video files are unsupported', () => {
  it('GIF', () => {
    expect(sniffImage(bytes(enc('GIF89a'), [1, 0, 1, 0, 0, 0, 0]))).toMatchObject({ ok: false, reason: 'unsupported', container: 'gif' });
  });
  it('APNG (acTL before IDAT)', () => {
    expect(sniffImage(png(100, 100, { apng: true }))).toMatchObject({ ok: false, reason: 'unsupported', container: 'png', why: 'animated' });
  });
  it('animated WebP: the VP8X animation flag, or an ANIM/ANMF chunk when the flag is clear', () => {
    expect(sniffImage(riff([vp8x(64, 64, 0x02), riffChunk('ANIM', [0, 0, 0, 0, 0, 0])])))
      .toMatchObject({ ok: false, reason: 'unsupported', why: 'animated' });
    expect(sniffImage(riff([vp8x(64, 64, 0x00), riffChunk('ANMF', new Array(16).fill(0))])))
      .toMatchObject({ ok: false, reason: 'unsupported', why: 'animated' });
  });
  it('MP4 and other ISO-BMFF video', () => {
    expect(sniffImage(mp4())).toMatchObject({ ok: false, reason: 'unsupported', container: 'video' });
  });
  it('HEIF image sequences (msf1/hevc major brand, or a moov track)', () => {
    expect(sniffImage(heif('msf1', ['msf1', 'hevc'], [[64, 64]]))).toMatchObject({ ok: false, reason: 'unsupported', why: 'animated' });
    expect(sniffImage(heif('hevc', ['hevc'], [[64, 64]]))).toMatchObject({ ok: false, reason: 'unsupported', why: 'animated' });
    expect(sniffImage(heif('heic', ['mif1', 'heic'], [[64, 64]], { moov: true }))).toMatchObject({ ok: false, reason: 'unsupported', why: 'animated' });
  });
  it('AVIF, text, and an empty file', () => {
    expect(sniffImage(heif('avif', ['avif', 'mif1'], [[64, 64]]))).toMatchObject({ ok: false, reason: 'unsupported' });
    expect(sniffImage(new TextEncoder().encode('just some text, not a photo'))).toMatchObject({ ok: false, reason: 'unsupported', why: 'unknown' });
    expect(sniffImage(new Uint8Array(0), 0)).toMatchObject({ ok: false, reason: 'unsupported', why: 'empty' });
  });
});

describe('sniffImage: limits (30 MB, 40 MP)', () => {
  it('30 MB is decimal, as macOS Finder and iOS Files show it: exactly the limit passes, one byte more is tooLarge', () => {
    expect(MAX_IMPORT_BYTES).toBe(30_000_000);
    expect(sniffImage(minimalJpeg(10, 10), 31_400_000)).toMatchObject({ ok: false, reason: 'tooLarge', why: 'bytes' }); // Finder: "31.4 MB"
    expect(sniffImage(minimalJpeg(10, 10), MAX_IMPORT_BYTES).ok).toBe(true);
    expect(sniffImage(minimalJpeg(10, 10), MAX_IMPORT_BYTES + 1)).toMatchObject({ ok: false, reason: 'tooLarge', why: 'bytes' });
    expect(sniffImage(new Uint8Array(0), 35 * 1024 * 1024)).toMatchObject({ ok: false, reason: 'tooLarge' }); // AC-103: 35 MB
    expect(sniffImage(minimalJpeg(10, 10), Number.NaN)).toMatchObject({ ok: false, reason: 'tooLarge' }); // fail closed
    expect(exceedsByteLimit(MAX_IMPORT_BYTES)).toBe(false);
    expect(exceedsByteLimit(MAX_IMPORT_BYTES + 1)).toBe(true);
  });

  it('40 MP exactly passes; 40 MP + 1 px is tooLarge from the header alone (never decoded)', () => {
    expect(MAX_IMPORT_PIXELS).toBe(40_000_000);
    expect(sniffImage(minimalJpeg(8000, 5000))).toMatchObject({ ok: true, width: 8000, height: 5000 });
    expect(sniffImage(png(40_000_001, 1))).toMatchObject({ ok: false, reason: 'tooLarge', why: 'pixels' });
    expect(sniffImage(png(8000, 5001))).toMatchObject({ ok: false, reason: 'tooLarge', why: 'pixels' });
    expect(sniffImage(minimalJpeg(65535, 65535))).toMatchObject({ ok: false, reason: 'tooLarge', why: 'pixels' }); // a classic bomb
    expect(sniffImage(riff([vp8x(1 << 24, 1 << 24)]))).toMatchObject({ ok: false, reason: 'tooLarge', why: 'pixels' });
    expect(sniffImage(heif('heic', ['heic'], [[100_000, 100_000]]))).toMatchObject({ ok: false, reason: 'tooLarge', why: 'pixels' });
  });
});

describe('sniffImage: malformed or truncated headers fail closed (never throw, never loop)', () => {
  it('specific malformed headers', () => {
    const cases: Uint8Array[] = [
      bytes([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]), // SOS before any SOF
      bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]), // zero segment length
      bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0x12, 0x34]), // garbage between segments
      minimalJpeg(0, 100), // width 0
      png(100, 100, { idat: false }), // no IDAT before IEND
      bytes(PNG_SIG, pngChunk('IHDR', [...be32(0), ...be32(5), 8, 2, 0, 0, 0]), pngChunk('IDAT', [0])), // width 0
      bytes(PNG_SIG, pngChunk('sRGB', [0]), pngChunk('IDAT', [0])), // IHDR not first
      riff([riffChunk('VP8 ', [0, 0, 0, 0x11, 0x22, 0x33, 0, 0, 0, 0])]), // bad VP8 start code
      riff([riffChunk('VP8L', [0x00, 0, 0, 0, 0])]), // bad VP8L signature
      riff([riffChunk('XXXX', [0, 0])]), // unknown first chunk
      heif('heic', ['heic'], []), // no ispe
      bytes(ftyp('heic', ['heic']), [0, 0, 0, 4, ...enc('meta')]), // box smaller than its header
    ];
    for (const b of cases) expect(sniffImage(b)).toMatchObject({ ok: false, reason: 'unsupported' });
  });

  it('HEIF: an ispe too short for width and height is malformed (never read from the next box)', () => {
    // A 12-byte ispe (FullBox header only) followed by a box whose size/type bytes would read as 16 × 16.
    const shortIspe = box('ispe', [0, 0, 0, 0]);
    const next = box('pixi', [0, 0, 0, 0x10, 0, 0, 0, 0x10]);
    const b = bytes(ftyp('heic', ['mif1', 'heic']), fullBox('meta', box('iprp', box('ipco', [...shortIspe, ...next]))), box('mdat', [0]));
    expect(sniffImage(b)).toMatchObject({ ok: false, reason: 'unsupported', why: 'malformed' });
    // Same, with the ispe last inside ipco and real bytes after ipco: still malformed.
    const b2 = bytes(ftyp('heic', ['heic']), fullBox('meta', box('iprp', [...box('ipco', shortIspe), ...box('ipma', [0, 0, 0, 0x10, 0, 0, 0, 0x10])])));
    expect(sniffImage(b2)).toMatchObject({ ok: false, reason: 'unsupported', why: 'malformed' });
  });

  // T-053 final review: the JPEG walk stopped at the first SOF and the PNG walk at the first IDAT, while exifr walks the
  // segments up to SOS and every PNG chunk, so millions of tiny segments or chunks after those points passed the sniff
  // and then cost exifr ~1 s and hundreds of MB. Both walks now cover that structure, capped.
  it('JPEG: segments are counted up to the first scan (also after the SOF); more than MAX_JPEG_SEGMENTS fails closed', () => {
    const sofAt = (b: Uint8Array) => b.findIndex((x, i) => x === 0xff && b[i + 1] === 0xc0);
    const withAfterSof = (n: number) => { // n empty APP15 segments between the SOF and the SOS
      const b = minimalJpeg(640, 480);
      const sosAt = sofAt(b) + 2 + 0x11;
      return bytes([...b.subarray(0, sosAt)], new Array(n).fill([0xff, 0xef, 0x00, 0x02]).flat(), [...b.subarray(sosAt)]);
    };
    // minimalJpeg = SOI, APP0, SOF0, SOS: 3 segments up to the scan, so MAX - 3 more still pass.
    expect(sniffImage(withAfterSof(MAX_JPEG_SEGMENTS - 3))).toEqual({ ok: true, format: 'jpeg', width: 640, height: 480 });
    expect(sniffImage(withAfterSof(MAX_JPEG_SEGMENTS))).toMatchObject({ ok: false, reason: 'unsupported', why: 'malformed' });
    // A 30 MB JPEG of empty APP segments after its SOF stops at the cap.
    const huge = new Uint8Array(MAX_IMPORT_BYTES);
    const head = minimalJpeg(640, 480).subarray(0, sofAt(minimalJpeg(640, 480)) + 2 + 0x11);
    huge.set(head);
    for (let i = head.length; i + 4 <= huge.length; i += 4) huge.set([0xff, 0xef, 0x00, 0x02], i);
    expect(sniffImage(huge)).toMatchObject({ ok: false, why: 'malformed' });
  });

  it('JPEG: a frame header with no scan after it (truncated before SOS) is malformed', () => {
    const b = minimalJpeg(640, 480);
    const sof = b.findIndex((x, i) => x === 0xff && b[i + 1] === 0xc0);
    expect(sniffImage(b.subarray(0, sof + 2 + 0x11))).toMatchObject({ ok: false, reason: 'unsupported' });
  });

  it('PNG: every chunk is walked to IEND; more than MAX_SMALL_PNG_CHUNKS chunks under 1 KiB fails closed', () => {
    const head = [...PNG_SIG, ...pngChunk('IHDR', [...be32(64), ...be32(32), 8, 2, 0, 0, 0]), ...pngChunk('IDAT', [0x78, 0x9c])];
    const tEXt = pngChunk('tEXt', []);
    // IHDR and IEND are small non-IDAT chunks too (IDAT never counts): 2 + (MAX - 2) = MAX passes, one more fails.
    const after = (n: number) => bytes(head, new Array(n).fill(tEXt).flat(), pngChunk('IEND', []));
    expect(sniffImage(after(MAX_SMALL_PNG_CHUNKS - 2))).toEqual({ ok: true, format: 'png', width: 64, height: 32 });
    expect(sniffImage(after(MAX_SMALL_PNG_CHUNKS - 1))).toMatchObject({ ok: false, reason: 'unsupported', why: 'malformed' });
    // Round-5 verifier: an encoder that writes many SMALL IDAT chunks (1100 × 512 bytes) is legitimate and passes.
    const idat512 = pngChunk('IDAT', new Array(512).fill(0));
    const smallIdats = bytes([...PNG_SIG, ...pngChunk('IHDR', [...be32(64), ...be32(32), 8, 2, 0, 0, 0])], new Array(1100).fill(idat512).flat(), pngChunk('IEND', []));
    expect(sniffImage(smallIdats)).toEqual({ ok: true, format: 'png', width: 64, height: 32 });
    // No IEND (truncated) is malformed too: exifr would otherwise walk whatever follows.
    expect(sniffImage(bytes(head))).toMatchObject({ ok: false, reason: 'unsupported' });
    // A large legitimate PNG of many 1 KiB IDAT chunks still passes (only small chunks count).
    const idat1k = pngChunk('IDAT', new Array(1024).fill(0));
    const big = bytes([...PNG_SIG, ...pngChunk('IHDR', [...be32(64), ...be32(32), 8, 2, 0, 0, 0])], new Array(3 * MAX_SMALL_PNG_CHUNKS).fill(idat1k).flat(), pngChunk('IEND', []));
    expect(sniffImage(big)).toEqual({ ok: true, format: 'png', width: 64, height: 32 });
    // acTL AFTER the first IDAT does not make a PNG animated (the APNG spec puts acTL before it).
    expect(sniffImage(bytes(head, pngChunk('acTL', [...be32(2), ...be32(0)]), pngChunk('IEND', [])))).toMatchObject({ ok: true });
  });

  it('HEIF made of thousands of tiny boxes: fails closed at the per-level cap (no huge allocation)', () => {
    const valid = heif('heic', ['mif1', 'heic'], [[64, 32]]);
    expect(sniffImage(valid)).toMatchObject({ ok: true });
    // The same file with MAX_BOXES_PER_LEVEL empty `free` boxes before its meta.
    const ftypLen = 8 + 8 + 8; // ftyp('heic', ['mif1','heic'])
    const frees = new Array(MAX_BOXES_PER_LEVEL).fill(box('free', [])).flat();
    const padded = bytes([...valid.subarray(0, ftypLen)], frees, [...valid.subarray(ftypLen)]);
    expect(sniffImage(padded)).toMatchObject({ ok: false, reason: 'unsupported', why: 'malformed' });
    // A 30 MB file of 8-byte boxes stops after the cap instead of walking (and allocating) 3.75 M boxes.
    const huge = new Uint8Array(MAX_IMPORT_BYTES);
    huge.set(ftyp('heic', ['heic']));
    const free8 = [0, 0, 0, 8, 0x66, 0x72, 0x65, 0x65];
    for (let i = 20; i + 8 <= huge.length; i += 8) for (let k = 0; k < 8; k++) huge[i + k] = free8[k];
    expect(sniffImage(huge)).toMatchObject({ ok: false, why: 'malformed' });
  });

  describe('WebP made of thousands of tiny RIFF chunks: both walks stop at MAX_RIFF_CHUNKS (fix round 2)', () => {
    const junk = riffChunk('JUNK', []);
    const pad = (n: number) => new Array<number[]>(n).fill(junk);
    const anmf = riffChunk('ANMF', new Array(16).fill(0));
    const tiff = [...exifApp1().subarray(10)];

    it('the cap is exact: chunk number MAX_RIFF_CHUNKS is still walked, one chunk more fails closed', () => {
      expect(MAX_RIFF_CHUNKS).toBe(1024);
      // VP8X is chunk 1. An ANMF as chunk MAX_RIFF_CHUNKS is found (animated); pushed one chunk later, the dims walk
      // stops at the cap instead (malformed), so it never reaches it.
      expect(sniffImage(riff([vp8x(64, 32), ...pad(MAX_RIFF_CHUNKS - 2), anmf]))).toMatchObject({ ok: false, why: 'animated' });
      expect(sniffImage(riff([vp8x(64, 32), ...pad(MAX_RIFF_CHUNKS - 1), anmf])))
        .toMatchObject({ ok: false, reason: 'unsupported', container: 'webp', why: 'malformed' });
      // A still WebP of exactly MAX_RIFF_CHUNKS chunks is accepted; MAX_RIFF_CHUNKS + 1 is not.
      expect(sniffImage(riff([vp8x(64, 32), ...pad(MAX_RIFF_CHUNKS - 1)]))).toEqual({ ok: true, format: 'webp', width: 64, height: 32 });
      expect(sniffImage(riff([vp8x(64, 32), ...pad(MAX_RIFF_CHUNKS)]))).toMatchObject({ ok: false, why: 'malformed' });
      // The EXIF walk uses the same cap: an EXIF chunk as chunk MAX_RIFF_CHUNKS is read, one chunk later it is not.
      expect([...webpExifPayload(riff([vp8x(64, 32, 0x08), ...pad(MAX_RIFF_CHUNKS - 2), riffChunk('EXIF', tiff)]))!]).toEqual(tiff);
      expect(webpExifPayload(riff([vp8x(64, 32, 0x08), ...pad(MAX_RIFF_CHUNKS - 1), riffChunk('EXIF', tiff)]))).toBeNull();
    });

    it('fix round 3: a VP8- or VP8L-first WebP (no VP8X) is walked with the same cap', () => {
      for (const first of [vp8(64, 32), vp8l(64, 32)]) {
        // Exactly MAX_RIFF_CHUNKS chunks is accepted; one more is malformed (before round 3 only VP8X files were walked,
        // so these were accepted whatever their chunk count and webpExifPayload then stopped at the cap).
        expect(sniffImage(riff([first, ...pad(MAX_RIFF_CHUNKS - 1)]))).toEqual({ ok: true, format: 'webp', width: 64, height: 32 });
        expect(sniffImage(riff([first, ...pad(MAX_RIFF_CHUNKS)])))
          .toMatchObject({ ok: false, reason: 'unsupported', container: 'webp', why: 'malformed' });
        // An EXIF chunk as chunk MAX_RIFF_CHUNKS: the file is accepted AND its EXIF is read. One chunk later: rejected.
        const atCap = riff([first, ...pad(MAX_RIFF_CHUNKS - 2), riffChunk('EXIF', tiff)]);
        expect(sniffImage(atCap)).toMatchObject({ ok: true, format: 'webp' });
        expect([...webpExifPayload(atCap)!]).toEqual(tiff);
        expect(sniffImage(riff([first, ...pad(MAX_RIFF_CHUNKS - 1), riffChunk('EXIF', tiff)]))).toMatchObject({ ok: false, why: 'malformed' });
        // The same walk flags an ANMF chunk as animated even with no VP8X at all (fail closed).
        expect(sniffImage(riff([first, anmf]))).toMatchObject({ ok: false, reason: 'unsupported', why: 'animated' });
      }
    });

    it('a 30 MB VP8X + 3.75 M empty JUNK chunks fails closed, and its last-chunk EXIF is never reached', () => {
      const huge = new Uint8Array(MAX_IMPORT_BYTES);
      const head = bytes(enc('RIFF'), le32(MAX_IMPORT_BYTES - 8), enc('WEBP'), vp8x(64, 32, 0x08));
      huge.set(head);
      huge.set(junk, head.length);
      for (let n = 8; head.length + n < huge.length; n *= 2) huge.copyWithin(head.length + n, head.length, head.length + n);
      const lastChunk = head.length + 8 * (Math.floor((huge.length - head.length) / 8) - 1);
      huge.set([...enc('EXIF'), 0, 0, 0, 0], lastChunk); // an empty EXIF chunk: an uncapped walk would return it
      expect(sniffImage(huge)).toMatchObject({ ok: false, reason: 'unsupported', container: 'webp', why: 'malformed' });
      expect(webpExifPayload(huge)).toBeNull();
    });
  });

  it('every prefix of every valid fixture: no throw; a prefix is accepted only with its full header', () => {
    // [bytes, the dimensions a complete-enough prefix must report, or null when no prefix may ever be accepted]
    const fixtures: Array<[Uint8Array, [number, number] | null]> = [
      [minimalJpeg(640, 480, [exifApp1()]), [640, 480]], [png(64, 32), [64, 32]], [png(64, 32, { apng: true }), null],
      [riff([vp8(64, 32)]), [64, 32]], [riff([vp8l(64, 32)]), [64, 32]],
      [riff([vp8x(64, 32, 0x02), riffChunk('ANIM', [0, 0, 0, 0, 0, 0])]), null],
      [heif('heic', ['mif1', 'heic'], [[64, 32]]), [64, 32]], [mp4(), null],
    ];
    for (const [f, dims] of fixtures) {
      let accepted = 0;
      for (let n = 0; n <= f.length; n++) {
        const r = sniffImage(f.subarray(0, n), Math.max(n, 1));
        if (r.ok) {
          accepted += 1;
          expect(dims).not.toBeNull();
          expect([r.width, r.height]).toEqual(dims);
        } else {
          expect(r.reason).toBe('unsupported');
        }
      }
      if (dims) expect(accepted).toBeGreaterThan(0); // the whole file at least
    }
  });

  it('seeded random garbage, with and without a valid signature, never throws', () => {
    let seed = 0x5eed;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed >>> 16; };
    const prefixes = [[], [0xff, 0xd8, 0xff], PNG_SIG, [...enc('RIFF'), 0xff, 0xff, 0xff, 0x7f, ...enc('WEBP')], [0, 0, 0, 0x10, ...enc('ftypheic')]];
    for (let k = 0; k < 2000; k++) {
      const p = prefixes[k % prefixes.length];
      const b = new Uint8Array(p.length + (rnd() % 96));
      b.set(p);
      for (let i = p.length; i < b.length; i++) b[i] = rnd() & 0xff;
      const r = sniffImage(b, b.length || 1);
      expect(typeof r.ok).toBe('boolean');
      if (r.ok) expect(r.width * r.height).toBeLessThanOrEqual(MAX_IMPORT_PIXELS);
    }
  });
});

describe('webpExifPayload: the TIFF inside a WebP EXIF chunk', () => {
  const tiff = [...exifApp1().subarray(10)];
  it('finds the chunk after VP8X/VP8L, strips an "Exif\\0\\0" prefix, and returns null otherwise', () => {
    const plain = riff([vp8x(64, 32, 0x08), vp8l(64, 32), riffChunk('EXIF', tiff)]);
    expect([...webpExifPayload(plain)!]).toEqual(tiff);
    const prefixed = riff([vp8x(64, 32, 0x08), vp8l(64, 32), riffChunk('EXIF', [...enc('Exif\0\0'), ...tiff])]);
    expect([...webpExifPayload(prefixed)!]).toEqual(tiff);
    expect(webpExifPayload(riff([vp8l(64, 32)]))).toBeNull();
    expect(webpExifPayload(minimalJpeg(10, 10, [exifApp1()]))).toBeNull(); // not a WebP: exifr reads the JPEG itself
    expect(webpExifPayload(bytes(enc('RIFF'), le32(0xffffff), enc('WEBP'), [1, 2, 3]))).toBeNull(); // truncated: no throw
  });
});

// ---------------------------------------------------------------- exifTiff (T-053 round 6)
// The round-5 verifier showed exifr's own parsers walk structure the sniff does not bound (PNG chunks past IEND, a
// byte scan through some JPEG segment bodies past the SOS, every HEIF box after meta), so importPhoto now hands exifr
// ONLY the EXIF TIFF found on the sniff's capped walks.
const be16 = (v: number) => [(v >> 8) & 0xff, v & 0xff];
const be32n = (v: number) => be32(v);
interface HeifExifOpts {
  ilocVersion?: 0 | 1 | 2; infeVersion?: 2 | 3; iinfVersion?: 0 | 1; method?: number; extents?: 1 | 2; exifType?: string;
  fillers?: number; baseSize?: 0 | 4; base?: number; idxSize?: 0 | 4; tiffOffset?: 0 | 6;
}
/**
 * A HEIF whose Exif item (u32 tiff offset, optional "Exif\0\0", TIFF) sits in mdat, found via iinf and iloc. `fillers`
 * hvc1 items come first (real iPhone HEICs list 50–300 items before Exif); iloc/infe/iinf versions, base_offset,
 * index_size and the tiff offset vary so every branch of the iloc reader is exercised (round-6 verifier).
 */
function heifWithExif(tiff: readonly number[], o: HeifExifOpts = {}): Uint8Array {
  const lv = o.ilocVersion ?? 0;
  const iv = o.infeVersion ?? (lv === 2 ? 3 : 2);
  const wide = lv === 2 || iv === 3; // u32 item ids
  const exifId = wide ? 70_000 : (o.fillers ?? 0) + 1;
  const tiffOff = o.tiffOffset ?? 6;
  const payload = [...be32n(tiffOff), ...(tiffOff === 6 ? enc('Exif\0\0') : []), ...tiff];
  const baseSize = o.baseSize ?? 0;
  const idxSize = lv >= 1 ? (o.idxSize ?? 0) : 0;
  const id = (n: number) => (lv < 2 ? be16(n) : be32n(n));
  const infeId = (n: number) => (iv === 2 ? be16(n) : be32n(n));
  const build = (mdatBody: number) => {
    const ids = [...Array.from({ length: o.fillers ?? 0 }, (_, k) => k + 1), exifId];
    const infes = ids.map((n) => box('infe', [iv, 0, 0, 0, ...infeId(n), ...be16(0), ...enc(n === exifId ? (o.exifType ?? 'Exif') : 'hvc1'), 0]));
    const iinf = box('iinf', [o.iinfVersion ?? 0, 0, 0, 0, ...((o.iinfVersion ?? 0) === 0 ? be16(ids.length) : be32n(ids.length)), ...infes.flat()]);
    const base = baseSize ? (o.base ?? 16) : 0;
    const ext = (eo: number, el: number) => [...(idxSize ? be32n(0) : []), ...be32n(eo), ...be32n(el)];
    const items = ids.map((n) => {
      const isExif = n === exifId;
      const off = isExif ? mdatBody - base : 0;
      const exts = !isExif ? ext(0, 4) : (o.extents ?? 1) === 1 ? ext(off, payload.length) : [...ext(off, payload.length), ...ext(off, 4)];
      return [...id(n), ...(lv >= 1 ? be16(isExif ? (o.method ?? 0) : 0) : []), ...be16(0), ...(baseSize ? be32n(isExif ? base : 0) : []),
        ...be16(isExif ? (o.extents ?? 1) : 1), ...exts];
    });
    const iloc = box('iloc', [lv, 0, 0, 0, 0x44, (baseSize << 4) | idxSize, ...(lv < 2 ? be16(ids.length) : be32n(ids.length)), ...items.flat()]);
    const ipco = box('ipco', fullBox('ispe', [...be32(640), ...be32(480)]));
    const meta = fullBox('meta', [...fullBox('hdlr', [0, 0, 0, 0, ...enc('pict'), ...new Array(12).fill(0), 0]), ...iinf, ...iloc, ...box('iprp', ipco)]);
    return [...ftyp('heic', ['mif1', 'heic']), ...meta];
  };
  const head = build(0);
  return bytes(build(head.length + 8), box('mdat', payload)); // mdat body starts right after its 8-byte header
}

/**
 * A little-endian ("II*\0") TIFF: IFD0 {Orientation 6, GPS pointer}, GPS IFD {N 10°30', E 20°15'} (Android/Samsung byte
 * order). `gpsAt` moves the GPS IFD and its values further in, as ImageIO does after a large UserComment.
 */
function tiffLE(gpsAt = 38): number[] {
  const dv = new DataView(new ArrayBuffer(gpsAt + 102));
  let o = 0;
  const u16 = (v: number) => { dv.setUint16(o, v, true); o += 2; };
  const u32 = (v: number) => { dv.setUint32(o, v, true); o += 4; };
  dv.setUint8(0, 0x49); dv.setUint8(1, 0x49); o = 2; u16(42); u32(8);
  u16(2);
  u16(0x0112); u16(3); u32(1); u16(6); u16(0);
  u16(0x8825); u16(4); u32(1); u32(gpsAt);
  u32(0);
  o = gpsAt;
  u16(4);
  u16(1); u16(2); u32(2); dv.setUint8(o, 0x4e); o += 4;
  u16(2); u16(5); u32(3); u32(gpsAt + 54);
  u16(3); u16(2); u32(2); dv.setUint8(o, 0x45); o += 4;
  u16(4); u16(5); u32(3); u32(gpsAt + 78);
  u32(0);
  for (const [n, d] of [[10, 1], [30, 1], [0, 1], [20, 1], [15, 1], [0, 1]]) { u32(n); u32(d); }
  return [...new Uint8Array(dv.buffer)];
}
const TIFF_BE_FIXTURE = exifApp1().subarray(10);
const app1Of = (tiff: readonly number[]) => new Uint8Array([0xff, 0xe1, ...be16(2 + 6 + tiff.length), ...enc('Exif\0\0'), ...tiff]);

describe('exifTiff: the EXIF TIFF from the capped walks; exifr never sees the file', () => {
  const app1 = exifApp1();
  const TIFF = [...app1.subarray(10)]; // FF E1, length (2), "Exif\0\0" (6), then the TIFF
  const tiffOf = (b: Uint8Array) => { const t = exifTiff(b); return t === null ? null : [...t]; };

  it('JPEG: the first APP1 "Exif" before the scan', () => {
    expect(tiffOf(minimalJpeg(640, 480, [app1]))).toEqual(TIFF);
    expect(tiffOf(minimalJpeg(640, 480))).toBeNull();
  });

  it('JPEG: an Exif APP1 hidden inside another segment body, or placed after the scan, is never read', () => {
    const hidden = new Uint8Array([0xff, 0xf0, ...be16(2 + app1.length), ...app1]); // inside a JPG0 segment's body
    expect(sniffImage(minimalJpeg(640, 480, [hidden]))).toMatchObject({ ok: true });
    expect(exifTiff(minimalJpeg(640, 480, [hidden]))).toBeNull();
    const j = minimalJpeg(640, 480);
    expect(exifTiff(bytes([...j.subarray(0, j.length - 2)], [...app1], [0xff, 0xd9]))).toBeNull(); // after the SOS
  });

  it('PNG: the eXIf chunk before IEND (with or without "Exif\0\0"); trailing bytes do not matter; after IEND it is never read', () => {
    const head = [...PNG_SIG, ...pngChunk('IHDR', [...be32(64), ...be32(32), 8, 2, 0, 0, 0])];
    const tail = [...pngChunk('IDAT', [0x78, 0x9c]), ...pngChunk('IEND', [])];
    expect(tiffOf(bytes(head, pngChunk('eXIf', TIFF), tail))).toEqual(TIFF);
    expect(tiffOf(bytes(head, pngChunk('eXIf', [...enc('Exif\0\0'), ...TIFF]), tail))).toEqual(TIFF);
    expect(tiffOf(bytes(head, pngChunk('eXIf', TIFF), tail, [0]))).toEqual(TIFF); // 1 trailing byte (exifr threw here)
    expect(exifTiff(bytes(head, tail, pngChunk('eXIf', TIFF)))).toBeNull();
  });

  it('WebP: the EXIF chunk (webpExifPayload)', () => {
    expect(tiffOf(riff([vp8x(64, 32, 0x08), vp8(64, 32), riffChunk('EXIF', TIFF)]))).toEqual(TIFF);
  });

  it('HEIF: the Exif item through iinf and iloc (versions 0 and 1)', () => {
    for (const ilocVersion of [0, 1] as const) {
      const h = heifWithExif(TIFF, { ilocVersion });
      expect(sniffImage(h)).toEqual({ ok: true, format: 'heic', width: 640, height: 480 });
      expect(tiffOf(h)).toEqual(TIFF);
    }
  });

  it('HEIF: every iloc/iinf/infe layout real files use (fillers before Exif, base_offset, index_size, u32 ids, tiff offset 0)', async () => {
    const layouts: HeifExifOpts[] = [
      { fillers: 120 },                                          // an iPhone-like item list before the Exif item
      { ilocVersion: 1, baseSize: 4, base: 24, fillers: 3 },     // a non-zero base_offset
      { ilocVersion: 1, idxSize: 4 },                            // extent_index fields
      { ilocVersion: 2, infeVersion: 3, iinfVersion: 1, fillers: 5 }, // u32 item ids everywhere
      { tiffOffset: 0 },                                         // TIFF right after the offset field, no "Exif\0\0"
    ];
    for (const o of layouts) {
      const h = heifWithExif(TIFF, o);
      expect(sniffImage(h), JSON.stringify(o)).toEqual({ ok: true, format: 'heic', width: 640, height: 480 });
      expect(tiffOf(h), JSON.stringify(o)).toEqual(TIFF);
      expect((await readExifFacts(h)).gps, JSON.stringify(o)).toBeDefined();
    }
  });

  it('HEIF: an accepted file never loses its Exif to a cap: too many infe or iloc items fails the SNIFF closed', () => {
    const many = heifWithExif(TIFF, { fillers: MAX_BOXES_PER_LEVEL + 10 });
    expect(sniffImage(many)).toMatchObject({ ok: false, reason: 'unsupported', why: 'malformed' });
    // Round-7 verifier: each walk on its own. Too many infe entries with a small iloc, and a small iinf with too many
    // iloc items: each must fail the sniff, not only both together.
    const h = heifWithExif(TIFF);
    const find4cc = (b: Uint8Array, t: string) => b.findIndex((x, i) => String.fromCharCode(x, b[i + 1], b[i + 2], b[i + 3]) === t);
    const iinfAt = find4cc(h, 'iinf') - 4;
    const extraInfes = new Array(MAX_BOXES_PER_LEVEL + 5).fill(box('infe', [2, 0, 0, 0, ...be16(9), ...be16(0), ...enc('hvc1'), 0])).flat();
    const iinfOnly = (() => { // grow iinf (and its parents' sizes) by the extra infe boxes
      const size = (h[iinfAt] << 24 | h[iinfAt + 1] << 16 | h[iinfAt + 2] << 8 | h[iinfAt + 3]) >>> 0;
      const out = bytes([...h.subarray(0, iinfAt + size)], extraInfes, [...h.subarray(iinfAt + size)]);
      const grow = (at: number) => out.set(be32(((out[at] << 24 | out[at + 1] << 16 | out[at + 2] << 8 | out[at + 3]) >>> 0) + extraInfes.length), at);
      grow(iinfAt);
      grow(find4cc(out, 'meta') - 4);
      return out;
    })();
    expect(sniffImage(iinfOnly)).toMatchObject({ ok: false, why: 'malformed' });
    const ilocAt = find4cc(h, 'iloc') - 4;
    const ilocOnly = h.slice();
    ilocOnly.set(be16(MAX_BOXES_PER_LEVEL + 1), ilocAt + 8 + 4 + 2); // iloc item_count over the cap, iinf untouched
    expect(sniffImage(ilocOnly)).toMatchObject({ ok: false, why: 'malformed' });
  });

  it('a GPS IFD past 100 KB (ImageIO after a large UserComment) is still read: the TIFF cut is 1 MiB, not 64 KiB', async () => {
    const far = tiffLE(100_100);
    const head = [...PNG_SIG, ...pngChunk('IHDR', [...be32(64), ...be32(32), 8, 2, 0, 0, 0])];
    const png = bytes(head, pngChunk('eXIf', far), pngChunk('IDAT', [0x78, 0x9c]), pngChunk('IEND', []));
    const facts = await readExifFacts(png);
    expect(facts.gps?.latitude).toBeCloseTo(10.5, 6);
    expect(facts.orientation).toBe(6);
  });

  it('JPEG: an XMP APP1 before the Exif APP1 does not hide it; a little-endian TIFF is read too', async () => {
    const xmp = new Uint8Array([0xff, 0xe1, ...be16(2 + 29 + 5), ...enc('http://ns.adobe.com/xap/1.0/\0'), ...enc('<x/>\0')]);
    expect(tiffOf(minimalJpeg(640, 480, [xmp, app1]))).toEqual(TIFF);
    const le = tiffLE();
    const j = minimalJpeg(640, 480, [app1Of(le)]);
    expect(tiffOf(j)).toEqual(le);
    const facts = await readExifFacts(j);
    expect(facts.orientation).toBe(6);
    expect(facts.gps?.latitude).toBeCloseTo(10.5, 6);
    expect(facts.gps?.longitude).toBeCloseTo(20.25, 6);
  });

  it('HEIF: no Exif item, a constructed item, two extents or a malformed iloc is "nothing read" (never throws)', () => {
    expect(exifTiff(heifWithExif(TIFF, { exifType: 'mime' }))).toBeNull();
    expect(exifTiff(heifWithExif(TIFF, { ilocVersion: 1, method: 1 }))).toBeNull();
    expect(exifTiff(heifWithExif(TIFF, { extents: 2 }))).toBeNull();
    const h = heifWithExif(TIFF);
    const ilocAt = h.findIndex((x, i) => x === 0x69 && h[i + 1] === 0x6c && h[i + 2] === 0x6f && h[i + 3] === 0x63); // 'iloc'
    const bad1 = h.slice(); bad1.set(be16(MAX_BOXES_PER_LEVEL + 1), ilocAt + 4 + 4 + 2); // item_count over the cap
    expect(exifTiff(bad1)).toBeNull();
    const bad2 = h.slice(); bad2.set(be32(0x7fffff00), ilocAt + 4 + 4 + 2 + 2 + 2 + 2 + 2); // extent offset past the file
    expect(exifTiff(bad2)).toBeNull();
    expect(exifTiff(heif('heic', ['heic'], [[64, 32]]))).toBeNull(); // no iinf/iloc at all
  });

  it('a payload that is not a TIFF is "nothing read"', () => {
    const notTiff = new Uint8Array([0xff, 0xe1, ...be16(2 + 6 + 8), ...enc('Exif\0\0'), 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(exifTiff(minimalJpeg(640, 480, [notTiff]))).toBeNull();
  });

  it('readExifFacts hands exifr ONLY the TIFF, for every format (exifr calls recorded)', async () => {
    const head = [...PNG_SIG, ...pngChunk('IHDR', [...be32(64), ...be32(32), 8, 2, 0, 0, 0])];
    const files = [
      minimalJpeg(640, 480, [app1]),
      bytes(head, pngChunk('eXIf', TIFF), pngChunk('IDAT', [0x78, 0x9c]), pngChunk('IEND', []), [0]),
      riff([vp8x(64, 32, 0x08), vp8(64, 32), riffChunk('EXIF', TIFF)]),
      heifWithExif(TIFF),
    ];
    for (const f of files) {
      exifrCalls.gps.length = 0;
      exifrCalls.orientation.length = 0;
      const facts = await readExifFacts(f);
      expect(facts.gps).toBeDefined(); // the GPS warning still works (the PNG has a trailing byte)
      expect(facts.orientation).toBe(6);
      for (const calls of [exifrCalls.gps, exifrCalls.orientation]) {
        expect(calls).toHaveLength(1);
        expect([...(calls[0] as Uint8Array)]).toEqual(TIFF); // the TIFF, never the file
      }
    }
    exifrCalls.gps.length = 0;
    expect(await readExifFacts(minimalJpeg(640, 480))).toEqual({ gps: undefined, orientation: null });
    expect(exifrCalls.gps).toHaveLength(0); // no TIFF: exifr is not called at all
  });
});

describe('HEIF: every child of meta is walked (capped), as the Exif lookup does', () => {
  it('more than MAX_BOXES_PER_LEVEL boxes inside meta after iprp fail closed', () => {
    const ipco = box('ipco', fullBox('ispe', [...be32(640), ...be32(480)]));
    const frees = new Array(MAX_BOXES_PER_LEVEL).fill(box('free', [])).flat();
    const meta = fullBox('meta', [...fullBox('hdlr', [0, 0, 0, 0, ...enc('pict'), ...new Array(12).fill(0), 0]), ...box('iprp', ipco), ...frees]);
    expect(sniffImage(bytes(ftyp('heic', ['mif1', 'heic']), meta))).toMatchObject({ ok: false, why: 'malformed' });
  });
});

describe('round-6 verifier: costs that survived exifTiff', () => {
  it('ftyp: only the first MAX_FTYP_BRANDS compatible brands are read (a 30 MB ftyp built ~7.5 M strings)', () => {
    // major 'mif1' makes detectContainer look for an AVIF brand; one placed after the cap is not seen.
    const brandsBefore = new Array(MAX_FTYP_BRANDS).fill(enc('xxxx')).flat();
    const f = bytes(ftyp('mif1', []).slice(0, 16), brandsBefore, enc('avif'));
    f.set(be32(f.length), 0);
    expect(detectContainer(f)).toBe('heic');            // 'avif' at brand MAX_FTYP_BRANDS + 1 is never read
    const g = bytes(ftyp('mif1', []).slice(0, 16), brandsBefore.slice(4), enc('avif'));
    g.set(be32(g.length), 0);
    expect(detectContainer(g)).toBe('other');           // at brand MAX_FTYP_BRANDS it still is
    const huge = new Uint8Array(MAX_IMPORT_BYTES);
    huge.set(ftyp('mif1', []).slice(0, 16));
    huge.set(be32(MAX_IMPORT_BYTES), 0);
    expect(detectContainer(huge)).toBe('heic');         // returns at once instead of walking 7.5 M brands
  });

  it('exifr gets at most MAX_EXIF_TIFF_BYTES of a TIFF, even from a 30 MB eXIf chunk (exifr trusts value counts)', async () => {
    const head = [...PNG_SIG, ...pngChunk('IHDR', [...be32(64), ...be32(32), 8, 2, 0, 0, 0])];
    const big = new Uint8Array(29_000_000);
    big.set(TIFF_BE_FIXTURE);
    const png = bytes(head, pngChunk('eXIf', [...big]), pngChunk('IDAT', [0x78, 0x9c]), pngChunk('IEND', []));
    expect(sniffImage(png)).toMatchObject({ ok: true, format: 'png' });
    exifrCalls.gps.length = 0;
    const facts = await readExifFacts(png);
    expect(facts.gps).toBeDefined();                    // the real GPS IFD is inside the first 64 KiB
    expect((exifrCalls.gps[0] as Uint8Array).byteLength).toBe(MAX_EXIF_TIFF_BYTES);
  });
});
