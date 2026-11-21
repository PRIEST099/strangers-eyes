// web/src/ui/checkState.ts: the Check screen's state and every transition (SCR-05…12; T-053 fix round 3, T-068).
// Pure, so it is unit-tested in Node; screens/Check.tsx holds it with useReducer and only dispatches.
//   - selectStep REVISITS a step already reached (SPEC §8.2) and nothing else: the import status and the pre-screen
//     survive a round trip (the dropzone unmounts meanwhile). A step not reached yet is never selectable (D-121).
//   - continue moves Import → Pre-screen, and only while Check holds a photo (`ready`; AC-100 "starts a session").
//   - importStatus is sent only by the dropzone's onStatus: busy on a new attempt, then ready or the error. Every new
//     attempt replaces the photo, so it also drops the pre-screen and every step after Import (D-121): masks drawn on
//     the old photo must never be applied to, or sent with, a new one.
//   - `epoch` counts the pre-screen episodes: every import attempt and every accepted retry starts a new one. A run's
//     number IS the epoch it was started in, so prescreenStart is accepted once per epoch (StrictMode's second effect,
//     or any duplicate, is refused) and a report from any other run (a photo replaced mid-run, a retry) is ignored
//     (D-133). retry drops a failed pre-screen so Check runs it again.
//   - edit applies a mask-editor op (ui/check/editor.ts) to a finished pre-screen. An edit drops a consent dry run
//     (it described other bytes); once the image has been sent the masks are locked (the Fix step changes them, D-139).
//   - T-069/T-071/T-086 (D-139): `flow` is the Send → Attack → Verdict episode. toSend opens the Send step from a
//     finished pre-screen; the dry run (preflightStart/Done) and the attack (sent/attackDone/retryAttack) carry the
//     flow's run number, so a result from an episode that was cancelled or replaced is ignored. cancelSend sends
//     nothing and returns to the editor (AC-132). A final attack outcome moves on to the Verdict by itself; a
//     transient failure stays on the Attack step with Try again (and toVerdict shows the on-device findings).
//   - T-078..T-080 (D-142, D-143): `fix` and `reattack`. toFix opens the Fix step from a verdict built on a pass-B
//     result (never after a decline, never past RC max_fix_rounds); the plan itself is derived in Check (core/fixPlan),
//     the reducer keeps only what the user unticked and the fix applied so far (cumulative masks + crop on top of the
//     candidate's). applyFix starts a new re-attack episode; its dry run, consent and pass B mirror the first send's
//     actions (reflight*, resent, reattackDone, retryReattack) under their own run number. A round counts when it is
//     sent. Any refusal (first attack or re-attack) ends fixing for the photo: the gate refuses S3 after a decline
//     anyway (D-114, D-129), so the UI never offers it.
// The master photo is NOT here: Check keeps it in a ref (never React state, never storage).
import type { ClueType, PxRect } from '../core/types';
import { combineCrops } from '../core/fixPlan';
import type { PreTickMode } from '../core/pretick';
import { TIER0_STEPS, type Tier0Finding, type Tier0StepId, type Tier0StepReport } from '../tier0/tier0';
import type { AttackOutcome } from '../ai/jobs/adversaryB';
import type { DryRun } from '../ai/preflight';
import { candidateOf, createEditor, editorReducer, type EditorOp, type EditorState, type MaskedFrameCandidate } from './check/editor';
import { IMPORT_IDLE, type ImportStatus } from './importTransfer';
import { CHECK_STEPS, STEPPER_START, moveToStep, type CheckStep, type StepperPosition } from './layout';

/** The steps that exist so far. The stepper shows the others as not available yet (D-121). */
export const BUILT_STEPS: readonly CheckStep[] = Object.freeze(['import', 'prescreen', 'send', 'attack', 'verdict', 'fix', 'reattack']);

/** One progress line (SPEC SCR-06 "Progress list"). */
export interface ProgressLine {
  readonly status: 'pending' | 'running' | 'done' | 'failed';
  readonly count?: number;
  readonly ms?: number;
}
export type ProgressLines = Readonly<Record<Tier0StepId, ProgressLine>>;
export const PENDING_LINES: ProgressLines = Object.freeze(
  Object.fromEntries(TIER0_STEPS.map((s) => [s, Object.freeze({ status: 'pending' as const })])) as Record<Tier0StepId, ProgressLine>,
);

/** What a finished Tier-0 run hands the reducer (ui/check/runPrescreen.ts). */
export interface PrescreenOutcome {
  readonly findings: readonly Tier0Finding[];
  readonly failed: readonly Tier0StepId[];
  readonly width: number;
  readonly height: number;
  readonly mode: PreTickMode;
  readonly autoMaskTypes: readonly ClueType[];
  readonly padRatio: number;
  /** T-066: the Gemini Nano pre-screen line (route, latency, how many clues it added); absent = not run. */
  readonly nano?: PrescreenNanoLine;
}
/** The pre-screen's Nano line: ON_DEVICE with its clue count, or RULES_ONLY and why (SPEC SCR-06 states a–c). */
export interface PrescreenNanoLine {
  readonly route: 'ON_DEVICE' | 'IN_CLOUD' | 'RULES_ONLY'; // IN_CLOUD: Judge Mode only (S4 on a sample)
  readonly latencyMs: number;
  readonly count: number;
  readonly fallback: 'no_device' | 'device_failed' | null;
}

export type PrescreenState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly run: number; readonly sha256: string; readonly lines: ProgressLines }
  | {
    readonly kind: 'done'; readonly run: number; readonly sha256: string; readonly lines: ProgressLines;
    readonly failed: readonly Tier0StepId[]; readonly editor: EditorState; readonly nano?: PrescreenNanoLine;
  };
export const PRESCREEN_IDLE: PrescreenState = Object.freeze({ kind: 'idle' });

/** The consent dry run of the Send step (SCR-07). */
export type SendState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking'; readonly run: number }
  | { readonly kind: 'ready'; readonly run: number; readonly dry: DryRun };
/** Pass B (SCR-08). */
export type AttackState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly run: number }
  | { readonly kind: 'done'; readonly run: number; readonly outcome: AttackOutcome };
export interface FlowState {
  /** The current Send/Attack episode; async reports from any other run are ignored. */
  readonly run: number;
  readonly send: SendState;
  readonly attack: AttackState;
}
export const FLOW_IDLE: FlowState = Object.freeze({ run: 0, send: Object.freeze({ kind: 'idle' as const }), attack: Object.freeze({ kind: 'idle' as const }) });
const nextFlow = (f: FlowState): FlowState => ({ run: f.run + 1, send: FLOW_IDLE.send, attack: FLOW_IDLE.attack });

/** The Fix step (SCR-11): what the user unticked in the plan on screen, and the fix applied so far. */
export interface FixState {
  readonly unchecked: readonly string[];
  readonly cropOff: boolean;
  /** Cumulative fix masks (master px) and crop on top of the candidate's masks; null before the first Apply. */
  readonly applied: { readonly masks: readonly PxRect[]; readonly crop: PxRect | null } | null;
  /** Masks the last Apply added. */
  readonly lastAdded: number;
}
export const FIX_IDLE: FixState = Object.freeze({ unchecked: Object.freeze([]) as readonly string[], cropOff: false, applied: null, lastAdded: 0 });

/** Re-attack episodes (SCR-11): the dry run and pass B of the fixed image, and the rounds so far. */
export interface ReattackState {
  readonly run: number;
  readonly send: SendState;
  readonly attack: AttackState;
  /** Re-attacks sent for this photo; each counts toward RC max_fix_rounds. */
  readonly rounds: number;
  /** Final outcomes of the re-attacks, in order. */
  readonly history: readonly AttackOutcome[];
  /** An Apply is waiting for its re-attack. */
  readonly pending: boolean;
  /** How many masks the last image sent had (the consent sheet's diff line). */
  readonly lastSentMasks: number;
}
export const REATTACK_IDLE: ReattackState = Object.freeze({
  run: 0, send: FLOW_IDLE.send, attack: FLOW_IDLE.attack, rounds: 0, history: Object.freeze([]) as readonly AttackOutcome[], pending: false, lastSentMasks: 0,
});
const nextReattack = (r: ReattackState, over: Partial<ReattackState> = {}): ReattackState => ({ ...r, run: r.run + 1, send: FLOW_IDLE.send, attack: FLOW_IDLE.attack, ...over });

/** A final outcome goes straight on to the Verdict; a retryable one waits on the Attack step for Try again. */
export const goesToVerdict = (o: AttackOutcome): boolean => o.kind === 'result' || o.kind === 'refused' || !o.retry;

export interface CheckState {
  readonly pos: StepperPosition;
  /** The last import status, next to the master it describes: `ready` exactly while Check holds that master. */
  readonly importStatus: ImportStatus;
  /** The pre-screen of the photo Check holds (idle until it is first opened). */
  readonly prescreen: PrescreenState;
  /** The current pre-screen episode; the only run number prescreenStart accepts (D-133). */
  readonly epoch: number;
  /** Send → Attack → Verdict (D-139). */
  readonly flow: FlowState;
  /** Fix → Re-attack (D-142, D-143). */
  readonly fix: FixState;
  readonly reattack: ReattackState;
}

export type CheckAction =
  | { type: 'selectStep'; step: CheckStep }
  | { type: 'continue' }
  | { type: 'importStatus'; status: ImportStatus }
  | { type: 'prescreenStart'; run: number; sha256: string }
  | { type: 'prescreenStep'; run: number; report: Tier0StepReport }
  | { type: 'prescreenDone'; run: number; outcome: PrescreenOutcome }
  | { type: 'retry' }
  | { type: 'edit'; op: EditorOp }
  | { type: 'toSend' }
  | { type: 'preflightStart'; run: number }
  | { type: 'preflightDone'; run: number; dry: DryRun }
  | { type: 'cancelSend' }
  | { type: 'sent'; run: number }
  | { type: 'attackDone'; run: number; outcome: AttackOutcome }
  | { type: 'retryAttack'; run: number }
  | { type: 'toVerdict' }
  | { type: 'toFix'; maxRounds: number }
  | { type: 'toggleFixMask'; clueId: string }
  | { type: 'toggleFixCrop' }
  | { type: 'applyFix'; masks: readonly PxRect[]; crop: PxRect | null }
  | { type: 'cancelFix' }
  | { type: 'toReattack'; maxRounds: number }
  | { type: 'reflightStart'; run: number }
  | { type: 'reflightDone'; run: number; dry: DryRun }
  | { type: 'cancelResend' }
  | { type: 'resent'; run: number }
  | { type: 'reattackDone'; run: number; outcome: AttackOutcome }
  | { type: 'retryReattack'; run: number }
  | { type: 'reattackSettle' };

/** A new Check: the Import step, idle. */
export const CHECK_START: CheckState = Object.freeze({
  pos: STEPPER_START, importStatus: IMPORT_IDLE, prescreen: PRESCREEN_IDLE, epoch: 0, flow: FLOW_IDLE, fix: FIX_IDLE, reattack: REATTACK_IDLE,
});

/** A refusal anywhere in this photo's session (the first attack or a re-attack): no more S3 for it (D-114, D-129). */
export function declinedInSession(s: CheckState): boolean {
  const a = s.flow.attack;
  return (a.kind === 'done' && a.outcome.kind === 'refused') || s.reattack.history.some((o) => o.kind === 'refused');
}

/** The newest pass-B result of this photo (the last re-attack result, else the first attack's), or null. */
export function latestResult(s: CheckState): Extract<AttackOutcome, { kind: 'result' }> | null {
  for (let i = s.reattack.history.length - 1; i >= 0; i--) {
    const o = s.reattack.history[i];
    if (o && o.kind === 'result') return o;
  }
  const a = s.flow.attack;
  return a.kind === 'done' && a.outcome.kind === 'result' ? a.outcome : null;
}

/** The last re-attack's final outcome, once it is settled (the compare view's "after"), else null. */
export function settledReattack(s: CheckState): AttackOutcome | null {
  const r = s.reattack;
  return r.attack.kind === 'done' && r.history.length === r.rounds && r.rounds > 0 ? r.history[r.history.length - 1] ?? null : null;
}

/** Why no further fix round may start (null when one may): a decline, no pass-B result, or the round cap (AC-195). */
export function fixBlocked(s: CheckState, maxRounds: number): 'declined' | 'noResult' | 'maxRounds' | 'busy' | null {
  if (declinedInSession(s)) return 'declined';
  if (!latestResult(s)) return 'noResult';
  if (s.reattack.rounds >= maxRounds) return 'maxRounds';
  const at = s.reattack.attack;
  if (at.kind === 'running' || (at.kind === 'done' && s.reattack.history.length < s.reattack.rounds)) return 'busy';
  return null;
}

const reachedIndex = (pos: StepperPosition) => CHECK_STEPS.indexOf(pos.reached);

export function checkReducer(s: CheckState, a: CheckAction): CheckState {
  switch (a.type) {
    case 'selectStep':
      if (CHECK_STEPS.indexOf(a.step) > reachedIndex(s.pos) || a.step === s.pos.current) return s;
      return { ...s, pos: moveToStep(s.pos, a.step) };
    case 'continue':
      if (s.pos.current !== 'import' || s.importStatus.kind !== 'ready') return s;
      return { ...s, pos: moveToStep(s.pos, 'prescreen') };
    case 'importStatus':
      // A new attempt (or its result): the photo the later steps were about is gone.
      return {
        pos: STEPPER_START, importStatus: a.status, prescreen: PRESCREEN_IDLE, epoch: s.epoch + 1, flow: nextFlow(s.flow),
        fix: FIX_IDLE, reattack: nextReattack(REATTACK_IDLE, { run: s.reattack.run + 1 }),
      };
    case 'prescreenStart':
      if (s.importStatus.kind !== 'ready' || s.prescreen.kind !== 'idle' || a.run !== s.epoch) return s;
      return { ...s, prescreen: { kind: 'running', run: a.run, sha256: a.sha256, lines: PENDING_LINES } };
    case 'prescreenStep': {
      const p = s.prescreen;
      if (p.kind !== 'running' || p.run !== a.run) return s;
      const { step, status, count, ms } = a.report;
      const line: ProgressLine = { status, ...(count !== undefined ? { count } : {}), ...(ms !== undefined ? { ms } : {}) };
      return { ...s, prescreen: { ...p, lines: { ...p.lines, [step]: line } } };
    }
    case 'prescreenDone': {
      const p = s.prescreen;
      if (p.kind !== 'running' || p.run !== a.run) return s;
      const o = a.outcome;
      // A step that never reported done is failed (fail closed), whatever the outcome says.
      const failed = TIER0_STEPS.filter((st) => o.failed.includes(st) || p.lines[st].status !== 'done');
      const lines = { ...p.lines };
      for (const st of failed) if (lines[st].status !== 'failed') lines[st] = { status: 'failed', ...(lines[st].ms !== undefined ? { ms: lines[st].ms } : {}) };
      const editor = createEditor(o.findings, { width: o.width, height: o.height }, { mode: o.mode, autoMaskTypes: o.autoMaskTypes, padRatio: o.padRatio });
      return { ...s, prescreen: { kind: 'done', run: p.run, sha256: p.sha256, lines, failed, editor, ...(o.nano ? { nano: o.nano } : {}) } };
    }
    case 'retry':
      if (s.prescreen.kind !== 'done' || s.prescreen.failed.length === 0) return s;
      return { ...s, prescreen: PRESCREEN_IDLE, epoch: s.epoch + 1, flow: nextFlow(s.flow), fix: FIX_IDLE, reattack: nextReattack(REATTACK_IDLE, { run: s.reattack.run + 1 }) };
    case 'edit': {
      const p = s.prescreen;
      if (p.kind !== 'done' || s.flow.attack.kind !== 'idle') return s; // sent: the masks are locked (D-139)
      const editor = editorReducer(p.editor, a.op);
      if (editor === p.editor) return s;
      return { ...s, prescreen: { ...p, editor }, flow: s.flow.send.kind === 'idle' ? s.flow : nextFlow(s.flow) };
    }
    case 'toSend':
      if (s.pos.current !== 'prescreen' || s.prescreen.kind !== 'done' || s.prescreen.failed.length > 0) return s;
      return { ...s, pos: moveToStep(s.pos, 'send') };
    case 'preflightStart':
      if (s.pos.current !== 'send' || s.flow.send.kind !== 'idle' || s.flow.attack.kind !== 'idle' || a.run !== s.flow.run) return s;
      return { ...s, flow: { ...s.flow, send: { kind: 'checking', run: a.run } } };
    case 'preflightDone':
      if (s.flow.send.kind !== 'checking' || s.flow.send.run !== a.run) return s;
      return { ...s, flow: { ...s.flow, send: { kind: 'ready', run: a.run, dry: a.dry } } };
    case 'cancelSend':
      if (s.pos.current !== 'send' || s.flow.attack.kind !== 'idle') return s;
      return { ...s, pos: moveToStep(s.pos, 'prescreen'), flow: nextFlow(s.flow) };
    case 'sent': {
      const f = s.flow;
      if (s.pos.current !== 'send' || f.send.kind !== 'ready' || f.send.dry.failed.length > 0 || f.attack.kind !== 'idle' || a.run !== f.run) return s;
      return {
        ...s, pos: moveToStep(s.pos, 'attack'), flow: { ...f, attack: { kind: 'running', run: a.run } },
        reattack: { ...s.reattack, lastSentMasks: f.send.dry.masks.length },
      };
    }
    case 'attackDone': {
      const at = s.flow.attack;
      if (at.kind !== 'running' || at.run !== a.run) return s;
      const flow = { ...s.flow, attack: { kind: 'done' as const, run: a.run, outcome: a.outcome } };
      const pos = goesToVerdict(a.outcome) && s.pos.current === 'attack' ? moveToStep(s.pos, 'verdict') : s.pos;
      return { ...s, pos, flow };
    }
    case 'retryAttack': {
      const at = s.flow.attack;
      if (at.kind !== 'done' || at.run !== a.run || at.outcome.kind === 'result' || at.outcome.kind === 'refused' || !at.outcome.retry) return s;
      return { ...s, pos: moveToStep(s.pos, 'attack'), flow: { ...s.flow, attack: { kind: 'running', run: a.run } } };
    }
    case 'toVerdict':
      if (s.flow.attack.kind !== 'done') return s;
      return { ...s, pos: moveToStep(s.pos, 'verdict') };
    // ---------- Fix → Re-attack (T-078..T-080) ----------
    case 'toFix':
      if ((s.pos.current !== 'verdict' && s.pos.current !== 'reattack') || fixBlocked(s, a.maxRounds) !== null) return s;
      return { ...s, pos: moveToStep(s.pos, 'fix'), fix: { ...s.fix, unchecked: [], cropOff: false } };
    case 'toggleFixMask': {
      if (s.pos.current !== 'fix') return s;
      const u = s.fix.unchecked;
      return { ...s, fix: { ...s.fix, unchecked: u.includes(a.clueId) ? u.filter((x) => x !== a.clueId) : [...u, a.clueId] } };
    }
    case 'toggleFixCrop':
      if (s.pos.current !== 'fix') return s;
      return { ...s, fix: { ...s.fix, cropOff: !s.fix.cropOff } };
    case 'applyFix': {
      if (s.pos.current !== 'fix' || (a.masks.length === 0 && !a.crop) || s.reattack.attack.kind === 'running') return s;
      const prev = s.fix.applied;
      const applied = { masks: [...(prev?.masks ?? []), ...a.masks.map((m) => ({ ...m }))], crop: combineCrops(prev?.crop ?? null, a.crop) };
      return { ...s, fix: { unchecked: [], cropOff: false, applied, lastAdded: a.masks.length }, reattack: nextReattack(s.reattack, { pending: true }) };
    }
    case 'cancelFix':
      if (s.pos.current !== 'fix') return s;
      return { ...s, pos: moveToStep(s.pos, settledReattack(s) ? 'reattack' : 'verdict'), fix: { ...s.fix, unchecked: [], cropOff: false } };
    case 'toReattack':
      if (s.pos.current !== 'fix' || !s.reattack.pending || !s.fix.applied || declinedInSession(s) || s.reattack.rounds >= a.maxRounds) return s;
      return { ...s, pos: moveToStep(s.pos, 'reattack') };
    case 'reflightStart': {
      const r = s.reattack;
      if (s.pos.current !== 'reattack' || !r.pending || r.send.kind !== 'idle' || r.attack.kind !== 'idle' || a.run !== r.run) return s;
      return { ...s, reattack: { ...r, send: { kind: 'checking', run: a.run } } };
    }
    case 'reflightDone': {
      const r = s.reattack;
      if (r.send.kind !== 'checking' || r.send.run !== a.run) return s;
      return { ...s, reattack: { ...r, send: { kind: 'ready', run: a.run, dry: a.dry } } };
    }
    case 'cancelResend':
      if (s.pos.current !== 'reattack' || !s.reattack.pending || s.reattack.attack.kind !== 'idle') return s;
      return { ...s, pos: moveToStep(s.pos, 'fix'), reattack: nextReattack(s.reattack) };
    case 'resent': {
      const r = s.reattack;
      if (s.pos.current !== 'reattack' || !r.pending || r.send.kind !== 'ready' || r.send.dry.failed.length > 0 || r.attack.kind !== 'idle' || a.run !== r.run) return s;
      if (declinedInSession(s)) return s;
      return {
        ...s, reattack: { ...r, attack: { kind: 'running', run: a.run }, rounds: r.rounds + 1, pending: false, lastSentMasks: r.send.dry.masks.length },
      };
    }
    case 'reattackDone': {
      const r = s.reattack;
      if (r.attack.kind !== 'running' || r.attack.run !== a.run) return s;
      const history = goesToVerdict(a.outcome) ? [...r.history, a.outcome] : r.history;
      return { ...s, reattack: { ...r, attack: { kind: 'done', run: a.run, outcome: a.outcome }, history } };
    }
    case 'retryReattack': {
      const r = s.reattack;
      const at = r.attack;
      if (at.kind !== 'done' || at.run !== a.run || at.outcome.kind === 'result' || at.outcome.kind === 'refused' || !at.outcome.retry) return s;
      if (r.history.length === r.rounds) return s; // already settled
      return { ...s, reattack: { ...r, attack: { kind: 'running', run: a.run } } };
    }
    case 'reattackSettle': {
      const r = s.reattack;
      if (r.attack.kind !== 'done' || r.history.length >= r.rounds) return s;
      return { ...s, reattack: { ...r, history: [...r.history, r.attack.outcome] } };
    }
  }
}

/**
 * The masked frame candidate for the Send step (T-069), or null while there is none: no finished pre-screen, or a
 * pre-screen of another photo than the one Check holds (`masterSha256`; null = none held). A candidate with a
 * non-empty `blockedBy` must not be sent or exported (fail closed).
 */
export function maskedCandidate(s: CheckState, masterSha256: string | null): MaskedFrameCandidate | null {
  const p = s.prescreen;
  if (p.kind !== 'done' || s.importStatus.kind !== 'ready' || masterSha256 === null || p.sha256 !== masterSha256) return null;
  return candidateOf(p.editor, p.sha256, p.failed);
}
