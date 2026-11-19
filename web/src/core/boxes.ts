// web/src/core/boxes.ts: box mapping, padding and crop (ARCH §11.5, SPEC SCR-11, D-35). Pure functions.
import type { Box2D, CropSide, GridRegion, ImageFrame, PxRect } from './types';

export const DEFAULT_MASK_PAD_RATIO = 0.15; // total padding: 15% of the box (7.5% per side)
export const MIN_PAD_PX = 4;
export const MAX_CROP_RATIO = 0.4; // D-35: a crop never removes more than 40% of that dimension

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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
 * Values are clamped to 0..1000 and swapped corners are fixed. Vector: [100,250,500,750] on 800×600 → {200,60,400,240}.
 */
export function box2dToPx(box: Box2D, W: number, H: number): PxRect {
  const [ymin, xmin, ymax, xmax] = box.map((v) => clamp(Number.isFinite(v) ? v : 0, 0, 1000)) as Box2D;
  const x0 = Math.floor((Math.min(xmin, xmax) / 1000) * W);
  const y0 = Math.floor((Math.min(ymin, ymax) / 1000) * H);
  const x1 = Math.ceil((Math.max(xmin, xmax) / 1000) * W);
  const y1 = Math.ceil((Math.max(ymin, ymax) / 1000) * H);
  return clampRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, W, H);
}

/** Map a rect from a derived frame (e.g. the 1536-px cloud copy, possibly cropped) back to master pixels. */
export function cloudToMaster(r: PxRect, frame: ImageFrame): PxRect {
  const sx = frame.cropInMaster.w / frame.width;
  const sy = frame.cropInMaster.h / frame.height;
  return {
    x: frame.cropInMaster.x + r.x * sx,
    y: frame.cropInMaster.y + r.y * sy,
    w: r.w * sx,
    h: r.h * sy,
  };
}

/** Pad a rect by `ratio` of its size in total (half per side), at least MIN_PAD_PX per side, clamped to the frame. */
export function padRect(r: PxRect, W: number, H: number, ratio = DEFAULT_MASK_PAD_RATIO): PxRect {
  const px = Math.max(MIN_PAD_PX, Math.round((r.w * ratio) / 2));
  const py = Math.max(MIN_PAD_PX, Math.round((r.h * ratio) / 2));
  return clampRect({ x: r.x - px, y: r.y - py, w: r.w + 2 * px, h: r.h + 2 * py }, W, H);
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
 * D-35: the minimal crop from one side that removes every given box, capped at 40% of that dimension.
 * `rect` is the remaining image in the W×H frame.
 */
export function minimalCrop(side: Exclude<CropSide, 'none'>, boxes: readonly PxRect[], W: number, H: number): CropResult {
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
