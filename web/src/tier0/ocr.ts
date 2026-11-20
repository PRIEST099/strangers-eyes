// web/src/tier0/ocr.ts: the Tesseract worker singleton and Tier-0 OCR (ARCH §11.2 step 3, §18; API-NOTES §5.2; T-057).
// Tesseract rejects ImageBitmap: pass a canvas (or a Blob). v6+ returns word boxes only with {blocks: true}.
// Assets are self-hosted under /vendor (copied by scripts/copy-assets.mjs); never a CDN.
//
// D-81 (T-037): the default global-Otsu binarisation found the demo name tag in only 14/30 placements on street photos.
// So every pass sets Tesseract's thresholding_method: Leptonica adaptive Otsu ('1'), then a Sauvola pass ('2') whose
// lines are unioned in (ocrMerge.unionWords; 29/30 with this code, D-83). The setting is a per-job recognize option:
// tesseract.js applies it with SaveParameters/SetVariable/RestoreParameters, so a job can never run with another job's
// binarisation.
//
// Every OCR call still runs one at a time (`exclusive`), so the worker's lifetime (warm-up, idle drop, replacement after
// a failure) is managed between jobs, never during one.
// Lifetime (ARCH §18): the Check screen holds the worker warm (retainOcr); once nothing holds it, it is terminated after
// OCR_IDLE_MS without use. A worker that fails or times out is dropped and a new one is started by the next call.
//
// tesseract.js 7.0.0 caveat (T-057 review): createWorker's promise rejects only when loading the core fails. A failed
// language load or initialise (a traineddata fetch error on a first visit, a corrupt cache) is reported only to
// `errorHandler`, and the promise never settles. Start-up is therefore raced against errorHandler and a timeout, and
// each pass against a timeout. A drop never waits on a start that may never finish.
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import type { OcrWord } from '../core/types';
import { downscaleTo } from './decode';
import { unionWords, wordsToMaster } from './ocrMerge';

export const TESSERACT_BASE = '/vendor/tesseract-7.0.0';
/** RC `ocr_max_px` default (SPEC D-20): Tier-0 OCR reads a downscale of the master no larger than this. */
export const OCR_MAX_PX = 1600;
/** The worker is terminated after this long without use while nothing holds it (ARCH §18). */
export const OCR_IDLE_MS = 5 * 60_000;
/** Start-up (core + ~3 MB traineddata on a first visit) must finish within this, or it counts as failed. */
export const OCR_START_TIMEOUT_MS = 120_000;
/** One recognize pass must finish within this (a 1600 px pass takes about 0.5–1.5 s on the M1). */
export const OCR_PASS_TIMEOUT_MS = 30_000;

/** Tesseract `thresholding_method`: Leptonica adaptive Otsu (the default pass, D-81) or Sauvola (the union pass). */
export type Binarisation = 'adaptiveOtsu' | 'sauvola';
const THRESHOLDING: Readonly<Record<Binarisation, string>> = { adaptiveOtsu: '1', sauvola: '2' };

/** RC `ocr_max_px`, clamped to 800–2048 (the master is ≤ 2048; D-83); anything else is the default. */
export function clampOcrMaxPx(x: unknown): number {
  return typeof x === 'number' && Number.isFinite(x) ? Math.round(Math.min(2048, Math.max(800, x))) : OCR_MAX_PX;
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`ocr: ${what} timed out`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e: unknown) => { clearTimeout(t); reject(e); });
  });
}

// ---------------------------------------------------------------- the worker
let workerP: Promise<Worker> | null = null;
/** The started worker behind workerP, once it resolved (a drop terminates this one, never a pending start). */
let workerNow: Worker | null = null;

export function getOcrWorker(): Promise<Worker> {
  if (workerP) return workerP;
  let failStart: (e: unknown) => void = () => undefined;
  const failed = new Promise<never>((_, reject) => { failStart = reject; });
  failed.catch(() => undefined);
  const created = createWorker('eng', OEM.LSTM_ONLY, {
    // Paths resolve against window.location.href.
    workerPath: `${TESSERACT_BASE}/worker.min.js`,
    corePath: `${TESSERACT_BASE}/core`, // a DIRECTORY holding the three *-lstm.wasm.js cores
    langPath: `${TESSERACT_BASE}/lang`, // fetches `${langPath}/eng.traineddata.gz`
    // cacheMethod 'write' (default) caches traineddata in idb-keyval's default 'keyval-store'. Never clear it.
    // Called for EVERY failed job: during start-up it fails the start; afterwards the job's own promise rejects too, and
    // without a handler tesseract.js would also throw an uncaught Error.
    errorHandler: (e: unknown) => failStart(e instanceof Error ? e : new Error(`ocr: ${String(e)}`)),
  });
  const p: Promise<Worker> = withTimeout(Promise.race([created, failed]), OCR_START_TIMEOUT_MS, 'start').then(async (w) => {
    await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, thresholding_method: THRESHOLDING.adaptiveOtsu });
    return w;
  });
  workerP = p;
  p.then(
    (w) => { if (workerP === p) workerNow = w; else void w.terminate(); }, // dropped while starting: never leak it
    () => {
      if (workerP === p) workerP = null; // the next call starts afresh
      void created.then((w) => w.terminate(), () => undefined); // a start that settles late is terminated
    },
  );
  return p;
}

/**
 * Forget the worker and terminate it if it started (idle timer, a failed or timed-out job, tests). Never waits on a
 * start that may never settle; a start still pending terminates itself when it lands (see getOcrWorker).
 */
async function dropWorker(): Promise<void> {
  const w = workerNow;
  workerP = null;
  workerNow = null;
  if (w) { try { await w.terminate(); } catch { /* already gone */ } }
}

// ---------------------------------------------------------------- one job at a time
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn);
  queue = p.catch(() => undefined);
  return p;
}

// ---------------------------------------------------------------- lifetime: holds and the idle timer
let holds = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Restart the idle countdown; while anything holds the worker there is none. */
function touch(): void {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = holds > 0 ? null : setTimeout(() => {
    idleTimer = null;
    // Re-checked when the queued drop runs: a retain in between keeps the worker. (A new OCR call queued behind the drop
    // runs after it and simply starts a new worker.)
    void exclusive(async () => { if (holds === 0 && idleTimer === null) await dropWorker(); });
  }, OCR_IDLE_MS);
}

/**
 * Keep the worker warm until the returned release is called (the Check screen, ARCH §18), and start loading it now so
 * the first OCR does not wait for the ~7 MB core and traineddata. Release is idempotent. A failed warm-up is not
 * retried here; the first real OCR call starts a new worker (getOcrWorker forgets a failed start).
 */
export function retainOcr(): () => void {
  holds += 1;
  touch();
  void getOcrWorker().catch(() => undefined);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    touch();
  };
}

/** Terminate the worker after any job in progress (tests). */
export function terminateOcr(): Promise<void> {
  if (idleTimer !== null) { clearTimeout(idleTimer); idleTimer = null; }
  return exclusive(dropWorker);
}

// ---------------------------------------------------------------- recognition
type OcrInput = HTMLCanvasElement | OffscreenCanvas;
type OcrImage = Blob | OcrInput;

/**
 * The canvas's pixels NOW, as a PNG Blob encoded once for both passes. A canvas the pipeline frees (width 0) while the
 * job waits in the queue can then never reach tesseract.js, whose loadImage hangs forever on an empty canvas (T-057
 * review). Inputs without an encoder (the Node tests' fakes) are passed through.
 */
function snapshot(img: OcrInput): Promise<OcrImage> {
  const off = img as Partial<OffscreenCanvas>;
  if (typeof off.convertToBlob === 'function') return off.convertToBlob({ type: 'image/png' });
  const el = img as Partial<HTMLCanvasElement>;
  if (typeof el.toBlob === 'function') {
    return new Promise<Blob>((resolve, reject) => {
      el.toBlob!((b) => (b ? resolve(b) : reject(new Error('ocr: canvas could not be encoded'))), 'image/png');
    });
  }
  return Promise.resolve(img);
}

async function recognizeWith(image: OcrImage, bin: Binarisation): Promise<OcrWord[]> {
  const w = await getOcrWorker();
  // thresholding_method passes straight through to Tesseract as a job option (not in tesseract.js's typed options).
  const opts = { thresholding_method: THRESHOLDING[bin] } as unknown as Parameters<Worker['recognize']>[1];
  const { data } = await withTimeout(w.recognize(image, opts, { blocks: true, text: true }), OCR_PASS_TIMEOUT_MS, 'recognize');
  const out: OcrWord[] = [];
  let line = 0;
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const l of para.lines) {
        for (const word of l.words) {
          const { x0, y0, x1, y1 } = word.bbox;
          out.push({ text: word.text, conf: word.confidence, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, line });
        }
        line++;
      }
    }
  }
  return out;
}

/**
 * OCR one canvas; boxes are in ITS pixels. `union` (default true): the adaptive-Otsu pass, then a Sauvola pass whose
 * lines are unioned in (D-81); false runs the adaptive pass only, for display-only uses. Rejects at once for an empty
 * canvas; rejects (and drops the worker) when a pass fails or times out.
 */
export function ocrCanvas(img: OcrInput, opts: { union?: boolean } = {}): Promise<OcrWord[]> {
  if (!(img.width > 0 && img.height > 0)) return Promise.reject(new Error('ocr: empty canvas'));
  const snap = snapshot(img);
  snap.catch(() => undefined); // awaited inside the job; never an unhandled rejection meanwhile
  return exclusive(async () => {
    touch();
    try {
      const image = await snap;
      const a = await recognizeWith(image, 'adaptiveOtsu');
      if (opts.union === false) return a;
      return unionWords(a, await recognizeWith(image, 'sauvola'));
    } catch (e) {
      await dropWorker(); // a worker that failed or timed out is replaced on the next call
      throw e;
    } finally {
      touch();
    }
  });
}

/**
 * ONE adaptive-Otsu pass, no union: for the DEV spikes and selftest and display-only uses. Never for a check whose miss
 * fails open (Tier-0's vault match, the gate, the export check): those use ocrMaster / ocrCanvas with the union.
 */
export function ocrSinglePass(img: OcrInput): Promise<OcrWord[]> {
  return ocrCanvas(img, { union: false });
}

/**
 * Tier-0 OCR of the master (ARCH §11.2 step 3): a downscale to at most `maxPx` (RC ocr_max_px, default 1600; never
 * upscaled), both passes unioned unless `union: false`, and every box mapped back to master pixels (AC-118). The
 * downscale canvas is freed afterwards (ARCH §18).
 */
export async function ocrMaster(master: HTMLCanvasElement, opts: { maxPx?: unknown; union?: boolean } = {}): Promise<OcrWord[]> {
  const maxPx = clampOcrMaxPx(opts.maxPx ?? OCR_MAX_PX);
  const c = Math.max(master.width, master.height) > maxPx ? downscaleTo(master, maxPx) : master;
  const sx = c.width / master.width;
  const sy = c.height / master.height;
  try {
    return wordsToMaster(await ocrCanvas(c, { union: opts.union }), sx, sy, master.width, master.height);
  } finally {
    if (c !== master) { c.width = 0; c.height = 0; } // ~7.7 MB of RGBA released at once
  }
}
