// web/src/core/frames.ts: derived image frames (ARCH §11.1, D-20, D-88).
// The ImageFrame built here is the ONLY description of a derived frame's pixels: renderFrame draws exactly its
// cropInMaster rect into exactly width × height pixels, so boxes.ts (box2dToMaster, frameToMaster) maps a box from the
// frame back to the master without drift. Never letterboxed: Gemini's box_2d is normalised to the image as sent.
// Masks are solid fills applied on the MASTER, before the crop and the downscale (ARCH §11.6, invariant 6).
// This is egress code: every input is validated and anything malformed throws (fail closed, D-97).
// deriveFrame/snapCrop/clampMaxPx are pure; renderFrame/buildFrameJpeg are Node-tested on a recording canvas
// (frames.canvas.test.ts) and pixel-tested in the DEV selftest step 'frames'.
import type { ImageFrame, PxRect } from './types';
import { fillSolid } from './mask';
import { assertFrame, assertRect, clampRect } from './boxes';
import { fitWithin, toJpeg } from '../tier0/decode';
import { assertCleanJpeg } from '../tier0/exif';

export type DerivedFrameId = Exclude<ImageFrame['id'], 'master'>;

/** RC defaults (ARCH RC table): `nano_image_max_px` 768 and `cloud_image_max_px` 1536. Export (P0) is master size. */
export const FRAME_MAX_PX: Readonly<Record<DerivedFrameId, number>> = { nano768: 768, cloud: 1536, export: Infinity };
/**
 * Allowed longest sides (D-98): cloud 768–2048 (ARCH §13.2 `cloud_image_max_px`); nano768 256–768 (never above the
 * size Nano was verified with); export 1–4096 when given (SPEC SCR-12 P2), otherwise master size.
 */
export const FRAME_MAX_PX_RANGE: Readonly<Record<DerivedFrameId, readonly [number, number]>> = {
  nano768: [256, 768], cloud: [768, 2048], export: [1, 4096],
};

/**
 * A raw RC (or caller) longest-side value → the integer to use: floored (1536.6 → 1536, so a frame is never wider than
 * intended), clamped to FRAME_MAX_PX_RANGE; a missing, non-numeric or non-finite value → FRAME_MAX_PX (D-98).
 */
export function clampMaxPx(id: DerivedFrameId, raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return FRAME_MAX_PX[id];
  const [lo, hi] = FRAME_MAX_PX_RANGE[id];
  return Math.min(hi, Math.max(lo, Math.floor(raw)));
}
/** ARCH §11.1: nano768 and cloud JPEG q 0.85, export q 0.92. */
export const FRAME_JPEG_QUALITY: Readonly<Record<DerivedFrameId, number>> = { nano768: 0.85, cloud: 0.85, export: 0.92 };

/** The master itself as a frame: no crop, no scaling. */
export function masterFrame(W: number, H: number): ImageFrame {
  return { id: 'master', width: W, height: H, cropInMaster: { x: 0, y: 0, w: W, h: H } };
}

/**
 * A crop rect snapped to whole master pixels INWARD (a crop never keeps a sliver it was meant to remove) and clamped
 * to the W×H master. Throws if nothing is left: a crop must keep at least one pixel each way.
 */
export function snapCrop(crop: PxRect, W: number, H: number): PxRect {
  assertRect(crop, 'crop');
  const c = clampRect(crop, W, H);
  const x0 = Math.ceil(c.x);
  const y0 = Math.ceil(c.y);
  const x1 = Math.floor(c.x + c.w);
  const y1 = Math.floor(c.y + c.h);
  if (!(x1 > x0 && y1 > y0)) throw new Error(`snapCrop: nothing left of ${W}×${H} after crop ${JSON.stringify(crop)}`);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * The ImageFrame of a derived frame of a W×H master: the crop (default: the whole master) snapped inward to whole
 * pixels, then scaled so its longest side is ≤ maxPx (clampMaxPx: an integer in the frame's range, default per frame
 * id), never upscaled, each side rounded separately (tier0/decode.ts fitWithin), at least 1 px. The aspect ratio is
 * the crop's, up to that rounding.
 */
export function deriveFrame(id: DerivedFrameId, W: number, H: number, opts: { maxPx?: number; crop?: PxRect } = {}): ImageFrame {
  if (!(Number.isInteger(W) && Number.isInteger(H) && W > 0 && H > 0)) throw new Error(`deriveFrame: bad master size ${W}×${H}`);
  const maxPx = clampMaxPx(id, opts.maxPx); // export without maxPx → Infinity (master size)
  // Only `undefined` means "no crop": a null or malformed crop is a bug upstream and fails closed (D-97).
  const cropInMaster = snapCrop(opts.crop === undefined ? { x: 0, y: 0, w: W, h: H } : opts.crop, W, H);
  // D-178: a crop never raises detail. The crop is drawn at no finer a scale than the whole master would be at this
  // maxPx, so cropping to a smaller area never sends that area at a higher resolution than the earlier, uncropped copy
  // (found by the fix-loop measurement: a crop sent 1337 × 1536 where the uncropped copy was 1536 × 1152).
  const whole = fitWithin(W, H, maxPx).scale;
  const fit = fitWithin(cropInMaster.w, cropInMaster.h, maxPx);
  const scale = Math.min(fit.scale, whole);
  const width = Math.max(1, Math.round(cropInMaster.w * scale));
  const height = Math.max(1, Math.round(cropInMaster.h * scale));
  return { id, width, height, cropInMaster };
}

function newCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [c, ctx];
}

/**
 * Render `frame` from the master: solid masks (master px) painted on a copy of the master, then the frame's crop drawn
 * from that copy into width × height. Returns a NEW canvas; the master is never modified. The caller frees it
 * (width = 0) when done. Fails closed (D-97): a bad frame, a malformed mask, or a mask that paints nothing (wholly
 * outside the master, zero area) throws, so no frame is ever rendered with a mask silently missing.
 */
export function renderFrame(master: HTMLCanvasElement, frame: ImageFrame, masks: readonly PxRect[] = []): HTMLCanvasElement {
  assertFrame(frame);
  const c = frame.cropInMaster;
  if (![c.x, c.y, c.w, c.h, frame.width, frame.height].every(Number.isInteger)) {
    throw new Error(`renderFrame: frame ${frame.id} is not in whole pixels (build it with deriveFrame)`);
  }
  if (c.x + c.w > master.width || c.y + c.h > master.height) {
    throw new Error(`renderFrame: crop ${c.x},${c.y} ${c.w}×${c.h} lies outside the ${master.width}×${master.height} master`);
  }
  let src: HTMLCanvasElement = master;
  if (masks.length) {
    const [copy, cctx] = newCanvas(master.width, master.height);
    try {
      cctx.drawImage(master, 0, 0);
      const painted = fillSolid(cctx, masks, master.width, master.height); // throws on a malformed mask
      if (painted !== masks.length) {
        throw new Error(`renderFrame: ${masks.length - painted} mask(s) painted nothing (outside the image or zero area)`);
      }
    } catch (e) {
      copy.width = 0;
      throw e;
    }
    src = copy; // the output is drawn ONLY from the masked copy
  }
  try {
    const [out, ctx] = newCanvas(frame.width, frame.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, c.x, c.y, c.w, c.h, 0, 0, frame.width, frame.height);
    return out;
  } finally {
    if (src !== master) src.width = 0; // free the masked full-size copy
  }
}

export interface FrameJpeg { jpeg: Blob; frame: ImageFrame }

/**
 * Build a derived frame as JPEG: master + solid masks + crop → ≤ maxPx → JPEG (q per frame id) → assertCleanJpeg
 * (throws on APP1/APP13/GPS: nothing unclean ever leaves this function). The cloud frame is
 * `buildFrameJpeg('cloud', master, { masks, crop })` (ARCH §11.1); nano768 is the master without masks.
 */
export async function buildFrameJpeg(
  id: DerivedFrameId,
  master: HTMLCanvasElement,
  opts: { masks?: readonly PxRect[]; crop?: PxRect; maxPx?: number; quality?: number } = {},
): Promise<FrameJpeg> {
  const frame = deriveFrame(id, master.width, master.height, { maxPx: opts.maxPx, crop: opts.crop });
  const canvas = renderFrame(master, frame, opts.masks ?? []);
  try {
    const jpeg = await toJpeg(canvas, opts.quality ?? FRAME_JPEG_QUALITY[id]);
    await assertCleanJpeg(jpeg);
    return { jpeg, frame };
  } finally {
    canvas.width = 0;
  }
}
