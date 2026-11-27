// web/src/ui/judge/seal.ts: the "Prove it offline" sealed answer in Judge Mode (D-182). Pure, no DOM, no network.
// With the switch on, the attacker's first answer is held on this device, unchecked, until the judge opens it. Opened
// with the connection off, the guess check (the referee) runs with no network at all: Nano when this browser has it,
// otherwise simple rules; the gate never sends a Judge Mode check to the cloud while offline (deviceOrRules).
// The stamp then reports what the Cloud Ledger recorded for this session while the connection was off. With the
// network off a cloud call cannot complete, so a 0 is a check that the app behaved, not extra evidence; the copy says
// "AI calls", the Ledger's scope (requests the app makes outside its AI gate, such as App Check or MediaPipe's usage
// pings, are not counted here; docs/egress-measurement.md).
import type { LedgerEntry } from '../../core/types';

export type SealState =
  | { kind: 'closed' }
  /** `offline`: opened while the browser reported no connection (the only case that gets a stamp). */
  | { kind: 'opened'; offline: boolean; at: number };

export const SEAL_CLOSED: SealState = { kind: 'closed' };

/** Whether the first answer is still held: the switch is on, it is not opened yet, and there is a result to check. */
export function sealHeld(sealedMode: boolean, seal: SealState, outcomeIsResult: boolean): boolean {
  return sealedMode && seal.kind === 'closed' && outcomeIsResult;
}

/** Opening with the connection off is only offered when the browser reports it off (navigator.onLine === false). */
export function canOpenOffline(online: boolean): boolean {
  return !online;
}

export interface SealCounts {
  /** AI calls that ran on this device (Gemini Nano or Apple FM) in the window. */
  onDevice: number;
  /** Calls answered by simple rules in the window (no model available, or it failed). */
  rules: number;
  /** Calls that reached, or tried to reach, the cloud: route IN_CLOUD, or any request bytes seen by the gate. */
  cloud: number;
}

/**
 * What the Cloud Ledger recorded for this session between `from` (opened) and `until` (back online; Infinity while
 * still offline). Pending entries count too: a call that started counts whether or not it finished.
 */
export function sealCounts(entries: readonly LedgerEntry[], sessionId: string, from: number, until: number): SealCounts {
  const c: SealCounts = { onDevice: 0, rules: 0, cloud: 0 };
  for (const e of entries) {
    if (e.sessionId !== sessionId || e.ts < from || e.ts > until) continue;
    if (e.route === 'IN_CLOUD' || e.bytesOut > 0) c.cloud++;
    else if (e.route === 'ON_DEVICE') c.onDevice++;
    else if (e.route === 'RULES_ONLY') c.rules++;
  }
  return c;
}
