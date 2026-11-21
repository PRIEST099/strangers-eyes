// web/src/ui/components/verdict/model.ts: the verdict card's view model (T-077; SPEC SCR-09, §10; ARCH §12.3, §12.4).
// Pure: a Verdict (core/verdict.ts) plus the local vault in, display strings and tones out, so the card's rules are
// unit-tested without a DOM. All text comes from shared/strings/en.json through the engine's copy helpers.
// Rules pinned here (D-124):
//   - Tones: HIGH red, MEDIUM amber, INFO grey, CAUGHT teal; level RED red, AMBER amber, LOW and PARTIAL grey. GREEN is
//     only ever the "Risk reduced" compare header (SPEC §10.6), never a level or a line.
//   - Confidence (AC-164): match → "{strength} · attacker confidence {c}"; pin → "attacker confidence {c}"; pin_match →
//     the match form plus the band hypothesis's confidence, always (amended AC-164, D-134). Echo, caught and found-on-device lines are code
//     findings: "Found on this device", no confidence (a found_on_device line's own text already says it).
//   - Muted vault labels (SCR-09): the item's own label after the KIND, when the setting is on, the label is not empty,
//     and it adds something (not a place pin, whose KIND is already the label; not the KIND itself, e.g. "Home").
//   - Every icon is paired with text (AC-062): the line text is never empty and each tone has its own icon.
import {
  bestGuessCopy, comparisonHeadline, headlineCopyId, lineText, notLinkedCopy, scrubNumbers,
} from '../../../core/verdict';
import { t as appLookup, type StringId, type Translate } from '../../../core/strings';
import type {
  Route, VaultItem, Verdict, VerdictComparison, VerdictLevel, VerdictLine,
} from '../../../core/types';

export type Tone = 'red' | 'amber' | 'grey' | 'teal' | 'green';
export type VerdictIconName = 'alert' | 'warn' | 'info' | 'lock' | 'eye' | 'chip' | 'check';

/** The text of one line, split around its KIND so the muted vault label can sit right after it. */
export interface LineSegments {
  before: string;
  kind: string;
  /** The muted vault label, or null when hidden or not useful. */
  label: string | null;
  after: string;
}
export interface LineView {
  id: string;
  kind: VerdictLine['kind'];
  severity: VerdictLine['severity'];
  tone: Tone;
  icon: VerdictIconName;
  /** lineText(line): the line exactly as the engine words it (no vault label). */
  text: string;
  segments: LineSegments;
  /** " (never sent)" for caught lines (SCR-09 layout), else null. */
  suffix: string | null;
  /**
   * The confidence (AC-164) or the "Found on this device" label. Null only for a found_on_device line, whose own text
   * already starts "Found on this device: …" (the label would repeat it).
   */
  confidence: string | null;
  /** Whether the line has a "Why?" expansion (a referee reason or supporting clues). */
  why: { reason: string | null; clues: string | null; clueIds: readonly string[]; route: Route } | null;
}
export interface CompareView {
  text: string;
  tone: Tone;
  icon: VerdictIconName;
  reduced: boolean;
  /**
   * "Risk reduced" in level terms (D-128): the header's {after} IS the card's headline, so the header becomes the
   * card's heading and the headline is not printed again under it (D-134).
   */
  isHeadline: boolean;
}
export interface CardView {
  level: VerdictLevel;
  levelLabel: string;
  headline: string;
  tone: Tone;
  icon: VerdictIconName;
  compare: CompareView | null;
  lines: LineView[];
  notLinked: string | null;
  bestGuess: string | null;
  noVault: string | null;
  neverLearns: string;
  /** What the live region announces (compare header first, then the headline unless the header already ends with it). */
  announcement: string;
}
export interface CardOptions {
  showVaultLabels: boolean;
  /** When present, the card shows the "Risk reduced" / "Still exposed" header over `comparison.after`. */
  comparison?: VerdictComparison | null;
  tr?: Translate;
}

const appT: Translate = (id, params) => appLookup(id as StringId, params);

export const SEVERITY_TONE: Readonly<Record<VerdictLine['severity'], Tone>> = Object.freeze({
  HIGH: 'red', MEDIUM: 'amber', INFO: 'grey', NONE: 'grey', CAUGHT: 'teal',
});
export const LEVEL_TONE: Readonly<Record<VerdictLevel, Tone>> = Object.freeze({
  RED: 'red', AMBER: 'amber', LOW: 'grey', PARTIAL: 'grey',
});
export const LEVEL_ICON: Readonly<Record<VerdictLevel, VerdictIconName>> = Object.freeze({
  RED: 'alert', AMBER: 'warn', LOW: 'info', PARTIAL: 'chip',
});
export const LEVEL_LABEL_IDS: Readonly<Record<VerdictLevel, StringId>> = Object.freeze({
  RED: 'ui.verdict.level.RED', AMBER: 'ui.verdict.level.AMBER', LOW: 'ui.verdict.level.LOW', PARTIAL: 'ui.verdict.level.PARTIAL',
});

export function lineIcon(line: VerdictLine): VerdictIconName {
  if (line.kind === 'caught') return 'lock';
  if (line.kind === 'echo') return 'eye';
  if (line.kind === 'found_on_device') return 'chip';
  return line.severity === 'HIGH' ? 'alert' : line.severity === 'MEDIUM' ? 'warn' : 'info';
}

/** The confidence wording (AC-164), or "Found on this device" for code findings. */
export function lineConfidence(line: VerdictLine, tr: Translate = appT): string {
  switch (line.kind) {
    case 'match':
      return tr('ui.verdict.strengthConf', { strength: line.strength ?? '', confidence: line.confidence ?? '' });
    case 'pin_match':
      // Amended AC-164 (D-127, D-134): strength, the claim's confidence AND the band hypothesis's confidence, always.
      return line.bandConfidence !== undefined
        ? tr('ui.verdict.pinMatchConf', { strength: line.strength ?? '', confidence: line.confidence ?? '', bandConfidence: line.bandConfidence })
        : tr('ui.verdict.strengthConf', { strength: line.strength ?? '', confidence: line.confidence ?? '' });
    case 'pin':
      return tr('ui.verdict.conf', { confidence: line.confidence ?? '' });
    case 'echo':
    case 'caught':
    case 'found_on_device':
      return tr('ui.verdict.onDevice');
  }
}

/** The muted label for a line's vault item, or null (see the header for when it is shown). */
export function mutedLabel(line: VerdictLine, vault: readonly VaultItem[], show: boolean): string | null {
  if (!show || line.vaultId === undefined) return null;
  const item = vault.find((v) => v.id === line.vaultId);
  if (!item || item.kind === 'place_pin') return null;
  const label = scrubNumbers(item.label.trim());
  if (!label) return null;
  const kind = (line.params.KIND ?? '').trim();
  return label.toLocaleUpperCase() === kind.toLocaleUpperCase() ? null : label;
}

const SENTINEL = '\u0000';

/** Split lineText around {KIND}. before + kind + after always equals lineText(line). */
export function lineSegments(line: VerdictLine, label: string | null, tr: Translate = appT): LineSegments {
  const full = lineText(line, tr);
  const kind = line.params.KIND;
  if (kind === undefined) return { before: full, kind: '', label: null, after: '' };
  const marked = lineText({ ...line, params: { ...line.params, KIND: SENTINEL } }, tr);
  const at = marked.indexOf(SENTINEL);
  if (at < 0 || marked.indexOf(SENTINEL, at + 1) >= 0) return { before: full, kind: '', label: null, after: '' };
  const seg = { before: marked.slice(0, at), kind, label, after: marked.slice(at + 1) };
  // A KIND that the copy repeats or alters would break the split: fall back to the plain text.
  return seg.before + seg.kind + seg.after === full ? seg : { before: full, kind: '', label: null, after: '' };
}

export function lineView(line: VerdictLine, vault: readonly VaultItem[], show: boolean, tr: Translate = appT): LineView {
  const reason = line.reason?.trim() ? line.reason.trim() : null;
  const hasWhy = (line.kind === 'match' || line.kind === 'pin_match' || line.kind === 'pin') && (reason !== null || line.clueIds.length > 0);
  return {
    id: line.id,
    kind: line.kind,
    severity: line.severity,
    tone: SEVERITY_TONE[line.severity],
    icon: lineIcon(line),
    text: lineText(line, tr),
    segments: lineSegments(line, mutedLabel(line, vault, show), tr),
    suffix: line.kind === 'caught' ? tr('ui.verdict.neverSent') : null,
    confidence: line.kind === 'found_on_device' ? null : lineConfidence(line, tr),
    why: hasWhy
      ? {
          reason,
          clues: line.clueIds.length ? tr('ui.verdict.clues', { ids: line.clueIds.join(', ') }) : null,
          clueIds: line.clueIds,
          route: line.route,
        }
      : null,
  };
}

/**
 * The compare header, or null. A PARTIAL after-verdict never gets "Risk reduced" / "Still exposed": its own headline
 * (copy.verdict.partial) already says it, so the header is dropped when the after-level is PARTIAL, or when the engine
 * returns no headline or a level headline instead of reduced/still (verdict.ts review round, D-125). GREEN only when
 * riskReduced.
 */
export function compareView(cmp: VerdictComparison, tr: Translate = appT): CompareView | null {
  if (cmp.after.level === 'PARTIAL') return null;
  const h = (comparisonHeadline as (c: VerdictComparison, t?: Translate) => { copyId: StringId; params: Record<string, string> } | null)(cmp, tr);
  // Only "Risk reduced" and "Still exposed" are compare headers; a level headline (partial, or LOW with no risk line
  // left) would repeat the card's own headline.
  if (!h || (h.copyId !== 'copy.verdict.reduced' && h.copyId !== 'copy.verdict.still')) return null;
  const text = tr(h.copyId, h.params);
  if (cmp.riskReduced && h.copyId === 'copy.verdict.reduced') {
    const isHeadline = h.params.after === tr(headlineCopyId(cmp.after.level));
    return { text, tone: 'green', icon: 'check', reduced: true, isHeadline };
  }
  return { text, tone: LEVEL_TONE[cmp.after.level], icon: LEVEL_ICON[cmp.after.level], reduced: false, isHeadline: false };
}

/** `noPins` (no pin item with a pin; verdict.ts review round): the same "Add places" prompt as noVault (D-125). */
const hasNoPins = (v: Verdict): boolean => v.noPins === true;

/** The whole card. With `comparison`, the verdict shown is `comparison.after`, under its compare header. */
export function verdictCardView(verdict: Verdict, vault: readonly VaultItem[], opts: CardOptions): CardView {
  const tr = opts.tr ?? appT;
  const cmp = opts.comparison ?? null;
  const v = cmp ? cmp.after : verdict;
  const headline = tr(headlineCopyId(v.level));
  const compare = cmp ? compareView(cmp, tr) : null;
  const nl = notLinkedCopy(v, vault);
  const bg = bestGuessCopy(v);
  return {
    level: v.level,
    levelLabel: tr(LEVEL_LABEL_IDS[v.level]),
    headline,
    tone: LEVEL_TONE[v.level],
    icon: LEVEL_ICON[v.level],
    compare,
    lines: v.lines.map((l) => lineView(l, vault, opts.showVaultLabels, tr)),
    notLinked: nl ? tr(nl.copyId, nl.params) : null,
    bestGuess: bg ? tr(bg.copyId, bg.params) : null,
    noVault: v.noVault || hasNoPins(v) ? tr('copy.verdict.noVault') : null,
    neverLearns: tr('copy.verdict.neverLearns'),
    announcement: compare ? (compare.isHeadline ? compare.text : `${compare.text} ${headline}`) : headline,
  };
}

/** "1.3 s" for the referee row (SCR-09 layout). */
export const secondsText = (ms: number, tr: Translate = appT): string =>
  tr('ui.unit.seconds', { n: (Math.max(0, ms) / 1000).toFixed(1) });
