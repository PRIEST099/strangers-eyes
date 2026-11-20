// DEV/test-only byte fixtures (__SE_DEV_ONLY__): an EXIF APP1 segment (Orientation + GPS) and helpers to splice it
// into a JPEG. Shared by Vitest (tier0/*.test.ts) and the DEV selftest (#/dev/selftest). Synthetic values only: the
// default GPS point is a city centre (a public place), never a home. Never imported by production code (R14).

/** DEV-only marker (R20): scripts/check-dist.mjs fails the build if this file reaches web/dist. */
export const FIXTURE_MARKER = '__SE_DEV_ONLY__';

export interface ExifFixtureOptions {
  /** EXIF Orientation (1–8). Default 6: stored rotated, "rotate 90° clockwise to view". null = no Orientation tag. */
  orientation?: number | null;
  /** Decimal degrees. Default 52°31'N 13°24'E. null = no GPS IFD. */
  gps?: { lat: number; lng: number } | null;
}

const DEFAULT_GPS = { lat: 52 + 31 / 60, lng: 13 + 24 / 60 };

/** Decimal degrees → [deg, min, sec × 1000] as EXIF rationals (seconds to 1/1000 s, about 3 cm). */
function dms(v: number): Array<[number, number]> {
  const ms = Math.round(Math.abs(v) * 3_600_000); // integer milliseconds of arc: no 30'60" rounding artefacts
  return [[Math.floor(ms / 3_600_000), 1], [Math.floor((ms % 3_600_000) / 60_000), 1], [ms % 60_000, 1000]];
}

/**
 * An APP1 "Exif" segment (marker included): big-endian TIFF, IFD0 {Orientation, GPS pointer}, GPS IFD
 * {LatitudeRef, Latitude, LongitudeRef, Longitude}. The defaults carry the T-023 selftest fixture's tags and values.
 */
export function exifApp1(opts: ExifFixtureOptions = {}): Uint8Array<ArrayBuffer> {
  const orientation = opts.orientation === undefined ? 6 : opts.orientation;
  const gps = opts.gps === undefined ? DEFAULT_GPS : opts.gps;
  const n0 = (orientation !== null ? 1 : 0) + (gps ? 1 : 0);
  const ifd0Size = 2 + 12 * n0 + 4;
  const gpsOffset = 8 + ifd0Size;
  const gpsIfdSize = gps ? 2 + 12 * 4 + 4 : 0;
  const dataOffset = gpsOffset + gpsIfdSize;
  const total = dataOffset + (gps ? 48 : 0);
  const tiff = new DataView(new ArrayBuffer(total));
  let o = 0;
  const u16 = (v: number) => { tiff.setUint16(o, v); o += 2; };
  const u32 = (v: number) => { tiff.setUint32(o, v); o += 4; };
  const ascii1 = (c: string) => { tiff.setUint8(o, c.charCodeAt(0)); o += 4; }; // count 2 ("N\0"), inline, padded
  u16(0x4d4d); u16(42); u32(8);
  u16(n0);
  if (orientation !== null) { u16(0x0112); u16(3); u32(1); u16(orientation); u16(0); }
  if (gps) { u16(0x8825); u16(4); u32(1); u32(gpsOffset); }
  u32(0);
  if (gps) {
    u16(4);
    u16(0x0001); u16(2); u32(2); ascii1(gps.lat >= 0 ? 'N' : 'S');
    u16(0x0002); u16(5); u32(3); u32(dataOffset);
    u16(0x0003); u16(2); u32(2); ascii1(gps.lng >= 0 ? 'E' : 'W');
    u16(0x0004); u16(5); u32(3); u32(dataOffset + 24);
    u32(0);
    for (const [n, d] of [...dms(gps.lat), ...dms(gps.lng)]) { u32(n); u32(d); }
  }
  const body = new Uint8Array(tiff.buffer);
  const seg = new Uint8Array(10 + body.length);
  const len = 8 + body.length;
  seg.set([0xff, 0xe1, len >> 8, len & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0]);
  seg.set(body, 10);
  return seg;
}

/** Insert `segment` after SOI and, when present, the leading APP0 (JFIF) segment. */
export function spliceSegment(jpeg: Uint8Array, segment: Uint8Array): Uint8Array<ArrayBuffer> {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG');
  const cut = jpeg[2] === 0xff && jpeg[3] === 0xe0 ? 4 + ((jpeg[4] << 8) | jpeg[5]) : 2;
  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, cut));
  out.set(segment, cut);
  out.set(jpeg.subarray(cut), cut + segment.length);
  return out;
}

/**
 * A minimal JPEG-shaped byte stream (not decodable): SOI, APP0 (JFIF), optional extra segments, SOF0 with the given
 * size, SOS, two data bytes, EOI. Enough for marker scanners, the sniffer and exifr.
 */
export function minimalJpeg(width: number, height: number, extra: readonly Uint8Array[] = []): Uint8Array<ArrayBuffer> {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  const tail = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0xff, 0xd9];
  const parts: number[] = [0xff, 0xd8, ...app0];
  for (const e of extra) parts.push(...e);
  parts.push(...sof0, ...tail);
  return new Uint8Array(parts);
}
