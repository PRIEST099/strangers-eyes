// web/src/ui/check/prescreenView.ts: pure view helpers of the pre-screen step (SPEC SCR-06; T-068): the progress-line
// copy, the Nano line by capability state, and the side-list labels. No React: unit-tested in Node.
import { kindDisplay } from '../../core/kinds';
import type { StringId, StringParams } from '../../core/strings';
import type { Confidence, Readers } from '../../core/types';
import type { CapState } from '../../ai/capabilities';
import type { Tier0StepId } from '../../tier0/tier0';
import type { PrescreenNanoLine, ProgressLine } from '../checkState';
import type { EditorItem } from './editor';

export interface Copy { id: StringId; params?: StringParams }

const NAME: Readonly<Record<Tier0StepId, StringId>> = {
  metadata: 'ui.prescreen.metadataName',
  faces: 'ui.prescreen.facesName',
  text: 'ui.prescreen.textName',
  vault: 'ui.prescreen.vaultName',
};
const DONE: Readonly<Record<Tier0StepId, StringId>> = {
  metadata: 'ui.prescreen.metadataName',
  faces: 'ui.prescreen.facesDone',
  text: 'ui.prescreen.textDone',
  vault: 'ui.prescreen.vaultDone',
};

/**
 * The text of one progress line (SPEC SCR-06: "Removing metadata", "Finding faces (n)", "Reading text (n words)",
 * "Checking against your vault (n matches)"). Pending and running read "{name}…"; a failed line says it didn't finish.
 * `name` is resolved by the caller with t() (a nested string parameter).
 */
export function lineCopy(step: Tier0StepId, line: ProgressLine): { id: StringId; name?: StringId; params?: StringParams } {
  switch (line.status) {
    case 'done':
      return step === 'metadata' ? { id: DONE[step] } : { id: DONE[step], params: { n: line.count ?? 0 } };
    case 'failed':
      return { id: 'ui.prescreen.lineFailed', name: NAME[step] };
    default:
      return { id: 'ui.prescreen.busy', name: NAME[step] };
  }
}

/**
 * The "Looking for clues" line before the Nano pre-screen has answered (SPEC SCR-06 states): (a) Nano is ready, so it
 * is running (ui.prescreen.nanoRunning); (a′) copy.prescreen.textOnly; (b) and (c) copy.prescreen.rulesOnly. Unknown
 * (the first availability check has not returned) reads as (c), like the capability chip.
 */
export function nanoLineCopy(state: CapState | null): StringId {
  if (state === 'a') return 'ui.prescreen.nanoRunning';
  if (state === 'a-prime') return 'copy.prescreen.textOnly';
  return 'copy.prescreen.rulesOnly';
}

/** T-066: the Nano line once the pre-screen finished: what the gate actually did, not what the chip expected. */
export function nanoResultLine(
  nano: PrescreenNanoLine | undefined, state: CapState | null,
): { id: StringId; params?: StringParams; route: 'ON_DEVICE' | 'RULES_ONLY'; ms?: number } {
  if (!nano) return { id: nanoLineCopy(state), route: 'RULES_ONLY' };
  if (nano.route === 'ON_DEVICE') return { id: 'ui.prescreen.nanoDone', params: { n: nano.count }, route: 'ON_DEVICE', ms: nano.latencyMs };
  if (nano.fallback === 'device_failed') return { id: 'ui.prescreen.nanoFailed', route: 'RULES_ONLY' };
  if (state === 'a') return { id: 'ui.prescreen.nanoUnavailable', route: 'RULES_ONLY' };
  return { id: nanoLineCopy(state), route: 'RULES_ONLY' };
}

/** The type label of a side-list row ("Face", "Phone number", "Name or text"…). */
export function clueLabelId(item: Pick<EditorItem, 'clue' | 'regexKind'>): StringId {
  if (item.clue.type === 'face') return 'ui.clue.face';
  if (item.regexKind === 'phone') return 'ui.clue.phone';
  return `ui.clue.${item.clue.type}`;
}

export function readerLabelId(r: Readers): StringId | null {
  switch (r) {
    case 'tier0': return 'ui.editor.reader.tier0';
    case 'nano': return 'ui.editor.reader.nano';
    case 'both': return 'ui.editor.reader.both';
    default: return null;
  }
}

export const severityLabelId = (s: Confidence): StringId => `ui.editor.severity.${s}`;

/**
 * The explanation under a row: a masked vault hit says what it matched (copy.prescreen.vaultHit, LOCAL ONLY), a grid-cell
 * box says it is approximate, an amber flag says it is a possible identifier. Otherwise null.
 */
export function rowDetail(item: EditorItem, typeLabel: string): Copy | null {
  const c = item.clue;
  if (c.vaultHits.length > 0) {
    if (!c.masked) return null; // "Masked on this device" would be untrue: the row shows copy.editor.warnVault instead
    const kind = item.vaultKinds?.[0];
    return { id: 'copy.prescreen.vaultHit', params: { TEXT: c.localText ?? '', kind: kind ? kindDisplay(kind).toLowerCase() : '' } };
  }
  if (item.approximate) return { id: 'copy.prescreen.approximate', params: { type: typeLabel.toLowerCase() } };
  if (!c.masked && item.flag === 'possible') return { id: 'copy.prescreen.possible', params: { type: typeLabel.toLowerCase() } };
  return null;
}
