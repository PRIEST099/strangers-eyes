// web/src/tier0/sniff.ts: decide what an imported file really is, from its bytes, before anything decodes it
// (SPEC SCR-05, AC-103; T-053). Pure and Node-testable.
//
// - The container comes from MAGIC BYTES, never from file.type or the file name (both are caller-controlled).
// - Pixel dimensions come from the header WITHOUT decoding (JPEG SOFn, PNG IHDR, WebP VP8/VP8L/VP8X, HEIF ispe), so
//   the 40 MP limit holds before createImageBitmap ever allocates: a decompression bomb is never decoded (8 GB RAM).
// - Animated or video files are rejected: GIF, APNG (acTL before IDAT), animated WebP (VP8X flag or ANIM/ANMF chunk),
//   HEIF image sequences, and ISO-BMFF / Matroska / AVI / Ogg video containers.
// - Malformed or truncated headers fail closed (`unsupported`). Every parser is bounds-checked, never throws to the
//   caller, and every loop advances by at least one byte per iteration, so no input can make it loop.
// - Every container walk is capped, so a 30 MB file of tiny pieces costs thousands of steps, not millions (8 GB RAM):
//   JPEG: MAX_JPEG_SEGMENTS segments up to the first scan (fill bytes between them are skipped in one linear pass);
//   PNG: MAX_SMALL_PNG_CHUNKS small non-IDAT chunks and MAX_PNG_CHUNKS chunks in all, up to IEND;
//   WebP: MAX_RIFF_CHUNKS chunks; ISO-BMFF: MAX_BOXES_PER_LEVEL boxes per level, MAX_FTYP_BRANDS brands, and
//   MAX_BOXES_PER_LEVEL iloc items of at most MAX_BOXES_PER_LEVEL extents.
// - exifr never sees the file: importPhoto hands it only the EXIF TIFF that exifTiff finds on these same capped walks
//   (exifr's own parsers walk past IEND, past the SOS and through every HEIF box; T-053 round-5 verifier).

/**
 * 30 MB, decimal (30,000,000 bytes): the "MB" that macOS Finder and the iOS Files app show, so a file the OS lists as
 * 30.1 MB is rejected exactly as copy.import.tooLarge ("max 30 MB") says.
 */
export const MAX_IMPORT_BYTES = 30_000_000;
/** 40 megapixels (decimal: 40,000,000 px). Exactly 40 MP is accepted. */
export const MAX_IMPORT_PIXELS = 40_000_000;

/** The formats SCR-05 accepts (HEIC is attempted: desktop Chrome may fail to decode it, U-32). */
export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'heic';
/** What the magic bytes say the file is. */
export type Container = ImageFormat | 'gif' | 'video' | 'other';
export type SniffReason = 'tooLarge' | 'unsupported';
export type SniffWhy = 'bytes' | 'pixels' | 'empty' | 'unknown' | 'animated' | 'malformed';

export interface SniffOk { ok: true; format: ImageFormat; width: number; height: number }
export interface SniffFail { ok: false; reason: SniffReason; container: Container; why: SniffWhy }
export type SniffResult = SniffOk | SniffFail;

/** Thrown by the bounds-checked readers; caught in sniffImage and turned into `unsupported/malformed`. */
class Malformed extends Error {}
const bad = (): never => { throw new Malformed(); };

function need(b: Uint8Array, i: number, n: number): void {
  if (!Number.isInteger(i) || i < 0 || i + n > b.length) bad();
}
const u8 = (b: Uint8Array, i: number) => { need(b, i, 1); return b[i]; };
const u16be = (b: Uint8Array, i: number) => { need(b, i, 2); return (b[i] << 8) | b[i + 1]; };
const u32be = (b: Uint8Array, i: number) => { need(b, i, 4); return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0; };
const u16le = (b: Uint8Array, i: number) => { need(b, i, 2); return b[i] | (b[i + 1] << 8); };
const u24le = (b: Uint8Array, i: number) => { need(b, i, 3); return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16); };
const u32le = (b: Uint8Array, i: number) => { need(b, i, 4); return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; };
const ascii = (b: Uint8Array, i: number, n: number) => { need(b, i, n); return String.fromCharCode(...b.subarray(i, i + n)); };
/** True when `b` starts with `sig` at `at` (no throw: used for detection on short inputs). */
const starts = (b: Uint8Array, sig: readonly number[], at = 0) => b.length >= at + sig.length && sig.every((x, k) => b[at + k] === x);
const startsAscii = (b: Uint8Array, s: string, at = 0) => starts(b, [...s].map((c) => c.charCodeAt(0)), at);

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

// HEIF brands (ISO/IEC 23008-12). Still images vs image sequences (a sequence is an animation or a burst).
const HEIF_IMAGE_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'mif1']);
const HEIF_SEQUENCE_BRANDS = new Set(['hevc', 'hevx', 'hevm', 'hevs', 'msf1']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

/** Detect the container from the first bytes only (no parsing beyond the signature and the ftyp box). */
export function detectContainer(b: Uint8Array): Container {
  if (starts(b, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (starts(b, PNG_SIG)) return 'png';
  if (startsAscii(b, 'GIF87a') || startsAscii(b, 'GIF89a')) return 'gif';
  if (startsAscii(b, 'RIFF')) {
    if (startsAscii(b, 'WEBP', 8)) return 'webp';
    if (startsAscii(b, 'AVI ', 8)) return 'video';
    return 'other';
  }
  if (startsAscii(b, 'ftyp', 4) && b.length >= 12) {
    const major = String.fromCharCode(...b.subarray(8, 12));
    if (HEIF_IMAGE_BRANDS.has(major) || HEIF_SEQUENCE_BRANDS.has(major)) {
      // mif1/msf1 are generic MIAF brands that AVIF also uses: an AVIF-only brand list is AVIF, not HEIC.
      if (major === 'mif1' || major === 'msf1') {
        const brands = ftypBrands(b);
        if (brands.some((x) => AVIF_BRANDS.has(x)) && !brands.some((x) => x.startsWith('he'))) return 'other';
      }
      return 'heic';
    }
    if (AVIF_BRANDS.has(major)) return 'other';
    return 'video'; // isom, mp41, mp42, qt, 3gp…: an ISO-BMFF file that is not a HEIF still image
  }
  if (starts(b, [0x1a, 0x45, 0xdf, 0xa3])) return 'video'; // EBML: WebM / Matroska
  if (startsAscii(b, 'OggS') || startsAscii(b, 'FLV')) return 'video';
  return 'other';
}

/** Most compatible brands read from an ftyp box (real files list fewer than 10). */
export const MAX_FTYP_BRANDS = 64;

/**
 * Compatible brands of the leading ftyp box, bounded by the box size, the input and MAX_FTYP_BRANDS (round-6 verifier:
 * a 30 MB ftyp built ~7.5 M strings, ~2 s, before any other cap applied).
 */
function ftypBrands(b: Uint8Array): string[] {
  const size = b.length >= 4 ? ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0 : 0;
  const end = Math.min(b.length, size, 16 + 4 * MAX_FTYP_BRANDS);
  const out: string[] = [];
  for (let i = 16; i + 4 <= end; i += 4) out.push(String.fromCharCode(...b.subarray(i, i + 4)));
  return out;
}

// ---------------------------------------------------------------- per-format header parsers
interface Dims { width: number; height: number; animated: boolean }

/**
 * Most marker segments walked in one JPEG, up to its first scan. A real file has a few dozen at most (up to 255 APP2
 * ICC segments in the extreme); more fails closed.
 */
export const MAX_JPEG_SEGMENTS = 1024;

/**
 * Walk a JPEG's marker segments from SOI up to the first SOS (MAX_JPEG_SEGMENTS at most), skipping every segment by
 * its length, as a decoder does. `visit(marker, body, end)` sees each segment's payload [body, end); it returns true to
 * stop early. Returns true when the walk reached the SOS. Malformed (throws) on garbage between segments, a bad length,
 * stuffing/SOI/EOI before the scan, or too many segments.
 */
function eachJpegSegment(b: Uint8Array, visit: (marker: number, body: number, end: number) => boolean): boolean {
  let i = 2; // after SOI
  for (let n = 0; ; n++) {
    if (n >= MAX_JPEG_SEGMENTS) bad();
    if (u8(b, i) !== 0xff) bad(); // garbage between segments
    while (u8(b, i) === 0xff) i += 1; // marker prefix and fill bytes
    const m = b[i];
    i += 1;
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue; // TEM, RSTn: no length
    if (m === 0xda) return true; // SOS: the first scan
    if (m === 0x00 || m === 0xd8 || m === 0xd9) bad(); // stuffing, SOI or EOI before the first scan
    const len = u16be(b, i);
    if (len < 2) bad();
    need(b, i, len);
    if (visit(m, i + 2, i + len)) return false;
    i += len;
  }
}

/** JPEG: the size from the first SOFn (baseline, progressive, lossless, arithmetic) before the first SOS. */
function jpegDims(b: Uint8Array): Dims {
  let dims: Dims | null = null;
  eachJpegSegment(b, (m, body, end) => {
    const isSof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc; // not DHT, JPG, DAC
    if (isSof && !dims) {
      if (end - body < 6) bad();
      const height = u16be(b, body + 1); // after the sample precision (1)
      const width = u16be(b, body + 3);
      if (width === 0 || height === 0) bad(); // height 0 = defined later by DNL: fail closed
      dims = { width, height, animated: false };
    }
    return false;
  });
  return dims ?? bad(); // a scan before any frame header is malformed
}

/**
 * Most non-IDAT PNG chunks under 1 KiB of data walked in one PNG. Real files have a handful (IHDR, PLTE, gAMA, pHYs,
 * tEXt…, IEND); IDAT chunks do not count (an encoder may write many small ones), MAX_PNG_CHUNKS bounds those.
 */
export const MAX_SMALL_PNG_CHUNKS = 1024;

/** Most PNG chunks of any kind (a 30 MB file of 8 KiB IDATs has ~3,700). */
export const MAX_PNG_CHUNKS = 65_536;

/**
 * Walk a PNG's chunks from the signature up to IEND. Small non-IDAT chunks are capped at MAX_SMALL_PNG_CHUNKS and all
 * chunks at MAX_PNG_CHUNKS. `visit(type, data, end)` sees each chunk's data [data, end); it returns true to stop.
 * Malformed (throws) on a bad length, a chunk running past the file, a missing IEND, or too many chunks.
 */
function eachPngChunk(b: Uint8Array, visit: (type: string, data: number, end: number) => boolean): void {
  let small = 0;
  for (let i = 8, n = 0; ; n++) {
    if (n >= MAX_PNG_CHUNKS) bad();
    const len = u32be(b, i);
    if (len > 0x7fffffff) bad();
    const type = ascii(b, i + 4, 4);
    if (len < 1024 && type !== 'IDAT' && ++small > MAX_SMALL_PNG_CHUNKS) bad(); // millions of tiny chunks
    need(b, i + 8, len + 4); // data + CRC inside the file
    if (visit(type, i + 8, i + 8 + len) || type === 'IEND') return;
    i += 12 + len; // length + type + data + CRC: at least 12 bytes per iteration
  }
}

/**
 * PNG: IHDR must be the first chunk; every chunk up to IEND is walked (a PNG without IEND is malformed), acTL before
 * the first IDAT means APNG, and there must be image data.
 */
function pngDims(b: Uint8Array): Dims {
  if (u32be(b, 8) !== 13 || ascii(b, 12, 4) !== 'IHDR') bad();
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  if (width === 0 || height === 0 || width > 0x7fffffff || height > 0x7fffffff) bad();
  let animated = false;
  let sawIdat = false;
  let sawIend = false;
  eachPngChunk(b, (type) => {
    if (type === 'acTL' && !sawIdat) animated = true; // the APNG spec puts acTL before the first IDAT
    if (type === 'IDAT') sawIdat = true;
    if (type === 'IEND') sawIend = true;
    return false;
  });
  if (!sawIend || !sawIdat) bad(); // no image data
  return { width, height, animated };
}

/**
 * Most RIFF chunks walked in one WebP. A real still WebP has a handful (VP8X, ICCP, ALPH, VP8/VP8L, EXIF, XMP); a
 * 30 MB file of 3.75 M empty 8-byte chunks fails closed here instead of being walked twice for ~0.7 s each (once for
 * the dimensions, once more for the EXIF chunk). The one cap for every RIFF walk in this file.
 */
export const MAX_RIFF_CHUNKS = 1024;

interface RiffChunk { id: string; body: number; size: number; riffEnd: number }

/**
 * Walk the chunks of a RIFF file (from offset 12 to the RIFF size, clipped to the input) lazily: `visit` returns true
 * to stop. More than MAX_RIFF_CHUNKS chunks is malformed (throws Malformed: callers fail closed).
 */
function eachRiffChunk(b: Uint8Array, visit: (c: RiffChunk) => boolean): void {
  const riffEnd = Math.min(b.length, 8 + u32le(b, 4));
  let n = 0;
  for (let i = 12; i + 8 <= riffEnd; ) {
    if (++n > MAX_RIFF_CHUNKS) bad();
    const id = ascii(b, i, 4);
    const size = u32le(b, i + 4);
    if (visit({ id, body: i + 8, size, riffEnd })) return;
    i += 8 + size + (size & 1); // chunks are padded to an even size; at least 8 bytes per iteration
  }
}

/**
 * WebP: RIFF chunks. VP8 (lossy), VP8L (lossless) or VP8X (extended: canvas size, animation flag, ANIM/ANMF).
 * Whatever the first chunk is, ONE capped walk then visits every chunk: a WebP of more than MAX_RIFF_CHUNKS chunks is
 * malformed here (VP8- and VP8L-first files included), so webpExifPayload, which runs only on a file sniffImage
 * accepted, always sees every chunk and can never miss a late EXIF (GPS) chunk at the cap. The same walk flags an
 * ANIM/ANMF chunk as animated even when the VP8X flag is clear, or there is no VP8X at all (fail closed).
 */
function webpDims(b: Uint8Array): Dims {
  const first = ascii(b, 12, 4);
  let width: number;
  let height: number;
  let animated = false;
  if (first === 'VP8 ') {
    if (!(u8(b, 23) === 0x9d && u8(b, 24) === 0x01 && u8(b, 25) === 0x2a)) bad(); // key-frame start code
    width = u16le(b, 26) & 0x3fff;
    height = u16le(b, 28) & 0x3fff;
  } else if (first === 'VP8L') {
    if (u8(b, 20) !== 0x2f) bad(); // lossless signature
    const bits = u32le(b, 21);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (first === 'VP8X') {
    animated = (u8(b, 20) & 0x02) !== 0; // flags: Rsv Rsv ICC Alpha EXIF XMP Anim Rsv
    width = u24le(b, 24) + 1;
    height = u24le(b, 27) + 1;
  } else {
    return bad();
  }
  eachRiffChunk(b, (c) => {
    if (c.id === 'ANIM' || c.id === 'ANMF') animated = true;
    return false; // every chunk up to the cap, never an early stop: more than MAX_RIFF_CHUNKS always throws
  });
  if (width === 0 || height === 0) bad();
  return { width, height, animated };
}

interface Box { type: string; start: number; body: number; end: number }

/**
 * Most boxes walked at one level. Real HEIF files have a handful of top-level boxes and tens of ipco properties;
 * a file made of millions of tiny boxes fails closed here instead of costing seconds and hundreds of MB (8 GB RAM).
 */
export const MAX_BOXES_PER_LEVEL = 1024;

/**
 * Walk the ISO-BMFF boxes inside [from, to) lazily (no array): `visit` returns true to stop. size 1 = 64-bit size;
 * size 0 = to the end of the parent. More than MAX_BOXES_PER_LEVEL boxes is malformed.
 */
function eachBox(b: Uint8Array, from: number, to: number, visit: (x: Box) => boolean): void {
  let n = 0;
  for (let i = from; i + 8 <= to; ) {
    if (++n > MAX_BOXES_PER_LEVEL) bad();
    let size = u32be(b, i);
    const type = ascii(b, i + 4, 4);
    let header = 8;
    if (size === 1) {
      if (i + 16 > to || u32be(b, i + 8) !== 0) bad(); // > 4 GB inside a ≤ 30 MB file
      size = u32be(b, i + 12);
      header = 16;
    } else if (size === 0) {
      size = to - i;
    }
    if (size < header || i + size > to) bad();
    if (visit({ type, start: i, body: i + header, end: i + size })) return;
    i += size; // at least 8 bytes per iteration
  }
}

/** The first box of `type` inside [from, to), or malformed when there is none. */
function findBox(b: Uint8Array, from: number, to: number, type: string): Box {
  let found: Box | null = null;
  eachBox(b, from, to, (x) => {
    if (x.type !== type) return false;
    found = x;
    return true;
  });
  return found ?? bad();
}

/** HEIF: the largest `ispe` (image spatial extent) under meta/iprp/ipco is the full image; a `moov` means a sequence. */
function heifDims(b: Uint8Array): Dims {
  let meta: Box | null = null;
  let animated = HEIF_SEQUENCE_BRANDS.has(ascii(b, 8, 4));
  eachBox(b, 0, b.length, (x) => {
    if (x.type === 'meta' && meta === null) meta = x;
    if (x.type === 'moov') animated = true;
    return false; // every top-level box: a moov may follow the meta
  });
  const m: Box = meta ?? bad();
  // Every child of meta, every infe of iinf and every iloc entry is walked here with the same caps as the Exif lookup
  // (heifExifTiff), so an ACCEPTED file can never make that lookup stop at a cap and silently skip its GPS warning
  // (round-6 verifier; the WebP walks got the same rule in fix rounds 2–3).
  const kids = metaChildren(b, m);
  if (kids.iinf) eachInfe(b, kids.iinf, () => false);
  if (kids.iloc) eachIlocItem(b, kids.iloc, () => false);
  const iprp: Box = kids.iprp ?? bad();
  const ipco = findBox(b, iprp.body, iprp.end, 'ipco');
  let width = 0;
  let height = 0;
  eachBox(b, ipco.body, ipco.end, (p) => {
    if (p.type !== 'ispe') return false;
    if (p.end - p.body < 12) bad(); // FullBox (4) + width (4) + height (4), read inside the box, never past it
    const w = u32be(b, p.body + 4);
    const h = u32be(b, p.body + 8);
    if (w * h > width * height) { width = w; height = h; }
    return false;
  });
  if (width === 0 || height === 0) bad(); // ispe is mandatory for every HEIF image item
  return { width, height, animated };
}

/**
 * The payload of a WebP's first `EXIF` chunk: a TIFF header (some writers put "Exif\0\0" first; it is skipped), clipped
 * to the RIFF data. null when the file is not a WebP, has no EXIF chunk within the first MAX_RIFF_CHUNKS chunks, or is
 * malformed. Never throws. exifr 7.1.3 has no WebP parser, so tier0/importPhoto hands it this TIFF to find GPS (P1
 * warning, SCR-05 step 1). importPhoto calls it only after sniffImage accepted the file, and sniffImage walks every
 * chunk of every WebP (whatever its first chunk) with the same cap and rejects one with more: for an accepted WebP this
 * walk therefore sees every chunk, so a GPS EXIF chunk is never silently skipped.
 */
export function webpExifPayload(b: Uint8Array): Uint8Array | null {
  let out: Uint8Array | null = null;
  try {
    if (detectContainer(b) !== 'webp') return null;
    eachRiffChunk(b, (c) => {
      if (c.id !== 'EXIF') return false;
      const p = b.subarray(c.body, Math.min(c.body + c.size, c.riffEnd));
      out = startsAscii(p, 'Exif\0\0') ? p.subarray(6) : p;
      return true;
    });
  } catch {
    return null; // malformed, or more than MAX_RIFF_CHUNKS chunks before any EXIF: nothing read
  }
  return out;
}

// ---------------------------------------------------------------- the EXIF TIFF, found on the same capped walks
// importPhoto hands exifr ONLY this TIFF, never the whole file (T-053 round-5 verifier): exifr's own JPEG, PNG and HEIF
// parsers walk structure this file does not bound (PNG chunks past IEND, a byte-by-byte scan through some JPEG segment
// bodies past the SOS, every box after meta, every iinf/iloc entry), so a crafted 30 MB file cost ~1 s and hundreds of
// MB there. exifr's TIFF parser trusts each tag's value count too, so importPhoto also cuts the TIFF to
// MAX_EXIF_TIFF_BYTES first (round-6 verifier).

/** An unsigned big-endian integer of 0, 4 or 8 bytes (iloc field sizes); 8 only when the high word is 0 (≤ 30 MB). */
function uintN(b: Uint8Array, i: number, n: number): number {
  if (n === 0) return 0;
  if (n === 4) return u32be(b, i);
  if (n === 8 && u32be(b, i) === 0) return u32be(b, i + 4);
  return bad();
}

/** JPEG: the payload of the first APP1 "Exif\0\0" segment before the first scan (a decoder never reads one after it). */
function jpegExifTiff(b: Uint8Array): Uint8Array | null {
  let out: Uint8Array | null = null;
  eachJpegSegment(b, (m, body, end) => {
    if (m !== 0xe1 || !startsAscii(b.subarray(body, end), 'Exif\0\0')) return false;
    out = b.subarray(body + 6, end);
    return true;
  });
  return out;
}

/** PNG: the data of the first eXIf chunk before IEND. */
function pngExifTiff(b: Uint8Array): Uint8Array | null {
  let out: Uint8Array | null = null;
  eachPngChunk(b, (type, data, end) => {
    if (type !== 'eXIf') return false;
    out = b.subarray(data, end);
    return true;
  });
  return out;
}

/** meta's iprp, iinf and iloc (the first of each), walking EVERY child of meta (capped). meta is a FullBox. */
function metaChildren(b: Uint8Array, m: Box): { iprp: Box | null; iinf: Box | null; iloc: Box | null } {
  const out: { iprp: Box | null; iinf: Box | null; iloc: Box | null } = { iprp: null, iinf: null, iloc: null };
  eachBox(b, m.body + 4, m.end, (x) => {
    if (x.type === 'iprp' || x.type === 'iinf' || x.type === 'iloc') out[x.type] ??= x;
    return false;
  });
  return out;
}

/** Every infe of an iinf (FullBox; entry_count u16 in version 0, else u32), capped. visit(itemId, itemType) → stop. */
function eachInfe(b: Uint8Array, inf: Box, visit: (id: number, type: string) => boolean): void {
  eachBox(b, inf.body + 4 + (u8(b, inf.body) === 0 ? 2 : 4), inf.end, (e) => {
    if (e.type !== 'infe') return false;
    const v = u8(b, e.body);
    if (v < 2) return false; // versions 0 and 1 carry no item_type
    const idSize = v === 2 ? 2 : 4;
    const id = idSize === 2 ? u16be(b, e.body + 4) : u32be(b, e.body + 4);
    return visit(id, ascii(b, e.body + 4 + idSize + 2, 4)); // item_type after item_ID and item_protection_index
  });
}

interface IlocItem { id: number; method: number; base: number; extents: number; first: { off: number; len: number } | null }

/**
 * Every item of an iloc (FullBox, versions 0–2: offset/length/base_offset/index field sizes of 0, 4 or 8 bytes; item
 * ids u16, or u32 in version 2), at most MAX_BOXES_PER_LEVEL items of at most MAX_BOXES_PER_LEVEL extents, never
 * reading past the box. visit(item) → stop. A version above 2 is malformed.
 */
function eachIlocItem(b: Uint8Array, loc: Box, visit: (item: IlocItem) => boolean): void {
  const v = u8(b, loc.body);
  if (v > 2) bad();
  let i = loc.body + 4;
  const s1 = u8(b, i);
  const s2 = u8(b, i + 1);
  i += 2;
  const offSize = s1 >> 4;
  const lenSize = s1 & 15;
  const baseSize = s2 >> 4;
  const idxSize = v >= 1 ? s2 & 15 : 0;
  const idSize = v < 2 ? 2 : 4;
  const count = idSize === 2 ? u16be(b, i) : u32be(b, i);
  i += idSize;
  if (count > MAX_BOXES_PER_LEVEL) bad();
  for (let k = 0; k < count; k++) {
    const id = idSize === 2 ? u16be(b, i) : u32be(b, i);
    i += idSize;
    let method = 0;
    if (v >= 1) { method = u16be(b, i) & 15; i += 2; }
    i += 2; // data_reference_index
    const base = uintN(b, i, baseSize);
    i += baseSize;
    const extents = u16be(b, i);
    i += 2;
    if (extents > MAX_BOXES_PER_LEVEL) bad();
    let first: { off: number; len: number } | null = null;
    for (let x = 0; x < extents; x++) {
      if (idxSize > 0) { uintN(b, i, idxSize); i += idxSize; }
      const off = uintN(b, i, offSize);
      i += offSize;
      const len = uintN(b, i, lenSize);
      i += lenSize;
      if (x === 0) first = { off, len };
    }
    if (i > loc.end) bad(); // the item table ran past its box
    if (visit({ id, method, base, extents, first })) return;
  }
}

/**
 * HEIF: the Exif item (ISO/IEC 23008-12 A.2.1: u32 exif_tiff_header_offset, then the Exif data), found through
 * meta/iinf (an infe v2/v3 of item_type 'Exif') and meta/iloc. Only a plain item stored in the file
 * (construction_method 0) with ONE extent is read; anything else is "nothing read". Every walk is capped, with the same
 * caps heifDims checks, so an accepted file never stops here at a cap.
 */
function heifExifTiff(b: Uint8Array): Uint8Array | null {
  let meta: Box | null = null;
  eachBox(b, 0, b.length, (x) => { if (x.type !== 'meta') return false; meta = x; return true; });
  const m = meta as Box | null; // assigned in the callback: TS cannot see it
  if (m === null) return null;
  const { iinf, iloc } = metaChildren(b, m);
  if (iinf === null || iloc === null) return null;
  let exifId = -1;
  eachInfe(b, iinf, (id, type) => { if (type !== 'Exif') return false; exifId = id; return true; });
  if (exifId < 0) return null;
  let found: IlocItem | null = null;
  eachIlocItem(b, iloc, (item) => { if (item.id !== exifId) return false; found = item; return true; });
  const item = found as IlocItem | null;
  if (item === null || item.method !== 0 || item.extents !== 1 || item.first === null) return null;
  const start = item.base + item.first.off;
  const end = item.first.len === 0 ? b.length : start + item.first.len;
  if (start + 4 > end || end > b.length) return null;
  const tiff = start + 4 + u32be(b, start);
  return tiff < end ? b.subarray(tiff, end) : null;
}

/**
 * Most EXIF TIFF bytes handed to exifr (1 MiB). exifr's TIFF parser trusts value counts, so the TIFF must be cut, but
 * not at 64 KiB: Apple ImageIO writes the GPS IFD AFTER the Exif IFD's values, so a HEIC or PNG with a large
 * UserComment or MakerNote has it past 100 KB (round-7 verifier). exifr on a crafted 1 MiB TIFF takes ~5 ms.
 */
export const MAX_EXIF_TIFF_BYTES = 1_048_576;

const TIFF_LE = [0x49, 0x49, 0x2a, 0x00] as const;
const TIFF_BE = [0x4d, 0x4d, 0x00, 0x2a] as const;

/**
 * The EXIF TIFF of an image, found on capped walks (JPEG APP1 "Exif", PNG eXIf, WebP EXIF chunk, HEIF Exif item), or
 * null: none, not a TIFF, or malformed. Never throws. tier0/importPhoto hands exifr only this, never the whole file.
 */
export function exifTiff(b: Uint8Array): Uint8Array | null {
  let t: Uint8Array | null = null;
  try {
    const c = detectContainer(b);
    t = c === 'jpeg' ? jpegExifTiff(b) : c === 'png' ? pngExifTiff(b) : c === 'webp' ? webpExifPayload(b)
      : c === 'heic' ? heifExifTiff(b) : null;
  } catch {
    return null; // malformed: nothing read (the master is re-encoded and stripped either way)
  }
  if (t !== null && startsAscii(t, 'Exif\0\0')) t = t.subarray(6);
  return t !== null && (starts(t, TIFF_LE) || starts(t, TIFF_BE)) ? t : null;
}

// ---------------------------------------------------------------- the sniffer
const fail = (reason: SniffReason, container: Container, why: SniffWhy): SniffFail => ({ ok: false, reason, container, why });

/** True when a file of `size` bytes is over the import limit (or the size is not a number): reject before reading. */
export const exceedsByteLimit = (size: number): boolean => !Number.isFinite(size) || size > MAX_IMPORT_BYTES;

/**
 * Validate an import from its bytes. `size` is the file's byte size (Blob.size), checked first so a file over the
 * limit is never read. `bytes` should hold the whole file (≤ 30 MB): a PNG needs every chunk up to IEND, a JPEG every
 * segment up to its first SOS. A prefix that ends early fails closed as malformed.
 */
export function sniffImage(bytes: Uint8Array, size: number = bytes.length): SniffResult {
  if (exceedsByteLimit(size)) return fail('tooLarge', 'other', 'bytes');
  if (size <= 0 || bytes.length === 0) return fail('unsupported', 'other', 'empty');
  const container = detectContainer(bytes);
  if (container === 'gif') return fail('unsupported', container, 'animated');
  if (container === 'video') return fail('unsupported', container, 'animated');
  if (container === 'other') return fail('unsupported', container, 'unknown');
  let d: Dims;
  try {
    d = container === 'jpeg' ? jpegDims(bytes) : container === 'png' ? pngDims(bytes)
      : container === 'webp' ? webpDims(bytes) : heifDims(bytes);
  } catch {
    return fail('unsupported', container, 'malformed'); // Malformed, or anything unexpected: fail closed
  }
  if (d.animated) return fail('unsupported', container, 'animated');
  if (d.width * d.height > MAX_IMPORT_PIXELS) return fail('tooLarge', container, 'pixels');
  return { ok: true, format: container, width: d.width, height: d.height };
}
