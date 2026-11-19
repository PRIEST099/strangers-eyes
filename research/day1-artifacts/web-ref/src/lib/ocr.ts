import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';

let workerP: Promise<Worker> | null = null;

export function getOcrWorker(): Promise<Worker> {
  workerP ??= createWorker('eng', OEM.LSTM_ONLY, {
    // Paths are resolved against window.location.href by tesseract.js
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract/core', // DIRECTORY, not a single .js file
    langPath: '/tesseract/lang', // fetches `${langPath}/eng.traineddata.gz`
    // cacheMethod default 'write' caches traineddata in IndexedDB (idb-keyval default store)
    // logger: (m) => console.log(m),
  });
  return workerP;
}

export interface OcrWord { text: string; conf: number; x0: number; y0: number; x1: number; y1: number }

export async function ocrWords(img: HTMLCanvasElement | OffscreenCanvas | Blob): Promise<OcrWord[]> {
  const w = await getOcrWorker();
  await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  // v6+: only `text` is returned unless you ask for `blocks`
  const { data } = await w.recognize(img, {}, { blocks: true, text: true });
  const out: OcrWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        for (const word of line.words) {
          out.push({ text: word.text, conf: word.confidence, ...word.bbox });
        }
      }
    }
  }
  return out;
}
