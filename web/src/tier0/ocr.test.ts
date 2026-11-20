// T-057: Tier-0 OCR plumbing (D-81 passes, one job at a time, master mapping, lifetime, failure handling). tesseract.js
// is replaced by a fake worker that records its jobs; real recognition runs in the DEV selftest and the browser checks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OcrWord } from '../core/types';
import { makeTerm, matchWords } from './fuzzy';
import { boxToMaster, SAME_WORD_IOU, unionWords, wordsToMaster } from './ocrMerge';
import { phones, plates } from './regex';

const fake = vi.hoisted(() => {
  type Bbox = { x0: number; y0: number; x1: number; y1: number };
  type Page = Array<Array<{ text: string; confidence: number; bbox: Bbox }>>; // lines of words
  const log: string[] = [];
  const state = {
    created: 0,
    terminated: 0,
    /** What recognize returns per thresholding method ('1' adaptive Otsu, '2' Sauvola). */
    pages: { '1': [] as Page, '2': [] as Page } as Record<string, Page>,
    failNext: false,
    delayMs: 0,
    /** 'ok' | 'errorHandler' (a failed language load: only errorHandler hears of it) | 'hang' (never settles) */
    start: 'ok' as 'ok' | 'errorHandler' | 'hang',
    recognizeHangs: false,
    images: [] as unknown[],
  };
  const createWorker = vi.fn((_l: string, _o: number, options: { errorHandler?: (e: unknown) => void }) => {
    const id = ++state.created;
    if (state.start !== 'ok') {
      if (state.start === 'errorHandler') setTimeout(() => options.errorHandler?.('Error: Network error while fetching eng.traineddata'), 5);
      return new Promise(() => undefined); // tesseract.js 7: never settles when loadLanguage/initialize fails
    }
    let method = '0';
    return Promise.resolve({
      setParameters: async (p: Record<string, unknown>) => {
        if ('thresholding_method' in p) method = String(p.thresholding_method);
        log.push(`w${id}:set${method}`);
      },
      recognize: async (image: unknown, opts: Record<string, unknown> = {}) => {
        const m = String(opts.thresholding_method ?? method);
        state.images.push(image);
        log.push(`w${id}:rec${m}:start`);
        if (state.recognizeHangs) return new Promise(() => undefined);
        if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
        log.push(`w${id}:rec${m}:end`);
        if (state.failNext) { state.failNext = false; throw new Error('worker crashed'); }
        const page = state.pages[m] ?? [];
        return { data: { blocks: [{ paragraphs: [{ lines: page.map((words) => ({ words })) }] }] } };
      },
      terminate: async () => { state.terminated += 1; log.push(`w${id}:terminate`); },
    });
  });
  return { log, state, createWorker };
});
vi.mock('tesseract.js', () => ({ createWorker: fake.createWorker, OEM: { LSTM_ONLY: 1 }, PSM: { SPARSE_TEXT: '11' } }));
const downscaled: Array<{ width: number; height: number }> = [];
vi.mock('./decode', () => ({
  downscaleTo: (src: { width: number; height: number }, maxPx: number) => {
    const s = maxPx / Math.max(src.width, src.height);
    const c = { width: Math.round(src.width * s), height: Math.round(src.height * s), maxPx };
    downscaled.push(c);
    return c;
  },
}));

const w = (text: string, x: number, y: number, ww: number, h: number, line = 0, conf = 90): OcrWord => ({ text, conf, box: { x, y, w: ww, h }, line });
const bbox = (x: number, y: number, ww: number, h: number) => ({ x0: x, y0: y, x1: x + ww, y1: y + h });

describe('ocrMerge (pure)', () => {
  it('unionWords: all of the first pass, plus every second-pass LINE that is not wholly a re-reading', () => {
    const a = [w('CITY', 10, 10, 50, 20, 0), w('LUC', 100, 10, 40, 20, 1)];
    const b = [
      w('city', 12, 11, 50, 20, 0),                          // line 0: wholly a re-reading → skipped
      w('LUCAS', 100, 40, 70, 20, 1),                        // line 1: new → appended
      w('CITY', 400, 400, 50, 20, 2),                        // line 2: same text far away → another occurrence
    ];
    const u = unionWords(a, b);
    expect(u.map((x) => `${x.text}@${x.line}`)).toEqual(['CITY@0', 'LUC@1', 'LUCAS@3', 'CITY@4']); // b's lines shifted by 2
    expect(unionWords([], b)).toHaveLength(3);
    expect(unionWords(a, [])).toEqual(a);
  });

  it('unionWords keeps a second-pass sequence WHOLE even where words repeat the first pass (T-057 review)', () => {
    const lucas = makeTerm('v1', 'child_name', 'Lucas');
    // Spaced letters: pass A read only "U" and "S"; pass B read all five. The union must still match Lucas.
    const A1 = [w('U', 130, 10, 20, 30, 0), w('S', 220, 10, 20, 30, 0)];
    const B1 = ['L', 'U', 'C', 'A', 'S'].map((t, i) => w(t, 100 + i * 30, 10, 20, 30, 0));
    expect(matchWords(B1, [lucas], 0.8).length).toBe(1);
    expect(matchWords(unionWords(A1, B1), [lucas], 0.8).length).toBe(1);
    // A plate split over two words: pass A read "SE" and a sign word; pass B read "SE 1234".
    const plate = makeTerm('v2', 'plate', 'SE 1234');
    const A2 = [w('SE', 10, 100, 40, 30, 0), w('PARKING', 300, 100, 120, 30, 0)];
    const B2 = [w('SE', 10, 100, 40, 30, 0), w('1234', 60, 100, 80, 30, 0)];
    expect(matchWords(unionWords(A2, B2), [plate], 0.8).length).toBe(1);
    expect(plates(unionWords(A2, B2), ).length + matchWords(unionWords(A2, B2), [plate], 0.8).length).toBeGreaterThan(0);
    // A phone number across three words: pass A read the first two only.
    const A3 = [w('Call', 10, 200, 60, 30, 0), w('07700', 80, 200, 90, 30, 0)];
    const B3 = [w('Call', 10, 200, 60, 30, 0), w('07700', 80, 200, 90, 30, 0), w('900123', 180, 200, 110, 30, 0)];
    expect(phones(A3)).toHaveLength(0);
    expect(phones(unionWords(A3, B3))).toHaveLength(1);
  });

  it('unionWords: punctuation and case are not a new reading; the IoU boundary is inclusive', () => {
    const a = [w('Lucas', 0, 0, 30, 40)];
    expect(unionWords(a, [w('LUCAS,', 2, 0, 30, 40)])).toHaveLength(1);
    // Two 30×40 boxes 10 px apart overlap 20/40: IoU exactly SAME_WORD_IOU (0.5); 11 px apart: 19/41, just below.
    expect(SAME_WORD_IOU).toBe(0.5);
    expect(unionWords(a, [w('Lucas', 10, 0, 30, 40)])).toHaveLength(1); // IoU = 0.5: the same reading (inclusive)
    expect(unionWords(a, [w('Lucas', 11, 0, 30, 40)])).toHaveLength(2); // just below: another occurrence
  });

  it('boxToMaster scales x and y separately, rounds outward (a mask never shrinks) and clamps to the master', () => {
    expect(boxToMaster({ x: 100, y: 50, w: 10, h: 10 }, 0.78125, 0.78125, 2048, 1536)).toEqual({ x: 128, y: 64, w: 13, h: 13 });
    // Anisotropic: a downscale rounds each side, so sx ≠ sy.
    expect(boxToMaster({ x: 100, y: 100, w: 10, h: 10 }, 0.5, 0.25, 1000, 1000)).toEqual({ x: 200, y: 400, w: 20, h: 40 });
    // The far edges are CEILED, the near edges FLOORED (x1 = 2.6/0.5 = 5.2 → 6; rounding would give 5).
    expect(boxToMaster({ x: 0.9, y: 0.9, w: 1.7, h: 1.7 }, 0.5, 0.5, 100, 100)).toEqual({ x: 1, y: 1, w: 5, h: 5 });
    expect(boxToMaster({ x: 1590, y: 1190, w: 50, h: 50 }, 0.78125, 0.78125, 2048, 1536)).toMatchObject({ x: 2035, w: 13 });
    expect(boxToMaster({ x: -5, y: -5, w: 10, h: 10 }, 1, 1, 100, 100)).toEqual({ x: 0, y: 0, w: 5, h: 5 });
    expect(() => wordsToMaster([], 0, 1, 10, 10)).toThrow();
  });
});

describe('tier0/ocr (fake worker)', () => {
  let ocr: typeof import('./ocr');
  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.resetModules();
    fake.log.length = 0;
    Object.assign(fake.state, { created: 0, terminated: 0, failNext: false, delayMs: 0, start: 'ok', recognizeHangs: false, images: [] });
    fake.state.pages = { '1': [], '2': [] };
    downscaled.length = 0;
    fake.createWorker.mockClear();
    ocr = await import('./ocr');
  });
  afterEach(async () => {
    fake.state.recognizeHangs = false;
    await ocr.terminateOcr();
    vi.useRealTimers();
  });
  const canvas = (width: number, height: number) => ({ width, height }) as unknown as HTMLCanvasElement;
  const passes = () => fake.log.filter((l) => /rec\d:start/.test(l)).map((l) => l.replace(/^w\d+:rec(\d):start$/, '$1'));

  it('the worker starts in sparse-text mode with adaptive Otsu (D-81), never the default global Otsu', async () => {
    await ocr.ocrCanvas(canvas(100, 100), { union: false });
    expect(fake.log[0]).toBe('w1:set1');
    expect(passes()).toEqual(['1']);
  });

  it('ocrCanvas: adaptive Otsu, then Sauvola (each a per-job option), lines unioned; union:false runs one pass', async () => {
    fake.state.pages['1'] = [[{ text: 'CITY', confidence: 90, bbox: bbox(10, 10, 50, 20) }]];
    fake.state.pages['2'] = [
      [{ text: 'CITY', confidence: 80, bbox: bbox(11, 10, 50, 20) }],
      [{ text: 'LUCAS', confidence: 85, bbox: bbox(100, 60, 70, 20) }],
    ];
    expect((await ocr.ocrCanvas(canvas(400, 300))).map((x) => x.text)).toEqual(['CITY', 'LUCAS']);
    expect(passes()).toEqual(['1', '2']);
    fake.log.length = 0;
    expect((await ocr.ocrSinglePass(canvas(400, 300))).map((x) => x.text)).toEqual(['CITY']);
    expect(passes()).toEqual(['1']);
  });

  it('both passes read the same snapshot of the canvas, encoded once', async () => {
    let encodes = 0;
    const blob = new Blob(['png']);
    const c = { width: 10, height: 10, toBlob: (cb: (b: Blob | null) => void) => { encodes++; cb(blob); } } as unknown as HTMLCanvasElement;
    await ocr.ocrCanvas(c);
    expect(encodes).toBe(1);
    expect(fake.state.images).toEqual([blob, blob]);
  });

  it('an empty canvas is refused at once (tesseract.js would hang on it), and does not block later calls', async () => {
    await expect(ocr.ocrCanvas(canvas(0, 0))).rejects.toThrow('empty canvas');
    expect(fake.state.created).toBe(0);
    await expect(ocr.ocrCanvas(canvas(10, 10), { union: false })).resolves.toEqual([]);
  });

  it('two concurrent calls run one after the other', async () => {
    fake.state.delayMs = 5;
    await Promise.all([ocr.ocrCanvas(canvas(10, 10)), ocr.ocrCanvas(canvas(10, 10))]);
    const seq = fake.log.filter((l) => /rec\d:(start|end)/.test(l)).map((l) => l.replace(/^w\d+:/, ''));
    expect(seq).toEqual(['rec1:start', 'rec1:end', 'rec2:start', 'rec2:end', 'rec1:start', 'rec1:end', 'rec2:start', 'rec2:end']);
  });

  it('ocrMaster: downscales a 2048 master to 1600 (never upscales), maps boxes back (AC-118) and frees the downscale', async () => {
    fake.state.pages['1'] = [[{ text: 'LUCAS', confidence: 90, bbox: bbox(800, 600, 100, 40) }]];
    const words = await ocr.ocrMaster(canvas(2048, 1536), { union: false });
    expect(downscaled.map((d) => (d as unknown as { maxPx: number }).maxPx)).toEqual([1600]);
    expect(words[0].box).toEqual({ x: 1024, y: 768, w: 128, h: 52 }); // ×1.28, rounded outward
    expect(downscaled[0]).toMatchObject({ width: 0, height: 0 }); // released after use (ARCH §18)
    downscaled.length = 0;
    const small = canvas(1200, 800);
    await ocr.ocrMaster(small, { union: false });
    expect(downscaled).toEqual([]); // smaller than ocr_max_px: OCR reads the master itself
    expect(small).toMatchObject({ width: 1200, height: 800 }); // and never frees the master
    await ocr.ocrMaster(canvas(2048, 1536), { maxPx: 'huge', union: false });
    expect((downscaled[0] as unknown as { maxPx: number }).maxPx).toBe(1600); // an invalid RC value is the default
  });

  it('clampOcrMaxPx: RC ocr_max_px within 800–2048, else the default', () => {
    expect(ocr.clampOcrMaxPx(1600)).toBe(1600);
    expect(ocr.clampOcrMaxPx(100)).toBe(800);
    expect(ocr.clampOcrMaxPx(9000)).toBe(2048);
    expect(ocr.clampOcrMaxPx(Number.NaN)).toBe(ocr.OCR_MAX_PX);
    expect(ocr.clampOcrMaxPx('1600')).toBe(ocr.OCR_MAX_PX);
  });

  it('a failed language load (reported only to errorHandler; createWorker never settles) fails the call, and the next call starts afresh', async () => {
    fake.state.start = 'errorHandler';
    await expect(ocr.ocrCanvas(canvas(10, 10))).rejects.toThrow(/traineddata/);
    fake.state.start = 'ok';
    await expect(ocr.ocrCanvas(canvas(10, 10), { union: false })).resolves.toEqual([]);
    expect(fake.state.created).toBe(2);
  });

  it('a start that never settles times out; terminate and later calls never hang on it', async () => {
    fake.state.start = 'hang';
    const first = ocr.ocrCanvas(canvas(10, 10));
    first.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(ocr.OCR_START_TIMEOUT_MS + 10);
    await expect(first).rejects.toThrow('start timed out');
    fake.state.start = 'ok';
    await expect(ocr.terminateOcr()).resolves.toBeUndefined();
    await expect(ocr.ocrCanvas(canvas(10, 10), { union: false })).resolves.toEqual([]);
  });

  it('terminate while a start is still pending returns at once: a drop never waits on a start that may never settle', async () => {
    fake.state.start = 'hang';
    ocr.retainOcr()(); // warm (a start that will never settle is now pending), then release
    let done = false;
    void ocr.terminateOcr().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toBe(true);
    fake.state.start = 'ok';
    await expect(ocr.ocrCanvas(canvas(10, 10), { union: false })).resolves.toEqual([]); // and a new worker serves the next call
  });

  it('a pass that never returns times out, the worker is dropped, and the next call gets a new one', async () => {
    await ocr.ocrCanvas(canvas(10, 10), { union: false }); // worker 1 up
    fake.state.recognizeHangs = true;
    const stuck = ocr.ocrCanvas(canvas(10, 10), { union: false });
    stuck.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(ocr.OCR_PASS_TIMEOUT_MS + 10);
    await expect(stuck).rejects.toThrow('recognize timed out');
    expect(fake.state.terminated).toBe(1);
    fake.state.recognizeHangs = false;
    await ocr.ocrCanvas(canvas(10, 10), { union: false });
    expect(fake.state.created).toBe(2);
  });

  it('a worker that fails a job is replaced on the next call', async () => {
    fake.state.failNext = true;
    await expect(ocr.ocrCanvas(canvas(10, 10), { union: false })).rejects.toThrow('worker crashed');
    expect(fake.state.terminated).toBe(1);
    await ocr.ocrCanvas(canvas(10, 10), { union: false });
    expect(fake.state.created).toBe(2);
  });

  it('lifetime: with nothing holding it, the worker is terminated OCR_IDLE_MS after the END of its last job', async () => {
    fake.state.delayMs = 20_000; // a slow job (under the pass timeout): the countdown starts when it ENDS
    const job = ocr.ocrCanvas(canvas(10, 10), { union: false });
    await vi.advanceTimersByTimeAsync(20_010);
    await job;
    await vi.advanceTimersByTimeAsync(ocr.OCR_IDLE_MS - 1000); // 5 min after the START, but not yet after the end
    expect(fake.state.terminated).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.state.terminated).toBe(1);
    fake.state.delayMs = 0;
    await ocr.ocrCanvas(canvas(10, 10)); // the next call creates a new worker
    expect(fake.state.created).toBe(2);
  });

  it('lifetime: retainOcr warms the worker at once and keeps it while held; release starts the idle countdown', async () => {
    const release = ocr.retainOcr();
    await vi.advanceTimersByTimeAsync(10);
    expect(fake.state.created).toBe(1); // warmed without any OCR call
    await vi.advanceTimersByTimeAsync(ocr.OCR_IDLE_MS * 3);
    expect(fake.state.terminated).toBe(0);
    release();
    release(); // idempotent: holds never go negative
    await vi.advanceTimersByTimeAsync(ocr.OCR_IDLE_MS + 1000);
    expect(fake.state.terminated).toBe(1);
  });

  it('lifetime: no job can outlast the idle countdown (start + two passes are bounded below OCR_IDLE_MS)', () => {
    // So the countdown armed when a job starts can never fire during that job; the idle drop's own re-check (holds and
    // a re-armed timer) is defence in depth.
    expect(ocr.OCR_START_TIMEOUT_MS + 2 * ocr.OCR_PASS_TIMEOUT_MS).toBeLessThan(ocr.OCR_IDLE_MS);
  });

});
