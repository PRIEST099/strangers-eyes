// web/src/core/referee.ts: the deterministic rules-only referee and the union with the on-device referee.
// Behaviour contract: SPEC §10.3 (rules), §17.4 (kind compatibility), §17.5 (word lists), SCR-09, AC-165, AC-167;
// ARCH §12.1. Vectors: shared/testvectors/referee.json (Vitest here, XCTest on iOS: AC-168).
// One matcher (AD-21, D-38): normalisation, folds, token similarity, the distinctive/generic tests and the word lists all
// come from tier0/fuzzy.ts; this file only orders the §10.3 rules over them (D-90). Claims are scored on every reading
// the matcher builds (joined spaced letters, possessive 's removed, format characters as spaces: F-121). Plate /
// house_number / phone use the matcher's digit match in image mode, since claims never leave the device (F-124).
// Vault labels flow through here: pure code, no logging (R9), nothing persisted or sent.
// Pins reach this file as kind + label only; coordinates are never read (bands are core/geo.ts).
import enums from '@prompts/enums.v1.json';
import {
  alnum, ARTEFACT_TERMS, DEFAULT_FUZZY_THRESHOLD, FUNCTION_WORDS, GENERIC_PIN_LABELS, SYNONYM_CLASSES, isDigitKind,
  isDistinctive, isGeneric, makeTerm, normalize, prepare, termInWords, tokenSim, tokens, wordsOfText,
} from '../tier0/fuzzy';
import {
  PIN_KINDS, STRENGTHS, type AdversaryResult, type ClaimKind, type Confidence, type MatchStrength, type RefereeMatch,
  type VaultItem, type VaultKind,
} from './types';
import type { StringId } from './strings';

/** SCR-09: the badge/status copy shown whenever the rules referee produced the result (states b and c). */
export const RULES_REFEREE_COPY_ID = 'copy.ref.rules' satisfies StringId;
/** The Router HUD / Ledger note for a device result unioned with rules matches (SPEC SCR-09, SCR-14). */
export const RULES_NOTE = '+rules';

/** SPEC §17.4, from enums.v1.json (a Vitest test pins it to the claim kinds and vault kinds). */
export const KIND_COMPAT = enums.KIND_COMPAT as Readonly<Record<ClaimKind, readonly VaultKind[]>>;

// ---------- inputs ----------
/** A claim as the referee sees it: a pass-B inference, or a hypothesis as kind 'area' (SPEC SCR-09). */
export interface RefereeClaim {
  id: string;
  kind: ClaimKind;
  value: string;
  confidence: Confidence;
  clueIds: readonly string[];
}
/** A referee vault item: kind + label + aliases. Never coordinates (SPEC SCR-09, AC-162, AC-167). LOCAL ONLY. */
export interface RefereeVaultItem {
  id: string;
  kind: VaultKind;
  label: string;
  aliases: readonly string[];
}

/** CLAIMS = pass-B inferences, then hypotheses as {kind: 'area', value: label} (SPEC SCR-09; ARCH §10.9). */
export function refereeClaims(adv: Pick<AdversaryResult, 'inferences' | 'hypotheses'>): RefereeClaim[] {
  return [
    ...adv.inferences.map((i) => ({ id: i.id, kind: i.kind, value: i.value, confidence: i.confidence, clueIds: [...i.clueIds] })),
    ...adv.hypotheses.map((h) => ({ id: h.id, kind: 'area' as const, value: h.label, confidence: h.confidence, clueIds: [...h.clueIds] })),
  ];
}

/**
 * An empty or generic vault string ("Home", "Work", "School" …, GENERIC_PIN_LABELS): never a referee string (D-36, D-79).
 * The same test as vault/vaultStore.ts isGenericVaultString (pinned by a parity test), so a lone U+02BC, which
 * normalize() deletes but alnum() keeps as a letter, is judged the same way as at validation.
 */
export function isGenericLabel(s: string): boolean {
  const n = normalize(s);
  return (n === '' && alnum(s) === '') || GENERIC_PIN_LABELS.has(n);
}
/**
 * The strings an item is matched by: its label and aliases, minus empty or generic ones. An item whose LABEL is empty
 * or generic (a pin, or a text item that validation would refuse) contributes nothing, its aliases included: a pin's
 * distance is shown through bands (D-36, AC-167).
 */
function eligibleStrings(item: RefereeVaultItem): string[] {
  if (isGenericLabel(item.label)) return [];
  return [item.label, ...item.aliases].filter((s) => !isGenericLabel(s));
}

/**
 * VAULT for the referee: every item whose label is not generic, as {id, kind, label, aliases} with generic aliases
 * dropped. The pin's coordinates are not copied (SPEC SCR-09: "never coordinates").
 */
export function refereeVaultItems(vault: readonly VaultItem[]): RefereeVaultItem[] {
  return vault
    .map((v) => ({ id: v.id, kind: v.kind, label: v.label, aliases: v.aliases.filter((a) => !isGenericLabel(a)) }))
    .filter((v) => eligibleStrings(v).length > 0);
}

// ---------- the §10.3 rules ----------
/** Which SPEC §10.3 rule decided a pair: 1(a) exact_a, 1(b) exact_b, 2(a–c) likely_a–c, 3(a–b) possible_a–b. */
export type RefereeRule = 'exact_a' | 'exact_b' | 'likely_a' | 'likely_b' | 'likely_c' | 'possible_a' | 'possible_b';
export interface RuleHit { strength: MatchStrength; rule: RefereeRule; /** ARCH §12.1 template, local only */ reason: string }

const RANK: Readonly<Record<MatchStrength, number>> = { exact: 3, likely: 2, possible: 1 };
const isStrength = (s: unknown): s is MatchStrength => (STRENGTHS as readonly unknown[]).includes(s);

// ARCH §12.1 reason templates, one per rule (both exact rules share one).
const EXACT_REASON = 'named in the claim';
const hit = (strength: MatchStrength, rule: RefereeRule, reason: string): RuleHit => ({ strength, rule, reason });

/** A word list entry as a token run, normalised like a claim ("name tag" → name, tag). */
interface Run { text: string; toks: readonly string[] }
const runOf = (text: string): Run => ({ text, toks: tokens(text) });
const ARTEFACT_RUNS: readonly Run[] = ARTEFACT_TERMS.map(runOf);
/** A synonym class is named by its first word (hospital, school, university). */
const CLASS_RUNS: readonly { name: string; words: readonly Run[] }[] = SYNONYM_CLASSES.map((c) => ({ name: c[0], words: c.map(runOf) }));

/** Does `run` occur as consecutive whole tokens of `toks`? (Word lists: equality after normalisation, no similarity.) */
function hasRun(toks: readonly string[], run: Run): boolean {
  const n = run.toks.length;
  if (n === 0) return false;
  for (let j = 0; j + n <= toks.length; j++) if (run.toks.every((t, k) => toks[j + k] === t)) return true;
  return false;
}

/** §10.3 2(b): first letters of the label tokens, function words skipped; letters only. */
export function acronym(labelToks: readonly string[]): string {
  return labelToks.filter((t) => !FUNCTION_WORDS.has(t)).map((t) => String.fromCodePoint(t.codePointAt(0) ?? 0)).join('');
}
const ACRONYM_RE = /^\p{L}{3,}$/u;

/**
 * The claim's token readings, exactly as the matcher scans a text (fuzzy.ts prepare(); F-121): the joined and unjoined
 * spaced-letter sequences, each word with a possessive 's removed ("Max's" → max), and format characters read as spaces
 * ("Lucas<ZWSP>school" → lucas school). Folded; duplicates removed.
 */
export function claimReadings(value: string): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const seq of prepare(wordsOfText(value)).seqs) {
    const toks = seq.map((k) => k.t);
    const key = toks.join(' ');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(toks);
    }
  }
  return out;
}

/** Plate / house_number / phone: the SCR-06 digit match in image mode (a standalone 1–2 character value counts; F-124). */
const digitHit = (s: string, kind: VaultKind, claimValue: string, theta: number): boolean =>
  termInWords(makeTerm('', kind, s), wordsOfText(claimValue), theta, 'image');

/** The strongest rule 1–3(a) that holds for one label or alias (its tokens `lt`) against one claim reading, or null. */
function textHit(claimToks: readonly string[], lt: readonly string[], theta: number): RuleHit | null {
  const n = lt.length;
  if (n === 0) return null;
  const sim = (a: string, b: string) => tokenSim(a, b) >= theta;
  // 1(a) the whole label as consecutive claim tokens. A one-token generic label or alias ("Hospital", "st") never
  // matches: generic strings are not terms (D-79, D-101).
  if (!(n === 1 && isGeneric(lt[0]))) {
    for (let j = 0; j + n <= claimToks.length; j++) if (lt.every((t, k) => sim(t, claimToks[j + k]))) return hit('exact', 'exact_a', EXACT_REASON);
  }
  // 1(b) two consecutive label tokens against two consecutive claim tokens. Never a pair of function words (as in the
  // matcher); and the pair must hold a non-generic token unless EVERY label token is generic ("City General" vs
  // "City General Hospital" stays exact; "primary school" vs "Northfield Primary School" does not: D-101).
  const allGeneric = lt.every(isGeneric);
  for (let i = 0; i + 1 < n; i++) {
    if (FUNCTION_WORDS.has(lt[i]) && FUNCTION_WORDS.has(lt[i + 1])) continue;
    if (!allGeneric && isGeneric(lt[i]) && isGeneric(lt[i + 1])) continue;
    for (let j = 0; j + 1 < claimToks.length; j++) {
      if (sim(lt[i], claimToks[j]) && sim(lt[i + 1], claimToks[j + 1])) return hit('exact', 'exact_b', EXACT_REASON);
    }
  }
  // 2(a) one distinctive label token.
  const token = lt.find((t) => isDistinctive(t) && claimToks.some((c) => sim(t, c)));
  if (token !== undefined) return hit('likely', 'likely_a', `shares '${token}'`);
  // 2(b) the label's acronym as a claim token.
  const acr = acronym(lt);
  if (ACRONYM_RE.test(acr) && claimToks.includes(acr)) return hit('likely', 'likely_b', `acronym '${acr}'`);
  // 2(c) / 3(a) a shared synonym class, with or without an artefact term in the claim.
  const cls = CLASS_RUNS.find((c) => c.words.some((w) => hasRun(claimToks, w)) && c.words.some((w) => hasRun(lt, w)));
  if (cls) {
    const art = ARTEFACT_RUNS.find((a) => hasRun(claimToks, a));
    return art ? hit('likely', 'likely_c', `${art.text} + same category: ${cls.name}`) : hit('possible', 'possible_a', `same category: ${cls.name}`);
  }
  return null;
}

/**
 * §10.3 3(b) as narrowed by D-94: a NON-generic label/alias token that some token of some claim reading matches under
 * the matcher's token rule (similarity ≥ θ; tokens of ≤ 3 characters must be equal). Generic words (and their folds,
 * and since D-102 the common function words) never count.
 */
function sharedToken(readings: readonly (readonly string[])[], strings: readonly string[], theta: number): string | undefined {
  for (const s of strings) {
    const t = tokens(s).find((lt) => !isGeneric(lt) && readings.some((r) => r.some((c) => tokenSim(lt, c) >= theta)));
    if (t !== undefined) return t;
  }
  return undefined;
}

/**
 * SPEC §10.3 for one (claim, vault item) pair: null unless the kinds are compatible (§17.4) and the item is eligible;
 * otherwise the first rule that holds for the label and each alias against each claim reading (the strongest wins;
 * on a tie the label, then the earlier reading), then 3(b): a high-confidence claim that shares a non-generic label/alias
 * token (D-94). Without a shared token a confident claim never marks an item (geography is the bands' job); digit kinds
 * never reach 3(b) without a digit match.
 */
export function rulesStrength(claim: RefereeClaim, item: RefereeVaultItem, theta: number = DEFAULT_FUZZY_THRESHOLD): RuleHit | null {
  if (!Object.hasOwn(KIND_COMPAT, claim.kind) || !KIND_COMPAT[claim.kind].includes(item.kind)) return null;
  const strings = eligibleStrings(item);
  if (strings.length === 0) return null;
  if (isDigitKind(item.kind)) {
    return strings.some((s) => digitHit(s, item.kind, claim.value, theta)) ? hit('exact', 'exact_a', EXACT_REASON) : null;
  }
  const readings = claimReadings(claim.value);
  let best: RuleHit | null = null;
  for (const s of strings) {
    const lt = tokens(s);
    for (const r of readings) {
      const h = textHit(r, lt, theta);
      if (h && (!best || RANK[h.strength] > RANK[best.strength])) best = h;
    }
  }
  if (best) return best;
  if (claim.confidence !== 'high') return null;
  return sharedToken(readings, strings, theta) !== undefined ? hit('possible', 'possible_b', 'compatible kind, high confidence') : null;
}

/**
 * The rules-only referee (ARCH §12.1): one match per (claim, vault item) pair that any rule links, in claim order then
 * item order, route RULES_ONLY. Pass raw vault items or refereeVaultItems(): generic pins are skipped either way.
 */
export function rulesReferee(
  claims: readonly RefereeClaim[], items: readonly RefereeVaultItem[], theta: number = DEFAULT_FUZZY_THRESHOLD,
): RefereeMatch[] {
  const out: RefereeMatch[] = [];
  for (const c of claims) {
    for (const v of items) {
      const h = rulesStrength(c, v, theta);
      if (h) out.push({ claimId: c.id, vaultId: v.id, strength: h.strength, reason: h.reason, clueIds: [...c.clueIds], route: 'RULES_ONLY' });
    }
  }
  return out;
}

// ---------- union with the device referee ----------
export interface MergedMatches { matches: RefereeMatch[]; /** [RULES_NOTE] when any rules match entered the union */ notes: string[] }

/**
 * ARCH §12.1 / SPEC SCR-09: the union per (claim, vault item) pair, keeping the stronger strength (the device wins a
 * tie). When the device found the pair, route is the device match's own route (ON_DEVICE; IN_CLOUD only for an S4
 * Judge Mode run that fell back to the cloud), even if the rules strength is kept; otherwise RULES_ONLY. reason and
 * clueIds come from the side whose strength is kept. A match whose strength is not a STRENGTHS value is dropped
 * (AC-161: device output should already be validated). notes carries '+rules' when at least one valid rules match
 * entered the union (D-90). For the rules-only path (no device result), use rulesReferee's output directly.
 */
export function mergeMatches(device: readonly RefereeMatch[], rules: readonly RefereeMatch[], geo?: GeoPairs): MergedMatches {
  const key = (m: RefereeMatch) => `${m.claimId}\u0000${m.vaultId}`;
  const out = new Map<string, RefereeMatch>();
  const take = (m: RefereeMatch, route: RefereeMatch['route']) => {
    const k = key(m);
    const prev = out.get(k);
    if (!prev || RANK[m.strength] > RANK[prev.strength]) out.set(k, { ...m, clueIds: [...m.clueIds], route: prev?.route ?? route });
  };
  for (const m of device) if (isStrength(m.strength)) take(m, m.route);
  let rulesUsed = false;
  const ruled = new Set<string>();
  for (const m of rules) {
    if (!isStrength(m.strength)) continue;
    rulesUsed = true;
    ruled.add(key(m));
    take(m, 'RULES_ONLY');
  }
  // D-157: a device match for a pair that NO rules match links is capped at 'possible' (after the union). Nano and Apple
  // FM grade generic-word overlaps ("A coastal city" vs "City General Hospital") as exact; any rules evidence (a shared
  // distinctive token, an acronym, a synonym class) lets the device upgrade as before (D-90).
  // D-168: a device-only link between a place guess (claim kind 'area') and a PIN is dropped, not capped. Whether a guessed
  // place is near a pin is geometry, and geometry is code (invariant 5: the distance bands already show it); Apple FM linked
  // "Berlin, Germany" to the work pin "City General Hospital" on the word "city". Any rules evidence for the pair keeps it.
  const areaClaims = new Set(geo?.areaClaimIds ?? []);
  const pins = new Set(geo?.pinVaultIds ?? []);
  let capped = false;
  let dropped = false;
  for (const [k, m] of out) {
    if (ruled.has(k)) continue;
    if (areaClaims.has(m.claimId) && pins.has(m.vaultId)) { out.delete(k); dropped = true; continue; }
    if (RANK[m.strength] > RANK.possible) { out.set(k, { ...m, strength: 'possible' }); capped = true; }
  }
  return {
    matches: [...out.values()],
    notes: [...(rulesUsed ? [RULES_NOTE] : []), ...(capped ? [DEVICE_CAP_NOTE] : []), ...(dropped ? [DEVICE_GEO_NOTE] : [])],
  };
}

/** D-168: which claims are place guesses (kind 'area') and which vault items are pins (PIN_KINDS), by id. */
export interface GeoPairs { areaClaimIds: readonly string[]; pinVaultIds: readonly string[] }
/** The GeoPairs of a referee run's claims and vault items. */
export const geoPairs = (claims: readonly RefereeClaim[], items: readonly RefereeVaultItem[]): GeoPairs => {
  // Pass-B ids are unique within inferences and within hypotheses, not across them: an id that also names a non-area
  // claim is left out, so a collision fails toward the D-157 cap, never toward a drop.
  const other = new Set(claims.filter((c) => c.kind !== 'area').map((c) => c.id));
  return {
    areaClaimIds: claims.filter((c) => c.kind === 'area' && !other.has(c.id)).map((c) => c.id),
    pinVaultIds: items.filter((v) => PIN_KINDS.includes(v.kind)).map((v) => v.id),
  };
};

/** The HUD note when D-157 capped a device-only match. */
export const DEVICE_CAP_NOTE = 'device-only: capped at possible';
/** The HUD note when D-168 dropped a device-only place-guess × pin link (the distance bands decide). */
export const DEVICE_GEO_NOTE = 'device-only place × pin: dropped (bands decide)';
