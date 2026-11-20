// web/src/tier0/regex.ts: Tier-0 regex flags on OCR words (SPEC SCR-06 step 4, ARCH §11.2 step 4). Conservative:
// every hit is pre-ticked as a mask in both modes (D-16), and the Nano pre-screen and the vault matcher are the other
// readers. Pure functions over OcrWord[] (master-pixel boxes); the caller turns hits into clues. Matched text is LOCAL ONLY.
import type { OcrWord, PxRect } from '../core/types';

export type RegexKind = 'plate' | 'phone' | 'house_number';
export interface RegexHit {
  kind: RegexKind;
  /** Indices into the OcrWord[] passed in, ascending. */
  words: number[];
  /** Union of those words' boxes (master px). */
  box: PxRect;
  /** The matched text, for the local side list only. Never sent, never logged. */
  text: string;
}

/** SPEC SCR-06: plate-like tokens need OCR confidence ≥ 60. */
export const PLATE_MIN_CONF = 60;
/** SPEC SCR-06: a house-number candidate's box is at least 2% of the image height. */
export const HOUSE_NUMBER_MIN_HEIGHT_RATIO = 0.02;

/** Strip leading and trailing punctuation ("12," → "12", "(SE1234)" → "SE1234"). */
export const trimPunct = (s: string): string => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/**
 * Plate-like: ONE token of 5–8 alphanumerics with ≥2 letters and ≥2 digits (internal hyphens allowed and not
 * counted: "AB-123-CD"). Confidence is checked by the caller (plates()).
 */
export function isPlateLike(text: string): boolean {
  const t = trimPunct(text.normalize('NFKC'));
  if (!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(t)) return false;
  const a = t.replace(/-/g, '');
  if (a.length < 5 || a.length > 8) return false;
  const letters = (a.match(/\p{L}/gu) ?? []).length;
  const digits = (a.match(/\p{Nd}/gu) ?? []).length;
  return letters >= 2 && digits >= 2 && letters + digits === a.length;
}

/** House-number candidate text: 1–4 digits plus an optional letter ("12", "7b", "1024A"). */
export function isHouseNumberText(text: string): boolean {
  return /^\d{1,4}\p{L}?$/u.test(trimPunct(text.normalize('NFKC')));
}

/**
 * Phone: 7–15 digits, with `+ - . space` as the only separators (a leading + allowed). Not preceded by a letter, digit
 * or +, and not followed by a digit, so a longer digit run is not cut into a phone. A trailing letter is allowed
 * ("07700900123x" is flagged): over-masking is the safe side. Runs on one OCR line joined with spaces.
 */
export const PHONE_RE = /(?<![\p{L}\p{N}+])(?:\+ ?)?\d(?:[ .-]{0,3}\d){6,14}(?![\p{N}])/gu;

export function unionRect(rects: readonly PxRect[]): PxRect {
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Word indices grouped by OCR line, in input order. */
function lines(words: readonly OcrWord[]): number[][] {
  const by = new Map<number, number[]>();
  words.forEach((w, i) => {
    const l = by.get(w.line);
    if (l) l.push(i);
    else by.set(w.line, [i]);
  });
  return [...by.values()];
}

const hit = (kind: RegexKind, words: readonly OcrWord[], idx: number[], text: string): RegexHit =>
  ({ kind, words: idx, box: unionRect(idx.map((i) => words[i].box)), text });

export function plates(words: readonly OcrWord[]): RegexHit[] {
  const out: RegexHit[] = [];
  words.forEach((w, i) => {
    if (w.conf >= PLATE_MIN_CONF && isPlateLike(w.text)) out.push(hit('plate', words, [i], trimPunct(w.text)));
  });
  return out;
}

export function phones(words: readonly OcrWord[]): RegexHit[] {
  const out: RegexHit[] = [];
  for (const idx of lines(words)) {
    let s = '';
    const spans: { i: number; a: number; b: number }[] = [];
    for (const i of idx) {
      if (s) s += ' ';
      spans.push({ i, a: s.length, b: s.length + words[i].text.length });
      s += words[i].text;
    }
    for (const m of s.matchAll(PHONE_RE)) {
      const a = m.index ?? 0;
      const b = a + m[0].length;
      const covered = spans.filter((sp) => sp.a < b && sp.b > a).map((sp) => sp.i);
      if (covered.length) out.push(hit('phone', words, covered, m[0]));
    }
  }
  return out;
}

/** A standalone 1–4 digit (+ letter) token, alone on its OCR line, with a box ≥ 2% of the image height. */
export function houseNumbers(words: readonly OcrWord[], imageHeight: number): RegexHit[] {
  const out: RegexHit[] = [];
  for (const idx of lines(words)) {
    const real = idx.filter((i) => trimPunct(words[i].text) !== '');   // stray punctuation is OCR noise, not a word
    if (real.length !== 1) continue;
    const w = words[real[0]];
    if (isHouseNumberText(w.text) && w.box.h >= HOUSE_NUMBER_MIN_HEIGHT_RATIO * imageHeight) {
      out.push(hit('house_number', words, [real[0]], trimPunct(w.text)));
    }
  }
  return out;
}

/** All three detectors (SPEC SCR-06 step 4). `imageHeight` is the master height in px (OcrWord boxes are master px). */
export function regexFlags(words: readonly OcrWord[], imageHeight: number): RegexHit[] {
  return [...plates(words), ...phones(words), ...houseNumbers(words, imageHeight)];
}
