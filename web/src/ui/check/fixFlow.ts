// web/src/ui/check/fixFlow.ts: pure helpers for the Fix → Re-attack → compare view (SCR-11; T-080, D-143).
//   - compareRows: SCR-11's "Before and After for each line", one row per vault item ("HOME: within 1 km → same
//     country") plus the attacker's best-guess level. Band words and copy only: never a distance, a coordinate or the
//     attacker's place (invariant 5). The row heading is the item's KIND display name without the user's label.
//   - receiptParams: the numbers of copy.receipt.line from this photo's outcomes (D-143).
// LOCAL ONLY: vault kinds and pin bands flow through here; nothing is logged, persisted or sent.
import type { AttackOutcome } from '../../ai/jobs/adversaryB';
import { bandWords } from '../../core/geo';
import { kindDisplay } from '../../core/kinds';
import { t, type StringId, type Translate } from '../../core/strings';
import type { VaultItem, Verdict, VerdictLine } from '../../core/types';

type Tr = Translate;
const appT: Tr = (id, params) => t(id as StringId, params);

function cell(v: Verdict, id: string, tr: Tr): string {
  const pb = v.pinBands.find((p) => p.vaultId === id);
  if (pb) return bandWords(pb.band, tr);
  const line: VerdictLine | undefined = v.lines.find((l) => l.vaultId === id && (l.kind === 'match' || l.kind === 'pin_match' || l.kind === 'pin'));
  if (line?.band) return bandWords(line.band, tr);
  if (line?.strength) return tr('ui.compare.match', { strength: line.strength });
  return tr('ui.compare.notLinked');
}

const covers = (v: Verdict, id: string) =>
  v.pinBands.some((p) => p.vaultId === id) || v.notLinkedVaultIds.includes(id) || v.lines.some((l) => l.vaultId === id);

/** The Before → After rows; [] when either side is PARTIAL (its header says so instead). */
export function compareRows(before: Verdict, after: Verdict, vault: readonly VaultItem[], tr: Tr = appT): string[] {
  if (before.level === 'PARTIAL' || after.level === 'PARTIAL') return [];
  const rows: string[] = [];
  const seen = new Set<string>();
  for (const item of vault) {
    if (seen.has(item.id) || !(covers(before, item.id) || covers(after, item.id))) continue;
    seen.add(item.id);
    rows.push(tr('ui.compare.row', { KIND: kindDisplay(item.kind), before: cell(before, item.id, tr), after: cell(after, item.id, tr) }));
  }
  // SR-07: an attacker guess always shows its confidence (T-161).
  const guess = (v: Verdict) =>
    v.bestGuess ? tr('ui.compare.guessLevelConf', { level: v.bestGuess.level, confidence: v.bestGuess.confidence }) : tr('ui.compare.noGuess');
  rows.push(tr('ui.compare.guess', { before: guess(before), after: guess(after) }));
  return rows;
}

/**
 * copy.receipt.line's numbers for this photo: images and requests = pass-B calls that reached the model (route
 * IN_CLOUD; cached and blocked calls sent nothing), k = on-device AI calls (the Nano referee runs that answered ON_DEVICE,
 * T-074: `onDevice`), r = local checks (the pre-screen, one consent dry run per send, one referee pass per result).
 */
/**
 * F-332 (D-185, after D-179): `r` counts only real fallbacks, the guess checks that ran as simple rules because the
 * on-device model was missing or failed (`rulesFallbacks`). It used to be a fixed 1 + outcomes + results, which called
 * the always-on built-in steps "rules-only fallbacks" even with Gemini Nano on.
 */
export function receiptParams(outcomes: readonly AttackOutcome[], onDevice = 0, rulesFallbacks = 0): { images: number; requests: number; k: number; r: number } {
  const sent = outcomes.filter((o) => o.call.route === 'IN_CLOUD').length;
  return { images: sent, requests: sent, k: Math.max(0, Math.floor(onDevice)), r: Math.max(0, Math.floor(rulesFallbacks)) };
}
