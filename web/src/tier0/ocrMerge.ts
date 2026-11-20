// web/src/tier0/ocrMerge.ts: pure helpers for Tier-0 OCR (T-057; D-81; AC-118). Node-testable.
// - unionWords: the words of two binarisation passes (adaptive Otsu, then Sauvola) as one list, without duplicates.
// - wordsToMaster: word boxes from the OCR canvas (a downscale of the master) back to master pixels.
import { iou } from '../core/boxes';
import type { OcrWord, PxRect } from '../core/types';

/** Two readings are the same word when their letters and digits match and their boxes overlap at least this much. */
export const SAME_WORD_IOU = 0.5;

const key = (t: string) => t.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Every word of `a`, plus every LINE of `b` that is not wholly a re-reading of `a` (D-81: a word either pass found
 * counts). The union works by line, not by word: the matcher joins spaced letters within a line and reads digit
 * sequences across adjacent words, and the phone/house-number detectors read whole lines, so dropping `b`'s copies of
 * words `a` also read would split a sequence that only `b` read in full ("L U C A S", "SE 1234", a phone number;
 * T-057 review). A `b` line is skipped only when every word on it is the same reading of a word of `a` (same letters
 * and digits, boxes overlapping ≥ SAME_WORD_IOU); otherwise it is appended whole. Its line ids are shifted past a's,
 * so a line never mixes the two passes. Duplicate words only over-mask, which is fail-safe. Near-linear: a's boxes are
 * bucketed by their text key.
 */
export function unionWords(a: readonly OcrWord[], b: readonly OcrWord[]): OcrWord[] {
  const shift = a.reduce((m, w) => Math.max(m, w.line), -1) + 1;
  const byKey = new Map<string, PxRect[]>();
  for (const x of a) {
    const k = key(x.text);
    const boxes = byKey.get(k);
    if (boxes) boxes.push(x.box);
    else byKey.set(k, [x.box]);
  }
  const reread = (w: OcrWord) => (byKey.get(key(w.text)) ?? []).some((box) => iou(box, w.box) >= SAME_WORD_IOU);
  const lines = new Map<number, OcrWord[]>();
  for (const w of b) {
    const l = lines.get(w.line);
    if (l) l.push(w);
    else lines.set(w.line, [w]);
  }
  const out = [...a];
  for (const words of lines.values()) {
    if (words.every(reread)) continue;
    for (const w of words) out.push({ ...w, line: w.line + shift });
  }
  return out;
}

/**
 * A box from canvas pixels to master pixels. `sx`/`sy` = canvas size / master size (≤ 1; the downscale keeps the aspect
 * ratio but rounds each side, so x and y are scaled separately). Rounds outward, so a mask built on it never shrinks,
 * and clamps to the master.
 */
export function boxToMaster(r: PxRect, sx: number, sy: number, W: number, H: number): PxRect {
  const x0 = Math.max(0, Math.floor(r.x / sx));
  const y0 = Math.max(0, Math.floor(r.y / sy));
  const x1 = Math.min(W, Math.ceil((r.x + r.w) / sx));
  const y1 = Math.min(H, Math.ceil((r.y + r.h) / sy));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** Every word's box mapped to master pixels (AC-118: all boxes live in the master frame, D-20). */
export function wordsToMaster(words: readonly OcrWord[], sx: number, sy: number, W: number, H: number): OcrWord[] {
  if (!(sx > 0 && sy > 0)) throw new Error('wordsToMaster: non-positive scale');
  return words.map((w) => ({ ...w, box: boxToMaster(w.box, sx, sy, W, H) }));
}
