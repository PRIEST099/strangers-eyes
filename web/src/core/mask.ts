// web/src/core/mask.ts: solid masks (ARCH §11.6, CLAUDE.md invariant 6). Never blur or pixelate:
// blurred or pixelated text can be recovered. Exported pixels are always solid, opaque #000.
import type { PxRect } from './types';
import { area, assertRect, assertSize, clampRect } from './boxes';

export const MASK_COLOR = '#000';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Fill rects (master pixels) with an opaque solid colour on an existing context. Returns how many rects were painted:
 * a rect wholly outside W×H or of zero area paints nothing. A malformed rect (non-finite, null, negative extent)
 * throws before anything is painted (D-97). Egress callers check the count (applyMasks, frames.renderFrame).
 */
export function fillSolid(ctx: Ctx2D, rects: readonly PxRect[], W: number, H: number, color = MASK_COLOR): number {
  assertSize(W, H, 'mask frame');
  rects.forEach((r, i) => assertRect(r, `mask ${i}`));
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.fillStyle = color;
  let n = 0;
  for (const r of rects) {
    const c = clampRect(r, W, H);
    if (area(c) > 0) {
      // Snap outward to whole pixels so no partially covered (anti-aliased) edge leaks content.
      const x0 = Math.floor(c.x);
      const y0 = Math.floor(c.y);
      const x1 = Math.ceil(c.x + c.w);
      const y1 = Math.ceil(c.y + c.h);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      n++;
    }
  }
  ctx.restore();
  return n;
}

/**
 * Copy the master, apply solid masks, then optionally crop. Returns a NEW canvas; the master is never modified.
 * `crop` is in master pixels. Fails closed (D-97): throws if any mask is malformed or paints nothing.
 */
export function applyMasks(master: HTMLCanvasElement, rects: readonly PxRect[], crop?: PxRect): HTMLCanvasElement {
  const W = master.width;
  const H = master.height;
  if (crop !== undefined) assertRect(crop, 'crop'); // the masks are validated by fillSolid (the copy is freed on a throw)
  const masked = document.createElement('canvas');
  masked.width = W;
  masked.height = H;
  try {
    const mctx = masked.getContext('2d');
    if (!mctx) throw new Error('2d context unavailable');
    mctx.drawImage(master, 0, 0);
    const painted = fillSolid(mctx, rects, W, H);
    if (painted !== rects.length) {
      throw new Error(`applyMasks: ${rects.length - painted} mask(s) painted nothing (outside the image or zero area)`);
    }
  } catch (e) {
    masked.width = 0; // free the copy
    throw e;
  }
  if (crop === undefined) return masked;
  try {
    const c = clampRect(crop, W, H);
    const x0 = Math.floor(c.x);
    const y0 = Math.floor(c.y);
    const w = Math.max(1, Math.floor(c.x + c.w) - x0);
    const h = Math.max(1, Math.floor(c.y + c.h) - y0);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const octx = out.getContext('2d');
    if (!octx) throw new Error('2d context unavailable');
    octx.drawImage(masked, x0, y0, w, h, 0, 0, w, h);
    return out;
  } finally {
    masked.width = 0; // the full-size masked copy is no longer needed
  }
}
