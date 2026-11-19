/** Gemini box_2d = [ymin, xmin, ymax, xmax], each normalized to 0..1000 of the image SENT to Gemini. */
export type Box2D = [number, number, number, number];

export function box2dToPx(box: Box2D, width: number, height: number, padPx = 0) {
  const clamp = (v: number) => Math.max(0, Math.min(1000, v));
  const [ymin, xmin, ymax, xmax] = box.map(clamp) as Box2D;
  const x0 = Math.floor((Math.min(xmin, xmax) / 1000) * width) - padPx;
  const y0 = Math.floor((Math.min(ymin, ymax) / 1000) * height) - padPx;
  const x1 = Math.ceil((Math.max(xmin, xmax) / 1000) * width) + padPx;
  const y1 = Math.ceil((Math.max(ymin, ymax) / 1000) * height) + padPx;
  const x = Math.max(0, x0);
  const y = Math.max(0, y0);
  return { x, y, w: Math.min(width, x1) - x, h: Math.min(height, y1) - y };
}

/** Solid, opaque fill (no blur: blur/pixelation can be reversed or still read). */
export function drawSolidMasks(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  boxes: Box2D[],
  width: number,
  height: number,
  color = '#000',
) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = color;
  for (const b of boxes) {
    const r = box2dToPx(b, width, height, Math.round(0.01 * Math.max(width, height)));
    if (r.w > 0 && r.h > 0) ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}
