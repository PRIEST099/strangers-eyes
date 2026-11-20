// web/src/tier0/importPhoto.ts: one imported file → the oriented, metadata-free master (SPEC SCR-05, D-20; ARCH §11.1;
// API-NOTES §5.3; T-053: AC-101, AC-103, P1 AC-102).
//
//   1. Size limit from Blob.size first: a file over 30 MB is never read.
//   2. Magic-byte sniff (tier0/sniff.ts): container, header dimensions (40 MP before any decode), animation.
//   3. EXIF read locally with exifr from the ORIGINAL bytes: GPS present? orientation? (P1 GPS warning, S0, in code.)
//   4. createImageBitmap(blob, {imageOrientation:'from-image'}); a failure is copy.import.heic for HEIC, else unsupported.
//   5. Downscale to the master (longest side ≤ 2048, never upscaled), JPEG q 0.9, assertCleanJpeg (no APP1/APP13, no GPS).
//   6. sha256 of the master JPEG bytes.
//
// The original blob is never uploaded, persisted or returned; its bytes and EXIF point live only inside this call.
import exifr from 'exifr';
import type { StringId } from '../core/strings';
import type { BandThresholdsM } from '../core/types';
import { MASTER_MAX_PX, decodeOriented, toCanvas, toJpeg } from './decode';
import { assertCleanJpeg } from './exif';
import { gpsWarningFor, type GpsPinLike, type GpsPoint, type GpsWarning } from './gpsWarning';
import { MAX_EXIF_TIFF_BYTES, MAX_IMPORT_PIXELS, exceedsByteLimit, exifTiff, sniffImage, type ImageFormat } from './sniff';

/** JPEG quality of the master (D-20, ARCH §11.1). */
export const MASTER_JPEG_QUALITY = 0.9;

export type ImportErrorCode = 'tooLarge' | 'unsupported' | 'heic' | 'metadata';
/**
 * The copy each failure shows. `metadata` (the master still carried APP1/APP13/GPS) should never happen: fail closed.
 * Its copy is the import's own (ui.import.metadataFailed), not the Egress Gate's copy.gate.blockedMetadata: nothing is
 * being sent at import, so "would have left this device" would be untrue here (T-053 fix round 4).
 */
export const IMPORT_ERROR_COPY: Readonly<Record<ImportErrorCode, StringId>> = Object.freeze({
  tooLarge: 'copy.import.tooLarge',
  unsupported: 'copy.import.unsupported',
  heic: 'copy.import.heic',
  metadata: 'ui.import.metadataFailed',
});

export interface ImportError { ok: false; code: ImportErrorCode; copyId: StringId }
export interface ImportedPhoto {
  ok: true;
  /** The oriented working image. Every later box (faces, OCR, Gemini, masks) is in these pixels (ARCH §11.1). */
  master: HTMLCanvasElement;
  /** The master as a clean JPEG (q 0.9): APP0/APP2 only, no APP1/APP13, no GPS (D-19). */
  jpeg: Blob;
  width: number;
  height: number;
  /** Lower-case hex sha256 of `jpeg`'s bytes (64 chars). */
  sha256: string;
  format: ImageFormat;
  /** The ORIGINAL file carried EXIF GPS (it is gone from the master). */
  hadGps: boolean;
  /** EXIF Orientation of the original (1–8), or null when absent. Already applied to the master's pixels. */
  orientation: number | null;
  /** P1 GPS warning (S0, computed here); null when the original had no GPS. Holds a band and a kind, never coordinates. */
  gpsWarning: GpsWarning | null;
}
export type ImportResult = ImportedPhoto | ImportError;

export interface ImportOptions {
  /** The ACTIVE vault's pins (vaultScan.activePins()), passed as plain data. Used only for the local GPS warning. */
  pins?: readonly GpsPinLike[];
  bands?: BandThresholdsM;
}

/** Browser seams, injectable so the flow is unit-testable in Node (Vitest has no canvas or createImageBitmap). */
export interface ImportDeps {
  decode: (blob: Blob) => Promise<ImageBitmap>;
  render: (img: ImageBitmap, maxPx: number) => HTMLCanvasElement;
  encode: (c: HTMLCanvasElement, quality: number) => Promise<Blob>;
  assertClean: (jpeg: Blob) => Promise<void>;
}
export const BROWSER_IMPORT_DEPS: ImportDeps = {
  decode: decodeOriented,
  render: (img, maxPx) => toCanvas(img, maxPx),
  encode: toJpeg,
  assertClean: assertCleanJpeg,
};

const fail = (code: ImportErrorCode): ImportError => ({ ok: false, code, copyId: IMPORT_ERROR_COPY[code] });

/** Lower-case hex SHA-256 (WebCrypto; also available in Node, where the tests run). */
export async function sha256Hex(data: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('');
}

export interface ExifFacts { gps: GpsPoint | undefined; orientation: number | null }

/**
 * GPS and orientation from the original bytes, locally. exifr gets ONLY the EXIF TIFF that sniff.exifTiff finds on
 * its capped walks (JPEG APP1, PNG eXIf, WebP EXIF, HEIF Exif item), never the whole file, and at most
 * MAX_EXIF_TIFF_BYTES of it: exifr's file parsers walk structure the sniff does not bound, and its TIFF parser trusts
 * value counts (T-053 round-5/6 verifiers: ~1–2.5 s and hundreds of MB on crafted files). No
 * TIFF, or one exifr cannot read, means "nothing read": the master is stripped by the re-encode either way.
 */
export async function readExifFacts(bytes: Uint8Array): Promise<ExifFacts> {
  let gps: GpsPoint | undefined;
  let orientation: number | null = null;
  const tiff = exifTiff(bytes);
  if (tiff === null) return { gps, orientation };
  // A copy of at most MAX_EXIF_TIFF_BYTES (1 MiB): exifr's TIFF parser trusts each tag's value count (a crafted 30 MB
  // TIFF in a PNG, WebP or HEIF cost ~2.5 s and hundreds of MB; round-6 verifier), while real GPS IFDs can sit past
  // 100 KB (ImageIO, round-7 verifier).
  const src = tiff.slice(0, MAX_EXIF_TIFF_BYTES);
  try {
    const g: unknown = await exifr.gps(src);
    if (g && typeof g === 'object' && 'latitude' in g && 'longitude' in g) {
      gps = { latitude: Number(g.latitude), longitude: Number(g.longitude) };
    }
  } catch {
    gps = undefined;
  }
  try {
    const o: unknown = await exifr.orientation(src);
    orientation = typeof o === 'number' && Number.isInteger(o) && o >= 1 && o <= 8 ? o : null;
  } catch {
    orientation = null;
  }
  return { gps, orientation };
}

/**
 * Import one photo (SPEC SCR-05). Never throws for a bad file: every rejection is a typed error with its copy ID.
 * The returned master and JPEG are the only image data the rest of the app may use.
 */
export async function importPhoto(file: Blob, opts: ImportOptions = {}, deps: ImportDeps = BROWSER_IMPORT_DEPS): Promise<ImportResult> {
  if (exceedsByteLimit(file.size)) return fail('tooLarge'); // size first: a file over the limit is never read

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return fail('unsupported');
  }
  const sniff = sniffImage(bytes, file.size);
  if (!sniff.ok) return fail(sniff.reason);

  const exif = await readExifFacts(bytes);
  const gpsWarning = exif.gps ? gpsWarningFor(exif.gps, opts.pins ?? [], opts.bands) : null;

  let bmp: ImageBitmap;
  try {
    bmp = await deps.decode(file);
  } catch {
    return fail(sniff.format === 'heic' ? 'heic' : 'unsupported'); // U-32: desktop Chrome may not decode HEIC
  }
  let master: HTMLCanvasElement;
  try {
    if (!(bmp.width > 0 && bmp.height > 0)) return fail('unsupported');
    if (bmp.width * bmp.height > MAX_IMPORT_PIXELS) return fail('tooLarge'); // backstop: the header check came first
    master = deps.render(bmp, MASTER_MAX_PX);
  } catch {
    return fail('unsupported');
  } finally {
    bmp.close();
  }

  let jpeg: Blob;
  try {
    jpeg = await deps.encode(master, MASTER_JPEG_QUALITY);
  } catch {
    return fail('unsupported');
  }
  try {
    await deps.assertClean(jpeg); // D-19: no APP1, no APP13, exifr.gps undefined
  } catch {
    return fail('metadata');
  }
  const sha256 = await sha256Hex(await jpeg.arrayBuffer());
  return {
    ok: true, master, jpeg, width: master.width, height: master.height, sha256, format: sniff.format,
    hadGps: exif.gps !== undefined, orientation: exif.orientation, gpsWarning,
  };
}
