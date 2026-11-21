// web/src/ui/check/sendFlow.ts: pure helpers for the Send → Attack → Verdict slice (T-069, T-071, T-086; D-139).
//   - sendBlockedCopy: SCR-07 states where the consent sheet does not open (offline, kill switch, cap, App Check or
//     sign-in failure, a BREACH): the copy shown instead. The gate re-checks all of these anyway.
//   - consentTierCopy / groundingOffered: AC-131. The tier line follows `data_tier`; the grounding box shows only when
//     grounding is allowed AND pass A exists (it does not yet: T-070), so on the free tier it is always hidden.
//   - consentCounts: the checklist's "n areas masked (f faces, v vault, u yours)".
//   - userUnmaskedBoxes: the boxes of private items the user deliberately un-ticked (the dry run never re-masks them).
//   - verdictOf: the rules referee (§10.3) over pass B's validated JSON → buildVerdict. Pass B is the ONLY input from
//     the cloud (invariant 8). A refusal is the partial verdict (SCR-09 e); any other failure is partial too.
// LOCAL ONLY: vault labels and clue texts flow through here; no logging, nothing persisted or sent.
import type { AttackOutcome } from '../../ai/jobs/adversaryB';
import type { DryRun, PreflightFailure } from '../../ai/preflight';
import type { StringId } from '../../core/strings';
import type { BandThresholdsM, ClueType, PxRect, VaultItem, Verdict } from '../../core/types';
import { refereeClaims, refereeVaultItems, rulesReferee } from '../../core/referee';
import { buildVerdict, type CaughtItem } from '../../core/verdict';
import { cloudOffReason, type SystemStatus } from '../systemStatus';
import type { MaskedFrameCandidate } from './editor';

export function sendBlockedCopy(s: { online: boolean; status: SystemStatus; capUsed: number }): StringId | null {
  if (!s.online) return 'copy.cap.offline';
  switch (cloudOffReason(s.status, s.capUsed)) {
    case 'tripwire': return 'copy.gate.tripwire';
    case 'killSwitch': return 'copy.err.killSwitch';
    case 'appCheck': return 'copy.err.appCheck';
    case 'auth': return 'copy.err.auth';
    case 'dailyCap': return 'copy.err.dailyCap';
    default: return null;
  }
}

export const consentTierCopy = (dataTier: 'free' | 'paid'): StringId => (dataTier === 'paid' ? 'copy.consent.tierPaid' : 'copy.consent.tierFree');
/** Pass A (T-070) is not built, so the box never shows yet; with grounding off (the free tier) it never shows at all. */
export const PASS_A_BUILT = false;
export const groundingOffered = (groundingEnabled: boolean, passABuilt: boolean = PASS_A_BUILT): boolean => groundingEnabled && passABuilt;

const isPrivate = (c: MaskedFrameCandidate['clues'][number]) => c.type === 'face' || c.vaultHits.length > 0;

export function userUnmaskedBoxes(c: MaskedFrameCandidate): PxRect[] {
  return c.clues.filter((x) => x.source !== 'manual' && !x.masked && x.userUnmasked && isPrivate(x)).map((x) => ({ ...x.box }));
}

export function consentCounts(c: MaskedFrameCandidate, dry: DryRun): { n: number; f: number; v: number; u: number; auto: number } {
  const detected = c.clues.filter((x) => x.source !== 'manual' && x.masked);
  return {
    n: dry.masks.length,
    f: detected.filter((x) => x.type === 'face').length,
    v: detected.filter((x) => x.type !== 'face' && x.vaultHits.length > 0).length,
    u: c.clues.filter((x) => x.source === 'manual').length,
    auto: dry.autoMasked,
  };
}

export const FAILURE_COPY: Readonly<Record<PreflightFailure, StringId>> = {
  metadata: 'ui.consent.failed.metadata', faces: 'ui.consent.failed.faces', vault: 'ui.consent.failed.vault', check: 'ui.consent.failed.check',
};

/** Vault items masked on this device before upload (the verdict's "caught" lines). */
export function caughtOf(c: MaskedFrameCandidate | null): CaughtItem[] {
  if (!c) return [];
  const seen = new Set<string>();
  const out: CaughtItem[] = [];
  for (const x of c.clues) {
    if (!x.masked) continue;
    for (const id of x.vaultHits) if (!seen.has(id)) { seen.add(id); out.push({ vaultId: id, route: c.route }); }
  }
  return out;
}

export function verdictOf(
  o: AttackOutcome, vault: readonly VaultItem[], c: MaskedFrameCandidate | null,
  opts: { theta?: number; bands?: BandThresholdsM; phase?: Verdict['phase'] } = {},
): Verdict {
  const caught = caughtOf(c);
  const types = c ? [...new Set(c.clues.flatMap((x): ClueType[] => (x.source !== 'manual' && x.type !== 'face' ? [x.type] : [])))] : [];
  const prescreenFlags = c ? { types, route: c.route } : null;
  const base = { vault, caught, prescreenFlags, ...(opts.bands ? { bands: opts.bands } : {}), ...(opts.phase ? { phase: opts.phase } : {}) };
  if (o.kind === 'result') {
    const claims = refereeClaims(o.result);
    const matches = rulesReferee(claims, refereeVaultItems(vault), opts.theta);
    return buildVerdict({ ...base, adv: o.result, matches, echoedVaultIds: o.result.echoedVaultIds });
  }
  return buildVerdict({ ...base, adv: null, matches: [], refused: o.kind === 'refused' });
}
