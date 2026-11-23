// laneOf (docs/DESIGN.md §4, §5.6): every route maps to a lane, and placement follows the FINAL route (hudRoute).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hudRoute } from '../../core/ledgerView';
import { CloudCopy } from '../components/CloudCopy';
import { HybridLanes } from '../components/HybridLanes';
import type { LedgerEntry, Route } from '../../core/types';
import { laneOf, type Lane } from './lanes';

const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: 'e1',
  sessionId: 's1',
  judge: true,
  ts: 0,
  status: 'done',
  job: 'explain',
  payloadClass: 'S4',
  route: 'ON_DEVICE',
  mode: 'PREFER_ON_DEVICE',
  model: 'gemini-nano',
  promptVersion: null,
  latencyMs: 10,
  bytesOut: 0,
  imagesOut: 0,
  imageSha256: [],
  facesInOutgoing: 0,
  vaultItemsInOutgoing: 0,
  notes: [],
  ...over,
});

describe('laneOf', () => {
  it.each<[Route, Lane]>([
    ['ON_DEVICE', 'device'],
    ['RULES_ONLY', 'device'],
    ['BLOCKED', 'device'],
    ['QUEUED', 'device'],
    ['IN_CLOUD', 'cloud'],
    ['CACHED', 'cloud'],
  ])('%s → %s', (route, lane) => {
    expect(laneOf(route)).toBe(lane);
  });

  it('puts an S4 call that fell back to the cloud in the cloud lane (route honesty)', () => {
    const e = entry({ payloadClass: 'S4', route: 'ON_DEVICE', inferenceSource: 'in_cloud', bytesOut: 1200 });
    expect(laneOf(hudRoute(e))).toBe('cloud');
  });

  it('keeps a queued call (not sent yet) in the device lane', () => {
    expect(laneOf(hudRoute(entry({ payloadClass: 'S3', route: 'QUEUED', mode: 'ONLY_IN_CLOUD' })))).toBe('device');
  });
});

describe('HybridLanes live: chips are placed by the final route only', () => {
  const render = (entries: LedgerEntry[]) =>
    renderToStaticMarkup(createElement(HybridLanes, { mode: 'live', sessionId: 's1', entries }));
  /** The md+ lane panels: device comes first in the markup, then the Wall, then cloud. */
  const lanes = (out: string) => {
    const [, afterDevice = ''] = out.split('data-lane="device"');
    const [device, cloud = ''] = afterDevice.split('data-lane="cloud"');
    return { device, cloud };
  };

  it('puts an S4 cloud fallback in the cloud lane and a rules-only referee in the device lane', () => {
    const out = render([
      entry({ id: 'a', job: 'referee', payloadClass: 'S0', route: 'RULES_ONLY', mode: 'RULES', model: 'rules' }),
      entry({ id: 'b', job: 'explain', payloadClass: 'S4', route: 'ON_DEVICE', inferenceSource: 'in_cloud', bytesOut: 900 }),
    ]);
    const { device, cloud } = lanes(out);
    expect(device).toContain('referee');
    expect(device).toContain('>RULES-ONLY</span>');
    expect(device).not.toContain('>explain<');
    expect(cloud).toContain('>explain<');
    expect(cloud).toContain('>IN CLOUD</span>');
  });

  it('places neither pending calls nor other sessions, and shows the gate counter', () => {
    const out = render([
      entry({ id: 'p', job: 'adversaryB', payloadClass: 'S3', route: 'IN_CLOUD', status: 'pending' }),
      entry({ id: 'o', sessionId: 'other', job: 'fixPlan', payloadClass: 'S0', route: 'ON_DEVICE' }),
    ]);
    expect(out).not.toContain('attacker pass B');
    expect(out).not.toContain('fix plan');
    expect(out).toContain('0 faces · 0 vault items');
  });

  it('caps each lane at four chips plus "+n earlier"', () => {
    const many = Array.from({ length: 6 }, (_, i) => entry({ id: `r${i}`, job: 'referee', payloadClass: 'S0', route: 'ON_DEVICE' }));
    const { device } = lanes(render(many));
    expect(device.match(/>referee</g)?.length).toBe(4);
    expect(device).toContain('+2 earlier');
  });
});

describe('HybridLanes explainer', () => {
  it('shows ghost chips with no route badges', () => {
    const out = renderToStaticMarkup(createElement(HybridLanes, { mode: 'explainer' }));
    expect(out).toContain('Where each step runs');
    expect(out).toContain('attacker pass B');
    expect(out).not.toContain('data-route=');
  });
});

describe('CloudCopy stage: scoped to its own check', () => {
  const shaA = 'a1b2c3d4'.padEnd(64, '0');
  const entries = [
    entry({ id: 'a', sessionId: 'A', job: 'adversaryB', payloadClass: 'S3', route: 'IN_CLOUD', mode: 'ONLY_IN_CLOUD', model: 'model-a', imagesOut: 1, imageSha256: [shaA], bytesOut: 50_000 }),
    entry({ id: 'b', sessionId: 'B', job: 'adversaryB', payloadClass: 'S3', route: 'BLOCKED', mode: 'ONLY_IN_CLOUD', notes: ['OFFLINE'] }),
  ];
  const stage = (sessionId?: string) =>
    renderToStaticMarkup(createElement(CloudCopy, { variant: 'stage', entries, images: null, sessionId }));

  it("shows the empty state, not session A's copy, when session B's send was blocked", () => {
    const out = stage('B');
    expect(out).toContain('Nothing has left this device yet.');
    expect(out).not.toContain('data-sha-prefix');
    expect(out).not.toContain('a1b2c3d4');
    expect(out).not.toContain('model-a');
  });

  it("shows session A's own send for session A", () => {
    expect(stage('A')).toContain('data-sha-prefix="a1b2c3d4"');
  });
});
