// web/src/ai/jpegStrict.ts: the Egress Gate's strict validator for an outgoing JPEG (T-062 review S2, D-130).
// tier0/exif.ts `jpegAppSegmentsFromBytes` stops at the first SOS or at any non-FF byte, so metadata can hide behind a
// junk byte, after the first scan (progressive JPEGs allow APPn between scans), in COM / APP2 / APP15, after EOI or
// behind a corrupt length, and still read "clean". This validator accepts only what a canvas JPEG encoder writes and
// rejects everything else, so any anomaly blocks the send as a metadata problem (EXIF). Pure: bytes in, verdict out.
//
// Accepted, in a single SOI … EOI stream with nothing after it:
//   APP0 "JFIF\0" exactly once, first, 16 bytes, no thumbnail (a thumbnail would carry original pixels);
//   at most one APP2 whose identifier is exactly "ICC_PROFILE\0", ≤ ICC_MAX_BYTES (Chrome's canvas encoder writes one);
//   DQT, DHT, DRI, SOF0 (baseline) or SOF2 (progressive), SOS with its entropy-coded data (FF00 stuffing, RST0–7).
// Rejected: COM, APP1 (EXIF/XMP), APP3–APP15, a second SOI, a second SOF, fill bytes, any byte between segments,
// any other marker, a length that does not fit, data after EOI, no SOF or no SOS.

export type JpegVerdict = { ok: true; segments: string[] } | { ok: false; why: string };

/** The largest APP2 ICC segment accepted (Chrome's sRGB profile is about 3 KB). */
export const ICC_MAX_BYTES = 8 * 1024;

const ascii = (b: Uint8Array, from: number, n: number): string => String.fromCharCode(...b.subarray(from, from + n));
const NAMES: Readonly<Record<number, string>> = { 0xdb: 'DQT', 0xc4: 'DHT', 0xdd: 'DRI', 0xc0: 'SOF0', 0xc2: 'SOF2', 0xda: 'SOS', 0xe0: 'APP0', 0xe2: 'APP2' };

export function validateOutgoingJpeg(b: Uint8Array): JpegVerdict {
  const fail = (why: string): JpegVerdict => ({ ok: false, why });
  const n = b.length;
  if (n < 6 || b[0] !== 0xff || b[1] !== 0xd8) return fail('no SOI at 0');
  if (b[n - 2] !== 0xff || b[n - 1] !== 0xd9) return fail('EOI is not the last two bytes');
  const segments: string[] = [];
  let i = 2;
  let sawApp0 = false;
  let sawApp2 = false;
  let sawSof = false;
  let sawSos = false;
  for (;;) {
    if (i + 2 > n) return fail('truncated');
    if (b[i] !== 0xff) return fail(`stray byte at ${i}`);
    const m = b[i + 1];
    if (m === 0xd9) {
      if (i + 2 !== n) return fail('data after EOI');
      if (!sawSof || !sawSos) return fail('no frame or no scan');
      segments.push('EOI');
      return { ok: true, segments };
    }
    if (m === 0xff) return fail('fill bytes');
    if (m === 0xd8) return fail('second SOI');
    const name = NAMES[m];
    if (name === undefined) return fail(`marker 0x${m.toString(16)} not allowed`);
    if (i + 4 > n) return fail('truncated length');
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > n - 2) return fail(`bad length for ${name}`);
    const body = i + 4;
    const bodyLen = len - 2;
    switch (m) {
      case 0xe0: {
        if (sawApp0 || segments.length !== 0) return fail('APP0 not first or repeated');
        if (len !== 16 || ascii(b, body, 5) !== 'JFIF\0') return fail('APP0 is not a plain JFIF header');
        if (b[body + 12] !== 0 || b[body + 13] !== 0) return fail('JFIF thumbnail');
        sawApp0 = true;
        break;
      }
      case 0xe2: {
        if (sawApp2) return fail('second APP2');
        if (bodyLen < 14 || ascii(b, body, 12) !== 'ICC_PROFILE\0') return fail('APP2 is not an ICC profile');
        if (len > ICC_MAX_BYTES) return fail('ICC profile too large');
        sawApp2 = true;
        break;
      }
      case 0xc0:
      case 0xc2:
        if (sawSof) return fail('second SOF');
        if (sawSos) return fail('SOF after SOS');
        sawSof = true;
        break;
      default:
        break;
    }
    segments.push(name);
    i = body + bodyLen;
    if (m === 0xda) {
      if (!sawSof) return fail('SOS before SOF');
      sawSos = true;
      // Entropy-coded data: FF00 is a stuffed FF, FFD0–FFD7 are restart markers; any other FFxx ends the scan.
      for (;;) {
        if (i >= n) return fail('scan runs past the end');
        if (b[i] !== 0xff) { i++; continue; }
        if (i + 1 >= n) return fail('truncated scan');
        const x = b[i + 1];
        if (x === 0x00 || (x >= 0xd0 && x <= 0xd7)) { i += 2; continue; }
        break; // a marker: handled by the outer loop
      }
    }
  }
}
