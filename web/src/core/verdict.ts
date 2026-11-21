// web/src/core/verdict.ts: the verdict engine (SPEC §10.1, §10.2, §10.5, §10.6; ARCH §12.3, §12.4; D-115, D-116).
// Deterministic and pure: the same input always gives the same Verdict, and the iOS port runs the same vectors
// (shared/testvectors/verdict.json, AC-160, AC-168). Distances are code (core/geo.ts), never the LLM (invariant 5).
// The view model carries copy IDs, band words and enums only: never a coordinate, a radius or a measured distance
// (SR-07, AC-146). Free text that reaches it (KIND for a place pin, the attacker's best-guess label, referee reasons)
// has numbers replaced (scrubAttackerText for attacker text, scrubNumbers for the user's own labels). Vault labels flow through here: pure code, no logging, nothing
// persisted or sent. GREEN is never a level: it is only the "Risk reduced" header (compareVerdicts).
import { bandRank, bandThresholdsOrDefault, bandWords, DEFAULT_BANDS_M, pinBand } from './geo';
import { refereeClaims } from './referee';
import { kindDisplay } from './kinds';
import { t as lookup, type StringId, type Translate } from './strings';
import {
  CLUE_TYPES, PIN_KINDS, STRENGTHS,
  type AdversaryHypothesis, type AdversaryResult, type BandThresholdsM, type ClueType, type Confidence, type DistanceBand,
  type Inference, type Level, type LineSeverity, type MatchStrength, type PinBand, type RefereeMatch, type Route,
  type VaultItem, type Verdict, type VerdictComparison, type VerdictLevel, type VerdictLine,
} from './types';

// ---------- inputs ----------
/** The pass-B result as the verdict needs it (ParsedAdvB or AdversaryResult). */
export interface VerdictAdv {
  status: AdversaryResult['status'];
  hypotheses: readonly AdversaryHypothesis[];
  inferences: readonly Inference[];
}
/** A vault item masked before upload (Tier-0 or Nano), with what caught it. */
export interface CaughtItem { vaultId: string; route: Route }
/** Pre-screen clue types flagged on this device (shown only in a PARTIAL verdict). */
export interface PrescreenFlags { types: readonly ClueType[]; route: Route }
export interface VerdictInput {
  /** Validated pass B; null when there is none (refused before any result). */
  adv: VerdictAdv | null;
  /** rulesReferee(...) or mergeMatches(...).matches over the same pass B. */
  matches: readonly RefereeMatch[];
  vault: readonly VaultItem[];
  caught?: readonly CaughtItem[];
  /** Vault items whose strings the response-side scan found in pass B's free text (SPEC §10.2 echo). */
  echoedVaultIds?: readonly string[];
  prescreenFlags?: PrescreenFlags | null;
  /** RC bands_m; anything invalid (or a moved locked threshold, D-77) falls back to the defaults. */
  bands?: BandThresholdsM;
  /** State (e): pass B declined or blocked. */
  refused?: boolean;
  phase?: Verdict['phase'];
}

// ---------- tables ----------
/** SPEC §10.1 "Line severity". */
export const BAND_SEVERITY: Readonly<Record<DistanceBand, LineSeverity>> = Object.freeze({
  street: 'HIGH', neighbourhood: 'HIGH', district: 'MEDIUM', city: 'INFO', country: 'NONE', none: 'NONE',
});
/** SPEC §10.2. */
export const STRENGTH_SEVERITY: Readonly<Record<MatchStrength, LineSeverity>> = Object.freeze({
  exact: 'HIGH', likely: 'HIGH', possible: 'MEDIUM',
});
export const MATCH_COPY_IDS: Readonly<Record<MatchStrength, StringId>> = Object.freeze({
  exact: 'copy.verdict.exact', likely: 'copy.verdict.likely', possible: 'copy.verdict.possible',
});
/** SPEC §10.5 headlines. */
export const LEVEL_COPY_IDS: Readonly<Record<VerdictLevel, StringId>> = Object.freeze({
  RED: 'copy.verdict.red', AMBER: 'copy.verdict.amber', LOW: 'copy.verdict.low', PARTIAL: 'copy.verdict.partial',
});
export const FOUND_ON_DEVICE_COPY_ID: StringId = 'ui.verdict.foundOnDevice';
/** SPEC §10.2: a combined pin line reads "{match wording} · {band words}". */
export const PIN_MATCH_SEPARATOR = ' · ';
/** ARCH §12.3: "Not linked: SCHOOL · CAR PLATE". */
export const KINDS_SEPARATOR = ' · ';
/** SPEC SCR-09: "Found on this device: street sign, lanyard…". */
export const TYPES_SEPARATOR = ', ';

const STRENGTH_RANK: Readonly<Record<MatchStrength, number>> = { exact: 3, likely: 2, possible: 1 };
const CONF_RANK: Readonly<Record<Confidence, number>> = { high: 3, medium: 2, low: 1 };
const SEV_RANK: Readonly<Record<LineSeverity, number>> = { HIGH: 3, MEDIUM: 2, INFO: 1, NONE: 0, CAUGHT: -1 };
/** Display order of lines: HIGH, MEDIUM, INFO, then CAUGHT (stable within a severity). */
const SEV_ORDER: Readonly<Record<LineSeverity, number>> = { HIGH: 0, MEDIUM: 1, INFO: 2, NONE: 3, CAUGHT: 4 };
const LEVEL_RANK: Readonly<Record<Exclude<VerdictLevel, 'PARTIAL'>, number>> = { RED: 2, AMBER: 1, LOW: 0 };
/** SPEC §10.5 empty vault: the best hypothesis's LEVEL decides. */
const EMPTY_VAULT_LEVEL: Readonly<Record<Level, Exclude<VerdictLevel, 'PARTIAL'>>> = {
  street: 'RED', neighbourhood: 'RED', district: 'AMBER', city: 'LOW', region: 'LOW', country: 'LOW',
};
/** Pass-B statuses a full verdict can be built from; anything else is PARTIAL (D-115). */
const USABLE_STATUS: ReadonlySet<string> = new Set(['ok', 'no_location_signal']);

const isStrength = (s: unknown): s is MatchStrength => (STRENGTHS as readonly unknown[]).includes(s);
const isClueType = (s: unknown): s is ClueType => (CLUE_TYPES as readonly unknown[]).includes(s);
const isPinKind = (v: VaultItem) => PIN_KINDS.includes(v.kind);

// The app's lookup (strict in tests, lenient in production).
const appT: Translate = (id, params) => lookup(id as StringId, params);

// ---------- no coordinates in the view model ----------
/**
 * Decimal numbers (a dot or comma fraction, also in fullwidth or Arabic-Indic digits) and degree expressions (digits
 * followed by a degree sign), in any script's digits. Integers
 * without a fraction are kept (a house number, "Platform 9").
 */
const COORDINATE_LIKE = /[-+−]?\p{Nd}+(?:[.,٫，．]\p{Nd}+)+(?:\s*[°º˚])?|\p{Nd}+\s*[°º˚]/gu;
export const SCRUBBED = '…';
/** Replace every coordinate-like number in free text that enters the verdict (D-115). */
export function scrubNumbers(s: string): string {
  return s.replace(COORDINATE_LIKE, SCRUBBED);
}

// Attacker text (a hypothesis label, a referee reason) may name a house number, a street address, a radius in metres or
// a coordinate in any notation, none of which SCR-09 / AC-146 / invariant 5 allow on screen (D-127). So EVERY digit run
// goes: any script's decimal digits plus superscript and subscript digits, with its sign, internal separators
// (. , · ٫ ٬ ， ． ' and an exponent e±n), and a following unit (m, km, mi, ft, d) or degree / minute / second mark.
const D = '[\\p{Nd}\\u00B2\\u00B3\\u00B9\\u2070\\u2074-\\u2079\\u2080-\\u2089]';
const NUMBER_RUN = new RegExp(
  `[-+\\u2212]?${D}+(?:(?:[.,\\u00B7\\u2027\\u066B\\u066C\\uFF0C\\uFF0E]|[eE][-+\\u2212]?)${D}+)*`
  + `(?:\\s*(?:(?:km|mi|ft|m|d)(?!\\p{L})|[°º˚′″'"\\u2032\\u2033]))?`,
  'gu',
);
const ELLIPSIS_RUN = /…(?:[\s,;]*…)+/gu;
/** Replace every number (with its unit or degree marks) in ATTACKER text by "…"; neighbouring ellipses collapse (D-127). */
export function scrubAttackerText(s: string): string {
  return s.replace(NUMBER_RUN, SCRUBBED).replace(ELLIPSIS_RUN, SCRUBBED);
}

// ---------- buildVerdict ----------
const unique = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

/** The strongest valid match per vault item (strength, then attacker confidence, then the earlier claim). */
interface Ranked { m: RefereeMatch; conf: Confidence; order: number }

/**
 * SPEC §10 as a view model. See ARCH §12.3 and D-115 for the readings this pins:
 * - PARTIAL when `refused`, when there is no pass B, or when its status is not ok / no_location_signal; its lines are
 *   echo lines, one found_on_device line and caught lines (no bands, no matches, no "Not linked", no best guess).
 * - Empty vault (no items at all): no lines, noVault. With no pin item (noPins, empty vault included) the level is at
 *   least the finest hypothesis LEVEL's (street/neighbourhood RED, district AMBER) (D-127).
 * - Otherwise one main line per vault item (pin_match when a match and a shown band (street..city) meet; match; or pin),
 *   plus echo and caught lines; RED if any line is HIGH, else AMBER if any is MEDIUM, else LOW.
 * pinBands never carry effectiveKm (null): the verdict holds bands only.
 */
export function buildVerdict(input: VerdictInput): Verdict {
  const phase = input.phase ?? 'initial';
  const th = bandThresholdsOrDefault(input.bands ?? DEFAULT_BANDS_M);
  // Unique items in vault order; a duplicate id keeps its first item.
  const items: VaultItem[] = [];
  const index = new Map<string, number>();
  for (const v of input.vault) {
    if (index.has(v.id)) continue;
    index.set(v.id, items.length);
    items.push(v);
  }
  const noVault = items.length === 0;
  /** No pin item with a pin: nothing to measure the attacker's guess against (D-127). */
  const noPins = !items.some((v) => isPinKind(v) && v.pin !== undefined);
  const kindOf = (v: VaultItem) => scrubNumbers(kindDisplay(v.kind, v.label));

  const echoed = new Set(unique(input.echoedVaultIds ?? []).filter((id) => index.has(id)));
  const caught = new Map<string, Route>();
  for (const c of input.caught ?? []) if (index.has(c.vaultId) && !caught.has(c.vaultId)) caught.set(c.vaultId, c.route);

  const echoLine = (v: VaultItem): VerdictLine => ({
    id: `echo:${v.id}`, kind: 'echo', severity: 'HIGH', copyId: 'copy.verdict.echo', params: { KIND: kindOf(v) },
    vaultId: v.id, clueIds: [], route: 'RULES_ONLY',
  });
  const caughtLine = (v: VaultItem, route: Route): VerdictLine => ({
    id: `caught:${v.id}`, kind: 'caught', severity: 'CAUGHT', copyId: 'copy.verdict.caught', params: { KIND: kindOf(v) },
    vaultId: v.id, clueIds: [], route,
  });
  const sortLines = (ls: VerdictLine[]) => ls
    .map((l, i) => ({ l, i }))
    .sort((a, b) => SEV_ORDER[a.l.severity] - SEV_ORDER[b.l.severity] || a.i - b.i)
    .map((x) => x.l);

  const adv = input.adv;
  if (input.refused === true || adv === null || !USABLE_STATUS.has(adv.status)) {
    const lines: VerdictLine[] = [];
    for (const v of items) if (echoed.has(v.id)) lines.push(echoLine(v));
    const flags = input.prescreenFlags;
    const types = flags ? unique(flags.types.filter(isClueType)) : [];
    if (flags && types.length > 0) {
      lines.push({
        id: 'found_on_device', kind: 'found_on_device', severity: 'INFO', copyId: FOUND_ON_DEVICE_COPY_ID,
        params: { TYPES: types.map((x) => x.replace(/_/g, ' ')).join(TYPES_SEPARATOR) }, clueIds: [], route: flags.route,
      });
    }
    for (const v of items) { const r = caught.get(v.id); if (r !== undefined) lines.push(caughtLine(v, r)); }
    return { phase, level: 'PARTIAL', lines: sortLines(lines), notLinkedVaultIds: [], bestGuess: null, pinBands: [], matches: [], noVault, noPins };
  }

  const ok = adv.status === 'ok';
  const hyps = ok ? adv.hypotheses.slice(0, 3) : [];
  const claims = ok ? refereeClaims({ inferences: [...adv.inferences], hypotheses: [...hyps] }) : [];
  const claimInfo = new Map<string, { conf: Confidence; order: number }>();
  claims.forEach((c, order) => { if (!claimInfo.has(c.id)) claimInfo.set(c.id, { conf: c.confidence, order }); });

  // Valid matches: a known claim, a known vault item, a STRENGTHS value (AC-161). One per (claim, item) pair: the
  // stronger, the first on a tie. Sorted by claim order, then vault order, so the input order never matters.
  const pairs = new Map<string, RefereeMatch>();
  for (const m of input.matches) {
    if (!isStrength(m.strength) || !index.has(m.vaultId) || !claimInfo.has(m.claimId)) continue;
    const k = `${m.claimId}\u0000${m.vaultId}`;
    const prev = pairs.get(k);
    if (!prev || STRENGTH_RANK[m.strength] > STRENGTH_RANK[prev.strength]) {
      pairs.set(k, { ...m, reason: scrubAttackerText(m.reason), clueIds: [...m.clueIds] });
    }
  }
  const matches = [...pairs.values()].sort((a, b) =>
    (claimInfo.get(a.claimId)?.order ?? 0) - (claimInfo.get(b.claimId)?.order ?? 0)
    || (index.get(a.vaultId) ?? 0) - (index.get(b.vaultId) ?? 0));
  const best = new Map<string, Ranked>();
  for (const m of matches) {
    const info = claimInfo.get(m.claimId);
    if (!info) continue;
    const prev = best.get(m.vaultId);
    const better = !prev || STRENGTH_RANK[m.strength] > STRENGTH_RANK[prev.m.strength]
      || (STRENGTH_RANK[m.strength] === STRENGTH_RANK[prev.m.strength] && CONF_RANK[info.conf] > CONF_RANK[prev.conf]);
    if (better) best.set(m.vaultId, { m, conf: info.conf, order: info.order });
  }

  // Pin bands (SPEC §10.1): the closest band over the (≤3) ok hypotheses; a pin item without a pin is band none.
  const pinBands: PinBand[] = items.filter(isPinKind).map((v) => {
    const pb = v.pin ? pinBand(v.id, v.pin, hyps, th) : { vaultId: v.id, band: 'none' as const, hypothesisId: null, confidence: null };
    return { vaultId: v.id, band: pb.band, hypothesisId: pb.hypothesisId, confidence: pb.confidence, effectiveKm: null };
  });
  const bandOf = new Map(pinBands.map((p) => [p.vaultId, p]));
  const hypClues = (id: string | null) => hyps.find((h) => h.id === id)?.clueIds ?? [];

  const lines: VerdictLine[] = [];
  const notLinkedVaultIds: string[] = [];
  for (const v of items) {
    const KIND = kindOf(v);
    const r = best.get(v.id);
    const pb = bandOf.get(v.id);
    const shown = pb !== undefined && BAND_SEVERITY[pb.band] !== 'NONE' && pb.confidence !== null ? pb : undefined;
    const before = lines.length;
    if (r && shown) {
      const ms = STRENGTH_SEVERITY[r.m.strength];
      const bs = BAND_SEVERITY[shown.band];
      lines.push({
        id: `pin_match:${v.id}`, kind: 'pin_match', severity: SEV_RANK[bs] > SEV_RANK[ms] ? bs : ms,
        copyId: MATCH_COPY_IDS[r.m.strength], params: { KIND, 'band words': bandWords(shown.band) }, vaultId: v.id,
        band: shown.band, strength: r.m.strength, confidence: r.conf, bandConfidence: shown.confidence ?? undefined,
        reason: r.m.reason, clueIds: unique([...r.m.clueIds, ...hypClues(shown.hypothesisId)]), route: r.m.route,
      });
    } else if (r) {
      lines.push({
        id: `match:${v.id}`, kind: 'match', severity: STRENGTH_SEVERITY[r.m.strength], copyId: MATCH_COPY_IDS[r.m.strength],
        params: { KIND }, vaultId: v.id, strength: r.m.strength, confidence: r.conf, reason: r.m.reason,
        clueIds: [...r.m.clueIds], route: r.m.route,
      });
    } else if (shown) {
      lines.push({
        id: `pin:${v.id}`, kind: 'pin', severity: BAND_SEVERITY[shown.band], copyId: 'copy.verdict.pin',
        params: { KIND, 'band words': bandWords(shown.band) }, vaultId: v.id, band: shown.band,
        confidence: shown.confidence ?? undefined, clueIds: [...hypClues(shown.hypothesisId)], route: 'RULES_ONLY',
      });
    }
    if (echoed.has(v.id)) lines.push(echoLine(v));
    const cr = caught.get(v.id);
    if (cr !== undefined) lines.push(caughtLine(v, cr));
    if (lines.length === before) notLinkedVaultIds.push(v.id);
  }

  const h1 = hyps[0];
  const bestGuess = h1 ? { level: h1.level, label: scrubAttackerText(h1.label), confidence: h1.confidence } : null;
  const ruleLevel: Exclude<VerdictLevel, 'PARTIAL'> = lines.some((l) => l.severity === 'HIGH') ? 'RED'
    : lines.some((l) => l.severity === 'MEDIUM') ? 'AMBER' : 'LOW';
  // No pin to measure against (an empty vault, or text items only): geography falls back to the attacker's own precision,
  // the finest level over the (≤3) hypotheses, so a street-level guess is never LOW (D-127).
  const geoLevel = hyps.reduce<Exclude<VerdictLevel, 'PARTIAL'>>(
    (acc, h) => (LEVEL_RANK[EMPTY_VAULT_LEVEL[h.level]] > LEVEL_RANK[acc] ? EMPTY_VAULT_LEVEL[h.level] : acc), 'LOW');
  const level: VerdictLevel = noPins && LEVEL_RANK[geoLevel] > LEVEL_RANK[ruleLevel] ? geoLevel : ruleLevel;

  return { phase, level, lines: sortLines(lines), notLinkedVaultIds, bestGuess, pinBands, matches, noVault, noPins };
}

// ---------- copy helpers (T-077 renders with these; the vectors pin their output) ----------
export const headlineCopyId = (level: VerdictLevel): StringId => LEVEL_COPY_IDS[level];

/** One line as text: the copy with its params; a pin_match appends " · {band words}" (SPEC §10.2). */
export function lineText(line: VerdictLine, tr: Translate = appT): string {
  const text = tr(line.copyId, line.params);
  const bw = line.params['band words'];
  return line.kind === 'pin_match' && bw ? `${text}${PIN_MATCH_SEPARATOR}${bw}` : text;
}

/** "Attacker's best guess: {level} level · {label} · {confidence}", or null when there is none. */
export function bestGuessCopy(v: Verdict): { copyId: StringId; params: Record<string, string> } | null {
  return v.bestGuess
    ? { copyId: 'copy.verdict.bestGuess', params: { level: v.bestGuess.level, label: v.bestGuess.label, confidence: v.bestGuess.confidence } }
    : null;
}

/** The one grey "Not linked: {KINDS}" line (SPEC §10.2): display names in vault order, repeats dropped. */
export function notLinkedCopy(v: Verdict, vault: readonly VaultItem[]): { copyId: StringId; params: Record<string, string> } | null {
  const ids = new Set(v.notLinkedVaultIds);
  const seen = new Set<string>();
  const kinds: string[] = [];
  for (const item of vault) {
    if (!ids.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    kinds.push(scrubNumbers(kindDisplay(item.kind, item.label)));
  }
  const names = unique(kinds);
  return names.length ? { copyId: 'copy.verdict.notLinked', params: { KINDS: names.join(KINDS_SEPARATOR) } } : null;
}

// ---------- "Risk reduced" (SPEC §10.6, ARCH §12.4) ----------
/** The finest band over the verdict's pins; 'none' without pins. */
export function worstPinBand(v: Verdict): DistanceBand {
  let worst: DistanceBand = 'none';
  for (const p of v.pinBands) if (bandRank(p.band) < bandRank(worst)) worst = p.band;
  return worst;
}
export const highCount = (v: Verdict): number => v.lines.filter((l) => l.severity === 'HIGH').length;

/** The most severe remaining line (HIGH > MEDIUM > INFO; caught lines never count), the first on a tie. */
function worstLine(v: Verdict): VerdictLine | null {
  let w: VerdictLine | null = null;
  for (const l of v.lines) if (SEV_RANK[l.severity] > 0 && (!w || SEV_RANK[l.severity] > SEV_RANK[w.severity])) w = l;
  return w;
}

/** Every vault item a (non-PARTIAL) verdict covers: each one is on a line, Not linked, or has a pin band. */
function itemIds(v: Verdict): Set<string> {
  const ids = new Set<string>(v.notLinkedVaultIds);
  for (const l of v.lines) if (l.vaultId !== undefined) ids.add(l.vaultId);
  for (const p of v.pinBands) ids.add(p.vaultId);
  return ids;
}
/** The worst severity rank of each vault item's lines (caught lines rank below none). */
function itemSeverity(v: Verdict): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of v.lines) {
    if (l.vaultId === undefined) continue;
    out.set(l.vaultId, Math.max(out.get(l.vaultId) ?? 0, SEV_RANK[l.severity]));
  }
  return out;
}

/**
 * SPEC §10.6 as amended by D-128: riskReduced = (after.level < before.level, or the same level with a coarser worst pin
 * band AND fewer HIGH lines) AND no vault item's worst severity rose AND the worst pin band did not get finer AND both
 * verdicts cover the same vault (same item ids, same noVault). PARTIAL on either side is never "Risk reduced".
 */
export function compareVerdicts(before: Verdict, after: Verdict): VerdictComparison {
  let riskReduced = false;
  if (before.level !== 'PARTIAL' && after.level !== 'PARTIAL') {
    const b = LEVEL_RANK[before.level];
    const a = LEVEL_RANK[after.level];
    const bandB = bandRank(worstPinBand(before));
    const bandA = bandRank(worstPinBand(after));
    const base = a < b || (a === b && bandA > bandB && highCount(after) < highCount(before));
    const idsB = itemIds(before);
    const idsA = itemIds(after);
    // Same item ids; this also means the same noVault (only an empty vault covers no ids).
    const sameVault = idsB.size === idsA.size && [...idsB].every((id) => idsA.has(id));
    const sevB = itemSeverity(before);
    const noRise = [...itemSeverity(after)].every(([id, sev]) => sev <= (sevB.get(id) ?? 0));
    riskReduced = base && bandA >= bandB && sameVault && noRise;
  }
  return { riskReduced, before, after, worstRemainingLineId: worstLine(after)?.id ?? null };
}

/**
 * The compare header (D-116, D-128). After a PARTIAL re-attack: `copy.verdict.partial`. Risk reduced:
 * `copy.verdict.reduced` with band words when the worst pin band got coarser, otherwise with the two level headlines.
 * Not reduced and after LOW with no risk line: `copy.verdict.low` (never "Still exposed"). Otherwise `copy.verdict.still`
 * naming the worst remaining line, else the best guess (a no-pins level), else the after headline. Never a raw enum.
 */
export function comparisonHeadline(cmp: VerdictComparison, tr: Translate = appT): { copyId: StringId; params: Record<string, string> } {
  const { before, after } = cmp;
  if (cmp.riskReduced) {
    const bw = worstPinBand(before);
    const aw = worstPinBand(after);
    return bandRank(aw) > bandRank(bw)
      ? { copyId: 'copy.verdict.reduced', params: { before: bandWords(bw, tr), after: bandWords(aw, tr) } }
      : { copyId: 'copy.verdict.reduced', params: { before: tr(LEVEL_COPY_IDS[before.level]), after: tr(LEVEL_COPY_IDS[after.level]) } };
  }
  if (after.level === 'PARTIAL') return { copyId: LEVEL_COPY_IDS.PARTIAL, params: {} };
  const line = worstLine(after);
  const risk = line !== null && SEV_RANK[line.severity] >= SEV_RANK.MEDIUM;
  if (after.level === 'LOW' && !risk) return { copyId: LEVEL_COPY_IDS.LOW, params: {} };
  const bg = bestGuessCopy(after);
  // RED/AMBER always have a line or a hypothesis, so the last fallback is defensive only.
  const text = line ? lineText(line, tr) : bg ? tr(bg.copyId, bg.params) : tr(LEVEL_COPY_IDS[after.level]);
  return { copyId: 'copy.verdict.still', params: { line: text } };
}
