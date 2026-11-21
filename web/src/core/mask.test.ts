import { describe, expect, it } from 'vitest';
import { fillSolid, MASK_COLOR } from './mask';

// fillSolid is checked against a recording 2D context (Node has no canvas). The real pixels ([0,0,0,255] inside a
// mask, untouched outside) are sampled in the DEV selftest steps 'masks' and 'frames' (AC-113, AC-118).

interface Fill { x: number; y: number; w: number; h: number; alpha: number; op: string; filter: string; style: string }
function recorder(init: Partial<Record<'globalAlpha' | 'globalCompositeOperation' | 'filter' | 'fillStyle', unknown>> = {}) {
  const fills: Fill[] = [];
  const stack: unknown[] = [];
  const ctx = {
    globalAlpha: 0.3, globalCompositeOperation: 'multiply', filter: 'blur(8px)', fillStyle: '#f00', ...init,
    save() { stack.push({ a: ctx.globalAlpha, o: ctx.globalCompositeOperation, f: ctx.filter, s: ctx.fillStyle }); },
    restore() {
      const s = stack.pop() as { a: number; o: string; f: string; s: string };
      Object.assign(ctx, { globalAlpha: s.a, globalCompositeOperation: s.o, filter: s.f, fillStyle: s.s });
    },
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ x, y, w, h, alpha: ctx.globalAlpha as number, op: ctx.globalCompositeOperation as string, filter: ctx.filter as string, style: ctx.fillStyle as string });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, raw: ctx, fills, depth: () => stack.length };
}

describe('fillSolid (ARCH §11.6, invariant 6: solid fills, never blur)', () => {
  it('fills opaque #000 with source-over and no filter, whatever state the context was in, then restores it', () => {
    const r = recorder();
    expect(fillSolid(r.ctx, [{ x: 10, y: 10, w: 20, h: 20 }], 100, 100)).toBe(1);
    expect(r.fills).toEqual([{ x: 10, y: 10, w: 20, h: 20, alpha: 1, op: 'source-over', filter: 'none', style: MASK_COLOR }]);
    expect(MASK_COLOR).toBe('#000');
    expect(r.depth()).toBe(0);
    expect([r.raw.globalAlpha, r.raw.globalCompositeOperation, r.raw.filter]).toEqual([0.3, 'multiply', 'blur(8px)']);
  });
  it('snaps outward to whole pixels so no anti-aliased edge leaks content', () => {
    const r = recorder();
    // near edges 10.6 / 5.6 (round → 11 / 6 would lose a column and a row); far edges 31.2 / 8.2 (round → 31 / 8 would too)
    fillSolid(r.ctx, [{ x: 10.6, y: 5.6, w: 20.6, h: 2.6 }], 100, 100);
    expect(r.fills[0]).toMatchObject({ x: 10, y: 5, w: 22, h: 4 });
  });
  it('clamps to the frame and skips zero-area rects', () => {
    const r = recorder();
    const n = fillSolid(r.ctx, [{ x: -5, y: 90, w: 20, h: 20 }, { x: 200, y: 0, w: 5, h: 5 }, { x: 3, y: 3, w: 0, h: 9 }], 100, 100);
    expect(n).toBe(1);
    expect(r.fills).toEqual([expect.objectContaining({ x: 0, y: 90, w: 15, h: 10 })]);
  });
  it('fails closed on a malformed rect: throws before painting anything (D-97)', () => {
    for (const bad of [{ x: Number.NaN, y: 0, w: 5, h: 5 }, { x: 0, y: 0, w: -5, h: 5 }, { x: null, y: 0, w: 5, h: 5 }, null, { x: 0, y: 0, w: 5 }]) {
      const r = recorder();
      expect(() => fillSolid(r.ctx, [{ x: 1, y: 1, w: 5, h: 5 }, bad as never], 100, 100), JSON.stringify(bad)).toThrow('malformed mask');
      expect(r.fills).toEqual([]);
      expect(r.depth()).toBe(0);
    }
    expect(() => fillSolid(recorder().ctx, [], 0, 100)).toThrow('bad mask frame');
  });
});
