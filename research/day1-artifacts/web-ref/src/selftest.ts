import exifr from 'exifr';
import { detectFaces } from './lib/faces';
import { ocrWords } from './lib/ocr';
import { reencodeClean, jpegAppSegments, findMetadata } from './lib/exif';
import { getVaultKey, putSealed, getSealed } from './lib/vault';
import { haversineMeters, bandFor } from './lib/geo';
import { box2dToPx, drawSolidMasks } from './lib/masks';

/** Build an APP1 Exif segment: IFD0{Orientation=6, GPS ptr}, GPS IFD {N 52/31/0, E 13/24/0}. Big-endian TIFF. */
function exifApp1(): Uint8Array {
  const tiff = new DataView(new ArrayBuffer(140));
  let o = 0;
  const u16 = (v: number) => { tiff.setUint16(o, v); o += 2; };
  const u32 = (v: number) => { tiff.setUint32(o, v); o += 4; };
  u16(0x4d4d); u16(42); u32(8); // "MM", 42, IFD0 at 8
  u16(2); // IFD0 entries
  u16(0x0112); u16(3); u32(1); u16(6); u16(0); // Orientation = 6 (rotate 90 CW)
  u16(0x8825); u16(4); u32(1); u32(38); // GPS IFD at 38
  u32(0);
  u16(4); // GPS entries
  u16(0x0001); u16(2); u32(2); tiff.setUint8(o, 0x4e); o += 4; // 'N'
  u16(0x0002); u16(5); u32(3); u32(92);
  u16(0x0003); u16(2); u32(2); tiff.setUint8(o, 0x45); o += 4; // 'E'
  u16(0x0004); u16(5); u32(3); u32(116);
  u32(0);
  for (const [n, d] of [[52, 1], [31, 1], [0, 1], [13, 1], [24, 1], [0, 1]]) { u32(n); u32(d); }
  const body = new Uint8Array(tiff.buffer);
  const seg = new Uint8Array(4 + 6 + body.length);
  const len = 2 + 6 + body.length;
  seg.set([0xff, 0xe1, len >> 8, len & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0]);
  seg.set(body, 10);
  return seg;
}

async function jpegWithExif(): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = 200; c.height = 100;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c00'; ctx.fillRect(0, 0, 200, 100);
  const base = new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9))).arrayBuffer());
  const app0Len = (base[4] << 8) | base[5];
  const cut = 4 + app0Len; // after SOI + APP0
  const seg = exifApp1();
  const out = new Uint8Array(base.length + seg.length);
  out.set(base.subarray(0, cut)); out.set(seg, cut); out.set(base.subarray(cut), cut + seg.length);
  return new Blob([out], { type: 'image/jpeg' });
}

async function step<T>(name: string, fn: () => Promise<T>, res: Record<string, unknown>) {
  const t = performance.now();
  try { res[name] = { ok: true, ms: Math.round(performance.now() - t), value: await fn() }; }
  catch (e) { res[name] = { ok: false, error: String(e), stack: (e as Error)?.stack?.slice(0, 400) }; }
  if (res[name] && (res[name] as { ms?: number }).ms !== undefined) (res[name] as { ms: number }).ms = Math.round(performance.now() - t);
}

export async function runSelfTest(): Promise<Record<string, unknown>> {
  const res: Record<string, unknown> = { ua: navigator.userAgent, crossOriginIsolated, isSecureContext };

  await step('exif', async () => {
    const dirty = await jpegWithExif();
    const before = { segs: await jpegAppSegments(dirty), gps: await exifr.gps(dirty), orientation: await exifr.orientation(dirty), meta: await findMetadata(dirty) };
    const bmpFrom = await createImageBitmap(dirty, { imageOrientation: 'from-image' });
    const bmpNone = await createImageBitmap(dirty, { imageOrientation: 'none' });
    const bmpDefault = await createImageBitmap(dirty);
    const dims = { fromImage: [bmpFrom.width, bmpFrom.height], none: [bmpNone.width, bmpNone.height], dflt: [bmpDefault.width, bmpDefault.height] };
    const clean = await reencodeClean(dirty);
    const after = { segs: await jpegAppSegments(clean.blob), meta: await findMetadata(clean.blob), all: await exifr.parse(clean.blob, true), gps: await exifr.gps(clean.blob).catch((e) => String(e)), w: clean.width, h: clean.height };
    return { before, dims, after };
  }, res);

  await step('vault', async () => {
    const key = await getVaultKey();
    await putSealed('pins', [{ label: 'home', lat: 52.52, lng: 13.405 }]);
    const back = await getSealed<unknown>('pins');
    const key2 = await getVaultKey();
    let exportErr = '';
    try { await crypto.subtle.exportKey('raw', key2); } catch (e) { exportErr = `${(e as Error).name}: ${(e as Error).message}`; }
    return { extractable: key.extractable, sameAfterReload: key2.extractable === false && key2.algorithm, back, exportErr, usages: key2.usages };
  }, res);

  await step('geo', async () => ({
    berlinParis: Math.round(haversineMeters(52.52, 13.405, 48.8566, 2.3522)),
    band300: bandFor(300),
  }), res);

  await step('masks', async () => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 600;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 800, 600);
    drawSolidMasks(ctx, [[100, 250, 500, 750]], 800, 600);
    const px = ctx.getImageData(400, 200, 1, 1).data;
    return { rect: box2dToPx([100, 250, 500, 750], 800, 600), pixel: Array.from(px) };
  }, res);

  await step('ocr', async () => {
    const c = document.createElement('canvas'); c.width = 1000; c.height = 300;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1000, 300);
    ctx.fillStyle = '#000'; ctx.font = 'bold 64px Arial, Helvetica, sans-serif';
    ctx.fillText('CITY GENERAL', 60, 120); ctx.fillText('Ella 4B', 60, 230);
    const words = await ocrWords(c);
    const t2 = performance.now();
    const words2 = await ocrWords(c);
    return { words, second_ms: Math.round(performance.now() - t2), n2: words2.length };
  }, res);

  for (const model of ['short', 'full'] as const) {
    await step(`faces_${model}`, async () => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 480;
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#888'; ctx.fillRect(0, 0, 640, 480);
      const onCanvas = await detectFaces(c, model);
      const bmp = await createImageBitmap(c);
      const onBitmap = await detectFaces(bmp, model);
      const img = new Image(); img.src = c.toDataURL('image/png'); await img.decode();
      const onImg = await detectFaces(img, model);
      return { onCanvas, onBitmap, onImg };
    }, res);
  }
  return res;
}
