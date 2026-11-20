// web/src/ui/checkState.ts: the Check screen's state and its only two transitions (SCR-05…12; T-053 fix round 3).
// Pure, so it is unit-tested in Node; screens/Check.tsx holds it with useReducer and only dispatches.
//   - selectStep moves the stepper and nothing else: the import status survives a round trip to another step and back
//     (the dropzone unmounts meanwhile), so Import shows the panel for the photo Check still holds, and a `busy` import
//     still refuses a second photo.
//   - importStatus is sent only by the dropzone's onStatus: busy on a new attempt, then ready or the error.
// The master photo is NOT here: Check keeps it in a ref (never React state, never storage).
import { IMPORT_IDLE, type ImportStatus } from './importTransfer';
import { STEPPER_START, moveToStep, type CheckStep, type StepperPosition } from './layout';

export interface CheckState {
  readonly pos: StepperPosition;
  /** The last import status, next to the master it describes: `ready` exactly while Check holds that master. */
  readonly importStatus: ImportStatus;
}

export type CheckAction =
  | { type: 'selectStep'; step: CheckStep }
  | { type: 'importStatus'; status: ImportStatus };

/** A new Check: the Import step, idle. */
export const CHECK_START: CheckState = Object.freeze({ pos: STEPPER_START, importStatus: IMPORT_IDLE });

export function checkReducer(s: CheckState, a: CheckAction): CheckState {
  switch (a.type) {
    case 'selectStep': return { pos: moveToStep(s.pos, a.step), importStatus: s.importStatus };
    case 'importStatus': return { pos: s.pos, importStatus: a.status };
  }
}
