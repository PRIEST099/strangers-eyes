// web/src/tier0/exif.ts: metadata stripping and checks (ARCH §11.7, D-19, API-NOTES §5.3).
// Ported from research/day1-artifacts/web-ref/src/lib/exif.ts [verified in Chrome 157].
import exifr from 'exifr';
import { MASTER_MAX_PX, decodeOriented, fitWithin } from './decode';

/** Re-encode through a canvas: drops EXIF/XMP/IPTC, bakes EXIF orientation into the pixels. */
export async function reencodeClean(
  src: Blob,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<{ blob: Blob; width: number; height: number }> {
  const { maxDim = MASTER_MAX_PX, quality = 0.9 } = opts;
  const bmp = await decodeOriented(src);
  const { width, height } = fitWithin(bmp.width, bmp.height, maxDim);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/jpeg', quality),
  );
  return { blob, width, height };
}

/** Pure byte-level scan of JPEG markers before SOS. Returns the APPn markers found (e.g. ['APP0','APP2']). */
export function jpegAppSegmentsFromBytes(b: Uint8Array): string[] {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) throw new Error('not a JPEG');
  const found: string[] = [];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) break;
    const m = b[i + 1];
    if (m === 0xff) { i += 1; continue; } // fill byte
    if (m === 0xda) break; // SOS: entropy-coded data follows
    if (m === 0xd9) break; // EOI
    if (m >= 0xd0 && m <= 0xd7) { i += 2; continue; } // RSTn have no length
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) break; // corrupt length
    if (m >= 0xe0 && m <= 0xef) found.push(`APP${m - 0xe0}`);
    i += 2 + len;
  }
  return found;
}

export async function jpegAppSegments(blob: Blob): Promise<string[]> {
  return jpegAppSegmentsFromBytes(new Uint8Array(await blob.arrayBuffer()));
}

/** Full exifr metadata parse (JFIF excluded: canvas JPEGs always carry an APP0 JFIF header). */
export async function findMetadata(blob: Blob): Promise<Record<string, unknown> | undefined> {
  return exifr.parse(blob, {
    tiff: true, ifd1: true, exif: true, gps: true, interop: true,
    xmp: true, icc: true, iptc: true, jfif: false, ihdr: false,
    makerNote: true, userComment: true, mergeOutput: false,
  });
}

export const FORBIDDEN_APP_SEGMENTS = ['APP1', 'APP13'] as const;

/** D-19: segments must not include APP1 (EXIF/XMP) or APP13 (IPTC/Photoshop). APP0 and APP2 are allowed. */
export function segmentsAreClean(segments: readonly string[]): boolean {
  return !segments.some((s) => (FORBIDDEN_APP_SEGMENTS as readonly string[]).includes(s));
}

export interface CleanCheck { clean: boolean; segments: string[]; hasGps: boolean }

/** The gate's metadata check (D-19): no APP1, no APP13, and exifr.gps() is undefined. */
export async function checkCleanJpeg(blob: Blob): Promise<CleanCheck> {
  const segments = await jpegAppSegments(blob);
  let gps: unknown;
  try {
    gps = await exifr.gps(blob);
  } catch {
    gps = undefined; // exifr throws on some files without metadata; the segment scan already decides
  }
  const hasGps = gps !== undefined && gps !== null;
  return { clean: segmentsAreClean(segments) && !hasGps, segments, hasGps };
}

/** Throws if the JPEG carries forbidden metadata. Used on every outgoing frame. */
export async function assertCleanJpeg(blob: Blob): Promise<void> {
  const r = await checkCleanJpeg(blob);
  if (!r.clean) throw new Error(`metadata present: segments=${r.segments.join(',')} gps=${r.hasGps}`);
}
