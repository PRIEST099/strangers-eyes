// web/src/tier0/fuzzy.ts: THE vault matcher (D-38). One algorithm for Tier-0 OCR, the gate's image re-check, the S2/S3
// prompt scans, the tripwire text scan and the pass-B echo scan (and iOS, through shared/testvectors/fuzzy.json).
// Behaviour contract: SPEC SCR-06 step 3 as fixed by R-15, ARCH §8.4, AC-042, AC-110. NOT a port of the pre-R-15
// research/day1-artifacts/arch/src/fuzzy.ts (that one strips possessive 's, uses extra folds and matches digits as substrings).
// The word lists come from shared/prompts/enums.v1.json (SPEC §17.5). Vault strings flow through here: no logging (R9).
// Tier-0 must never import vault/* (R13): terms arrive as plain arguments.
import enums from '@prompts/enums.v1.json';
import { DIGIT_KINDS, type VaultKind } from '../core/types';

// ---------- threshold (RC fuzzy_threshold, ARCH §13: default 0.8, clamped 0.6–0.98) ----------
export const DEFAULT_FUZZY_THRESHOLD = 0.8;
export const FUZZY_THRESHOLD_MIN = 0.6;
export const FUZZY_THRESHOLD_MAX = 0.98;

/** RC value → threshold. Non-numbers and non-finite values fall back to 0.8; others are clamped to 0.6–0.98. */
export function clampFuzzyThreshold(x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return DEFAULT_FUZZY_THRESHOLD;
  return Math.min(FUZZY_THRESHOLD_MAX, Math.max(FUZZY_THRESHOLD_MIN, x));
}

// ---------- word lists (enums.v1.json) ----------
export const GENERIC_WORDS: ReadonlySet<string> = new Set(enums.GENERIC_WORDS);
export const GENERIC_PIN_LABELS: ReadonlySet<string> = new Set(enums.GENERIC_PIN_LABELS);
export const SYNONYM_CLASSES: readonly (readonly string[])[] = enums.SYNONYM_CLASSES;
export const ARTEFACT_TERMS: readonly string[] = enums.ARTEFACT_TERMS;
/** SCR-06 folds only. A Map, so a token such as "constructor" can never hit an Object.prototype key. */
export const WORD_FOLDS: ReadonlyMap<string, string> = new Map(Object.entries(enums.WORD_FOLDS));
/**
 * Function words. A pair made only of these ("of the") never counts as "two consecutive label tokens": it carries no
 * identifying information and would trip on almost any sentence. They are also the words an acronym skips (§10.3).
 */
export const FUNCTION_WORDS: ReadonlySet<string> = new Set(['the', 'of', 'and', 'for', 'at', 'in', 'on']);

export const foldWord = (t: string): string => WORD_FOLDS.get(t) ?? t;
/** Fold targets whose source word is generic ("st" from street/saint, "rd" from road, "ave" from avenue). */
const GENERIC_FOLDED: ReadonlySet<string> = new Set([...WORD_FOLDS].filter(([k]) => GENERIC_WORDS.has(k)).map(([, v]) => v));
/** Generic = on the §17.5 list, or the fold of a word on it. */
export const isGeneric = (t: string): boolean => GENERIC_WORDS.has(t) || GENERIC_FOLDED.has(t);
/** Distinctive = ≥4 characters and not generic (SPEC SCR-06 rule (a)). */
export const isDistinctive = (t: string): boolean => t.length >= 4 && !isGeneric(t);

// ---------- normalisation ----------
/**
 * SPEC SCR-06: NFKD, strip diacritics, lowercase, DELETE apostrophes ("Mary's" → "marys"), & → and, every other
 * punctuation (periods, hyphens, …) → space, collapse whitespace. No word folding here (see tokens()).
 * Invisible format characters (\p{Cf}: soft hyphen, zero-width space, …) are deleted, not spaced, so "Lu\u00ADcas"
 * stays one word (D-77).
 */
export function normalize(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/['‘’ʼ\p{Cf}]/gu, '').replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Digit kinds: NFKD, no diacritics, uppercase, and keep letters and digits only ("SE-1234" → "SE1234"). */
export function alnum(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** OCR-confusable skeleton (0→o, 1/l→i, 5→s, 8→b), applied to BOTH sides and only to tokens that contain a letter. */
export function skeleton(t: string): string {
  return /\p{L}/u.test(t) ? t.replace(/0/g, 'o').replace(/[1l]/g, 'i').replace(/5/g, 's').replace(/8/g, 'b') : t;
}

export function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

/** 1 − levenshtein / maxLength on the skeletons. Tokens of ≤3 characters must be equal (after the skeleton). */
export function tokenSim(a: string, b: string): number {
  const x = skeleton(a);
  const y = skeleton(b);
  if (x.length <= 3 || y.length <= 3) return x === y ? 1 : 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

// ---------- words → tokens ----------
/** An OCR word (Tier-0, gate image re-check) or a whitespace-separated word of a text. `line` = its OCR line. */
export interface WordLike { text: string; line?: number }
/** A token and the range of source words it came from (inclusive), so a hit can be turned into a mask. */
interface Tok { t: string; from: number; to: number; line: number }
/** Indices of the first and last word a hit covers (inclusive). */
export type Span = readonly [from: number, to: number];

function rawTokens(words: readonly WordLike[]): Tok[] {
  const out: Tok[] = [];
  words.forEach((w, i) => {
    for (const t of normalize(w.text).split(' ')) if (t) out.push({ t, from: i, to: i, line: w.line ?? 0 });
  });
  return out;
}

/** SPEC SCR-06: on ONE OCR line, a run of single-character tokens ("L U C A S") becomes one token. */
function joinSpaced(toks: readonly Tok[]): Tok[] {
  const out: Tok[] = [];
  let run: Tok[] = [];
  const flush = () => {
    if (run.length >= 2) out.push({ t: run.map((r) => r.t).join(''), from: run[0].from, to: run[run.length - 1].to, line: run[0].line });
    else out.push(...run);
    run = [];
  };
  for (const k of toks) {
    if (k.t.length === 1 && (run.length === 0 || run[0].line === k.line)) run.push(k);
    else {
      flush();
      if (k.t.length === 1) run.push(k);
      else out.push(k);
    }
  }
  flush();
  return out;
}

/**
 * The token sequences a term is matched against: the joined sequence, plus the unjoined one when joining changed
 * anything (so a 1-letter term next to other single letters is not lost). Word folds are applied to both.
 */
function sequences(words: readonly WordLike[]): Tok[][] {
  const raw = rawTokens(words);
  const joined = joinSpaced(raw);
  const fold = (s: Tok[]) => s.map((k) => ({ ...k, t: foldWord(k.t) }));
  return joined.length === raw.length ? [fold(raw)] : [fold(joined), fold(raw)];
}

/** Normalised, spaced-letter-joined, folded tokens of a label or claim ("Saint Mary's Road" → st marys rd). */
export function tokens(s: string): string[] {
  return joinSpaced(rawTokens([{ text: s }])).map((k) => foldWord(k.t));
}

/** Whitespace-separated words of a prompt or echo text, all on one "line". */
export function wordsOfText(text: string): WordLike[] {
  return text.split(/\s+/u).filter(Boolean).map((w) => ({ text: w }));
}

// ---------- terms ----------
export type MatchMode = 'image' | 'text';
/** One vault string (a label or an alias). `digit` = plate / house_number / phone. LOCAL ONLY. */
export interface Term { vaultId: string; kind: VaultKind; text: string; digit: boolean }

export const isDigitKind = (k: VaultKind): boolean => DIGIT_KINDS.includes(k);
export function makeTerm(vaultId: string, kind: VaultKind, text: string): Term {
  return { vaultId, kind, text, digit: isDigitKind(kind) };
}

/** Number of groups in a digit value, counted on the normalised value so any punctuation separates
 *  ("+44 20 7946 0958" → 4, "+44 (20) 7946.0958" → 4; D-77). */
const groupsOf = (s: string) => normalize(s).split(' ').filter(Boolean).length;
/** A digit value may span this many adjacent words: SPEC says up to 2; a value written in more groups may span them all. */
const MAX_DIGIT_WINDOW = 6;

/**
 * Digit kinds (SPEC SCR-06): no confusable folding; letters and digits only, uppercase; equal to one word or to
 * adjacent words joined (never a substring). Values of 1–2 characters match only a standalone word, and only in
 * images; text scans (prompt, echo) skip them.
 */
function digitSpans(term: Term, words: readonly WordLike[], mode: MatchMode): Span[] {
  const t = alnum(term.text);
  if (!t) return [];
  // Two views of the same words, each entry keeping its source word index: whole words ("SE-1234" → SE1234) and the
  // sub-words punctuation separates ("Tel:07700900123" → TEL | 07700900123), because SPEC SCR-06 turns punctuation
  // into a space for every kind (D-77, review T-058 major). A lone "-" is not a word in either view.
  const whole = words.map((w, i) => ({ a: alnum(w.text), i })).filter((w) => w.a);
  const subs = words.flatMap((w, i) => normalize(w.text).split(' ').map((x) => ({ a: alnum(x), i }))).filter((w) => w.a);
  if (t.length < 3) {
    if (mode !== 'image') return [];
    return [...whole, ...subs].filter((w) => w.a === t).map((w) => [w.i, w.i] as const);
  }
  const maxW = Math.min(MAX_DIGIT_WINDOW, Math.max(2, groupsOf(term.text)));
  const out: Span[] = [];
  // The sub-word view may join up to MAX_DIGIT_WINDOW sub-words ("Tel:077-0090-0123" vs a vault "07700 900123"):
  // exact equality at sub-word boundaries still rules out substrings (verifier, D-77).
  for (const [ws, win] of [[whole, maxW], [subs, MAX_DIGIT_WINDOW]] as const) {
    for (let s = 0; s < ws.length; s++) {
      let acc = '';
      for (let k = s; k < ws.length && k - s < win && acc.length < t.length; k++) {
        acc += ws[k].a;
        if (acc === t) out.push([ws[s].i, ws[k].i]);
      }
    }
  }
  return out;
}

/**
 * Text kinds (SPEC SCR-06):
 * - a single-token label matches a token by similarity (a ≤3-character generic word like "the" never matches);
 * - a multi-word label matches on (a) one distinctive label token, (b) two consecutive label tokens against two
 *   consecutive tokens (not a pair of function words), or (c) the whole label against a window of the same length.
 */
function textSpans(labelToks: readonly string[], seq: readonly Tok[], theta: number): Span[] {
  const n = labelToks.length;
  if (n === 0) return [];
  const sim = (a: string, b: Tok) => tokenSim(a, b.t) >= theta;
  const out: Span[] = [];
  if (n === 1) {
    const [t] = labelToks;
    if (t.length < 4 && isGeneric(t)) return [];
    for (const w of seq) if (sim(t, w)) out.push([w.from, w.to]);
    return out;
  }
  for (const t of labelToks) {                                                          // (a)
    if (isDistinctive(t)) for (const w of seq) if (sim(t, w)) out.push([w.from, w.to]);
  }
  for (let i = 0; i + 1 < n; i++) {                                                     // (b)
    if (FUNCTION_WORDS.has(labelToks[i]) && FUNCTION_WORDS.has(labelToks[i + 1])) continue;
    for (let j = 0; j + 1 < seq.length; j++) {
      if (sim(labelToks[i], seq[j]) && sim(labelToks[i + 1], seq[j + 1])) out.push([seq[j].from, seq[j + 1].to]);
    }
  }
  for (let j = 0; j + n <= seq.length; j++) {                                           // (c)
    if (labelToks.every((t, k) => sim(t, seq[j + k]))) out.push([seq[j].from, seq[j + n - 1].to]);
  }
  return out;
}

/** Sort and merge overlapping spans (spans that only touch stay separate). */
export function mergeSpans(spans: readonly Span[]): Span[] {
  const s = [...spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number][] = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** The words of one scan, tokenised once for every term. */
interface Prepared { words: readonly WordLike[]; seqs: Tok[][] }
/** "Ava's" / "JO'S" → "Ava" / "JO": the possessive form of a word, without its 's (D-77). */
const POSSESSIVE = /(\p{L})['‘’ʼ][sS](?![\p{L}\p{N}])/gu;
/**
 * Text kinds also see each word with a possessive 's removed: deleting the apostrophe turns "Ava's" into "avas",
 * which can never equal a ≤3-character name such as "Ava" (exact-match rule), so short child names were missed
 * (review T-058). Same word indices, so spans stay valid; "St Mary's" still matches via the unstripped sequence.
 */
const prepare = (words: readonly WordLike[]): Prepared => {
  const seqs = sequences(words);
  const variant = (f: (t: string) => string) => {
    const v = words.map((w) => ({ ...w, text: f(w.text) }));
    if (v.some((w, i) => w.text !== words[i].text)) seqs.push(...sequences(v));
  };
  variant((t) => t.replace(POSSESSIVE, '$1'));
  // normalize() deletes format characters (so "Lu\u00ADcas" stays one word); a zero-width space can also separate two
  // words ("Lucas\u200Bschool"), so the spaced reading is scanned too. Fail closed: both readings count (verifier, D-77).
  variant((t) => t.replace(/\p{Cf}/gu, ' '));
  return { words, seqs };
};

function spansIn(term: Term, p: Prepared, theta: number, mode: MatchMode): Span[] {
  if (term.digit) return mergeSpans(digitSpans(term, p.words, mode));
  const lt = tokens(term.text);
  return mergeSpans(p.seqs.flatMap((seq) => textSpans(lt, seq, theta)));
}

/** Every place `term` occurs in `words` (merged word-index spans; empty = no match). */
export function termSpans(term: Term, words: readonly WordLike[], theta: number, mode: MatchMode): Span[] {
  return spansIn(term, prepare(words), theta, mode);
}

export function termInWords(term: Term, words: readonly WordLike[], theta: number, mode: MatchMode): boolean {
  return termSpans(term, words, theta, mode).length > 0;
}

export interface WordHit { term: Term; spans: Span[] }
/** Tier-0 and the gate's image re-check: every term found in the OCR words, with the word spans to mask (AC-110). */
export function matchWords(words: readonly WordLike[], terms: readonly Term[], theta: number, mode: MatchMode = 'image'): WordHit[] {
  const p = prepare(words);
  const out: WordHit[] = [];
  for (const term of terms) {
    const spans = spansIn(term, p, theta, mode);
    if (spans.length) out.push({ term, spans });
  }
  return out;
}

export interface TextMatch { term: Term; /** the words of `text` that matched (first occurrence). LOCAL ONLY. */ matched: string }
/** Prompt and echo scans: the first term found in `text` and the words it matched, or null. */
export function firstMatchInText(text: string, terms: readonly Term[], theta: number): TextMatch | null {
  const p = prepare(wordsOfText(text));
  for (const term of terms) {
    const spans = spansIn(term, p, theta, 'text');
    if (spans.length) return { term, matched: p.words.slice(spans[0][0], spans[0][1] + 1).map((w) => w.text).join(' ') };
  }
  return null;
}

/** Prompt and echo scans: the first term found in `text`, or null. */
export function findInText(text: string, terms: readonly Term[], theta: number): Term | null {
  return firstMatchInText(text, terms, theta)?.term ?? null;
}

/** Every term found in `text`, in `terms` order. */
export function findAllInText(text: string, terms: readonly Term[], theta: number): Term[] {
  const p = prepare(wordsOfText(text));
  return terms.filter((t) => spansIn(t, p, theta, 'text').length > 0);
}
