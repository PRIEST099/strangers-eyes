import { describe, expect, it } from 'vitest';
import { box2dToPx, clampRect, cloudToMaster, gridCellRect, iou, minimalCrop, padRect, regionOf, union } from './boxes';
import { REGIONS, type ImageFrame } from './types';

describe('box2dToPx (Gemini [ymin, xmin, ymax, xmax] on 0..1000)', () => {
  it('matches the ARCH §11.5 / AC-192 vector', () => {
    expect(box2dToPx([100, 250, 500, 750], 800, 600)).toEqual({ x: 200, y: 60, w: 400, h: 240 });
  });
  it('fixes swapped corners', () => {
    expect(box2dToPx([500, 750, 100, 250], 800, 600)).toEqual({ x: 200, y: 60, w: 400, h: 240 });
  });
  it('clamps out-of-range and non-finite values', () => {
    expect(box2dToPx([-50, -50, 2000, 2000], 800, 600)).toEqual({ x: 0, y: 0, w: 800, h: 600 });
    expect(box2dToPx([Number.NaN, 0, 1000, 1000], 100, 100)).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
  it('rounds outward so masks never under-cover', () => {
    const r = box2dToPx([1, 1, 2, 2], 333, 333);
    expect(r.x).toBe(0);
    expect(r.x + r.w).toBeGreaterThanOrEqual(1);
  });
});

describe('padRect', () => {
  it('adds 7.5% per side, at least 4 px, clamped to the frame', () => {
    expect(padRect({ x: 100, y: 100, w: 200, h: 100 }, 1000, 1000)).toEqual({ x: 85, y: 92, w: 230, h: 116 });
    expect(padRect({ x: 0, y: 0, w: 10, h: 10 }, 1000, 1000)).toEqual({ x: 0, y: 0, w: 14, h: 14 });
  });
});

describe('gridCellRect / regionOf', () => {
  it('tiles the frame exactly with 9 cells', () => {
    const W = 1001, H = 667;
    const cells = REGIONS.map((r) => gridCellRect(r, W, H));
    expect(cells.reduce((a, c) => a + c.w * c.h, 0)).toBe(W * H);
  });
  it('round-trips each cell centre', () => {
    for (const r of REGIONS) expect(regionOf(gridCellRect(r, 900, 600), 900, 600)).toBe(r);
  });
});

describe('cloudToMaster', () => {
  it('maps a 1536-px cloud frame of a cropped master back to master pixels', () => {
    const frame: ImageFrame = { id: 'cloud', width: 1536, height: 768, cropInMaster: { x: 0, y: 100, w: 2048, h: 1024 } };
    const m = cloudToMaster({ x: 768, y: 384, w: 15, h: 15 }, frame);
    expect(m).toEqual({ x: 1024, y: 612, w: 20, h: 20 });
  });
});

describe('iou / union / clampRect', () => {
  it('computes IoU', () => {
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(1);
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 5, h: 5 })).toBe(0);
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 0, w: 10, h: 10 })).toBeCloseTo(50 / 150);
  });
  it('unions rects', () => {
    expect(union([{ x: 0, y: 0, w: 1, h: 1 }, { x: 5, y: 5, w: 1, h: 1 }])).toEqual({ x: 0, y: 0, w: 6, h: 6 });
    expect(union([])).toBeNull();
  });
  it('clamps', () => {
    expect(clampRect({ x: -5, y: -5, w: 10, h: 10 }, 100, 100)).toEqual({ x: 0, y: 0, w: 5, h: 5 });
    expect(clampRect({ x: 200, y: 0, w: 10, h: 10 }, 100, 100).w).toBe(0);
  });
});

describe('minimalCrop (D-35)', () => {
  const W = 1000, H = 800;
  it('crops the minimum from the top', () => {
    const r = minimalCrop('top', [{ x: 10, y: 0, w: 50, h: 100 }, { x: 600, y: 50, w: 20, h: 150 }], W, H);
    expect(r).toEqual({ ok: true, side: 'top', px: 200, rect: { x: 0, y: 200, w: W, h: H - 200 } });
  });
  it('crops from the right', () => {
    const r = minimalCrop('right', [{ x: 900, y: 10, w: 50, h: 10 }], W, H);
    expect(r.ok && r.px).toBe(100);
  });
  it('refuses more than 40% of the dimension', () => {
    expect(minimalCrop('bottom', [{ x: 0, y: 400, w: 10, h: 10 }], W, H)).toEqual({ ok: false, reason: 'too_much' });
    expect(minimalCrop('left', [{ x: 390, y: 0, w: 10, h: 10 }], W, H).ok).toBe(true); // exactly 40%
  });
  it('needs boxes', () => {
    expect(minimalCrop('top', [], W, H)).toEqual({ ok: false, reason: 'no_boxes' });
  });
});
