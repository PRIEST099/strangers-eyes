// laneOf (docs/DESIGN.md §4, §5.6): every route maps to a lane, and placement follows the FINAL route (hudRoute).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hudRoute } from '../../core/ledgerView';
import { t } from '../../core/strings';
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
  const render = (entries: LedgerEntry[], tech = true) =>
    renderToStaticMarkup(createElement(HybridLanes, { mode: 'live', sessionId: 's1', entries, tech }));
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

  it('Technical details off (the default): plain job names, the same lanes, badges and latency', () => {
    const out = render([
      entry({ id: 'a', job: 'referee', payloadClass: 'S0', route: 'RULES_ONLY', mode: 'RULES', model: 'rules', latencyMs: 14 }),
      entry({ id: 'b', job: 'adversaryB', payloadClass: 'S3', route: 'IN_CLOUD', mode: 'ONLY_IN_CLOUD', bytesOut: 900, latencyMs: 2100 }),
    ], false);
    const { device, cloud } = lanes(out);
    expect(device).toContain(`>${t('ui.jobPlain.referee')}<`);
    expect(device).toContain('>RULES-ONLY</span>');
    expect(device).toContain('14 ms');
    expect(cloud).toContain(`>${t('ui.jobPlain.adversaryB')}<`);
    expect(cloud).toContain('>IN CLOUD</span>');
    expect(cloud).toContain('2.1 s');
    expect(out).not.toContain('attacker pass B');
    expect(out).not.toContain('>referee<');
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
    const out = renderToStaticMarkup(createElement(HybridLanes, { mode: 'explainer', tech: true }));
    expect(out).toContain('Where each step runs');
    expect(out).toContain('attacker pass B');
    expect(out).not.toContain('data-route=');
    const plain = renderToStaticMarkup(createElement(HybridLanes, { mode: 'explainer' }));
    expect(plain).toContain(t('ui.jobPlain.adversaryB'));
    expect(plain).not.toContain('attacker pass B');
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

describe('CloudCopy: a CACHED replay says so in words', () => {
  const sha = 'b2c3d4e5'.padEnd(64, '0');
  const sent = entry({ id: 's', sessionId: 'A', job: 'adversaryB', payloadClass: 'S3', route: 'IN_CLOUD', mode: 'ONLY_IN_CLOUD', model: 'model-a', imagesOut: 1, imageSha256: [sha], bytesOut: 50_000 });
  const replay = entry({ id: 'r', sessionId: 'B', job: 'adversaryB', payloadClass: 'S3', route: 'CACHED', mode: 'ONLY_IN_CLOUD', notes: ['recorded'] });
  const rail = (entries: LedgerEntry[]) => renderToStaticMarkup(createElement(CloudCopy, { variant: 'rail', entries, images: null }));

  it('never a bare "Nothing has left this device" beside a recorded result, and never an earlier photo\'s copy', () => {
    const out = rail([sent, replay]);
    expect(out).toContain(t('ui.cloudSaw.cached'));
    expect(out).not.toContain(t('copy.cloudSaw.empty'));
    expect(out).not.toContain('data-sha-prefix');
    expect(out).toContain('data-cloud-saw="none"');
  });

  it('before any attack it is still the empty state, and after a real send the copy', () => {
    expect(rail([])).toContain(t('copy.cloudSaw.empty'));
    expect(rail([replay, sent])).toContain(`data-sha-prefix="${sha.slice(0, 8)}"`);
  });

  it('plain meta by default (sent to Gemini, size); the hash, prompt and model id only with Technical details', () => {
    const plain = renderToStaticMarkup(createElement(CloudCopy, { variant: 'rail', entries: [sent], images: null }));
    expect(plain).toContain(`>${t('ui.hud.engine.cloudPlain')}<`);
    expect(plain).not.toContain('model-a');
    expect(plain).not.toContain(`>${sha.slice(0, 8)}<`);
    const tech = renderToStaticMarkup(createElement(CloudCopy, { variant: 'rail', entries: [sent], images: null, tech: true }));
    expect(tech).toContain('model-a');
    expect(tech).toContain(`>${sha.slice(0, 8)}<`);
  });
});
