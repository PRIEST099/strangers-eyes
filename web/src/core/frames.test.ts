import { describe, expect, it } from 'vitest';
import framesVectors from '@vectors/frames.json';
import { clampMaxPx, deriveFrame, type DerivedFrameId, FRAME_JPEG_QUALITY, FRAME_MAX_PX, FRAME_MAX_PX_RANGE, masterFrame, snapCrop } from './frames';
import { frameToMaster, masterToFrame, regionOf } from './boxes';
import type { GridRegion, ImageFrame, PxRect } from './types';

// The canvas half (renderFrame, buildFrameJpeg) is tested on a recording canvas in frames.canvas.test.ts and with real
// pixels in the DEV selftest step 'frames' (AC-118).

describe('deriveFrame (ARCH §11.1, D-20, D-88)', () => {
  it('uses the RC defaults: nano768 ≤ 768, cloud ≤ 1536, export at master size; JPEG 0.85 / 0.85 / 0.92', () => {
    expect(deriveFrame('nano768', 2048, 1536)).toEqual({ id: 'nano768', width: 768, height: 576, cropInMaster: { x: 0, y: 0, w: 2048, h: 1536 } });
    expect(deriveFrame('cloud', 1536, 2048)).toEqual({ id: 'cloud', width: 1152, height: 1536, cropInMaster: { x: 0, y: 0, w: 1536, h: 2048 } });
    expect(deriveFrame('export', 2048, 1536)).toEqual({ id: 'export', width: 2048, height: 1536, cropInMaster: { x: 0, y: 0, w: 2048, h: 1536 } });
    expect(FRAME_MAX_PX).toEqual({ nano768: 768, cloud: 1536, export: Infinity });
    expect(FRAME_JPEG_QUALITY).toEqual({ nano768: 0.85, cloud: 0.85, export: 0.92 });
  });
  it('scales the CROP, not the master, and never upscales', () => {
    const f = deriveFrame('cloud', 2048, 1536, { crop: { x: 0, y: 536, w: 2048, h: 1000 } });
    expect(f).toEqual({ id: 'cloud', width: 1536, height: 750, cropInMaster: { x: 0, y: 536, w: 2048, h: 1000 } });
    expect(deriveFrame('cloud', 800, 600)).toMatchObject({ width: 800, height: 600 });
    expect(deriveFrame('cloud', 2048, 1536, { maxPx: 4096 })).toMatchObject({ width: 2048, height: 1536 });
  });
  it('keeps the longest side ≤ maxPx, each side ≥ 1 px and within 0.5 px of the exact scale, for any size', () => {
    for (const [W, H] of [[2048, 1], [1, 2048], [2047, 1023], [1999, 1201], [3, 2048], [2048, 2048], [1537, 1536]]) {
      for (const maxPx of [768, 1536, 2048]) {
        const f = deriveFrame('cloud', W, H, { maxPx });
        const s = Math.min(1, maxPx / Math.max(W, H));
        expect(Math.max(f.width, f.height)).toBeLessThanOrEqual(maxPx);
        expect(Math.min(f.width, f.height)).toBeGreaterThanOrEqual(1);
        expect(Math.abs(f.width - W * s)).toBeLessThanOrEqual(0.5 + (W * s < 1 ? 1 : 0));
        expect(Math.abs(f.height - H * s)).toBeLessThanOrEqual(0.5 + (H * s < 1 ? 1 : 0));
        expect(frameToMaster({ x: 0, y: 0, w: f.width, h: f.height }, f)).toEqual(f.cropInMaster); // corners map exactly
      }
    }
  });
  it('rejects a bad master size', () => {
    expect(() => deriveFrame('cloud', 0, 10)).toThrow('bad master size');
    expect(() => deriveFrame('cloud', 10.5, 10)).toThrow('bad master size');
    expect(() => deriveFrame('cloud', Number.NaN, 10)).toThrow('bad master size');
  });
  it('clamps a raw maxPx to a whole number in the frame range (D-98): never wider than intended', () => {
    expect(FRAME_MAX_PX_RANGE).toEqual({ nano768: [256, 768], cloud: [768, 2048], export: [1, 4096] });
    for (const id of ['nano768', 'cloud', 'export'] as const) {
      const [lo, hi] = FRAME_MAX_PX_RANGE[id];
      for (const raw of [0, -5, 1, 255.9, 767.99, 1536.6, 2048.4, 1e9]) {
        const v = clampMaxPx(id, raw);
        expect(Number.isInteger(v) && v >= lo && v <= hi && v <= Math.max(lo, raw), `${id} ${raw} → ${v}`).toBe(true);
      }
      for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, undefined, null, '1536']) expect(clampMaxPx(id, bad)).toBe(FRAME_MAX_PX[id]);
    }
    for (let i = 0; i < 500; i++) { // a frame never exceeds the floored RC value, whatever the master
      const raw = 768 + Math.random() * 1280, W = 1 + Math.floor(Math.random() * 2048), H = 1 + Math.floor(Math.random() * 2048);
      const f = deriveFrame('cloud', W, H, { maxPx: raw });
      expect(Math.max(f.width, f.height)).toBeLessThanOrEqual(Math.floor(raw));
    }
  });
  it('masterFrame is the identity frame', () => {
    expect(masterFrame(800, 600)).toEqual({ id: 'master', width: 800, height: 600, cropInMaster: { x: 0, y: 0, w: 800, h: 600 } });
  });
});

describe('snapCrop: whole pixels, inward, inside the master', () => {
  it('snaps a fractional crop inward, so it never keeps a sliver it was meant to remove', () => {
    expect(snapCrop({ x: 0.2, y: 99.5, w: 799.6, h: 400.7 }, 800, 600)).toEqual({ x: 1, y: 100, w: 798, h: 400 });
  });
  it('clamps to the master', () => {
    expect(snapCrop({ x: -10, y: -10, w: 2000, h: 2000 }, 800, 600)).toEqual({ x: 0, y: 0, w: 800, h: 600 });
  });
  it('fails closed on a malformed crop (D-97)', () => {
    for (const bad of [{ x: Number.NaN, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: -5, h: 10 }, { x: 0, y: 0, w: 10, h: Number.POSITIVE_INFINITY }, null]) {
      expect(() => snapCrop(bad as unknown as PxRect, 800, 600)).toThrow('malformed crop');
      expect(() => deriveFrame('cloud', 800, 600, { crop: bad as unknown as PxRect })).toThrow('malformed crop');
    }
  });
  it('throws when nothing is left', () => {
    expect(() => snapCrop({ x: 10.2, y: 0, w: 0.5, h: 600 }, 800, 600)).toThrow('nothing left');
    expect(() => snapCrop({ x: 900, y: 0, w: 10, h: 10 }, 800, 600)).toThrow('nothing left');
  });
  it('deriveFrame records the snapped crop, which is what renderFrame draws', () => {
    expect(deriveFrame('cloud', 800, 600, { crop: { x: 0, y: 99.5, w: 800, h: 500.5 } }).cropInMaster).toEqual({ x: 0, y: 100, w: 800, h: 500 });
  });
});

// ---------- shared/testvectors/frames.json (the iOS port runs the same file, AC-352) ----------

type Num = number | string;
const NON_FINITE: Readonly<Record<string, number>> = { NaN: Number.NaN, Infinity: Number.POSITIVE_INFINITY, '-Infinity': Number.NEGATIVE_INFINITY };
const num = (x: Num): number => (typeof x === 'number' ? x : Object.hasOwn(NON_FINITE, x) ? NON_FINITE[x] : Number.parseFloat('x'));
/** A rect whose fields may be spelled "NaN" etc. in the JSON. */
const vRect = (r: Record<'x' | 'y' | 'w' | 'h', Num>): PxRect => ({ x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h) });
type Throws = { throws: true };
type FCase =
  | { fn: 'clampMaxPx'; name: string; id: DerivedFrameId; raw: Num | null; expect: { maxPx: Num } }
  | { fn: 'snapCrop'; name: string; crop: Record<'x' | 'y' | 'w' | 'h', Num>; W: number; H: number; expect: { crop: PxRect } | Throws }
  | { fn: 'deriveFrame'; name: string; id: DerivedFrameId; W: number; H: number; maxPx?: Num; crop?: PxRect; expect: { frame: ImageFrame } | Throws }
  | { fn: 'frameToMaster' | 'masterToFrame'; name: string; rect: Record<'x' | 'y' | 'w' | 'h', Num>; frame: ImageFrame; expect: { rect: PxRect } | Throws }
  | { fn: 'regionOf'; name: string; rect: PxRect; W: number; H: number; expect: { region: GridRegion } };
const FV = framesVectors as unknown as { description: string; conventions: string[]; cases: FCase[] };
const FNS: readonly FCase['fn'][] = ['clampMaxPx', 'snapCrop', 'deriveFrame', 'frameToMaster', 'masterToFrame', 'regionOf'];
const throws = (e: object): e is Throws => 'throws' in e;

describe('frames.json (D-88, D-98, AC-118)', () => {
  it('is self-describing and covers every function it names', () => {
    expect(FV.description.length).toBeGreaterThan(0);
    for (const c of FV.cases) expect(FNS).toContain(c.fn);
    for (const fn of FNS) expect(FV.cases.filter((c) => c.fn === fn).length, fn).toBeGreaterThan(0);
  });
  for (const c of FV.cases) {
    it(`${c.fn}: ${c.name}`, () => {
      switch (c.fn) {
        case 'clampMaxPx': expect(clampMaxPx(c.id, c.raw === null ? undefined : num(c.raw))).toBe(num(c.expect.maxPx)); break;
        case 'snapCrop': {
          const run = () => snapCrop(vRect(c.crop), c.W, c.H);
          if (throws(c.expect)) expect(run).toThrow(); else expect(run()).toEqual(c.expect.crop);
          break;
        }
        case 'deriveFrame': {
          const run = () => deriveFrame(c.id, c.W, c.H, { maxPx: c.maxPx === undefined ? undefined : num(c.maxPx), crop: c.crop });
          if (throws(c.expect)) expect(run).toThrow(); else expect(run()).toEqual(c.expect.frame);
          break;
        }
        case 'frameToMaster':
        case 'masterToFrame': {
          const f = c.fn === 'frameToMaster' ? frameToMaster : masterToFrame;
          const run = () => f(vRect(c.rect), c.frame);
          if (throws(c.expect)) expect(run).toThrow(); else expect(run()).toEqual(c.expect.rect);
          break;
        }
        case 'regionOf': expect(regionOf(c.rect, c.W, c.H)).toBe(c.expect.region); break;
      }
    });
  }
});
