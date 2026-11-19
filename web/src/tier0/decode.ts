// web/src/tier0/decode.ts: decode, orient and resize images (ARCH §11.1, D-20).
// Every box in the app lives in the oriented "master" frame (longest side ≤ 2048 px).
// Tesseract rejects ImageBitmap, so Tier-0 always works on canvases.

export const MASTER_MAX_PX = 2048;

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** Decode a File/Blob with EXIF orientation applied to the pixels. */
export async function decodeOriented(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

/** Scale (w, h) so the longest side is at most maxPx. Never upscales. Keeps the aspect ratio. */
export function fitWithin(w: number, h: number, maxPx: number): { width: number; height: number; scale: number } {
  if (!(w > 0 && h > 0)) throw new Error('fitWithin: non-positive size');
  const scale = Math.min(1, maxPx / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return ctx;
}

/** Draw a bitmap or canvas onto a new canvas, downscaled so the longest side ≤ maxPx. */
export function toCanvas(src: ImageBitmap | HTMLCanvasElement, maxPx = MASTER_MAX_PX): HTMLCanvasElement {
  const { width, height } = fitWithin(src.width, src.height, maxPx);
  const c = makeCanvas(width, height);
  const ctx = ctx2d(c);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, width, height);
  return c;
}

/** A downscaled copy (e.g. nano768, cloud 1536, OCR 1600). Never letterboxed. */
export function downscaleTo(src: HTMLCanvasElement, maxPx: number): HTMLCanvasElement {
  return toCanvas(src, maxPx);
}

/** Encode a canvas as JPEG. Canvas JPEGs carry APP0 (JFIF) and APP2 (ICC) only: no EXIF, no GPS. */
export function toJpeg(c: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/jpeg', quality),
  );
}

/** Decode + orient + downscale to the master frame. */
export async function decodeToMaster(file: Blob, maxPx = MASTER_MAX_PX): Promise<HTMLCanvasElement> {
  const bmp = await decodeOriented(file);
  try {
    return toCanvas(bmp, maxPx);
  } finally {
    bmp.close();
  }
}
