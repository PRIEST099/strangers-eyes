// T-063 / T-064: counters, HUD lines and the "What the cloud saw" pick, over a real in-memory Ledger.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HudLines, RouterHUD } from '../ui/components/RouterHUD';
import { LedgerPanel } from '../ui/components/LedgerPanel';
import { createMemoryLedger, type Ledger, type LedgerStart } from './ledger';
import { createSentImageStore } from './ledgerImages';
import { bytesText, hudLine, hudPill, hudRoute, lastAttackReplayed, latencyText, lastCloudImageSend, ledgerCounters, receiptText } from './ledgerView';
import { t } from './strings';

const SHA_A = 'a'.repeat(64);
const SHA_ORIG = 'b'.repeat(64);
const start = (job: LedgerStart['job'], payloadClass: LedgerStart['payloadClass'], promptVersion: string | null = null): LedgerStart =>
  ({ sessionId: 's1', judge: false, job, payloadClass, promptVersion });

/** The demo loop: Nano pre-screen (S1, device, hashes the nano768 copy of the ORIGINAL), pass B (S3 cloud), referee. */
function demo(l: Ledger) {
  const pre = l.begin(start('preScreen', 'S1', 'nanoPre.v1'));
  l.commit(pre, { route: 'ON_DEVICE', mode: 'ONLY_ON_DEVICE', model: 'gemini-nano', inferenceSource: 'on_device', latencyMs: 640, imageSha256: [SHA_ORIG] });
  const b = l.begin(start('adversaryB', 'S3', 'advB.v1'));
  l.commit(b, { route: 'IN_CLOUD', mode: 'ONLY_IN_CLOUD', model: 'gemini-3-pro', inferenceSource: 'in_cloud', latencyMs: 8200, bytesOut: 61_000, imagesOut: 1, imageSha256: [SHA_A], notes: ['simulated'] });
  const r = l.begin(start('referee', 'S0', 'referee.v1'));
  l.commit(r, { route: 'ON_DEVICE', mode: 'ONLY_ON_DEVICE', model: 'gemini-nano', inferenceSource: 'on_device', latencyMs: 1300 });
}

describe('ledgerCounters (ARCH §8.6)', () => {
  it('counts requests by bytesOut > 0, images by unique sent hash, and on-device calls', () => {
    const l = createMemoryLedger();
    demo(l);
    expect(ledgerCounters(l.entries())).toEqual({
      facesSent: 0, vaultItemsSent: 0, uniqueImages: 1, cloudRequests: 1, bytesSent: 61_000, onDeviceCalls: 2, rulesChecks: 0, blocked: 0,
    });
  });

  it('Blocked counts gate refusals only: never a pending entry, never an error without a block reason', () => {
    const l = createMemoryLedger();
    l.begin(start('adversaryB', 'S3')); // pending: reads BLOCKED, 0 B
    const e = l.begin(start('adversaryB', 'S3'));
    l.commit(e, { route: 'IN_CLOUD', error: 'INTERNAL' }); // tried the cloud, nothing sent
    const k = l.begin(start('adversaryB', 'S3'));
    l.commit(k, { route: 'BLOCKED', blocked: { reason: 'FACE' } });
    const rules = l.begin(start('referee', 'S0'));
    l.commit(rules, { route: 'RULES_ONLY', notes: ['Nano off'] });
    const c = ledgerCounters(l.entries());
    expect(c.blocked).toBe(1);
    expect(c.cloudRequests).toBe(0);
    expect(c.rulesChecks).toBe(1);
  });

  it('the receipt is built from numbers only', () => {
    const l = createMemoryLedger();
    demo(l);
    const r = receiptText(ledgerCounters(l.entries()));
    expect(r).toBe('Cloud received 1 redacted images in 1 requests · 0 faces · 0 vault items · 2 on-device AI calls · 0 local checks.');
  });
});

describe('HUD lines (SCR-14, AC-220)', () => {
  it('every entry gives a line; a pending entry is "running", never BLOCKED', () => {
    const l = createMemoryLedger();
    demo(l);
    l.begin(start('explain', 'S2'));
    const lines = l.entries().map((e) => hudLine(e));
    expect(lines).toHaveLength(4);
    expect(lines.map((x) => x.route)).toEqual(['ON_DEVICE', 'IN_CLOUD', 'ON_DEVICE', null]);
    expect(lines[1]).toMatchObject({ job: 'attacker pass B', cls: 'S3', engine: 'gemini-3-pro', latency: '8.2 s', bytes: '60 KB', tags: ['simulated'] });
    expect(lines[2]).toMatchObject({ job: 'referee', engine: 'Gemini Nano', latency: '1.3 s', bytes: '0 B' });
    expect(hudPill(l.entries())).toBe('explain › running…');
  });

  it('S2/S4 take the route from inferenceSource; other classes keep the gate route', () => {
    const l = createMemoryLedger();
    const a = l.begin(start('explain', 'S2'));
    l.commit(a, { route: 'ON_DEVICE', inferenceSource: 'in_cloud', notes: ['fallback: no on-device model'] });
    const b = l.begin(start('referee', 'S0'));
    l.commit(b, { route: 'ON_DEVICE', inferenceSource: 'in_cloud' });
    const [x, y] = l.entries();
    expect(hudRoute(x)).toBe('IN_CLOUD');
    expect(hudRoute(y)).toBe('ON_DEVICE');
    expect(hudLine(x).tags).toContain('fallback: no on-device model');
  });

  it('Technical details off: plain job, engine and tags (no class code, raw note or gate code); route and latency stay', () => {
    const l = createMemoryLedger();
    const a = l.begin(start('explain', 'S2'));
    l.commit(a, { route: 'ON_DEVICE', inferenceSource: 'in_cloud', model: 'gemini-x-pinned', latencyMs: 2100, notes: ['fallback: no on-device model', 'RECLASSIFIED S2→S0'] });
    const [x] = l.entries();
    const plain = hudLine(x, false);
    expect(plain.job).toBe(t('ui.jobPlain.explain'));
    expect(plain.route).toBe('IN_CLOUD');
    expect(plain.latency).toBe('2.1 s');
    expect(plain.engine).toBe(t('ui.hud.engine.cloudPlain'));
    expect(plain.tags).toEqual([t('ui.hud.tagPlain.fallback')]);
    expect(plain.tags.join(' ')).not.toMatch(/S[0-4]/);
    expect(hudPill(l.entries(), false)).toBe(`${t('ui.jobPlain.explain')} › IN CLOUD 2.1 s`);
    // technical: the raw notes and the exact model id
    expect(hudLine(x, true).tags).toContain('RECLASSIFIED S2→S0');
    expect(hudLine(x, true).engine).toBe('gemini-x-pinned');
  });

  it('a replay is a recording: lastAttackReplayed follows the newest finished attacker entry', () => {
    const l = createMemoryLedger();
    expect(lastAttackReplayed(l.entries())).toBe(false);
    demo(l);
    expect(lastAttackReplayed(l.entries())).toBe(false);
    l.record({ sessionId: 's9', judge: true, ts: 0, job: 'adversaryB', payloadClass: 'S3', route: 'CACHED', mode: 'ONLY_IN_CLOUD', model: 'm', promptVersion: null,
      latencyMs: 0, bytesOut: 0, imagesOut: 0, imageSha256: [], facesInOutgoing: 0, vaultItemsInOutgoing: 0, notes: ['recorded'] });
    expect(lastAttackReplayed(l.entries())).toBe(true);
    expect(lastAttackReplayed(l.entries(), 's9')).toBe(true);
    expect(lastAttackReplayed(l.entries(), 'nope')).toBe(false);
    expect(ledgerCounters(l.entries()).cloudRequests).toBe(1); // the replay sent nothing
  });

  it('pill, latency and byte formats', () => {
    const l = createMemoryLedger();
    expect(hudPill(l.entries())).toBe(t('ui.hud.idleShort'));
    demo(l);
    expect(hudPill(l.entries())).toBe('referee › ON-DEVICE (Gemini Nano) 1.3 s');
    expect(latencyText(850)).toBe('850 ms');
    expect(latencyText(Number.NaN)).toBe('0 ms');
    expect(bytesText(312)).toBe('312 B');
    expect(bytesText(2048)).toBe('2.0 KB');
  });

  it('renders the log lines and the pill', () => {
    const l = createMemoryLedger();
    demo(l);
    const html = renderToStaticMarkup(createElement(RouterHUD, { entries: l.entries(), tech: true }));
    expect(html).toContain('role="log"');
    expect(html).toContain('referee › ON-DEVICE (Gemini Nano) 1.3 s');
    expect((html.match(/data-hud-line="/g) ?? []).length).toBe(3);
    // Technical details off (the default): plain job names, no payload class, still the route and the latency.
    const plain = renderToStaticMarkup(createElement(RouterHUD, { entries: l.entries() }));
    expect(plain).toContain(`${t('ui.jobPlain.referee')} › ON-DEVICE 1.3 s`);
    expect(plain).not.toMatch(/\[S[0-4]\]/);
    expect((plain.match(/data-hud-line="/g) ?? []).length).toBe(3);
    expect(renderToStaticMarkup(createElement(HudLines, { entries: [] }))).toContain(t('ui.hud.empty'));
  });
});

describe('What the cloud saw (SCR-15)', () => {
  it('picks the newest IN_CLOUD image send, never the on-device copy of the original', () => {
    const l = createMemoryLedger();
    const pre = l.begin(start('preScreen', 'S1'));
    l.commit(pre, { route: 'ON_DEVICE', model: 'gemini-nano', imageSha256: [SHA_ORIG] });
    expect(lastCloudImageSend(l.entries())).toBeNull();
    demo(l);
    expect(lastCloudImageSend(l.entries())?.imageSha256).toEqual([SHA_A]);
    expect(lastCloudImageSend(l.entries(), 'other')).toBeNull();
  });

  it('the rail shows the sha prefix and prompt id of the send, and the empty copy before one', async () => {
    const l = createMemoryLedger();
    const images = createSentImageStore(4, async () => SHA_A);
    const empty = renderToStaticMarkup(createElement(LedgerPanel, { counters: ledgerCounters(l.entries()), entries: l.entries(), images }));
    expect(empty).toContain(t('copy.cloudSaw.empty'));
    demo(l);
    await images.remember(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }));
    const html = renderToStaticMarkup(createElement(LedgerPanel, { counters: ledgerCounters(l.entries()), entries: l.entries(), images, tech: true }));
    expect(html).toContain(`data-sha-prefix="${SHA_A.slice(0, 8)}"`);
    expect(html).toContain('advB.v1');
    // Technical details off: no prompt id, no visible hash, no payload class; the route badges stay.
    const plain = renderToStaticMarkup(createElement(LedgerPanel, { counters: ledgerCounters(l.entries()), entries: l.entries(), images }));
    expect(plain).not.toContain('advB.v1');
    expect(plain).not.toContain(`${SHA_A.slice(0, 8)}<`);
    expect(plain).not.toMatch(/\[S[0-4]\]/);
    expect(plain).toContain('data-route="IN_CLOUD"');
    expect(html).toContain('Images: 1 · Requests: 1');
    expect(html).not.toContain(SHA_ORIG.slice(0, 8) + '<'); // the on-device hash is not the cloud-saw hash
  });
});
