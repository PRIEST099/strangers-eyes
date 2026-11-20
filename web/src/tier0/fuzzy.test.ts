import { describe, expect, it } from 'vitest';
import vectors from '@vectors/fuzzy.json';
import enums from '@prompts/enums.v1.json';
import {
  alnum, ARTEFACT_TERMS, clampFuzzyThreshold, DEFAULT_FUZZY_THRESHOLD, findAllInText, findInText, foldWord, GENERIC_PIN_LABELS,
  GENERIC_WORDS, isDistinctive, isGeneric, levenshtein, makeTerm, matchWords, mergeSpans, normalize, SYNONYM_CLASSES, termInWords,
  termSpans, tokens, tokenSim, wordsOfText, WORD_FOLDS, type MatchMode, type Term, type WordLike,
} from './fuzzy';
import { VAULT_KINDS, type VaultKind } from '../core/types';

// ---------- shared/testvectors/fuzzy.json (SPEC §10.7, AC-168: the iOS XCTest port runs the same file) ----------

interface VTerm { vaultId: string; kind: VaultKind; text: string }
type VCase =
  | { fn: 'match'; name: string; ac?: string; term: string; mode: MatchMode; words?: string[]; lines?: string[][]; text?: string;
      threshold?: number; expect: { match: boolean; spans?: [number, number][] } }
  | { fn: 'normalize'; name: string; input: string; expect: string }
  | { fn: 'alnum'; name: string; input: string; expect: string }
  | { fn: 'tokens'; name: string; input: string; expect: string[] }
  | { fn: 'tokenSim'; name: string; a: string; b: string; expect: { sim: number } }
  | { fn: 'clampThreshold'; name: string; input: unknown; expect: number }
  | { fn: 'termsOf'; name: string }   // run by web/src/ai/vaultScan.test.ts
  | { fn: 'coords'; name: string };   // run by web/src/ai/vaultScan.test.ts
type Fn = VCase['fn'];

const V = vectors as unknown as { description: string; conventions: string[]; threshold: number; terms: Record<string, VTerm>; cases: VCase[] };
const FNS: readonly Fn[] = ['match', 'normalize', 'alnum', 'tokens', 'tokenSim', 'clampThreshold', 'termsOf', 'coords'];
const casesOf = <F extends Fn>(fn: F) => V.cases.filter((c): c is Extract<VCase, { fn: F }> => c.fn === fn);
const term = (key: string): Term => {
  const t = V.terms[key];
  if (!t) throw new Error(`fuzzy.json: unknown term ${key}`);
  return makeTerm(t.vaultId, t.kind, t.text);
};
/** `words` = one OCR line; `lines` = several; `text` = a prompt/echo string. */
function wordsOf(c: Extract<VCase, { fn: 'match' }>): WordLike[] {
  if (c.text !== undefined) return wordsOfText(c.text);
  if (c.lines) return c.lines.flatMap((l, line) => l.map((text) => ({ text, line })));
  return (c.words ?? []).map((text) => ({ text, line: 0 }));
}

describe('fuzzy.json is well formed', () => {
  it('is self-describing, uses only known functions, and covers each of them', () => {
    expect(V.description.length).toBeGreaterThan(0);
    expect(V.conventions.length).toBeGreaterThan(0);
    for (const c of V.cases) expect(FNS).toContain(c.fn);
    for (const fn of FNS) expect(casesOf(fn).length, fn).toBeGreaterThan(0);
  });
  it('names every case uniquely within its function', () => {
    for (const fn of FNS) {
      const names = casesOf(fn).map((c) => c.name);
      expect(new Set(names).size, fn).toBe(names.length);
    }
  });
  it('uses the RC default threshold, known vault kinds and only defined terms', () => {
    expect(V.threshold).toBe(DEFAULT_FUZZY_THRESHOLD);
    for (const t of Object.values(V.terms)) expect(VAULT_KINDS).toContain(t.kind);
    for (const c of casesOf('match')) {
      expect(V.terms[c.term], c.name).toBeDefined();
      expect([c.words, c.lines, c.text].filter((x) => x !== undefined).length, c.name).toBe(1);
      expect(c.mode === 'text' ? c.text !== undefined : c.text === undefined, c.name).toBe(true);
    }
  });
  it('carries every T-058 Verify case and the AC-042 / AC-110 cases', () => {
    const has = (key: string, words: string[], match: boolean) => casesOf('match').some((c) =>
      c.term === key && c.mode === 'image' && JSON.stringify(c.words) === JSON.stringify(words) && c.expect.match === match);
    for (const w of ['LUCAS', 'Lucas', 'LUCA5', "LUCAS'S"]) expect(has('lucas', [w], true), w).toBe(true);
    expect(has('lucas', ['L', 'U', 'C', 'A', 'S'], true)).toBe(true);
    for (const w of ['LOCAL', 'LUCKY', 'PARIS']) expect(has('lucas', [w], false), w).toBe(true);
    expect(has('cgh', ['CITY', 'GENERAL'], true)).toBe(true);
    expect(has('cgh', ['CITY'], false)).toBe(true);
    expect(has('cgh', ['HOSPITAL', 'STAFF'], false)).toBe(true);
    expect(has('plate', ['SE', '1234'], true)).toBe(true);
    expect(has('plate', ['SE-1234'], true)).toBe(true);
    expect(has('plate', ['SE', '1235'], false)).toBe(true);
    expect(V.terms.lucas.text).toBe('Lucas');
    expect(V.terms.cgh.text).toBe('City General Hospital');
    expect(V.terms.plate).toMatchObject({ kind: 'plate', text: 'SE 1234' });
  });
});

describe('fuzzy.json: termSpans / termInWords (SCR-06 step 3, AC-042, AC-110)', () => {
  for (const c of casesOf('match')) {
    it(c.name, () => {
      const theta = c.threshold ?? V.threshold;
      const words = wordsOf(c);
      expect(termInWords(term(c.term), words, theta, c.mode)).toBe(c.expect.match);
      const spans = termSpans(term(c.term), words, theta, c.mode);
      if (c.expect.spans) expect(spans).toEqual(c.expect.spans);
      else expect(spans.length > 0).toBe(c.expect.match);
    });
  }
});

describe('fuzzy.json: normalize, alnum, tokens, tokenSim, clampFuzzyThreshold', () => {
  for (const c of casesOf('normalize')) it(`normalize: ${c.name}`, () => expect(normalize(c.input)).toBe(c.expect));
  for (const c of casesOf('alnum')) it(`alnum: ${c.name}`, () => expect(alnum(c.input)).toBe(c.expect));
  for (const c of casesOf('tokens')) it(`tokens: ${c.name}`, () => expect(tokens(c.input)).toEqual(c.expect));
  for (const c of casesOf('tokenSim')) {
    it(`tokenSim: ${c.name}`, () => {
      expect(tokenSim(c.a, c.b)).toBeCloseTo(c.expect.sim, 4);
      expect(tokenSim(c.b, c.a)).toBeCloseTo(c.expect.sim, 4);   // symmetric
    });
  }
  for (const c of casesOf('clampThreshold')) it(`clampFuzzyThreshold: ${c.name}`, () => expect(clampFuzzyThreshold(c.input)).toBe(c.expect));
});

// ---------- code-level properties (not part of the shared vectors) ----------

describe('word lists come from enums.v1.json (SPEC §17.5)', () => {
  it('mirrors GENERIC_WORDS, GENERIC_PIN_LABELS, SYNONYM_CLASSES, ARTEFACT_TERMS and WORD_FOLDS', () => {
    expect([...GENERIC_WORDS]).toEqual(enums.GENERIC_WORDS);
    expect([...GENERIC_PIN_LABELS]).toEqual(enums.GENERIC_PIN_LABELS);
    expect(SYNONYM_CLASSES).toEqual(enums.SYNONYM_CLASSES);
    expect(ARTEFACT_TERMS).toEqual(enums.ARTEFACT_TERMS);
    expect(Object.fromEntries(WORD_FOLDS)).toEqual(enums.WORD_FOLDS);
  });
  it('folds only the SCR-06 words, and never reads an Object.prototype key', () => {
    expect(['saint', 'street', 'avenue', 'road', 'number'].map(foldWord)).toEqual(['st', 'st', 'ave', 'rd', 'no']);
    for (const t of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) expect(foldWord(t)).toBe(t);
    expect(tokens('constructor toString')).toEqual(['constructor', 'tostring']);
  });
  it('treats folds of generic words as generic, and distinctive = ≥4 chars and not generic', () => {
    expect(['st', 'rd', 'ave', 'city', 'hospital'].every(isGeneric)).toBe(true);
    expect(isGeneric('no')).toBe(false);   // "number" is not on the generic list
    expect(isDistinctive('marys')).toBe(true);
    expect(isDistinctive('elm')).toBe(false);
    expect(isDistinctive('general')).toBe(false);
  });
});

describe('matcher internals', () => {
  it('levenshtein', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
  it('mergeSpans sorts and merges overlapping spans only', () => {
    expect(mergeSpans([[3, 4], [0, 1], [1, 2], [6, 6]])).toEqual([[0, 2], [3, 4], [6, 6]]);
    expect(mergeSpans([])).toEqual([]);
  });
  it('a single-token label that is a short generic word never matches ("the", "new")', () => {
    for (const label of ['The', 'new', 'St']) expect(termInWords(makeTerm('v', 'other_text', label), wordsOfText(`the new st ${label}`), 0.8, 'text'), label).toBe(false);
    expect(termInWords(makeTerm('v', 'employer', 'Hospital'), wordsOfText('hospital'), 0.8, 'text')).toBe(true);   // ≥4 chars: the user's choice
  });
  it('an empty or punctuation-only term never matches', () => {
    for (const s of ['', '  ', '...']) {
      expect(termInWords(makeTerm('v', 'other_text', s), wordsOfText('anything at all ...'), 0.8, 'text')).toBe(false);
      expect(termInWords(makeTerm('v', 'plate', s), wordsOfText('anything at all ...'), 0.8, 'image')).toBe(false);
    }
  });
  it('makeTerm marks plate, house_number and phone as digit terms only', () => {
    for (const k of VAULT_KINDS) expect(makeTerm('v', k, 'x').digit, k).toBe(['plate', 'house_number', 'phone'].includes(k));
  });
});

describe('matchWords: every vault hit becomes a mask (AC-110, Tier-0 and the gate image re-check)', () => {
  const lucas = makeTerm('v-lucas', 'child_name', 'Lucas');
  const cgh = makeTerm('v-cgh', 'employer', 'City General Hospital');
  const plate = makeTerm('v-plate', 'plate', 'SE 1234');
  const ocr: WordLike[] = [
    { text: 'L', line: 0 }, { text: 'U', line: 0 }, { text: 'C', line: 0 }, { text: 'A', line: 0 }, { text: 'S', line: 0 },
    { text: 'CITY', line: 1 }, { text: 'GENERAL', line: 1 }, { text: 'STAFF', line: 1 },
    { text: 'SE', line: 2 }, { text: '1234', line: 2 }, { text: 'LUCA5', line: 3 },
  ];
  it('returns each matching term with all its word spans', () => {
    const hits = matchWords(ocr, [lucas, cgh, plate, makeTerm('v-x', 'child_name', 'Paris')], 0.8);
    expect(hits.map((h) => [h.term.vaultId, h.spans])).toEqual([
      ['v-lucas', [[0, 4], [10, 10]]],
      ['v-cgh', [[5, 6]]],
      ['v-plate', [[8, 9]]],
    ]);
  });
  it('findInText / findAllInText (prompt and echo scans) use text mode', () => {
    const text = 'Lucas waits at city general; door 7';
    const house = makeTerm('v-7', 'house_number', '7');
    expect(findInText(text, [house, cgh, lucas], 0.8)?.vaultId).toBe('v-cgh');
    expect(findAllInText(text, [house, cgh, lucas], 0.8).map((t) => t.vaultId)).toEqual(['v-cgh', 'v-lucas']);
    expect(findInText('nothing here', [house, cgh, lucas], 0.8)).toBeNull();
    expect(matchWords(wordsOfText('door 7'), [house], 0.8, 'image')).toHaveLength(1);   // images: standalone 1-2 char values match
  });
});
