// T-069: the consent dry run (ARCH §8.3) on fake readers. The strict JPEG validator is real.
import { describe, expect, it } from 'vitest';
import type { OcrWord, PxRect } from '../core/types';
import { isUserHit, runPreflight, type PreflightDeps, type PreflightInput } from './preflight';

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const seg = (m: number, p: number[]) => [0xff, m, ((p.length + 2) >> 8) & 0xff, (p.length + 2) & 0xff, ...p];
function jpeg(fill: number, extra: number[] = []): Uint8Array<ArrayBuffer> {
  const parts = [0xff, 0xd8, ...seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), ...extra, ...seg(0xdb, [0, ...new Array(64).fill(1)]),
    ...seg(0xc0, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]), ...seg(0xc4, [0, ...new Array(16).fill(0)]), ...seg(0xda, [1, 1, 0, 0, 63, 0]),
    fill, 0x12, 0xff, 0xd9];
  const b = new Uint8Array(new ArrayBuffer(parts.length));
  b.set(parts);
  return b;
}
const EXIF = seg(0xe1, [...ascii('Exif'), 0, 0, 1, 2]);
// Master 2000×1000; the cloud frame is 1000×500, so frame px ×2 = master px.
const FRAME = { id: 'cloud' as const, width: 1000, height: 500, cropInMaster: { x: 0, y: 0, w: 2000, h: 1000 } };
const word = (text: string, box: PxRect): OcrWord => ({ text, conf: 90, line: 0, box });

/**
 * A fake world: `visible(masks)` says which faces / vault words the reader still sees given the masks so far
 * (each item disappears once a mask covers its master box).
 */
function deps(items: { kind: 'face' | 'vault'; frameBox: PxRect }[], over: Partial<PreflightDeps> = {}) {
  const builds: PxRect[][] = [];
  let current: PxRect[] = [];
  const covered = (b: PxRect) => current.some((m) => m.x <= b.x * 2 && m.y <= b.y * 2 && m.x + m.w >= (b.x + b.w) * 2 && m.y + m.h >= (b.y + b.h) * 2);
  const d: PreflightDeps = {
    build: async (masks) => { current = masks.map((m) => ({ ...m })); builds.push(current); return { jpeg: new Blob([jpeg(0x41 + builds.length)]), frame: FRAME }; },
    checkClean: async () => ({ clean: true }),
    decode: async () => ({}),
    faces: async () => items.filter((i) => i.kind === 'face' && !covered(i.frameBox)).map((i) => i.frameBox),
    ocr: async () => items.filter((i) => i.kind === 'vault' && !covered(i.frameBox)).map((i) => word('LUCAS', i.frameBox)),
    matchVault: async (words) => words.map((_, k) => ({ spans: [[k, k] as const] })),
    sha256Hex: async (b) => `sha-${b.length}-${b[b.length - 3]}`,
    ...over,
  };
  return { d, builds };
}
const input = (over: Partial<PreflightInput> = {}): PreflightInput => ({
  masks: [{ x: 10, y: 10, w: 50, h: 50 }], width: 2000, height: 1000, userUnmasked: [], faceMinConfidence: 0.3, padRatio: 0.15, ...over,
});

describe('runPreflight (consent dry run)', () => {
  it('a clean image: nothing auto-masked, Send enabled, the image is the built bytes with base64 and sha256', async () => {
    const { d, builds } = deps([]);
    const r = await runPreflight(input(), d);
    expect(r).toMatchObject({ autoMasked: 0, userHits: 0, failed: [], facesVisible: 0, vaultVisible: 0 });
    expect(builds).toHaveLength(1);
    expect(builds[0]).toEqual([{ x: 10, y: 10, w: 50, h: 50 }]); // candidate.masks as given, never re-padded
    expect(r.image.mime).toBe('image/jpeg');
    expect(atob(r.image.base64).length).toBe(r.bytes);
  });

  it('AC-134: a vault word only the 1536-px reader sees is auto-masked (in master px, padded) and Send enables', async () => {
    const { d, builds } = deps([{ kind: 'vault', frameBox: { x: 100, y: 100, w: 40, h: 10 } }]);
    const r = await runPreflight(input(), d);
    expect(r).toMatchObject({ autoMasked: 1, failed: [], vaultVisible: 0 });
    expect(builds).toHaveLength(2);
    const auto = r.masks[1];
    expect(auto.x).toBeLessThan(200);
    expect(auto.x + auto.w).toBeGreaterThan(280); // master px: frame ×2, padded
  });

  it('stops after 2 rounds: a hit that never goes away disables Send and is named', async () => {
    const { d, builds } = deps([], { faces: async () => [{ x: 5, y: 5, w: 20, h: 20 }] });
    const r = await runPreflight(input(), d);
    expect(r.failed).toEqual(['faces']);
    expect(builds).toHaveLength(3);
    expect(r.autoMasked).toBe(2);
  });

  it('AC-135: a hit on an item the user un-ticked is never re-masked; it is reported and Send stays enabled', async () => {
    const { d, builds } = deps([{ kind: 'vault', frameBox: { x: 100, y: 100, w: 40, h: 10 } }]);
    const r = await runPreflight(input({ userUnmasked: [{ x: 196, y: 196, w: 90, h: 28 }] }), d);
    expect(r).toMatchObject({ autoMasked: 0, userHits: 1, failed: [], vaultVisible: 1 });
    expect(builds).toHaveLength(1);
  });

  it('metadata in the built JPEG fails at once (never auto-fixable); a reader that throws fails closed', async () => {
    const meta = deps([], { build: async () => ({ jpeg: new Blob([jpeg(0x41, EXIF)]), frame: FRAME }) });
    expect((await runPreflight(input(), meta.d)).failed).toEqual(['metadata']);
    const broken = deps([], { ocr: async () => { throw new Error('ocr'); } });
    expect((await runPreflight(input(), broken.d)).failed).toEqual(['check']);
    const noIndex = deps([], { matchVault: async () => null });
    expect((await runPreflight(input(), noIndex.d)).failed).toEqual(['check']);
  });

  it('isUserHit: IoU ≥ 0.3, or half the hit inside the un-ticked box', () => {
    const u = [{ x: 0, y: 0, w: 100, h: 100 }];
    expect(isUserHit({ x: 10, y: 10, w: 20, h: 20 }, u)).toBe(true);
    expect(isUserHit({ x: 90, y: 90, w: 40, h: 40 }, u)).toBe(false);
    expect(isUserHit({ x: 10, y: 10, w: 20, h: 20 }, [])).toBe(false);
  });
});
