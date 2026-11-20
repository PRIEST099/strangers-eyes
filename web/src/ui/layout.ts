// web/src/ui/layout.ts: pure helpers for the global layout (SPEC §8.2). No React, no DOM: unit-tested in Node.
import type { LedgerCounters } from '../core/types';
import type { StringId, StringParams } from '../core/strings';
import type { ProductRouteName } from './router';

/** Screen names: the <h1> of placeholder screens and the document title (`{screen} · Strangers' Eyes`). */
export const SCREEN_TITLE: Readonly<Record<ProductRouteName, StringId>> = {
  home: 'ui.screen.home',
  vault: 'ui.screen.vault',
  check: 'ui.screen.check',
  judge: 'ui.screen.judge',
  settings: 'ui.screen.settings',
  about: 'ui.screen.about',
  atlas: 'ui.screen.atlas',
};

/** SPEC §8.2: the Cloud Ledger is a right rail at ≥1024 px (Tailwind `lg`), a bottom sheet below that. */
export const LEDGER_RAIL_MIN_PX = 1024;
export const LEDGER_RAIL_QUERY = `(min-width: ${LEDGER_RAIL_MIN_PX}px)`;
export const isLedgerRail = (viewportPx: number): boolean => viewportPx >= LEDGER_RAIL_MIN_PX;
export const LEDGER_RAIL_ID = 'ledger-rail';

/** Until the Ledger exists (T-063) nothing has been sent, so every counter is truly zero. */
export const ZERO_COUNTERS: Readonly<LedgerCounters> = Object.freeze({
  facesSent: 0,
  vaultItemsSent: 0,
  uniqueImages: 0,
  cloudRequests: 0,
  bytesSent: 0,
  onDeviceCalls: 0,
  rulesChecks: 0,
  blocked: 0,
});

/** Kilobytes for the Ledger's `Bytes: {kb}` line, one decimal under 10 KB, whole numbers above. */
export function kilobytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0';
  const kb = bytes / 1024;
  return kb < 10 ? kb.toFixed(1) : String(Math.round(kb));
}

// ---------- capability chip (SPEC §8.2; states from §5.2) ----------

export type CapabilityChipState =
  | { kind: 'nano' } // (a)
  | { kind: 'nanoTextOnly' } // (a′)
  | { kind: 'downloading'; pct: number } // (b)
  | { kind: 'rulesOnly' }; // (c)

/**
 * The chip before capability detection exists (T-061). Fail closed: the shell never claims on-device AI; with
 * no detection, private steps can only run as built-in rules.
 */
export const PLACEHOLDER_CAPABILITY: CapabilityChipState = { kind: 'rulesOnly' };

export function capabilityChipCopy(state: CapabilityChipState): { id: StringId; params?: StringParams } {
  switch (state.kind) {
    case 'nano':
      return { id: 'ui.cap.chip.nano' };
    case 'nanoTextOnly':
      return { id: 'ui.cap.chip.nanoTextOnly' };
    case 'downloading': {
      const pct = Number.isFinite(state.pct) ? Math.min(100, Math.max(0, Math.round(state.pct))) : 0;
      return { id: 'ui.cap.chip.downloading', params: { pct } };
    }
    case 'rulesOnly':
      return { id: 'ui.cap.chip.rulesOnly' };
  }
}

// ---------- connectivity chip (SPEC §8.2: shown only when offline or when the cloud is paused) ----------

export type Connectivity = 'online' | 'offline' | 'cloudPaused' | 'cloudCap';

/** Offline wins over the cloud states: with no network, nothing reaches the cloud anyway. */
export function connectivityOf(s: { online: boolean; killSwitch?: boolean; capReached?: boolean }): Connectivity {
  if (!s.online) return 'offline';
  if (s.killSwitch) return 'cloudPaused';
  if (s.capReached) return 'cloudCap';
  return 'online';
}

/** The chip text, or null when the chip is hidden (online, cloud available). */
export function connectivityChipCopy(c: Connectivity): StringId | null {
  switch (c) {
    case 'offline':
      return 'ui.conn.offline';
    case 'cloudPaused':
      return 'ui.conn.cloudPaused';
    case 'cloudCap':
      return 'ui.conn.cloudCap';
    case 'online':
      return null;
  }
}

// ---------- check stepper (SPEC §8.2) ----------

export const CHECK_STEPS = ['import', 'prescreen', 'send', 'attack', 'verdict', 'fix', 'reattack', 'export'] as const;
export type CheckStep = (typeof CHECK_STEPS)[number];
/**
 * done: behind the furthest step, so finished · current: on screen · reached: the furthest step, not on screen
 * (revisitable, but it may still be in progress, so it is not called done) · upcoming: not reached yet.
 */
export type StepStatus = 'done' | 'current' | 'reached' | 'upcoming';

export const stepLabelId = (s: CheckStep): StringId => `ui.step.${s}`;

/**
 * `reached` is the furthest step the check has got to. Every step up to it can be revisited without re-running
 * any calls (SPEC §8.2). Steps before it are finished (a check only moves on once a step is done); the furthest
 * step itself is only known to be started, so it gets its own status rather than `done`.
 */
export function stepStatus(index: number, current: number, reached: number): StepStatus {
  const furthest = Math.max(reached, current);
  if (index === current) return 'current';
  if (index < furthest) return 'done';
  return index === furthest ? 'reached' : 'upcoming';
}

/** Where the check stepper stands. `reached` only ever moves forward. */
export interface StepperPosition {
  current: CheckStep;
  reached: CheckStep;
}

export const STEPPER_START: Readonly<StepperPosition> = Object.freeze({ current: 'import', reached: 'import' });

/** Show `step`: a revisit keeps `reached`; an advance past it moves `reached` along. */
export function moveToStep(pos: StepperPosition, step: CheckStep): StepperPosition {
  const ahead = CHECK_STEPS.indexOf(step) > CHECK_STEPS.indexOf(pos.reached);
  return { current: step, reached: ahead ? step : pos.reached };
}
