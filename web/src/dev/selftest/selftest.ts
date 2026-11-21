// DEV-only self-test of the browser-only Tier-0 building blocks (T-023). Route: #/dev/selftest.
// Ported from research/day1-artifacts/web-ref/src/selftest.ts. Uses synthetic data only. It never touches
// the real vault databases: the crypto check uses its own scratch databases (dev/selftest/vaultStorageCheck.ts).
import exifr from 'exifr';
import { reencodeClean, checkCleanJpeg, jpegAppSegments } from '../../tier0/exif';
import { detectFaces } from '../../tier0/faces';
import { ocrMaster, ocrSinglePass } from '../../tier0/ocr';
import { vaultStorageCheck } from './vaultStorageCheck';
import { haversineMeters, bandFor } from '../../core/geo';
import { box2dToMaster, box2dToPx, gridCellRect, iou, masterToFrame, minimalCrop, padRect, regionOf } from '../../core/boxes';
import { applyMasks } from '../../core/mask';
import { buildFrameJpeg, deriveFrame, renderFrame } from '../../core/frames';
import type { Box2D, PxRect } from '../../core/types';
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

  // T-059 (AC-118, AC-113): boxes live in master pixels, checked by sampling pixels. A Gemini-style box_2d is read off
  // the ENCODED cloud frame (cropped from the top, downscaled with separately rounded sides), mapped back onto the master
  // fixture, padded and masked: no target pixel survives in the cloud or export frame, the masked pixel is opaque black,
  // and a grid cell named on the 768 px Nano frame lands on the target in the master.
  await step('frames', steps, async () => {
    const owned: HTMLCanvasElement[] = []; // every canvas this step makes, freed on every exit (early returns, throws)
    const run = async () => {
      const W = 1999, H = 1201;
      const [m, mctx] = canvas(W, H, '#fff');
      owned.push(m);
      const target: PxRect = { x: 1450, y: 560, w: 300, h: 140 }; // a "sign": pure red
      const skyline: PxRect = { x: 100, y: 0, w: 400, h: 150 }; // a non-removable clue at the top: pure green, cropped away
      mctx.fillStyle = '#f00';
      mctx.fillRect(target.x, target.y, target.w, target.h);
      mctx.fillStyle = '#0f0';
      mctx.fillRect(skyline.x, skyline.y, skyline.w, skyline.h);
      type Hit = (p: Uint8ClampedArray, i: number) => boolean;
      const isRed: Hit = (p, i) => p[i] > 160 && p[i + 1] < 100 && p[i + 2] < 100;
      const isGreen: Hit = (p, i) => p[i + 1] > 160 && p[i] < 100 && p[i + 2] < 100;
      const bounds = (c: HTMLCanvasElement, hit: Hit): PxRect | null => {
        const p = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            if (!hit(p, (y * c.width + x) * 4)) continue;
            x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          }
        }
        return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      };
      const px = (c: HTMLCanvasElement, x: number, y: number) => Array.from(c.getContext('2d')!.getImageData(x, y, 1, 1).data).join();
      const decoded = async (jpeg: Blob) => {
        const b = await createImageBitmap(jpeg);
        const [c, cctx] = canvas(b.width, b.height, '#fff');
        owned.push(c);
        cctx.drawImage(b, 0, 0);
        b.close();
        return c;
      };
      const crop = minimalCrop('top', [padRect(skyline, W, H)], W, H);
      if (!crop.ok) return { ok: false, detail: { crop } };

      // 1. The cloud frame as sent (unmasked here, to find the target the way the attacker sees it).
      const sent = await buildFrameJpeg('cloud', m, { crop: crop.rect });
      const f = sent.frame;
      const seen = await decoded(sent.jpeg);
      const sameSize = seen.width === f.width && seen.height === f.height && Math.max(f.width, f.height) <= 1536;
      const clean = (await checkCleanJpeg(sent.jpeg)).clean;
      const red = bounds(seen, isRed);
      const greenGone = bounds(seen, isGreen) === null;
      if (!red) return { ok: false, detail: { error: 'target not visible in the cloud frame', frame: f } };
      // What Gemini answers: [ymin, xmin, ymax, xmax] on 0..1000 of the image as sent, as integers.
      const box2d = [red.y, red.x, red.y + red.h, red.x + red.w].map((v, i) => Math.round((v * 1000) / (i % 2 ? f.width : f.height))) as Box2D;
      const mapped = box2dToMaster(box2d, f);
      if (!mapped) return { ok: false, detail: { error: 'box2dToMaster returned null', box2d, frame: f } };
      const mask = padRect(mapped, W, H);
      const tol = 6; // ≈ 1 cloud px (1.3 master px) of JPEG/resampling edge + 0.5 unit of integer box_2d + 1 px outward rounding
      const close = Math.abs(mapped.x - target.x) <= tol && Math.abs(mapped.y - target.y) <= tol
        && Math.abs(mapped.x + mapped.w - target.x - target.w) <= tol && Math.abs(mapped.y + mapped.h - target.y - target.h) <= tol;
      const covers = mask.x <= target.x && mask.y <= target.y && mask.x + mask.w >= target.x + target.w && mask.y + mask.h >= target.y + target.h;
      const centre = { x: Math.floor(mapped.x + mapped.w / 2), y: Math.floor(mapped.y + mapped.h / 2) };
      const masterCentreRed = px(m, centre.x, centre.y) === '255,0,0,255'; // the mapped box sits on the target IN THE MASTER
      const masterBesideWhite = px(m, mask.x - 3, centre.y) === '255,255,255,255';

      // 2. Masked on the master, then cropped and scaled: no red pixel survives; the masked pixel reads [0,0,0,255].
      const maskedSeen = await decoded((await buildFrameJpeg('cloud', m, { crop: crop.rect, masks: [mask] })).jpeg);
      const noRedSent = bounds(maskedSeen, isRed) === null;
      const exportFrame = deriveFrame('export', W, H, { crop: crop.rect });
      const out = renderFrame(m, exportFrame, [mask]);
      owned.push(out);
      const at = masterToFrame({ x: centre.x, y: centre.y, w: 1, h: 1 }, exportFrame);
      const beside = masterToFrame({ x: mask.x - 3, y: centre.y, w: 1, h: 1 }, exportFrame);
      const maskedPx = px(out, at.x, at.y);
      const besidePx = px(out, beside.x, beside.y);
      const noRedExport = bounds(out, isRed) === null;
      const masterUntouched = px(m, centre.x, centre.y) === '255,0,0,255';

      // 3. Nano grid cell: the region of the target on the 768 px frame → its 3×3 cell in master pixels holds the target.
      const nano = deriveFrame('nano768', W, H);
      const nanoCanvas = renderFrame(m, nano);
      owned.push(nanoCanvas);
      const nr = bounds(nanoCanvas, isRed);
      const region = nr ? regionOf(nr, nano.width, nano.height) : null;
      const cell = region ? gridCellRect(region, W, H) : null;
      const tc = { x: Math.floor(target.x + target.w / 2), y: Math.floor(target.y + target.h / 2) };
      const cellHasTarget = !!cell && tc.x >= cell.x && tc.x < cell.x + cell.w && tc.y >= cell.y && tc.y < cell.y + cell.h
        && px(m, tc.x, tc.y) === '255,0,0,255';

      const ok = sameSize && clean && greenGone && close && covers && masterCentreRed && masterBesideWhite && noRedSent
        && maskedPx === '0,0,0,255' && besidePx === '255,255,255,255' && noRedExport && masterUntouched && cellHasTarget;
      return {
        ok,
        detail: {
          crop: crop.rect, cloud: [f.width, f.height], scale: [f.cropInMaster.w / f.width, f.cropInMaster.h / f.height],
          sameSize, clean, greenGone, red, box2d, mapped, target, mask, close, covers, masterCentreRed, masterBesideWhite,
          noRedSent, maskedPx, besidePx, noRedExport, masterUntouched, nano: [nano.width, nano.height], region, cell, cellHasTarget,
        },
      };
    };
    try {
      return await run();
    } finally {
      for (const c of owned) c.width = 0;
    }
  });

  await step('ocr', steps, async () => {
    const [c, ctx] = canvas(1000, 300, '#fff');
    ctx.fillStyle = '#000';
    ctx.font = 'bold 64px Arial, Helvetica, sans-serif';
    ctx.fillText('CITY GENERAL', 60, 120);
    ctx.fillText('Ella 4B', 60, 230);
    const words = await ocrSinglePass(c);
    const text = words.map((w) => w.text.toUpperCase()).join(' ');
    const ok = text.includes('CITY') && text.includes('GENERAL') && words.every((w) => w.box.w > 0 && w.box.h > 0);
    return { ok, detail: { words: words.map((w) => ({ text: w.text, conf: Math.round(w.conf), box: w.box })) } };
  });

  // T-057: Tier-0 OCR of a master (downscale to ocr_max_px, both passes unioned per D-81, boxes back in master px).
  await step('ocrMaster', steps, async () => {
    const [c, ctx] = canvas(2048, 1024, '#fff');
    ctx.fillStyle = '#000';
    ctx.font = 'bold 120px Arial, Helvetica, sans-serif';
    const drawn = { x: 300, y: 600 - 120, w: Math.ceil(ctx.measureText('LUCAS').width), h: 140 }; // where LUCAS was drawn
    ctx.fillText('LUCAS', 300, 600);
    ctx.fillText('42', 300 + drawn.w + 80, 600);
    const t0 = performance.now();
    const words = await ocrMaster(c);
    const ms = Math.round(performance.now() - t0);
    const lucas = words.find((w) => w.text.replace(/[^A-Za-z]/g, '').toUpperCase() === 'LUCAS');
    const fortyTwo = words.some((w) => w.text.replace(/\D/g, '') === '42');
    // The box is in MASTER pixels (AC-118): it overlaps where LUCAS was drawn on the 2048 px canvas, not a 1600 px copy.
    const overlap = lucas ? iou(lucas.box, drawn) : 0;
    return { ok: !!lucas && fortyTwo && overlap > 0.5, detail: { ms, lucasBox: lucas?.box, drawn, iou: Math.round(overlap * 100) / 100, words: words.length } };
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
