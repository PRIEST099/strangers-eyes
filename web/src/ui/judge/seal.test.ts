// D-182: the sealed answer's pure parts (hold, open, the Ledger stamp).
import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from '../../core/types';
import { SEAL_CLOSED, canOpenOffline, sealCounts, sealHeld } from './seal';

const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: 'x', sessionId: 's1', judge: true, ts: 100, status: 'done', job: 'referee', payloadClass: 'S4', route: 'ON_DEVICE',
  mode: 'PREFER_ON_DEVICE', model: 'gemini-nano', promptVersion: null, latencyMs: 1, bytesOut: 0, imagesOut: 0, imageSha256: [],
  ...over,
} as LedgerEntry);

describe('sealed answer (D-182)', () => {
  it('holds only a result, only with the switch on, only until opened', () => {
    expect(sealHeld(true, SEAL_CLOSED, true)).toBe(true);
    expect(sealHeld(false, SEAL_CLOSED, true)).toBe(false); // switch off: the normal run is unchanged
    expect(sealHeld(true, SEAL_CLOSED, false)).toBe(false); // a refusal or failure: nothing to check, nothing held
    expect(sealHeld(true, { kind: 'opened', offline: true, at: 1 }, true)).toBe(false);
    expect(sealHeld(true, { kind: 'opened', offline: false, at: 1 }, true)).toBe(false);
  });

  it('offers "open offline" only when the browser reports no connection', () => {
    expect(canOpenOffline(false)).toBe(true);
    expect(canOpenOffline(true)).toBe(false);
  });

  it('counts this session in the window: on-device, rules, and anything that went or tried to go to the cloud', () => {
    const es = [
      entry({ id: 'a', ts: 150, route: 'ON_DEVICE' }),
      entry({ id: 'b', ts: 160, route: 'RULES_ONLY', model: 'rules' }),
      entry({ id: 'c', ts: 170, route: 'IN_CLOUD', model: 'gemini-x', bytesOut: 0 }),
      entry({ id: 'd', ts: 180, route: 'BLOCKED', bytesOut: 1200 }), // bytes seen by the gate count as cloud
      entry({ id: 'e', ts: 90, route: 'IN_CLOUD', bytesOut: 5000 }), // before opening: not in the window
      entry({ id: 'f', ts: 400, route: 'IN_CLOUD', bytesOut: 5000 }), // after coming back online
      entry({ id: 'g', ts: 155, route: 'ON_DEVICE', sessionId: 'other' }), // another session
      entry({ id: 'h', ts: 165, route: 'CACHED', model: 'x' }), // a replay sends nothing and is not an AI call here
      entry({ id: 'i', ts: 175, route: 'ON_DEVICE', status: 'pending' }), // a started call counts
    ];
    expect(sealCounts(es, 's1', 100, 300)).toEqual({ onDevice: 2, rules: 1, cloud: 2 });
    expect(sealCounts(es, 's1', 100, Infinity)).toEqual({ onDevice: 2, rules: 1, cloud: 3 });
    expect(sealCounts([], 's1', 0, Infinity)).toEqual({ onDevice: 0, rules: 0, cloud: 0 });
  });
});
