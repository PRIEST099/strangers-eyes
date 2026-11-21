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
//   - edit applies a mask-editor op (ui/check/editor.ts) to a finished pre-screen.
// The master photo is NOT here: Check keeps it in a ref (never React state, never storage).
import type { ClueType } from '../core/types';
import type { PreTickMode } from '../core/pretick';
import { TIER0_STEPS, type Tier0Finding, type Tier0StepId, type Tier0StepReport } from '../tier0/tier0';
import { candidateOf, createEditor, editorReducer, type EditorOp, type EditorState, type MaskedFrameCandidate } from './check/editor';
import { IMPORT_IDLE, type ImportStatus } from './importTransfer';
import { CHECK_STEPS, STEPPER_START, moveToStep, type CheckStep, type StepperPosition } from './layout';

/** The steps that exist so far. The stepper shows the others as not available yet (D-121). */
export const BUILT_STEPS: readonly CheckStep[] = Object.freeze(['import', 'prescreen']);

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
}

export type PrescreenState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly run: number; readonly sha256: string; readonly lines: ProgressLines }
  | {
    readonly kind: 'done'; readonly run: number; readonly sha256: string; readonly lines: ProgressLines;
    readonly failed: readonly Tier0StepId[]; readonly editor: EditorState;
  };
export const PRESCREEN_IDLE: PrescreenState = Object.freeze({ kind: 'idle' });

export interface CheckState {
  readonly pos: StepperPosition;
  /** The last import status, next to the master it describes: `ready` exactly while Check holds that master. */
  readonly importStatus: ImportStatus;
  /** The pre-screen of the photo Check holds (idle until it is first opened). */
  readonly prescreen: PrescreenState;
  /** The current pre-screen episode; the only run number prescreenStart accepts (D-133). */
  readonly epoch: number;
}

export type CheckAction =
  | { type: 'selectStep'; step: CheckStep }
  | { type: 'continue' }
  | { type: 'importStatus'; status: ImportStatus }
  | { type: 'prescreenStart'; run: number; sha256: string }
  | { type: 'prescreenStep'; run: number; report: Tier0StepReport }
  | { type: 'prescreenDone'; run: number; outcome: PrescreenOutcome }
  | { type: 'retry' }
  | { type: 'edit'; op: EditorOp };

/** A new Check: the Import step, idle. */
export const CHECK_START: CheckState = Object.freeze({ pos: STEPPER_START, importStatus: IMPORT_IDLE, prescreen: PRESCREEN_IDLE, epoch: 0 });

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
      return { pos: STEPPER_START, importStatus: a.status, prescreen: PRESCREEN_IDLE, epoch: s.epoch + 1 };
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
      return { ...s, prescreen: { kind: 'done', run: p.run, sha256: p.sha256, lines, failed, editor } };
    }
    case 'retry':
      if (s.prescreen.kind !== 'done' || s.prescreen.failed.length === 0) return s;
      return { ...s, prescreen: PRESCREEN_IDLE, epoch: s.epoch + 1 };
    case 'edit': {
      const p = s.prescreen;
      if (p.kind !== 'done') return s;
      const editor = editorReducer(p.editor, a.op);
      return editor === p.editor ? s : { ...s, prescreen: { ...p, editor } };
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
