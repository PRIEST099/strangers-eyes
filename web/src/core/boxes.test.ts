import { describe, expect, it } from 'vitest';
import box2dVectors from '@vectors/box2d.json';
import cropVectors from '@vectors/crop.json';
import {
  area, assertFrame, assertRect, bestCrop, box2dToMaster, box2dToPx, clampPadRatio, clampRect, cloudToMaster, type CropResult, DEFAULT_MASK_PAD_RATIO,
  frameToMaster, gridCellRect, intersect, iou, MAX_CROP_RATIO, masterToBox2d, masterToFrame, MIN_PAD_PX, minimalCrop, padRect,
  preferOcrBoxes, regionOf, roundOut, union,
} from './boxes';
import { deriveFrame } from './frames';
import { REGIONS, type Box2D, type CropSide, type GridRegion, type ImageFrame, type PxRect } from './types';

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

// ---------- shared/testvectors/box2d.json and crop.json (AC-192, AC-196; the iOS port runs the same files, AC-352) ----------

type Num = number | string; // JSON has no NaN/Infinity: the vectors spell them as strings
const NON_FINITE: Readonly<Record<string, number>> = { NaN: Number.NaN, Infinity: Number.POSITIVE_INFINITY, '-Infinity': Number.NEGATIVE_INFINITY };
function num(x: Num): number {
  if (typeof x === 'number') return x;
  if (Object.hasOwn(NON_FINITE, x)) return NON_FINITE[x];
  throw new Error(`vector: "${x}" is not a number or NaN/Infinity/-Infinity`);
}
const vBox = (b: Num[]) => b.map(num) as Box2D;
type VRect = Record<'x' | 'y' | 'w' | 'h', Num>;
const vRect = (r: VRect): PxRect => ({ x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h) });
type Throws = { throws: true };
const isThrows = (e: object): e is Throws => 'throws' in e;

type BoxCase =
  | { fn: 'box2dToPx'; name: string; box: Num[]; W: number; H: number; expect: { rect: PxRect } }
  | { fn: 'box2dToMaster'; name: string; box: Num[]; frame: ImageFrame; expect: { rect: PxRect | null } }
  | { fn: 'cloudToMaster'; name: string; rect: PxRect; frame: ImageFrame; expect: { rect: PxRect } }
  | { fn: 'masterToBox2d'; name: string; rect: PxRect; frame: ImageFrame; expect: { box: Box2D } }
  | { fn: 'padRect'; name: string; rect: VRect; W: number; H: number; ratio?: Num; expect: { rect: PxRect } | Throws }
  | { fn: 'gridCellRect'; name: string; region: GridRegion; W: number; H: number; expect: { rect: PxRect } };
type CropCase =
  | { fn: 'minimalCrop'; name: string; side: Exclude<CropSide, 'none'>; boxes: VRect[]; W: number; H: number; expect: CropResult | Throws }
  | { fn: 'bestCrop'; name: string; boxes: VRect[]; W: number; H: number; expect: CropResult | Throws };

const BV = box2dVectors as unknown as { description: string; conventions: string[]; cases: BoxCase[] };
const CV = cropVectors as unknown as { description: string; conventions: string[]; cases: CropCase[] };
const BOX_FNS: readonly BoxCase['fn'][] = ['box2dToPx', 'box2dToMaster', 'cloudToMaster', 'masterToBox2d', 'padRect', 'gridCellRect'];
const CROP_FNS: readonly CropCase['fn'][] = ['minimalCrop', 'bestCrop'];

describe('box2d.json (AC-192, AC-113 padding, AC-118 frames)', () => {
  it('is self-describing and covers every function it names', () => {
    expect(BV.description.length).toBeGreaterThan(0);
    for (const c of BV.cases) expect(BOX_FNS).toContain(c.fn);
    for (const fn of BOX_FNS) expect(BV.cases.filter((c) => c.fn === fn).length, fn).toBeGreaterThan(0);
    expect(BV.cases.some((c) => c.fn === 'box2dToPx' && c.name.startsWith('AC-192'))).toBe(true);
  });
  for (const c of BV.cases) {
    it(`${c.fn}: ${c.name}`, () => {
      switch (c.fn) {
        case 'box2dToPx': expect(box2dToPx(vBox(c.box), c.W, c.H)).toEqual(c.expect.rect); break;
        case 'box2dToMaster': expect(box2dToMaster(vBox(c.box), c.frame)).toEqual(c.expect.rect); break;
        case 'cloudToMaster': expect(cloudToMaster(c.rect, c.frame)).toEqual(c.expect.rect); break;
        case 'masterToBox2d': expect(masterToBox2d(c.rect, c.frame)).toEqual(c.expect.box); break;
        case 'padRect': {
          const run = () => (c.ratio === undefined ? padRect(vRect(c.rect), c.W, c.H) : padRect(vRect(c.rect), c.W, c.H, num(c.ratio)));
          if (isThrows(c.expect)) expect(run).toThrow('malformed'); else expect(run()).toEqual(c.expect.rect);
          break;
        }
        case 'gridCellRect': expect(gridCellRect(c.region, c.W, c.H)).toEqual(c.expect.rect); break;
      }
    });
  }
});

describe('crop.json (AC-196, D-35)', () => {
  it('is self-describing, covers both functions and has the rules-plan cases', () => {
    expect(CV.description.length).toBeGreaterThan(0);
    for (const c of CV.cases) expect(CROP_FNS).toContain(c.fn);
    for (const fn of CROP_FNS) expect(CV.cases.filter((c) => c.fn === fn).length, fn).toBeGreaterThan(0);
    expect(CV.cases.filter((c) => c.name.includes('rules plan')).length).toBeGreaterThanOrEqual(2);
  });
  for (const c of CV.cases) {
    it(`${c.fn}: ${c.name}`, () => {
      const boxes = c.boxes.map(vRect);
      const run = () => (c.fn === 'minimalCrop' ? minimalCrop(c.side, boxes, c.W, c.H) : bestCrop(boxes, c.W, c.H));
      if (isThrows(c.expect)) expect(run).toThrow('malformed crop box'); else expect(run()).toEqual(c.expect);
    });
  }
});

// ---------- properties (seeded, so a failure reproduces) ----------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0x5e59);
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1)); // inclusive
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const contains = (outer: PxRect, inner: PxRect) =>
  outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.w >= inner.x + inner.w && outer.y + outer.h >= inner.y + inner.h;
const isWhole = (r: PxRect) => [r.x, r.y, r.w, r.h].every(Number.isInteger);
const SIDES = ['top', 'bottom', 'left', 'right'] as const;
const SIZES: ReadonlyArray<[number, number]> = [[2048, 1536], [1536, 2048], [2048, 2048], [1999, 1201], [2047, 1023], [2048, 37], [41, 2048], [800, 600], [3, 5]];

/** A random master, a crop from one side of up to 40% (or none) and a derived cloud frame of it. */
function randomFrame(): { W: number; H: number; frame: ImageFrame; side: CropSide } {
  const [W, H] = rand() < 0.5 ? pick(SIZES) : [int(1, 2048), int(1, 2048)];
  const side = pick(['none', ...SIDES] as const);
  const cut = (dim: number) => Math.floor(rand() * MAX_CROP_RATIO * dim);
  const crop: PxRect = side === 'top' ? { x: 0, y: cut(H), w: W, h: H } : side === 'bottom' ? { x: 0, y: 0, w: W, h: H - cut(H) }
    : side === 'left' ? { x: cut(W), y: 0, w: W, h: H } : side === 'right' ? { x: 0, y: 0, w: W - cut(W), h: H } : { x: 0, y: 0, w: W, h: H };
  if (side === 'top' || side === 'left') { crop.w = W - crop.x; crop.h = H - crop.y; }
  return { W, H, side, frame: deriveFrame('cloud', W, H, { maxPx: pick([768, 1536, 2048, 4096]), crop }) };
}
/** A random whole-pixel box inside the rect. */
function randomBoxIn(c: PxRect): PxRect {
  const x0 = int(c.x, c.x + c.w - 1);
  const y0 = int(c.y, c.y + c.h - 1);
  return { x: x0, y: y0, w: int(1, c.x + c.w - x0), h: int(1, c.y + c.h - y0) };
}
/** What Gemini answers for a master box: [ymin, xmin, ymax, xmax] of the image as sent, rounded to the NEAREST integer
 * (not outward), and never zero-area (parse drops those). */
function geminiBox(r: PxRect, f: ImageFrame): Box2D {
  const c = f.cropInMaster;
  const ny = (v: number) => Math.round(((v - c.y) * 1000) / c.h);
  const nx = (v: number) => Math.round(((v - c.x) * 1000) / c.w);
  let [y0, x0, y1, x1] = [ny(r.y), nx(r.x), ny(r.y + r.h), nx(r.x + r.w)];
  if (y1 === y0) { if (y1 < 1000) y1++; else y0--; }
  if (x1 === x0) { if (x1 < 1000) x1++; else x0--; }
  return [y0, x0, y1, x1];
}

describe('round trips (master → frame → box_2d → master), any aspect ratio, crop on each side', () => {
  it('a Gemini box (nearest rounding) maps back within tolerance, and the padded mask covers the target', () => {
    const seen = new Set<CropSide>();
    for (let i = 0; i < 4000; i++) {
      const { W, H, frame, side } = randomFrame();
      seen.add(side);
      const c = frame.cropInMaster;
      const R = randomBoxIn(c);
      const M = box2dToMaster(geminiBox(R, frame), frame);
      expect(M, JSON.stringify({ W, H, frame, R })).not.toBeNull();
      const m = M!;
      // nearest rounding is off by ≤ 0.5 unit (1 unit for a widened zero-area box), outward rounding adds ≤ 1 px
      const tx = c.w / 1000 + 1, ty = c.h / 1000 + 1;
      const ctx = JSON.stringify({ W, H, frame, R, m });
      expect(Math.abs(m.x - R.x), ctx).toBeLessThanOrEqual(tx);
      expect(Math.abs(m.x + m.w - (R.x + R.w)), ctx).toBeLessThanOrEqual(tx);
      expect(Math.abs(m.y - R.y), ctx).toBeLessThanOrEqual(ty);
      expect(Math.abs(m.y + m.h - (R.y + R.h)), ctx).toBeLessThanOrEqual(ty);
      expect(isWhole(m) && contains(roundOut(c), m), ctx).toBe(true);
      expect(contains(padRect(m, W, H), R), ctx).toBe(true); // padding (≥ 4 px) absorbs the ≤ 3.05 px mapping error
    }
    expect([...seen].sort()).toEqual(['bottom', 'left', 'none', 'right', 'top']);
  });

  it('outward both ways (masterToBox2d → box2dToMaster) never shrinks the box', () => {
    for (let i = 0; i < 4000; i++) {
      const { frame } = randomFrame();
      const c = frame.cropInMaster;
      const R = randomBoxIn(c);
      const M = box2dToMaster(masterToBox2d(R, frame), frame)!;
      const ctx = JSON.stringify({ frame, R, M });
      expect(contains(M, R), ctx).toBe(true);
      expect(M.w - R.w, ctx).toBeLessThanOrEqual((2 * c.w) / 1000 + 2);
      expect(M.h - R.h, ctx).toBeLessThanOrEqual((2 * c.h) / 1000 + 2);
    }
  });

  it('frame pixels (faces or OCR found in the outgoing JPEG) map back to master pixels that cover the box', () => {
    for (let i = 0; i < 4000; i++) {
      const { frame } = randomFrame();
      const R = randomBoxIn(frame.cropInMaster);
      const F = masterToFrame(R, frame);
      expect(area(F)).toBeGreaterThan(0);
      expect(contains({ x: 0, y: 0, w: frame.width, h: frame.height }, F)).toBe(true);
      const back = frameToMaster(F, frame);
      expect(isWhole(back) && contains(back, R), JSON.stringify({ frame, R, F, back })).toBe(true);
    }
  });

  it('a box the crop removed has no area in the frame', () => {
    const frame = deriveFrame('cloud', 2000, 1200, { crop: { x: 0, y: 150, w: 2000, h: 1050 } });
    expect(area(masterToFrame({ x: 100, y: 0, w: 400, h: 150 }, frame))).toBe(0);
  });
});

describe('outward rounding and clamping', () => {
  it('roundOut never shrinks and adds less than one pixel per edge', () => {
    for (let i = 0; i < 2000; i++) {
      const r = { x: rand() * 1000 - 100, y: rand() * 1000 - 100, w: rand() * 500, h: rand() * 500 };
      const o = roundOut(r);
      expect(isWhole(o) && contains(o, r)).toBe(true);
      expect(o.w - r.w).toBeLessThan(2);
      expect(o.h - r.h).toBeLessThan(2);
    }
  });
  it('box2dToPx covers the exact box, adds < 1 px per edge, and stays inside the image', () => {
    for (let i = 0; i < 4000; i++) {
      const W = int(1, 2048), H = int(1, 2048);
      const b: Box2D = [rand() * 1400 - 200, rand() * 1400 - 200, rand() * 1400 - 200, rand() * 1400 - 200];
      const r = box2dToPx(b, W, H);
      const cl = b.map((v) => Math.max(0, Math.min(1000, v)));
      const exact = { x: (Math.min(cl[1], cl[3]) * W) / 1000, y: (Math.min(cl[0], cl[2]) * H) / 1000, x1: (Math.max(cl[1], cl[3]) * W) / 1000, y1: (Math.max(cl[0], cl[2]) * H) / 1000 };
      const ctx = JSON.stringify({ W, H, b, r });
      expect(isWhole(r) && contains({ x: 0, y: 0, w: W, h: H }, r), ctx).toBe(true);
      expect(r.x <= exact.x && r.y <= exact.y && r.x + r.w >= exact.x1 && r.y + r.h >= exact.y1, ctx).toBe(true);
      expect(exact.x - r.x < 1 && exact.y - r.y < 1 && r.x + r.w - exact.x1 < 1 && r.y + r.h - exact.y1 < 1, ctx).toBe(true);
    }
  });
  it('padRect pads at least max(4 px, 7.5%) per side unless the frame edge clamps it, and stays inside the frame', () => {
    for (let i = 0; i < 4000; i++) {
      const W = int(8, 2048), H = int(8, 2048);
      const r = randomBoxIn({ x: 0, y: 0, w: W, h: H });
      const p = padRect(r, W, H);
      const ctx = JSON.stringify({ W, H, r, p });
      const px = Math.max(MIN_PAD_PX, (r.w * DEFAULT_MASK_PAD_RATIO) / 2);
      const py = Math.max(MIN_PAD_PX, (r.h * DEFAULT_MASK_PAD_RATIO) / 2);
      expect(isWhole(p) && contains({ x: 0, y: 0, w: W, h: H }, p) && contains(p, r), ctx).toBe(true);
      expect(p.x <= Math.max(0, r.x - px) && p.y <= Math.max(0, r.y - py), ctx).toBe(true);
      expect(p.x + p.w >= Math.min(W, r.x + r.w + px) && p.y + p.h >= Math.min(H, r.y + r.h + py), ctx).toBe(true);
    }
  });
  it('clampPadRatio follows the RC clamp (0–0.5, default 0.15)', () => {
    expect(clampPadRatio(0.2)).toBe(0.2);
    expect(clampPadRatio(0.7)).toBe(0.5);
    expect(clampPadRatio(-0.1)).toBe(0);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, undefined, null, '0.3', {}]) expect(clampPadRatio(bad)).toBe(DEFAULT_MASK_PAD_RATIO);
  });
  it('mapping functions refuse a degenerate frame instead of returning Infinity', () => {
    const bad: ImageFrame = { id: 'cloud', width: 0, height: 10, cropInMaster: { x: 0, y: 0, w: 10, h: 10 } };
    expect(() => box2dToMaster([0, 0, 10, 10], bad)).toThrow('invalid ImageFrame');
    expect(() => frameToMaster({ x: 0, y: 0, w: 1, h: 1 }, bad)).toThrow('invalid ImageFrame');
    expect(() => masterToFrame({ x: 0, y: 0, w: 1, h: 1 }, bad)).toThrow('invalid ImageFrame');
    expect(() => masterToBox2d({ x: 0, y: 0, w: 1, h: 1 }, bad)).toThrow('invalid ImageFrame');
  });
});

describe('anisotropic downscale: width and height are rounded separately (D-88)', () => {
  const frame = deriveFrame('cloud', 2047, 1023); // scale 1536/2047: 1023 → 767.6 → 768, so sx ≠ sy
  it('derives 1536×768 with different x and y scales', () => {
    expect(frame).toEqual({ id: 'cloud', width: 1536, height: 768, cropInMaster: { x: 0, y: 0, w: 2047, h: 1023 } });
    expect(2047 / 1536).not.toBeCloseTo(1023 / 768, 4);
  });
  it('the full frame maps exactly onto the crop, and the bottom row onto the bottom row', () => {
    expect(frameToMaster({ x: 0, y: 0, w: 1536, h: 768 }, frame)).toEqual(frame.cropInMaster);
    expect(masterToFrame({ x: 0, y: 1022, w: 2047, h: 1 }, frame)).toEqual({ x: 0, y: 767, w: 1536, h: 1 });
    expect(frameToMaster({ x: 0, y: 767, w: 1536, h: 1 }, frame)).toEqual({ x: 0, y: 1021, w: 2047, h: 2 });
  });
});

describe('minimalCrop / bestCrop properties (D-35, D-89)', () => {
  it('a crop never exceeds 40%, removes every box, and is minimal', () => {
    for (let i = 0; i < 3000; i++) {
      const W = int(10, 2048), H = int(10, 2048);
      const boxes = Array.from({ length: int(1, 4) }, () => randomBoxIn({ x: 0, y: 0, w: W, h: H }));
      for (const side of SIDES) {
        const r = minimalCrop(side, boxes, W, H);
        const dim = side === 'top' || side === 'bottom' ? H : W;
        const need = side === 'top' ? Math.max(...boxes.map((b) => b.y + b.h)) : side === 'bottom' ? H - Math.min(...boxes.map((b) => b.y))
          : side === 'left' ? Math.max(...boxes.map((b) => b.x + b.w)) : W - Math.min(...boxes.map((b) => b.x));
        const ctx = JSON.stringify({ W, H, boxes, side, r });
        if (!r.ok) { expect(r.reason, ctx).toBe('too_much'); expect(need, ctx).toBeGreaterThan(MAX_CROP_RATIO * dim); continue; }
        expect(r.px, ctx).toBeLessThanOrEqual(MAX_CROP_RATIO * dim);
        expect(r.px, ctx).toBe(need);
        expect(boxes.every((b) => area(intersect(b, r.rect)) === 0), ctx).toBe(true);
        // one pixel less would keep part of some box
        const grown: PxRect = side === 'top' ? { ...r.rect, y: r.rect.y - 1, h: r.rect.h + 1 } : side === 'bottom' ? { ...r.rect, h: r.rect.h + 1 }
          : side === 'left' ? { ...r.rect, x: r.rect.x - 1, w: r.rect.w + 1 } : { ...r.rect, w: r.rect.w + 1 };
        expect(boxes.some((b) => area(intersect(b, grown)) > 0), ctx).toBe(true);
        expect(r.rect.w * r.rect.h, ctx).toBe(side === 'top' || side === 'bottom' ? W * (H - r.px) : (W - r.px) * H);
      }
      const best = bestCrop(boxes, W, H);
      const oks = SIDES.map((s) => minimalCrop(s, boxes, W, H)).filter((r): r is Extract<CropResult, { ok: true }> => r.ok);
      const share = (r: Extract<CropResult, { ok: true }>) => r.px / (r.side === 'top' || r.side === 'bottom' ? H : W);
      if (!oks.length) expect(best).toEqual({ ok: false, reason: 'too_much' });
      else expect(best.ok && share(best)).toBe(Math.min(...oks.map(share)));
    }
  });
});

describe('preferOcrBoxes (SPEC SCR-11: the OCR union replaces an overlapping pass-B box)', () => {
  const sign = { x: 90, y: 90, w: 520, h: 70 }; // pass B's loose box around "CITY GENERAL HOSPITAL"
  const words = [{ x: 100, y: 100, w: 120, h: 40 }, { x: 230, y: 100, w: 180, h: 40 }, { x: 420, y: 100, w: 180, h: 40 }];
  it('uses the union of the touching OCR words when its IoU with the pass-B box is > 0.3', () => {
    expect(preferOcrBoxes(sign, words)).toEqual({ box: { x: 100, y: 100, w: 500, h: 40 }, source: 'ocr' });
  });
  it('ignores a same-text word elsewhere in the photo', () => {
    expect(preferOcrBoxes(sign, [...words, { x: 1500, y: 900, w: 100, h: 40 }]).box).toEqual({ x: 100, y: 100, w: 500, h: 40 });
  });
  it('keeps the pass-B box when the overlap is small, exactly 0.3, or there are no words', () => {
    expect(preferOcrBoxes(sign, [{ x: 100, y: 100, w: 50, h: 40 }]).source).toBe('cloud');
    const a = { x: 0, y: 0, w: 100, h: 100 };
    const b = { x: 0, y: 0, w: 30, h: 100 }; // IoU exactly 0.3
    expect(iou(a, b)).toBeCloseTo(0.3, 12);
    expect(preferOcrBoxes(a, [b])).toEqual({ box: a, source: 'cloud' });
    expect(preferOcrBoxes(a, [{ x: 0, y: 0, w: 31, h: 100 }]).source).toBe('ocr');
    expect(preferOcrBoxes(sign, [])).toEqual({ box: sign, source: 'cloud' });
  });
});

describe('fail closed on malformed input (D-97)', () => {
  const BAD: unknown[] = [
    { x: Number.NaN, y: 0, w: 10, h: 10 }, { x: 0, y: Number.POSITIVE_INFINITY, w: 10, h: 10 }, { x: 0, y: 0, w: -1, h: 10 },
    { x: 0, y: 0, w: 10, h: -0.5 }, { x: null, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10 }, { x: '5', y: 0, w: 10, h: 10 }, null, undefined,
  ];
  const frame: ImageFrame = { id: 'cloud', width: 100, height: 100, cropInMaster: { x: 0, y: 0, w: 200, h: 200 } };
  const ok: PxRect = { x: 10, y: 10, w: 20, h: 20 };
  it('assertRect accepts finite rects with w, h ≥ 0 (zero area included) and rejects everything else', () => {
    expect(() => assertRect({ x: -5, y: 2.5, w: 0, h: 0 })).not.toThrow();
    for (const b of BAD) expect(() => assertRect(b), JSON.stringify(b)).toThrow('malformed');
  });
  it('padRect, minimalCrop, bestCrop, frameToMaster, masterToFrame, masterToBox2d and preferOcrBoxes all throw', () => {
    for (const b of BAD) {
      const r = b as PxRect;
      const tag = JSON.stringify(b) ?? 'undefined';
      expect(() => padRect(r, 100, 100), tag).toThrow('malformed');
      expect(() => minimalCrop('top', [ok, r], 100, 100), tag).toThrow('malformed');
      expect(() => bestCrop([ok, r], 100, 100), tag).toThrow('malformed');
      expect(() => frameToMaster(r, frame), tag).toThrow('malformed');
      expect(() => masterToFrame(r, frame), tag).toThrow('malformed');
      expect(() => masterToBox2d(r, frame), tag).toThrow('malformed');
      expect(() => preferOcrBoxes(r, [ok]), tag).toThrow('malformed');
      expect(() => preferOcrBoxes(ok, [ok, r]), tag).toThrow('malformed');
    }
  });
  it('a zero-area crop box is valid and simply removes nothing', () => {
    expect(minimalCrop('top', [{ x: 0, y: 0, w: 0, h: 50 }], 100, 100)).toEqual({ ok: false, reason: 'no_boxes' });
  });
  it('bad image sizes throw', () => {
    for (const [W, H] of [[0, 10], [10, Number.NaN], [Number.POSITIVE_INFINITY, 10], [-1, 10]]) {
      expect(() => padRect(ok, W, H)).toThrow('bad');
      expect(() => minimalCrop('top', [ok], W, H)).toThrow('bad');
      expect(() => bestCrop([ok], W, H)).toThrow('bad');
    }
  });
  it('assertFrame pins a finite positive size and a crop at x, y ≥ 0', () => {
    const f = (o: Partial<ImageFrame> & { crop?: Partial<PxRect> }): ImageFrame =>
      ({ id: 'cloud', width: o.width ?? 100, height: o.height ?? 100, cropInMaster: { x: 0, y: 0, w: 100, h: 100, ...o.crop } });
    expect(() => assertFrame(f({}))).not.toThrow();
    for (const bad of [f({ crop: { x: -1 } }), f({ crop: { y: -0.5 } }), f({ width: Number.POSITIVE_INFINITY }), f({ height: Number.NaN }),
      f({ crop: { w: 0 } }), f({ crop: { h: Number.POSITIVE_INFINITY } }), f({ crop: { x: Number.NaN } })]) {
      expect(() => assertFrame(bad), JSON.stringify(bad)).toThrow('invalid ImageFrame');
      expect(() => box2dToMaster([0, 0, 10, 10], bad)).toThrow('invalid ImageFrame');
    }
  });
});
