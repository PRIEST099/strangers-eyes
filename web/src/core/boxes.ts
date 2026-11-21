// web/src/core/boxes.ts: box mapping, padding and crop (ARCH §11.5, SPEC SCR-11, D-35, D-88, D-89). Pure functions.
// Every stored box is in MASTER pixels (D-20, AC-118). A derived frame (nano768, cloud, export) is described by an
// ImageFrame built in core/frames.ts; the functions here map boxes between that frame and the master.
import type { Box2D, CropSide, GridRegion, ImageFrame, PxRect } from './types';

export const DEFAULT_MASK_PAD_RATIO = 0.15; // total padding: 15% of the box (7.5% per side)
export const MAX_PAD_RATIO = 0.5; // RC mask_pad_ratio is clamped 0–0.5 (ARCH RC table)
export const MIN_PAD_PX = 4;
export const MAX_CROP_RATIO = 0.4; // D-35: a crop never removes more than 40% of that dimension
export const OCR_PREFER_IOU = 0.3; // SPEC SCR-11: OCR boxes replace a pass-B box when they overlap it with IoU > 0.3

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/**
 * ceil that ignores float noise: ceil(v − 1e-9), so 15.000000000000002 → 15 and padding is never one pixel bigger by
 * accident (the iOS port uses the same epsilon; shared/testvectors/box2d.json conventions).
 */
const ceilPx = (v: number) => Math.ceil(v - 1e-9);

/**
 * Fail closed (D-97): a rect that feeds a mask, a crop or a mapping must have finite x, y, w, h and w, h ≥ 0. Anything
 * else (NaN, ±Infinity, null, a missing field, a negative extent) is a bug upstream and throws, never silently becomes
 * 0 or gets dropped, so an image can never leave with a target unmasked because its box was garbage.
 */
export function assertRect(r: unknown, what = 'rect'): asserts r is PxRect {
  const o = r as Partial<Record<'x' | 'y' | 'w' | 'h', unknown>> | null | undefined;
  const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!(o && typeof o === 'object' && fin(o.x) && fin(o.y) && fin(o.w) && fin(o.h) && o.w >= 0 && o.h >= 0)) {
    throw new Error(`malformed ${what}: ${JSON.stringify(r)}`);
  }
}

/** A frame or image size must be finite and positive. */
export function assertSize(W: number, H: number, what = 'size'): void {
  if (!(Number.isFinite(W) && Number.isFinite(H) && W > 0 && H > 0)) throw new Error(`bad ${what}: ${W}×${H}`);
}

/** The smallest whole-pixel rect that contains `r` (near edges floored, far edges ceiled). Never shrinks a box. */
export function roundOut(r: PxRect): PxRect {
  const x0 = Math.floor(r.x);
  const y0 = Math.floor(r.y);
  return { x: x0, y: y0, w: Math.ceil(r.x + r.w) - x0, h: Math.ceil(r.y + r.h) - y0 };
}

/** RC `mask_pad_ratio` → the ratio to use: clamped 0–0.5; a missing, non-numeric or non-finite value → 0.15. */
export function clampPadRatio(ratio: unknown): number {
  return typeof ratio === 'number' && Number.isFinite(ratio) ? clamp(ratio, 0, MAX_PAD_RATIO) : DEFAULT_MASK_PAD_RATIO;
}

/** Clamp a rect to a W×H frame. Returns a zero-area rect if it lies outside. */
export function clampRect(r: PxRect, W: number, H: number): PxRect {
  const x0 = clamp(r.x, 0, W);
  const y0 = clamp(r.y, 0, H);
  const x1 = clamp(r.x + r.w, 0, W);
  const y1 = clamp(r.y + r.h, 0, H);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/**
 * Gemini box_2d [ymin, xmin, ymax, xmax], normalised 0..1000 to the image AS SENT, to pixels of that W×H image.
 * Values are clamped to 0..1000 (non-finite → 0) and swapped corners are fixed; edges round outward. A zero-area box
 * comes back with w or h 0 (box2dToMaster returns null for it). Vector: [100,250,500,750] on 800×600 → {200,60,400,240}.
 */
export function box2dToPx(box: Box2D, W: number, H: number): PxRect {
  const [ymin, xmin, ymax, xmax] = box.map((v) => clamp(Number.isFinite(v) ? v : 0, 0, 1000)) as Box2D;
  // Multiply before dividing: 550 × 800 / 1000 is exactly 440, while 0.55 × 800 is 440.00000000000006 (ceil → 441).
  const x0 = Math.floor((Math.min(xmin, xmax) * W) / 1000);
  const y0 = Math.floor((Math.min(ymin, ymax) * H) / 1000);
  const x1 = Math.ceil((Math.max(xmin, xmax) * W) / 1000);
  const y1 = Math.ceil((Math.max(ymin, ymax) * H) / 1000);
  return clampRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, W, H);
}

/** An ImageFrame must have a finite positive size and a finite crop with positive extent at x, y ≥ 0. */
export function assertFrame(f: ImageFrame): void {
  const c = f?.cropInMaster;
  const ok = !!c && [f.width, f.height, c.x, c.y, c.w, c.h].every((v) => typeof v === 'number' && Number.isFinite(v))
    && f.width > 0 && f.height > 0 && c.w > 0 && c.h > 0 && c.x >= 0 && c.y >= 0;
  if (!ok) throw new Error(`invalid ImageFrame ${f?.id}: ${f?.width}×${f?.height}, crop ${JSON.stringify(c)}`);
}

/**
 * Map a rect from a derived frame (e.g. the 1536-px cloud copy, possibly cropped) back to master pixels, exactly
 * (fractional). x and y scale separately: the frame's sides were rounded separately (D-88).
 */
export function cloudToMaster(r: PxRect, frame: ImageFrame): PxRect {
  const c = frame.cropInMaster;
  return {
    x: c.x + (r.x * c.w) / frame.width,
    y: c.y + (r.y * c.h) / frame.height,
    w: (r.w * c.w) / frame.width,
    h: (r.h * c.h) / frame.height,
  };
}

/** A rect in frame pixels → master pixels: clamped to the frame, mapped, rounded outward, kept inside the crop. */
export function frameToMaster(r: PxRect, frame: ImageFrame): PxRect {
  assertFrame(frame);
  assertRect(r, 'frameToMaster rect');
  const c = roundOut(frame.cropInMaster);
  const m = roundOut(cloudToMaster(clampRect(r, frame.width, frame.height), frame));
  return intersect(m, c);
}

/** A rect in master pixels → frame pixels: rounded outward, clamped to the frame (zero-area if it was cropped away). */
export function masterToFrame(r: PxRect, frame: ImageFrame): PxRect {
  assertFrame(frame);
  assertRect(r, 'masterToFrame rect');
  const c = frame.cropInMaster;
  const x0 = ((r.x - c.x) * frame.width) / c.w;
  const y0 = ((r.y - c.y) * frame.height) / c.h;
  const x1 = ((r.x + r.w - c.x) * frame.width) / c.w;
  const y1 = ((r.y + r.h - c.y) * frame.height) / c.h;
  return clampRect(roundOut({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }), frame.width, frame.height);
}

/**
 * Gemini box_2d (0..1000 of the image AS SENT, i.e. of `frame`) → master pixels, before padding. Maps straight from
 * the normalised values to the master (no intermediate frame-pixel rounding), rounds outward once and stays inside
 * the frame's crop. Returns null for a box with a non-finite value or zero area after clamping (API-NOTES §6.1).
 */
export function box2dToMaster(box: Box2D, frame: ImageFrame): PxRect | null {
  assertFrame(frame);
  if (box.length !== 4 || !box.every((v) => Number.isFinite(v))) return null;
  const [a, b, c2, d] = box.map((v) => clamp(v, 0, 1000));
  const ymin = Math.min(a, c2), ymax = Math.max(a, c2), xmin = Math.min(b, d), xmax = Math.max(b, d);
  if (!(xmax > xmin && ymax > ymin)) return null;
  const c = frame.cropInMaster;
  const x0 = Math.floor(c.x + (xmin * c.w) / 1000);
  const y0 = Math.floor(c.y + (ymin * c.h) / 1000);
  const x1 = Math.ceil(c.x + (xmax * c.w) / 1000);
  const y1 = Math.ceil(c.y + (ymax * c.h) / 1000);
  const r = intersect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, roundOut(c));
  return area(r) > 0 ? r : null;
}

/**
 * Master pixels → box_2d on `frame` ([ymin, xmin, ymax, xmax], integers 0..1000), rounded outward. The inverse of
 * box2dToMaster, for fixtures, tests and synthetic samples; production boxes come from Gemini.
 */
export function masterToBox2d(r: PxRect, frame: ImageFrame): Box2D {
  assertFrame(frame);
  assertRect(r, 'masterToBox2d rect');
  const c = frame.cropInMaster;
  const n = (v: number, o: number, s: number) => ((v - o) * 1000) / s;
  return [
    clamp(Math.floor(n(r.y, c.y, c.h)), 0, 1000),
    clamp(Math.floor(n(r.x, c.x, c.w)), 0, 1000),
    clamp(Math.ceil(n(r.y + r.h, c.y, c.h)), 0, 1000),
    clamp(Math.ceil(n(r.x + r.w, c.x, c.w)), 0, 1000),
  ];
}

/**
 * Pad a rect by `ratio` of its size in total (half per side, rounded up), at least MIN_PAD_PX per side, rounded
 * outward to whole pixels and clamped to the W×H frame. `ratio` is clamped like RC `mask_pad_ratio` (0–0.5).
 */
export function padRect(r: PxRect, W: number, H: number, ratio: number = DEFAULT_MASK_PAD_RATIO): PxRect {
  assertRect(r, 'padRect rect');
  assertSize(W, H, 'padRect frame');
  const k = clampPadRatio(ratio);
  const px = Math.max(MIN_PAD_PX, ceilPx((r.w * k) / 2));
  const py = Math.max(MIN_PAD_PX, ceilPx((r.h * k) / 2));
  return clampRect(roundOut({ x: r.x - px, y: r.y - py, w: r.w + 2 * px, h: r.h + 2 * py }), W, H);
}

/**
 * SPEC SCR-11 / ARCH §11.5: where a pass-B box overlaps OCR words of the same text, mask the union of those OCR boxes
 * (tighter). `ocrBoxes` are the boxes of words the caller matched to the clue's text (master px); only those touching
 * `cloudBox` count, and their union is used when its IoU with `cloudBox` is > 0.3. Otherwise the pass-B box stays.
 */
export function preferOcrBoxes(cloudBox: PxRect, ocrBoxes: readonly PxRect[], minIou = OCR_PREFER_IOU): { box: PxRect; source: 'ocr' | 'cloud' } {
  assertRect(cloudBox, 'pass-B box');
  ocrBoxes.forEach((b, i) => assertRect(b, `OCR box ${i}`));
  const touching = ocrBoxes.filter((b) => area(intersect(b, cloudBox)) > 0);
  const u = union(touching);
  return u && iou(u, cloudBox) > minIou ? { box: u, source: 'ocr' } : { box: cloudBox, source: 'cloud' };
}

const REGION_CELLS: Record<GridRegion, [col: number, row: number]> = {
  top_left: [0, 0], top_center: [1, 0], top_right: [2, 0],
  middle_left: [0, 1], middle_center: [1, 1], middle_right: [2, 1],
  bottom_left: [0, 2], bottom_center: [1, 2], bottom_right: [2, 2],
};

/** The 3×3 grid cell of a named region, in pixels of a W×H frame (cells tile the frame exactly). */
export function gridCellRect(region: GridRegion, W: number, H: number): PxRect {
  const [c, r] = REGION_CELLS[region];
  const x0 = Math.round((c * W) / 3);
  const x1 = Math.round(((c + 1) * W) / 3);
  const y0 = Math.round((r * H) / 3);
  const y1 = Math.round(((r + 1) * H) / 3);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The region whose cell contains the rect's centre. */
export function regionOf(r: PxRect, W: number, H: number): GridRegion {
  const cx = clamp(r.x + r.w / 2, 0, W - 1e-9);
  const cy = clamp(r.y + r.h / 2, 0, H - 1e-9);
  const col = Math.min(2, Math.floor((cx / W) * 3));
  const row = Math.min(2, Math.floor((cy / H) * 3));
  const found = (Object.keys(REGION_CELLS) as GridRegion[]).find((k) => REGION_CELLS[k][0] === col && REGION_CELLS[k][1] === row);
  return found ?? 'middle_center';
}

export function area(r: PxRect): number {
  return Math.max(0, r.w) * Math.max(0, r.h);
}

export function intersect(a: PxRect, b: PxRect): PxRect {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

export function union(rs: readonly PxRect[]): PxRect | null {
  if (!rs.length) return null;
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function iou(a: PxRect, b: PxRect): number {
  const i = area(intersect(a, b));
  const u = area(a) + area(b) - i;
  return u > 0 ? i / u : 0;
}

export type CropResult =
  | { ok: true; side: Exclude<CropSide, 'none'>; px: number; rect: PxRect }
  | { ok: false; reason: 'too_much' | 'no_boxes' };

/**
 * D-35: the minimal crop from one side that removes every given box, capped at 40% of that dimension (exactly 40% is
 * allowed). `rect` is the remaining image in the W×H frame, in whole pixels. Callers pass the PADDED master boxes, the
 * same rects a mask would cover (D-89). A malformed box (non-finite, negative extent) throws (D-97); a zero-area one is
 * ignored (nothing to remove).
 */
export function minimalCrop(side: Exclude<CropSide, 'none'>, boxes: readonly PxRect[], W: number, H: number): CropResult {
  assertSize(W, H, 'crop image');
  boxes.forEach((b, i) => assertRect(b, `crop box ${i}`)); // a NaN box must not be skipped (D-97)
  const bs = boxes.map((b) => clampRect(b, W, H)).filter((b) => area(b) > 0);
  if (!bs.length) return { ok: false, reason: 'no_boxes' };
  let px: number;
  let dim: number;
  switch (side) {
    case 'top': px = Math.ceil(Math.max(...bs.map((b) => b.y + b.h))); dim = H; break;
    case 'bottom': px = Math.ceil(H - Math.min(...bs.map((b) => b.y))); dim = H; break;
    case 'left': px = Math.ceil(Math.max(...bs.map((b) => b.x + b.w))); dim = W; break;
    case 'right': px = Math.ceil(W - Math.min(...bs.map((b) => b.x))); dim = W; break;
  }
  if (px > MAX_CROP_RATIO * dim) return { ok: false, reason: 'too_much' };
  const rect: PxRect =
    side === 'top' ? { x: 0, y: px, w: W, h: H - px }
    : side === 'bottom' ? { x: 0, y: 0, w: W, h: H - px }
    : side === 'left' ? { x: px, y: 0, w: W - px, h: H }
    : { x: 0, y: 0, w: W - px, h: H };
  return { ok: true, side, px, rect };
}

const CROP_SIDES = ['top', 'bottom', 'left', 'right'] as const;

/**
 * SPEC §10.4 / ARCH §12.5 (rules plan, D-89): try every side and keep the crop that removes the smallest share of the
 * photo within the 40% cap; ties keep the earlier side (top, bottom, left, right). `too_much` when no side fits (the
 * caller shows copy.fix.unremovable and uses crop 'none').
 */
export function bestCrop(boxes: readonly PxRect[], W: number, H: number): CropResult {
  // minimalCrop validates W, H and every box (D-97): a NaN box throws on the first side, it is never ignored.
  let best: Extract<CropResult, { ok: true }> | null = null;
  let bestShare = Infinity;
  let reason: 'too_much' | 'no_boxes' = 'no_boxes';
  for (const side of CROP_SIDES) {
    const r = minimalCrop(side, boxes, W, H);
    if (!r.ok) { reason = r.reason; continue; }
    const share = r.px / (side === 'top' || side === 'bottom' ? H : W);
    if (share < bestShare) { best = r; bestShare = share; }
  }
  return best ?? { ok: false, reason };
}
