import { describe, expect, it } from 'vitest';
import { t } from '../core/strings';
import {
  CHECK_STEPS,
  SCREEN_TITLE,
  ZERO_COUNTERS,
  capabilityChipCopy,
  connectivityChipCopy,
  connectivityOf,
  isLedgerRail,
  STEPPER_START,
  kilobytes,
  moveToStep,
  stepLabelId,
  stepStatus,
} from './layout';
import { PRODUCT_ROUTES } from './router';

describe('Ledger rail breakpoint (SPEC §8.2)', () => {
  it('is a rail at ≥1024 px and a sheet below', () => {
    expect(isLedgerRail(375)).toBe(false);
    expect(isLedgerRail(1023)).toBe(false);
    expect(isLedgerRail(1024)).toBe(true);
    expect(isLedgerRail(1440)).toBe(true);
  });

  it('starts with every counter at zero, rendered as 0 · 0', () => {
    expect(Object.values(ZERO_COUNTERS).every((n) => n === 0)).toBe(true);
    expect(t('ui.ledger.button', { f: ZERO_COUNTERS.facesSent, v: ZERO_COUNTERS.vaultItemsSent })).toBe('Ledger 0 · 0');
  });

  it('formats kilobytes', () => {
    expect(kilobytes(0)).toBe('0');
    expect(kilobytes(-5)).toBe('0');
    expect(kilobytes(512)).toBe('0.5');
    expect(kilobytes(20 * 1024 + 300)).toBe('20');
    expect(kilobytes(Number.NaN)).toBe('0');
    expect(kilobytes(Number.POSITIVE_INFINITY)).toBe('0');
  });
});

describe('capability chip (SPEC §8.2)', () => {
  const text = (s: Parameters<typeof capabilityChipCopy>[0]) => {
    const c = capabilityChipCopy(s);
    return t(c.id, c.params);
  };

  it('uses the SPEC chip wording for each state', () => {
    expect(text({ kind: 'nano' })).toBe('On-device: Gemini Nano');
    expect(text({ kind: 'nanoTextOnly' })).toBe('On-device: Nano (text only)');
    expect(text({ kind: 'downloading', pct: 43 })).toBe('Downloading Nano 43%');
    expect(text({ kind: 'rulesOnly' })).toBe('Rules-only');
  });

  it('clamps and rounds the download percentage', () => {
    expect(text({ kind: 'downloading', pct: 42.6 })).toBe('Downloading Nano 43%');
    expect(text({ kind: 'downloading', pct: 140 })).toBe('Downloading Nano 100%');
    expect(text({ kind: 'downloading', pct: Number.NaN })).toBe('Downloading Nano 0%');
  });
});

describe('connectivity chip (SPEC §8.2)', () => {
  it('shows only when offline or the cloud is paused or capped; offline wins', () => {
    expect(connectivityOf({ online: true })).toBe('online');
    expect(connectivityOf({ online: false, killSwitch: true })).toBe('offline');
    expect(connectivityOf({ online: true, killSwitch: true, capReached: true })).toBe('cloudPaused');
    expect(connectivityOf({ online: true, capReached: true })).toBe('cloudCap');
    expect(connectivityChipCopy('online')).toBeNull();
    expect(t(connectivityChipCopy('offline')!)).toBe('Offline');
    expect(t(connectivityChipCopy('cloudPaused')!)).toBe('Cloud paused');
    expect(t(connectivityChipCopy('cloudCap')!)).toBe('Cloud limit reached');
  });
});

describe('check stepper (SPEC §8.2)', () => {
  it('has the eight steps in order with SPEC labels', () => {
    expect(CHECK_STEPS.map((s) => t(stepLabelId(s))).join(' › ')).toBe(
      'Import › Pre-screen › Send › Attack › Verdict › Fix › Re-attack › Export',
    );
  });

  it('marks current, done, reached and upcoming steps', () => {
    expect([0, 1, 2].map((i) => stepStatus(i, 0, 0))).toEqual(['current', 'upcoming', 'upcoming']);
    expect([0, 1, 2, 3].map((i) => stepStatus(i, 2, 2))).toEqual(['done', 'done', 'current', 'upcoming']);
    // Revisiting step 1 after reaching step 4: steps 2–4 stay reachable without re-running anything, and step 4,
    // the furthest, is not called done (it may still be in progress).
    expect([0, 1, 2, 3, 4, 5].map((i) => stepStatus(i, 1, 4))).toEqual([
      'done',
      'current',
      'done',
      'done',
      'reached',
      'upcoming',
    ]);
  });

  it('keeps the furthest step when a finished step is revisited (SPEC §8.2)', () => {
    expect(STEPPER_START).toEqual({ current: 'import', reached: 'import' });
    const atVerdict = moveToStep(moveToStep(STEPPER_START, 'attack'), 'verdict');
    expect(atVerdict).toEqual({ current: 'verdict', reached: 'verdict' });
    const back = moveToStep(atVerdict, 'send');
    expect(back).toEqual({ current: 'send', reached: 'verdict' });
    expect(moveToStep(back, 'verdict')).toEqual({ current: 'verdict', reached: 'verdict' });
    expect(moveToStep(back, 'fix')).toEqual({ current: 'fix', reached: 'fix' });
  });
});

describe('screen titles', () => {
  it('names every product route', () => {
    for (const r of PRODUCT_ROUTES) expect(t(SCREEN_TITLE[r]).length).toBeGreaterThan(0);
  });
});
