// web/src/core/kinds.ts: the {KIND} display name of a vault kind (SPEC §17.3; ARCH §8.7 / §10 "KIND_DISPLAY").
// One source: shared/prompts/enums.v1.json KIND_DISPLAY, which a Vitest test pins to SPEC §17.3. Used by the copy
// strings that take {KIND} (copy.import.gpsNear, copy.verdict.*, copy.gate.blockedPrompt). Local display only.
import enums from '@prompts/enums.v1.json';
import type { VaultKind } from './types';

const KIND_DISPLAY: Readonly<Record<VaultKind, string>> = enums.KIND_DISPLAY;
/** place_pin's entry is "<LABEL>|PLACE": the user's label in capitals, or PLACE when there is none (SPEC §17.3). */
const PLACE_FALLBACK = (KIND_DISPLAY.place_pin.split('|')[1] ?? 'PLACE').trim();

/**
 * Display name for {KIND}. `label` matters only for place_pin. An unknown kind (a bad cast) shows the other_text
 * name ("VAULT ITEM") rather than an ID. The result is shown on this device only; it is never logged or sent.
 */
export function kindDisplay(kind: VaultKind, label?: string): string {
  if (kind === 'place_pin') {
    const l = (label ?? '').trim();
    return l ? l.toUpperCase() : PLACE_FALLBACK;
  }
  return Object.hasOwn(KIND_DISPLAY, kind) ? KIND_DISPLAY[kind] : KIND_DISPLAY.other_text;
}
