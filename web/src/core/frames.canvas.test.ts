// The egress image builder (renderFrame, buildFrameJpeg) and applyMasks on a RECORDING canvas: Node has no canvas, so
// document.createElement('canvas') is stubbed and toJpeg/assertCleanJpeg are mocked. Real pixels are sampled in the
// DEV selftest step 'frames' (AC-118); this file pins the ORDER and the ARGUMENTS of every canvas call (F-110, D-97).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PxRect } from './types';

const enc = vi.hoisted(() => ({ toJpeg: vi.fn(), assertCleanJpeg: vi.fn() }));
vi.mock('../tier0/decode', async (importOriginal) => ({ ...(await importOriginal<typeof import('../tier0/decode')>()), toJpeg: enc.toJpeg }));
vi.mock('../tier0/exif', () => ({ assertCleanJpeg: enc.assertCleanJpeg }));

const { buildFrameJpeg, deriveFrame, renderFrame } = await import('./frames');
const { applyMasks } = await import('./mask');

type Op =
  | { op: 'drawImage'; canvas: number; src: number; args: number[]; smoothing: string }
  | { op: 'fillRect'; canvas: number; args: number[]; alpha: number; composite: string; filter: string; style: string };

let log: Op[] = [];
let made: FakeCanvas[] = [];
let nextId = 1;

class FakeCanvas {
  readonly id = nextId++;
  width: number;
  height: number;
  private readonly ctx = {
    globalAlpha: 1, globalCompositeOperation: 'source-over', filter: 'none', fillStyle: '#123456', imageSmoothingQuality: 'low',
    stack: [] as Array<Record<string, unknown>>,
    save() { this.stack.push({ a: this.globalAlpha, o: this.globalCompositeOperation, f: this.filter, s: this.fillStyle }); },
    restore() {
      const s = this.stack.pop()!;
      Object.assign(this, { globalAlpha: s.a, globalCompositeOperation: s.o, filter: s.f, fillStyle: s.s });
    },
    fillRect: (...args: number[]) => {
      const c = this.ctx;
      log.push({ op: 'fillRect', canvas: this.id, args, alpha: c.globalAlpha, composite: c.globalCompositeOperation, filter: c.filter, style: c.fillStyle });
    },
    drawImage: (src: FakeCanvas, ...args: number[]) => {
      log.push({ op: 'drawImage', canvas: this.id, src: src.id, args, smoothing: this.ctx.imageSmoothingQuality });
    },
  };
  constructor(w = 300, h = 150) { this.width = w; this.height = h; }
  getContext(kind: string) { return kind === '2d' ? this.ctx : null; }
}

const asCanvas = (c: FakeCanvas) => c as unknown as HTMLCanvasElement;
const BLOB = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });

beforeEach(() => {
  log = [];
  made = [];
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected element ${tag}`);
      const c = new FakeCanvas();
      made.push(c);
      return c;
    },
  });
  enc.toJpeg.mockReset().mockResolvedValue(BLOB);
  enc.assertCleanJpeg.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllGlobals(); });

const W = 2000, H = 1200;
const target: PxRect = { x: 1400, y: 540, w: 350, h: 180 };
const other: PxRect = { x: 10.5, y: 900, w: 50, h: 50 };
const crop: PxRect = { x: 0, y: 150, w: 2000, h: 1050 };

describe('buildFrameJpeg: the cloud frame (master + masks + crop → JPEG 0.85 → assertCleanJpeg)', () => {
  it('paints every mask on a COPY of the master, then draws the crop from that copy only, then encodes it at 0.85', async () => {
    const master = new FakeCanvas(W, H);
    const { jpeg, frame } = await buildFrameJpeg('cloud', asCanvas(master), { masks: [target, other], crop });
    expect(frame).toEqual(deriveFrame('cloud', W, H, { crop }));
    expect(frame).toEqual({ id: 'cloud', width: 1536, height: 806, cropInMaster: crop });
    expect(jpeg).toBe(BLOB);

    const [copy, out] = made;
    expect(made).toHaveLength(2);
    expect(log.map((o) => `${o.op}@${o.canvas}`)).toEqual([`drawImage@${copy.id}`, `fillRect@${copy.id}`, `fillRect@${copy.id}`, `drawImage@${out.id}`]);
    // 1. the copy starts as the master
    expect(log[0]).toMatchObject({ op: 'drawImage', canvas: copy.id, src: master.id, args: [0, 0] });
    // 2. solid masks, master pixels, snapped outward, BEFORE anything is drawn into the output
    for (const f of log.slice(1, 3)) expect(f).toMatchObject({ alpha: 1, composite: 'source-over', filter: 'none', style: '#000' });
    expect(log[1].args).toEqual([1400, 540, 350, 180]);
    expect(log[2].args).toEqual([10, 900, 51, 50]);
    // 3. the output is drawn from the masked copy (never the master), exactly the crop into exactly the frame size
    expect(log[3]).toEqual({ op: 'drawImage', canvas: out.id, src: copy.id, args: [0, 150, 2000, 1050, 0, 0, 1536, 806], smoothing: 'high' });
    expect(log.filter((o) => o.op === 'drawImage' && o.src === master.id).every((o) => o.canvas === copy.id)).toBe(true);
    // 4. JPEG quality exactly 0.85 for the cloud, and the clean check runs on the very bytes returned
    expect(enc.toJpeg).toHaveBeenCalledTimes(1);
    expect(enc.toJpeg).toHaveBeenCalledWith(out, 0.85);
    expect(enc.assertCleanJpeg).toHaveBeenCalledWith(BLOB);
    // 5. both canvases are freed; the master is untouched
    expect([copy.width, out.width]).toEqual([0, 0]);
    expect([master.width, master.height]).toEqual([W, H]);
    expect(log.some((o) => o.canvas === master.id)).toBe(false);
  });

  it('export is the crop at master scale, JPEG 0.92', async () => {
    const master = new FakeCanvas(W, H);
    const { frame } = await buildFrameJpeg('export', asCanvas(master), { masks: [target], crop });
    expect(frame).toEqual({ id: 'export', width: 2000, height: 1050, cropInMaster: crop });
    expect(log.at(-1)).toMatchObject({ op: 'drawImage', src: made[0].id, args: [0, 150, 2000, 1050, 0, 0, 2000, 1050] });
    expect(enc.toJpeg).toHaveBeenCalledWith(made[1], 0.92);
  });

  it('nano768 (no masks) is drawn straight from the master, 768 px, JPEG 0.85', async () => {
    const master = new FakeCanvas(W, H);
    const { frame } = await buildFrameJpeg('nano768', asCanvas(master));
    expect(frame).toMatchObject({ width: 768, height: 461 });
    expect(made).toHaveLength(1);
    expect(log).toEqual([{ op: 'drawImage', canvas: made[0].id, src: master.id, args: [0, 0, W, H, 0, 0, 768, 461], smoothing: 'high' }]);
    expect(enc.toJpeg).toHaveBeenCalledWith(made[0], 0.85);
  });

  it('a raw RC size is clamped before rendering (1536.6 → 1536)', async () => {
    await buildFrameJpeg('cloud', asCanvas(new FakeCanvas(2048, 1536)), { maxPx: 1536.6 });
    expect(log.at(-1)?.args.slice(-2)).toEqual([1536, 1152]);
  });

  it('a rejected assertCleanJpeg yields no blob: it throws, and every canvas is freed', async () => {
    enc.assertCleanJpeg.mockRejectedValue(new Error('metadata present: segments=APP0,APP1 gps=false'));
    await expect(buildFrameJpeg('cloud', asCanvas(new FakeCanvas(W, H)), { masks: [target], crop })).rejects.toThrow('metadata present');
    expect(made.map((c) => c.width)).toEqual([0, 0]);
  });

  it('a failed encode throws and frees every canvas', async () => {
    enc.toJpeg.mockRejectedValue(new Error('toBlob returned null'));
    await expect(buildFrameJpeg('cloud', asCanvas(new FakeCanvas(W, H)), { masks: [target] })).rejects.toThrow('toBlob');
    expect(enc.assertCleanJpeg).not.toHaveBeenCalled();
    expect(made.map((c) => c.width)).toEqual([0, 0]);
  });
});

describe('fail closed on a malformed or unpainted mask (D-97)', () => {
  const MALFORMED: unknown[] = [
    { x: Number.NaN, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: -10, h: 10 }, { x: null, y: 0, w: 10, h: 10 },
    { x: 0, y: 0, w: Number.POSITIVE_INFINITY, h: 10 }, null,
  ];
  const UNPAINTED: PxRect[] = [{ x: 5000, y: 5000, w: 10, h: 10 }, { x: 100, y: 100, w: 0, h: 10 }, { x: -50, y: 10, w: 50, h: 10 }];

  it('buildFrameJpeg throws before encoding; nothing is drawn into an output; every canvas is freed', async () => {
    for (const bad of [...MALFORMED, ...UNPAINTED]) {
      log = []; made = []; enc.toJpeg.mockClear();
      await expect(buildFrameJpeg('cloud', asCanvas(new FakeCanvas(W, H)), { masks: [target, bad as PxRect] }), JSON.stringify(bad)).rejects.toThrow(/malformed mask|painted nothing/);
      expect(enc.toJpeg).not.toHaveBeenCalled();
      expect(made.every((c) => c.width === 0)).toBe(true);
      expect(log.some((o) => o.op === 'drawImage' && o.args.length === 8)).toBe(false);
    }
  });

  it('renderFrame refuses a frame that is not whole pixels, has a negative origin, or lies outside the master', () => {
    const master = asCanvas(new FakeCanvas(W, H));
    const f = deriveFrame('cloud', W, H);
    expect(() => renderFrame(master, { ...f, cropInMaster: { ...f.cropInMaster, x: 0.5, w: 1999 } })).toThrow('whole pixels');
    expect(() => renderFrame(master, { ...f, width: 1536.5 })).toThrow('whole pixels');
    expect(() => renderFrame(master, { ...f, cropInMaster: { ...f.cropInMaster, x: -1 } })).toThrow('invalid ImageFrame');
    expect(() => renderFrame(master, { ...f, cropInMaster: { x: 0, y: 1, w: W, h: H } })).toThrow('outside');
    expect(made).toHaveLength(0);
  });

  it('applyMasks (export/spike path) also throws on a malformed or unpainted mask and frees its copy', () => {
    const master = asCanvas(new FakeCanvas(W, H));
    for (const bad of [...MALFORMED, ...UNPAINTED]) {
      made = [];
      expect(() => applyMasks(master, [target, bad as PxRect]), JSON.stringify(bad)).toThrow(/malformed mask|painted nothing/);
      expect(made.every((c) => c.width === 0)).toBe(true);
    }
    made = []; log = [];
    const ok = applyMasks(master, [target]) as unknown as FakeCanvas;
    expect(ok.width).toBe(W);
    expect(log.map((o) => o.op)).toEqual(['drawImage', 'fillRect']);
    made = []; log = [];
    const cropped = applyMasks(master, [target], crop) as unknown as FakeCanvas;
    expect([cropped.width, cropped.height]).toEqual([2000, 1050]);
    expect(log.at(-1)).toMatchObject({ op: 'drawImage', canvas: cropped.id, src: made[0].id, args: [0, 150, 2000, 1050, 0, 0, 2000, 1050] });
    expect(made[0].width).toBe(0); // the full-size masked copy is freed
    made = [];
    for (const bad of MALFORMED.filter((b) => b !== null)) {
      expect(() => applyMasks(master, [target], bad as PxRect), JSON.stringify(bad)).toThrow('malformed crop');
    }
    expect(made).toHaveLength(0); // validated before anything is allocated
  });
});
