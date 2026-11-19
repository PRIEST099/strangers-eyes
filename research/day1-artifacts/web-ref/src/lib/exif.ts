import exifr from 'exifr';

/** Re-encode through a canvas: drops EXIF/XMP/IPTC/ICC, bakes EXIF orientation into pixels. */
export async function reencodeClean(
  src: Blob,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<{ blob: Blob; width: number; height: number }> {
  const { maxDim = 2048, quality = 0.9 } = opts;
  const bmp = await createImageBitmap(src, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
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

/** Byte-level scan of JPEG markers before SOS. Returns APPn markers found (e.g. ['APP0']). */
export async function jpegAppSegments(blob: Blob): Promise<string[]> {
  const b = new Uint8Array(await blob.arrayBuffer());
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('not a JPEG');
  const found: string[] = [];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) break;
    const m = b[i + 1];
    if (m === 0xda) break; // SOS: entropy-coded data follows
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xe0 && m <= 0xef) found.push(`APP${m - 0xe0}`);
    i += 2 + len;
  }
  return found;
}

/** exifr check. parse() resolves undefined when nothing is found. JFIF is excluded because canvas JPEGs always carry an APP0 JFIF header. */
export async function findMetadata(blob: Blob): Promise<Record<string, unknown> | undefined> {
  return exifr.parse(blob, {
    tiff: true, ifd1: true, exif: true, gps: true, interop: true,
    xmp: true, icc: true, iptc: true, jfif: false, ihdr: false,
    makerNote: true, userComment: true, mergeOutput: false,
  });
}
