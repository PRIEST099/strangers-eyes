// DEV-only self-test of the browser-only Tier-0 building blocks (T-023). Route: #/dev/selftest.
// Ported from research/day1-artifacts/web-ref/src/selftest.ts. Uses synthetic data only. It never touches
// the real vault databases: the crypto check uses its own scratch databases (dev/selftest/vaultStorageCheck.ts).
import exifr from 'exifr';
import { reencodeClean, checkCleanJpeg, jpegAppSegments } from '../../tier0/exif';
import { detectFaces } from '../../tier0/faces';
import { ocrWords } from '../../tier0/ocr';
import { vaultStorageCheck } from './vaultStorageCheck';
import { haversineMeters, bandFor } from '../../core/geo';
import { box2dToPx } from '../../core/boxes';
import { applyMasks } from '../../core/mask';
import { render, segmentsText, verifyManifest, PROMPT_IDS } from '../../ai/prompts';
import { ADV_B_SCHEMA, assertSchemaShape } from '../../ai/schemas';
import { toJpeg } from '../../tier0/decode';
import { importPhoto } from '../../tier0/importPhoto';
import { exifApp1, spliceSegment } from '../fixtures/exifFixture';

/** DEV-only marker: scripts/check-dist.mjs fails the build if this string reaches web/dist. */
export const DEV_ONLY_MARKER = '__SE_DEV_ONLY__';

export interface StepResult { ok: boolean; ms: number; detail: unknown; error?: string }
export interface SelfTestReport { ok: boolean; ua: string; marker: string; steps: Record<string, StepResult> }

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
  return new Blob([spliceSegment(base, exifApp1())], { type: 'image/jpeg' });
}

// T-053 (AC-101): a 200×100 image stored "sideways" with one colour per quadrant. EXIF Orientation=6 means "rotate
// 90° clockwise to view", so the upright 100×200 image has: top-left blue, top-right red, bottom-left yellow,
// bottom-right green (stored TL red → top-right, TR green → bottom-right, BL blue → top-left, BR yellow → bottom-left).
const QUAD = { red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255], yellow: [255, 255, 0] } as const;
type Rgb = readonly [number, number, number];
const UPRIGHT_O6: Array<[number, number, keyof typeof QUAD]> = [[25, 50, 'blue'], [75, 50, 'red'], [25, 150, 'yellow'], [75, 150, 'green']];

function quadrantCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas(200, 100, '#000');
  const fill = (rgb: Rgb, x: number, y: number) => { ctx.fillStyle = `rgb(${rgb.join(',')})`; ctx.fillRect(x, y, 100, 50); };
  fill(QUAD.red, 0, 0);
  fill(QUAD.green, 100, 0);
  fill(QUAD.blue, 0, 50);
  fill(QUAD.yellow, 100, 50);
  return c;
}

/** Each sample point holds its expected colour (JPEG tolerance: every channel within 60). */
function quadrantsUpright(src: CanvasImageSource, w: number, h: number): boolean {
  const [c, ctx] = canvas(w, h, '#000');
  ctx.drawImage(src, 0, 0, w, h);
  return UPRIGHT_O6.every(([x, y, name]) => {
    const px = c.getContext('2d')!.getImageData(x, y, 1, 1).data;
    return QUAD[name].every((v, i) => Math.abs(px[i] - v) <= 60);
  });
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

  await step('import', steps, async () => {
    // Report booleans and dimensions only: never the fixture's coordinates.
    const stored = new Uint8Array(await (await toJpeg(quadrantCanvas(), 0.95)).arrayBuffer());
    const dirty = new Blob([spliceSegment(stored, exifApp1({ orientation: 6 }))], { type: 'image/jpeg' });
    const before = { app1: (await jpegAppSegments(dirty)).includes('APP1'), gps: (await exifr.gps(dirty)) !== undefined };
    const r = await importPhoto(dirty, { pins: [] });
    if (!r.ok) return { ok: false, detail: { before, error: r.code } };
    const segs = await jpegAppSegments(r.jpeg);
    const clean = await checkCleanJpeg(r.jpeg);
    const gpsAfter = await exifr.gps(r.jpeg);
    const back = await createImageBitmap(r.jpeg); // the JPEG alone (no EXIF left) must already be upright
    const jpegUpright = back.width === 100 && back.height === 200 && quadrantsUpright(back, back.width, back.height);
    back.close();
    const masterUpright = quadrantsUpright(r.master, r.width, r.height);
    const big = new Uint8Array(35 * 1024 * 1024);
    big.set([0xff, 0xd8, 0xff, 0xe0]);
    const tooLarge = await importPhoto(new Blob([big], { type: 'image/jpeg' }));
    const text = await importPhoto(new Blob(['hello, this is not a photo'], { type: 'text/plain' }));
    const detail = {
      before,
      noApp1: !segs.includes('APP1'), noApp13: !segs.includes('APP13'), segments: segs, gpsUndefined: gpsAfter === undefined,
      clean: clean.clean, size: [r.width, r.height], swapped: r.width === 100 && r.height === 200,
      masterUpright, jpegUpright, orientation: r.orientation, hadGps: r.hadGps, gpsWarningFound: r.gpsWarning !== null,
      sha256Ok: /^[0-9a-f]{64}$/.test(r.sha256),
      tooLarge: tooLarge.ok ? 'ok' : tooLarge.code, unsupported: text.ok ? 'ok' : text.code,
    };
    const ok = before.app1 && before.gps && detail.noApp1 && detail.noApp13 && detail.gpsUndefined && detail.clean
      && detail.swapped && masterUpright && jpegUpright && r.orientation === 6 && r.hadGps && detail.gpsWarningFound
      && detail.sha256Ok && detail.tooLarge === 'tooLarge' && detail.unsupported === 'unsupported';
    return { ok, detail };
  });

  // T-054 (AC-080, AC-081): the key is READ BACK from IndexedDB (scratch databases only, deleted afterwards).
  await step('vaultCrypto', steps, vaultStorageCheck);

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

  await step('prompts', steps, async () => {
    const mismatches = await verifyManifest(); // WebCrypto sha256 of the bundled ?raw texts vs manifest.json
    const text = segmentsText(render('explain.v1', { CLUE_TYPE: 'transit_sign', REGION: 'top_right', EVIDENCE: '', REVEALS: '' }));
    assertSchemaShape(ADV_B_SCHEMA);
    return { ok: mismatches.length === 0 && text.includes('Clue type: transit_sign'), detail: { mismatches, prompts: PROMPT_IDS.length, chars: text.length } };
  });

  await step('faces_none', steps, async () => {
    const [c] = canvas(640, 480, '#888');
    const full = await detectFaces(c, 0.3, 'full');
    const short = await detectFaces(c, 0.3, 'short');
    return { ok: full.length === 0 && short.length === 0, detail: { full, short } };
  });

  return { ok: Object.values(steps).every((s) => s.ok), ua: navigator.userAgent, marker: DEV_ONLY_MARKER, steps };
}
