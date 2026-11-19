// web/src/tier0/ocr.ts: Tesseract worker singleton (ARCH §11.2, API-NOTES §5.2).
// Tesseract rejects ImageBitmap: pass a canvas. v6+ returns word boxes only with {blocks: true}.
// Assets are self-hosted under /vendor (copied by scripts/copy-assets.mjs); never a CDN.
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import type { OcrWord } from '../core/types';

export const TESSERACT_BASE = '/vendor/tesseract-7.0.0';

let workerP: Promise<Worker> | null = null;

export function getOcrWorker(): Promise<Worker> {
  workerP ??= (async () => {
    const w = await createWorker('eng', OEM.LSTM_ONLY, {
      // Paths resolve against window.location.href.
      workerPath: `${TESSERACT_BASE}/worker.min.js`,
      corePath: `${TESSERACT_BASE}/core`, // a DIRECTORY holding the three *-lstm.wasm.js cores
      langPath: `${TESSERACT_BASE}/lang`, // fetches `${langPath}/eng.traineddata.gz`
      // cacheMethod 'write' (default) caches traineddata in idb-keyval's default 'keyval-store'. Never clear it.
    });
    await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    return w;
  })();
  workerP.catch(() => { workerP = null; });
  return workerP;
}

/** OCR words with boxes in the pixels of the given canvas (the caller maps them to the master frame). */
export async function ocrWords(img: HTMLCanvasElement | OffscreenCanvas): Promise<OcrWord[]> {
  const w = await getOcrWorker();
  const { data } = await w.recognize(img, {}, { blocks: true, text: true });
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
