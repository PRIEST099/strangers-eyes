// web/src/tier0/fuzzy.ts — ONE text matcher shared by Tier-0, the gate (image OCR + prompt scan), the tripwire scanner
// and the rules referee. Behaviour contract = SPEC SCR-06 step 3, §10.3, AC-042, AC-110, AC-165.
// Word lists come from shared/prompts/enums.v1.json (GENERIC_WORDS, SYNONYM_CLASSES); inlined here for the sketch.
import type { VaultKind, ClaimKind, Confidence, MatchStrength } from './types.ts';

export const GENERIC_WORDS = new Set(['the', 'of', 'and', 'for', 'at', 'in', 'on', 'city', 'general', 'school', 'primary',
  'secondary', 'high', 'hospital', 'clinic', 'street', 'road', 'avenue', 'lane', 'north', 'south', 'east', 'west', 'centre',
  'center', 'central', 'new', 'old', 'park', 'house', 'home', 'office', 'company', 'group', 'academy', 'college', 'university',
  'church', 'station', 'market', 'saint']);
export const SYNONYM_CLASSES: string[][] = [
  ['hospital', 'hosp', 'clinic', 'medical', 'nurse', 'nursing', 'scrubs', 'health', 'doctor'],
  ['school', 'primary', 'elementary', 'academy', 'crest', 'uniform', 'pupil', 'pupils'],
  ['university', 'univ', 'uni', 'campus', 'college', 'faculty'],
];
const WORD_FOLDS: Record<string, string> = { saint: 'st', street: 'st', avenue: 'ave', road: 'rd', number: 'no', hospital: 'hosp',
  school: 'sch', university: 'univ', uni: 'univ' };

/** NFKD, strip marks, lowercase, drop possessive 's, & → and, punctuation → space, collapse. No word folding. */
export function normalize(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/(\p{L})['’]s\b/gu, '$1').replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
/** Join runs of >= 3 single-character tokens ("l u c a s" → "lucas"). */
export function joinSpaced(tokens: string[]): string[] {
  const out: string[] = []; let run: string[] = [];
  const flush = () => { if (run.length >= 3) out.push(run.join('')); else out.push(...run); run = []; };
  for (const t of tokens) { if (t.length === 1) run.push(t); else { flush(); out.push(t); } }
  flush(); return out;
}
export const tokens = (s: string): string[] => joinSpaced(normalize(s).split(' ').filter(Boolean)).map(t => WORD_FOLDS[t] ?? t);
/** OCR-confusable skeleton, applied to BOTH sides, only to tokens that contain a letter (pure digits untouched). */
export function skeleton(t: string): string {
  return /\p{L}/u.test(t) ? t.replace(/0/g, 'o').replace(/[1l|]/g, 'i').replace(/5/g, 's').replace(/8/g, 'b') : t;
}
export function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return d[b.length];
}
/** Token similarity. Tokens of <= 3 chars must be equal after skeleton. */
export function tokenSim(a: string, b: string): number {
  const x = skeleton(a), y = skeleton(b);
  if (x.length <= 3 || y.length <= 3) return x === y ? 1 : 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}
const distinctive = (t: string) => t.length >= 4 && !GENERIC_WORDS.has(t) && !GENERIC_WORDS.has(Object.entries(WORD_FOLDS).find(([, v]) => v === t)?.[0] ?? '');
const alnum = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export interface Term { vaultId: string; kind: VaultKind; text: string; digit: boolean }

/** Does `term` occur in the word sequence `words` (OCR words or a prompt segment's tokens)? */
export function termInWords(term: Term, words: string[], theta: number, opts: { image: boolean }): boolean {
  if (term.digit) {
    const t = alnum(term.text); if (!t) return false;
    if (t.length >= 3) return alnum(words.join(' ')).includes(t) || words.some(w => alnum(w) === t);
    return opts.image && words.some(w => alnum(w) === t);           // 1–2 char digit terms: standalone token, images only
  }
  const tt = tokens(term.text); if (tt.length === 0) return false;
  const ws = joinSpaced(words.flatMap(w => normalize(w).split(' ').filter(Boolean))).map(t => WORD_FOLDS[t] ?? t);
  const hit = (a: string) => ws.some(w => tokenSim(a, w) >= theta);
  if (tt.length === 1) return (tt[0].length >= 4 || !GENERIC_WORDS.has(tt[0])) && hit(tt[0]);
  if (tt.some(t => distinctive(t) && hit(t))) return true;            // one distinctive token
  for (let i = 0; i + 1 < tt.length; i++)                            // or two consecutive label tokens, consecutively
    for (let j = 0; j + 1 < ws.length; j++)
      if (tokenSim(tt[i], ws[j]) >= theta && tokenSim(tt[i + 1], ws[j + 1]) >= theta) return true;
  return false;
}

// ---------- rules referee (SPEC §10.3, §17.4) ----------
export const KIND_COMPAT: Record<ClaimKind, readonly VaultKind[]> = {
  workplace: ['work_pin', 'employer', 'descriptor'],
  school: ['school_pin', 'school_name', 'descriptor'],
  home_area: ['home_pin', 'area_name', 'street_name', 'house_number'],
  routine: ['home_pin', 'work_pin', 'school_pin', 'area_name', 'street_name'],
  transit_line: ['home_pin', 'work_pin', 'school_pin', 'area_name', 'street_name'],
  venue: ['place_pin', 'work_pin', 'school_pin', 'employer', 'school_name'],
  area: ['area_name', 'street_name', 'home_pin', 'work_pin', 'school_pin', 'place_pin'],
  other: ['child_name', 'person_name', 'employer', 'school_name', 'area_name', 'street_name', 'plate', 'house_number', 'phone', 'descriptor', 'other_text'],
};
export function acronym(label: string): string {
  return tokens(label).filter(t => !['the', 'of', 'and', 'for', 'at', 'in', 'on'].includes(t)).map(t => t[0]).join('');
}
export function rulesStrength(claim: { kind: ClaimKind; value: string; confidence: Confidence },
  item: { kind: VaultKind; label: string; aliases: string[] }, theta: number): MatchStrength | null {
  if (!KIND_COMPAT[claim.kind].includes(item.kind)) return null;
  const c = tokens(claim.value); const cs = ' ' + c.join(' ') + ' ';
  let best: MatchStrength | null = null;
  const rank = { exact: 3, likely: 2, possible: 1 } as const;
  const take = (s: MatchStrength) => { if (!best || rank[s] > rank[best]) best = s; };
  for (const l of [item.label, ...item.aliases]) {
    const lt = tokens(l); if (lt.length === 0) continue;
    const ln = lt.join(' ');
    const hit = (a: string) => c.some(w => tokenSim(a, w) >= theta);
    const consecutive = lt.some((_, i) => i + 1 < lt.length && c.some((_, j) => j + 1 < c.length && tokenSim(lt[i], c[j]) >= theta && tokenSim(lt[i + 1], c[j + 1]) >= theta));
    const dist = lt.filter(distinctive);
    if ((ln.length >= 4 && cs.includes(' ' + ln + ' ')) || (dist.every(hit) && consecutive)) take('exact');
    else if (dist.some(hit)) take('likely');
    else if (acronym(l).length >= 3 && c.includes(acronym(l))) take('likely');
    else if (SYNONYM_CLASSES.some(cls => cls.some(w => c.includes(WORD_FOLDS[w] ?? w)) && cls.some(w => lt.includes(WORD_FOLDS[w] ?? w)))) take('likely');
    else if (claim.confidence === 'high') take('possible');
  }
  return best;
}
