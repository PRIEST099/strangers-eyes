// web/src/ui/judge/judgeFlow.ts: Judge Mode's pure decisions (SPEC SCR-17; ARCH §5.4; T-105, D-150..D-152).
//   - liveUnavailable: when the live attacker counts as "unavailable" (offline, kill switch, daily cap, App Check or
//     auth failure, HTTP 400, 429 after its retries, a network failure), so the CACHED replay may take its place when RC
//     judge_cached_fallback is on. A refusal is NOT unavailability: state (e) offers the recording, never automatically.
//   - recordedOutcome: a recorded pass B (judge-0N.advB*.v1.json) → the AttackOutcome Check shows, validated by the same
//     strict parser as a live answer (invariant 8: only pass B ever feeds code), route CACHED, badged `recorded`.
//   - fixedRecordingApplies: the "after fix" recording stands for a re-attack only when the masks (and crop) actually
//     sent hide the first recording's clues that the live fix masked (manifest `fixMasked`; absent = every removable
//     clue); otherwise the first recording is replayed (honest: still exposed). D-161: keyed on the FIRST answer's own
//     boxes, never on the after-fix answer's ids, which a live model numbers independently (its c1 is not the first c1).
//   - nextAutoAction: what autoplay does next, from a small view of Check's state.
// Nothing here reads the vault, the network or the DOM.
import type { AttackOutcome } from '../../ai/jobs/adversaryB';
import type { GateErrorCode } from '../../ai/errors';
import { parseAdvB, type ParsedAdvB } from '../../ai/parse';
import type { StringId } from '../../core/strings';
import type { AdversaryResult, Box2D, GateBlockReason, ImageFrame, PxRect } from '../../core/types';
import type { CheckStep } from '../layout';

export const CACHED_ON_BLOCK: readonly GateBlockReason[] = ['OFFLINE', 'KILL_SWITCH', 'DAILY_CAP'];
// D-156: a timeout or a server error (free-tier flash: 80–143 s, 503s) is unavailability too, so judges get the
// labelled recording instead of an error (RUNBOOK §7.3 "never locked out"). Refusals, blocks, unreadable answers and
// INTERNAL (a bug) are never replaced.
export const CACHED_ON_ERROR: readonly GateErrorCode[] = ['CLOUD_QUOTA', 'CLOUD_AUTH', 'CLOUD_BAD_REQUEST', 'CLOUD_NETWORK', 'CLOUD_SERVER', 'TIMEOUT'];

export function liveUnavailable(o: AttackOutcome): boolean {
  if (o.kind === 'notSent') return CACHED_ON_BLOCK.includes(o.reason);
  if (o.kind === 'failed') return o.state === 'error' && CACHED_ON_ERROR.includes(o.code);
  return false;
}

/** Box (0..1000 of the uncropped sample) → px rect in a W×H master. */
export function boxToPx(b: Box2D, W: number, H: number): PxRect {
  const [y0, x0, y1, x1] = b;
  return { x: (x0 / 1000) * W, y: (y0 / 1000) * H, w: ((x1 - x0) / 1000) * W, h: ((y1 - y0) / 1000) * H };
}

const inside = (x: number, y: number, r: PxRect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Share (0..1) of the box hidden by the masks or cut off by the crop, sampled on a 10×10 grid. */
export function hiddenShare(box: PxRect, masks: readonly PxRect[], crop: PxRect | null): number {
  let hid = 0;
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
    const x = box.x + ((j + 0.5) / 10) * box.w;
    const y = box.y + ((i + 0.5) / 10) * box.h;
    if ((crop && !inside(x, y, crop)) || masks.some((m) => inside(x, y, m))) hid++;
  }
  return hid / 100;
}

/** A clue counts as removed when at least this share of its box is hidden. */
export const HIDDEN_ENOUGH = 0.9;

export function fixedRecordingApplies(
  first: Pick<ParsedAdvB, 'clues'>, masks: readonly PxRect[], crop: PxRect | null, W: number, H: number,
  fixMasked: readonly string[] | null = null,
): boolean {
  const must = fixMasked ? first.clues.filter((c) => fixMasked.includes(c.id)) : first.clues.filter((c) => c.removable);
  return must.every((c) => hiddenShare(boxToPx(c.box2d, W, H), masks, crop) >= HIDDEN_ENOUGH);
}

/** A box of the uncropped sample mapped into a cropped frame (clamped; 0..1000 of the crop). */
export function boxIntoCrop(b: Box2D, crop: PxRect | null, W: number, H: number): Box2D {
  if (!crop) return b;
  const map = (v: number, size: number, off: number, len: number) => Math.max(0, Math.min(1000, Math.round(((v / 1000) * size - off) / len * 1000)));
  return [map(b[0], H, crop.y, crop.h), map(b[1], W, crop.x, crop.w), map(b[2], H, crop.y, crop.h), map(b[3], W, crop.x, crop.w)];
}

export interface RecordedContext {
  runId: string;
  sentImageSha256: string;
  sentFrame: ImageFrame;
  recordedAt: string;
  model: string;
  /** The response-side echo scan of the ACTIVE vault (the fake vault in Judge Mode). */
  echo: (p: ParsedAdvB) => string[];
}

/** A recorded pass B → a CACHED result outcome. Throws ParseError when the file is not valid pass B. */
export function recordedOutcome(json: unknown, ctx: RecordedContext, masterW: number, masterH: number): AttackOutcome {
  const p = parseAdvB(json);
  const crop = ctx.sentFrame.cropInMaster;
  const cropped = crop.x !== 0 || crop.y !== 0 || crop.w !== masterW || crop.h !== masterH ? crop : null;
  const result: AdversaryResult = {
    runId: ctx.runId, promptVersion: 'advB.v1', model: ctx.model, status: p.status,
    ...(p.declineReason !== undefined ? { declineReason: p.declineReason } : {}),
    sceneSummary: p.sceneSummary, hypotheses: p.hypotheses,
    clues: p.clues.map((c) => ({ ...c, box2d: boxIntoCrop(c.box2d, cropped, masterW, masterH) })),
    inferences: p.inferences, sentImageSha256: ctx.sentImageSha256, sentFrame: ctx.sentFrame, route: 'CACHED', latencyMs: 0,
    echoedVaultIds: ctx.echo(p),
  };
  return {
    kind: 'result', result, recorded: { recordedAt: ctx.recordedAt, model: ctx.model },
    call: { route: 'CACHED', source: null, latencyMs: 0, ledgerId: null, model: ctx.model },
  };
}

// ---------- autoplay ----------
export type AutoAction = 'continue' | 'toSend' | 'send' | 'useRecorded' | 'toVerdict' | 'toFix' | 'applyFix' | 'toReattack' | 'resend' | 'useRecordedAgain';
export interface AutoView {
  current: CheckStep;
  importReady: boolean;
  canSend: boolean;            // the pre-screen finished with no failure and nothing blocks the candidate
  sendReady: boolean;          // the consent dry run is ready with no failure and nothing was sent yet
  cloudOff: boolean;           // the sheet shows a cloud-off reason (offline, kill switch, cap…)
  cachedFallback: boolean;     // RC judge_cached_fallback
  attackDone: boolean;
  fixAvailable: boolean;       // a fix round may start and the verdict has something to fix
  planHasFix: boolean;         // the fix plan proposes at least one mask or a crop
  reattackPending: boolean;    // a fix is applied and waits for its re-attack
  reSendReady: boolean;
  afterSettled: boolean;       // the re-attack's verdict is showing: autoplay stops
}
/** The delay before an automatic step: consent sends after a visible 3 s countdown (SCR-17); others after a beat. */
export const AUTO_CONSENT_MS = 3_000;
export const AUTO_STEP_MS = 1_500;

/** What autoplay does next, or null (wait, or done). Never decides past a failure: a failed step stops it. */
export function nextAutoAction(v: AutoView): AutoAction | null {
  if (v.afterSettled) return null;
  switch (v.current) {
    case 'import': return v.importReady ? 'continue' : null;
    case 'prescreen': return v.canSend ? 'toSend' : null;
    case 'send':
      if (v.cloudOff) return v.cachedFallback && v.sendReady ? 'useRecorded' : null;
      return v.sendReady ? 'send' : null;
    case 'attack': return v.attackDone ? 'toVerdict' : null;
    case 'verdict': return v.fixAvailable && v.planHasFix ? 'toFix' : null;
    case 'fix':
      if (v.reattackPending) return 'toReattack';
      return v.planHasFix ? 'applyFix' : null;
    case 'reattack':
      if (v.cloudOff) return v.cachedFallback && v.reSendReady ? 'useRecordedAgain' : null;
      return v.reSendReady ? 'resend' : null;
    default: return null;
  }
}
export const autoDelay = (a: AutoAction): number => (a === 'send' || a === 'resend' || a === 'useRecorded' || a === 'useRecordedAgain' ? AUTO_CONSENT_MS : AUTO_STEP_MS);

/** Coach marks per step (copy.judge.coach.*): what ran where. */
export function coachFor(step: CheckStep): readonly StringId[] {
  switch (step) {
    case 'prescreen': return ['copy.judge.coach.prescreen'];
    case 'send': return ['copy.judge.coach.consent'];
    case 'attack': return ['copy.judge.coach.attack'];
    case 'verdict': return ['copy.judge.coach.referee', 'copy.judge.coach.verdict'];
    case 'fix': return ['copy.judge.coach.fix'];
    case 'reattack': return ['copy.judge.coach.reattack'];
    default: return [];
  }
}
