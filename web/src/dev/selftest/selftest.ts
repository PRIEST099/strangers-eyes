// DEV-only self-test of the browser-only Tier-0 building blocks (T-023). Route: #/dev/selftest.
// Ported from research/day1-artifacts/web-ref/src/selftest.ts. Uses synthetic data only. It never touches
// the real vault databases: the crypto check uses a throwaway in-memory key.
import exifr from 'exifr';
import { reencodeClean, checkCleanJpeg, jpegAppSegments } from '../../tier0/exif';
import { detectFaces } from '../../tier0/faces';
import { ocrWords } from '../../tier0/ocr';
import { seal, unseal } from '../../vault/crypto';
import { haversineMeters, bandFor } from '../../core/geo';
import { box2dToPx } from '../../core/boxes';
import { applyMasks } from '../../core/mask';

/** DEV-only marker: scripts/check-dist.mjs fails the build if this string reaches web/dist. */
export const DEV_ONLY_MARKER = '__SE_DEV_ONLY__';

export interface StepResult { ok: boolean; ms: number; detail: unknown; error?: string }
export interface SelfTestReport { ok: boolean; ua: string; marker: string; steps: Record<string, StepResult> }

/** APP1 Exif segment: IFD0 {Orientation=6, GPS pointer}, GPS IFD {N 52/31/0, E 13/24/0}. Big-endian TIFF. */
function exifApp1(): Uint8Array {
  const tiff = new DataView(new ArrayBuffer(140));
  let o = 0;
  const u16 = (v: number) => { tiff.setUint16(o, v); o += 2; };
  const u32 = (v: number) => { tiff.setUint32(o, v); o += 4; };
  u16(0x4d4d); u16(42); u32(8);
  u16(2);
  u16(0x0112); u16(3); u32(1); u16(6); u16(0);
  u16(0x8825); u16(4); u32(1); u32(38);
  u32(0);
  u16(4);
  u16(0x0001); u16(2); u32(2); tiff.setUint8(o, 0x4e); o += 4;
  u16(0x0002); u16(5); u32(3); u32(92);
  u16(0x0003); u16(2); u32(2); tiff.setUint8(o, 0x45); o += 4;
  u16(0x0004); u16(5); u32(3); u32(116);
  u32(0);
  for (const [n, d] of [[52, 1], [31, 1], [0, 1], [13, 1], [24, 1], [0, 1]]) { u32(n); u32(d); }
  const body = new Uint8Array(tiff.buffer);
  const seg = new Uint8Array(10 + body.length);
  const len = 8 + body.length;
  seg.set([0xff, 0xe1, len >> 8, len & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0]);
  seg.set(body, 10);
  return seg;
}

function canvas(w: number, h: number, fill: string): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  return [c, ctx];
}

async function jpegWithExif(): Promise<Blob> {
  const [c] = canvas(200, 100, '#c00');
  const base = new Uint8Array(await (await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('toBlob'))), 'image/jpeg', 0.9))).arrayBuffer());
  const cut = 4 + ((base[4] << 8) | base[5]); // after SOI + APP0
  const seg = exifApp1();
  const out = new Uint8Array(base.length + seg.length);
  out.set(base.subarray(0, cut));
  out.set(seg, cut);
  out.set(base.subarray(cut), cut + seg.length);
  return new Blob([out], { type: 'image/jpeg' });
}

async function step(name: string, steps: Record<string, StepResult>, fn: () => Promise<{ ok: boolean; detail: unknown }>) {
  const t = performance.now();
  try {
    const { ok, detail } = await fn();
    steps[name] = { ok, ms: Math.round(performance.now() - t), detail };
  } catch (e) {
    steps[name] = { ok: false, ms: Math.round(performance.now() - t), detail: null, error: String(e) };
  }
}

export async function runSelfTest(): Promise<SelfTestReport> {
  const steps: Record<string, StepResult> = {};

  await step('exif', steps, async () => {
    const dirty = await jpegWithExif();
    const before = { segs: await jpegAppSegments(dirty), gps: await exifr.gps(dirty), orientation: await exifr.orientation(dirty) };
    const clean = await reencodeClean(dirty);
    const after = await checkCleanJpeg(clean.blob);
    const ok = before.segs.includes('APP1') && before.gps !== undefined && after.clean
      && clean.width === 100 && clean.height === 200; // orientation 6 rotates 200×100 to 100×200
    return { ok, detail: { before, after, size: [clean.width, clean.height] } };
  });

  await step('vaultCrypto', steps, async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const value = [{ kind: 'child_name', label: 'Lucas' }];
    const a = await seal(value, key);
    const b = await seal(value, key);
    const back = await unseal<typeof value>(a, key);
    let exportBlocked = false;
    try { await crypto.subtle.exportKey('raw', key); } catch { exportBlocked = true; }
    const freshIv = a.iv.some((x, i) => x !== b.iv[i]);
    const ok = JSON.stringify(back) === JSON.stringify(value) && !key.extractable && exportBlocked && freshIv;
    return { ok, detail: { extractable: key.extractable, exportBlocked, freshIv } };
  });

  await step('geo', steps, async () => {
    const m = haversineMeters(52.52, 13.405, 48.857, 2.352); // Berlin → Paris, ~878 km
    return { ok: m > 870_000 && m < 885_000 && bandFor(300) === 'neighbourhood', detail: { meters: Math.round(m) } };
  });

  await step('masks', steps, async () => {
    const [c] = canvas(800, 600, '#fff');
    const rect = box2dToPx([100, 250, 500, 750], 800, 600);
    const masked = applyMasks(c, [rect]);
    const px = Array.from(masked.getContext('2d')!.getImageData(400, 200, 1, 1).data);
    const outside = Array.from(masked.getContext('2d')!.getImageData(50, 50, 1, 1).data);
    const ok = rect.x === 200 && rect.y === 60 && rect.w === 400 && rect.h === 240
      && px.join() === '0,0,0,255' && outside.join() === '255,255,255,255';
    return { ok, detail: { rect, px, outside } };
  });

  await step('ocr', steps, async () => {
    const [c, ctx] = canvas(1000, 300, '#fff');
    ctx.fillStyle = '#000';
    ctx.font = 'bold 64px Arial, Helvetica, sans-serif';
    ctx.fillText('CITY GENERAL', 60, 120);
    ctx.fillText('Ella 4B', 60, 230);
    const words = await ocrWords(c);
    const text = words.map((w) => w.text.toUpperCase()).join(' ');
    const ok = text.includes('CITY') && text.includes('GENERAL') && words.every((w) => w.box.w > 0 && w.box.h > 0);
    return { ok, detail: { words: words.map((w) => ({ text: w.text, conf: Math.round(w.conf), box: w.box })) } };
  });

  await step('faces_none', steps, async () => {
    const [c] = canvas(640, 480, '#888');
    const full = await detectFaces(c, 0.3, 'full');
    const short = await detectFaces(c, 0.3, 'short');
    return { ok: full.length === 0 && short.length === 0, detail: { full, short } };
  });

  return { ok: Object.values(steps).every((s) => s.ok), ua: navigator.userAgent, marker: DEV_ONLY_MARKER, steps };
}
