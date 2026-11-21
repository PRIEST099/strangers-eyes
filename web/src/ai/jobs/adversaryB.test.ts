// T-071: pass B through the REAL Egress Gate (egressGate.testing createEgressGate) on fakes: the model, Auth, faces and
// OCR are fakes; the vault index, interlock, prompts, strict JPEG check, consent, echo scan and Ledger are real.
// No network, no AI call.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Part } from 'firebase/ai';

vi.mock('../../firebase/init', () => ({ ai: {}, ensureAuth: vi.fn(async () => 'uid'), authReady: Promise.resolve('uid') }));
vi.mock('../../firebase/remoteConfig', async () => {
  const m = await import('../../firebase/rcParse');
  return { cfg: () => m.DEFAULT_CONFIG, DEFAULT_CONFIG: m.DEFAULT_CONFIG };
});
vi.mock('../../tier0/faces', () => ({ detectFaces: vi.fn() }));
vi.mock('../../tier0/ocr', () => ({ ocrCanvas: vi.fn() }));

import { mintConsent, type EgressGate, type GateModel, type GateNotice, type GateResponse, type OutgoingImage } from '../egressGate';
import { createEgressGate } from '../egressGate.testing';
import { setVaultScanner, tripwire } from '../tripwire';
import { createInterlock, type Interlock } from '../interlock';
import { createDeviceQueue } from '../deviceQueue';
import { createVaultScan } from '../vaultScan';
import { createMemoryLedger, type Ledger } from '../../core/ledger';
import { DEFAULT_CONFIG, type AppConfig } from '../../firebase/rcParse';
import { checkCleanJpeg } from '../../tier0/exif';
import { ADV_B_PROMPT, adversaryB, adversaryBRequest, createAdvBCache, parseAdvBText, type AdvBCache } from './adversaryB';
import { ParseError } from '../parse';
import type { VaultItem } from '../../core/types';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../../../../shared/prompts/fixtures/${name}`, import.meta.url)), 'utf8');

// A structurally valid canvas-style JPEG (the gate's strict validator accepts it).
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const seg = (m: number, p: number[]) => [0xff, m, ((p.length + 2) >> 8) & 0xff, (p.length + 2) & 0xff, ...p];
function jpeg(fill: number): Uint8Array<ArrayBuffer> {
  const parts = [0xff, 0xd8, ...seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), ...seg(0xdb, [0, ...new Array(64).fill(1)]),
    ...seg(0xc0, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]), ...seg(0xc4, [0, ...new Array(16).fill(0)]), ...seg(0xda, [1, 1, 0, 0, 63, 0]),
    fill, 0x12, 0xff, 0x00, fill, 0xff, 0xd9];
  const b = new Uint8Array(new ArrayBuffer(parts.length));
  b.set(parts);
  return b;
}
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const IMG_BYTES = jpeg(0x41);
const image = (): OutgoingImage => ({
  jpeg: new Blob([IMG_BYTES], { type: 'image/jpeg' }), base64: Buffer.from(IMG_BYTES).toString('base64'), sha256: sha(IMG_BYTES),
  mime: 'image/jpeg', frame: { id: 'cloud', width: 16, height: 16, cropInMaster: { x: 0, y: 0, w: 16, h: 16 } },
});
const VAULT: VaultItem[] = [{ id: 'vi_000000000003', kind: 'employer', label: 'Northwind Clinic', aliases: [], createdAt: 1 }];
const SESSION = 's-1';
const MODEL = DEFAULT_CONFIG.adversaryModel;

type Reply = { text?: string; finish?: string; refuse?: boolean; err?: { code: string; status?: number } };
interface H { g: EgressGate; ledger: Ledger; il: Interlock; calls: number; replies: Reply[]; config: AppConfig; online: boolean; capUsed: number; notices: GateNotice[]; faces: unknown[] }
const live: H[] = [];

function model(h: H): GateModel {
  return {
    async generateContent(_parts: Part[]) {
      h.calls++;
      const r = h.replies.length > 1 ? h.replies.shift()! : h.replies[0];
      if (r.err) throw Object.assign(new Error(r.err.code), { code: r.err.code, ...(r.err.status ? { customErrorData: { status: r.err.status } } : {}) });
      const res: GateResponse = {
        text: () => { if (r.refuse) throw Object.assign(new Error('blocked: SAFETY'), { code: 'response-error' }); return r.text ?? ''; },
        inferenceSource: 'in_cloud', candidates: [{ finishReason: r.finish ?? 'STOP' }],
      };
      return { response: res };
    },
    async generateContentStream() { throw new Error('not streamed'); },
  };
}

async function harness(replies: Reply[], over: Partial<AppConfig> = {}): Promise<H> {
  const vs = createVaultScan({ loadReal: async () => VAULT, register: setVaultScanner });
  await vs.init({ judge: false });
  const h = { replies, calls: 0, config: { ...DEFAULT_CONFIG, ...over }, online: true, capUsed: 0, notices: [], faces: [] } as unknown as H;
  h.ledger = createMemoryLedger();
  h.il = createInterlock(tripwire);
  h.g = createEgressGate({
    cfg: () => h.config, vault: vs, availabilityNow: async () => 'unavailable',
    prefs: { nanoEnabled: () => false, simulateNoNano: () => false },
    caps: { usedToday: () => h.capUsed, increment: () => ++h.capUsed }, online: () => h.online, ensureAuth: async () => 'uid',
    interlock: h.il, tripwire, deviceQueue: createDeviceQueue(), buildModel: () => model(h), ledger: h.ledger,
    status: { markTripwire: () => undefined, report: () => undefined, set: () => undefined }, notify: (n) => h.notices.push(n),
    samples: async () => null,
    images: { checkClean: checkCleanJpeg, decode: async () => ({}), faces: async () => h.faces, ocr: async () => [] },
    sha256Hex: async (b) => sha(b), now: () => Date.now(), clock: () => performance.now(), sleep: async () => undefined, random: () => 0.5,
    authTimeoutMs: 30, vaultReadyTimeoutMs: 30, deviceGraceMs: 10,
  });
  live.push(h);
  return h;
}
afterEach(() => { for (const h of live.splice(0)) { h.g.dispose(); h.il.dispose(); } });

const attack = (h: H, cache?: AdvBCache) => adversaryB(
  { sessionId: SESSION, image: image(), consent: mintConsent({ sha256: sha(IMG_BYTES), sessionId: SESSION }), model: MODEL },
  { run: (r) => h.g.gate(r), notices: { subscribe: () => () => undefined }, ...(cache ? { cache } : {}) },
);

describe('parseAdvBText', () => {
  it('parses the ok fixture and rejects non-JSON as a ParseError', () => {
    expect(parseAdvBText(fixture('advB.v1.ok.json')).status).toBe('ok');
    expect(() => parseAdvBText(fixture('advB.v1.truncated.json'))).toThrow(ParseError);
    expect(() => parseAdvBText('Sorry, I cannot help with that.')).toThrow(ParseError);
  });
  it('builds the advB.v1 request the gate expects (S3, consent, one image, no deterministic path)', () => {
    const r = adversaryBRequest({ sessionId: SESSION, image: image(), consent: mintConsent({ sha256: sha(IMG_BYTES), sessionId: SESSION }), model: MODEL });
    expect([r.job, r.payloadClass, r.promptId, r.images.length, r.deterministic]).toEqual(['adversaryB', 'S3', ADV_B_PROMPT, 1, undefined]);
  });
});

describe('adversaryB through the gate', () => {
  it('ok: a validated result with route, source and latency; the echo scan flags a vault string; one Ledger entry', async () => {
    const ok = JSON.parse(fixture('advB.v1.ok.json')) as { clues: { evidence: string }[] };
    ok.clues[2].evidence = 'Lanyard printed NORTHWIND CLINIC with a red logo.';
    const h = await harness([{ text: JSON.stringify(ok) }]);
    const o = await attack(h);
    expect(o.kind).toBe('result');
    if (o.kind !== 'result') return;
    expect(o.result.status).toBe('ok');
    expect(o.result.clues.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(o.result.echoedVaultIds).toEqual(['vi_000000000003']);
    expect(o.result.sentImageSha256).toBe(sha(IMG_BYTES));
    expect(o.call.route).toBe('IN_CLOUD');
    expect(o.call.source).toBe('in_cloud');
    expect(typeof o.call.latencyMs).toBe('number');
    expect(h.ledger.entries()).toHaveLength(1);
    expect(h.capUsed).toBe(1);
  });

  it('AC-147: a revisit is a cache hit: no new gate call, no new Ledger entry, route CACHED', async () => {
    const h = await harness([{ text: fixture('advB.v1.ok.json') }]);
    const cache = createAdvBCache();
    await attack(h, cache);
    const again = await attack(h, cache);
    expect(again.kind).toBe('result');
    expect(again.call.route).toBe('CACHED');
    expect(h.calls).toBe(1);
    expect(h.ledger.entries()).toHaveLength(1);
  });

  it('no_location_signal is a result with empty arrays', async () => {
    const h = await harness([{ text: fixture('advB.v1.no_signal.json') }]);
    const o = await attack(h);
    expect(o.kind === 'result' && o.result.status).toBe('no_location_signal');
  });

  it('declined: refused, no retry; the gate refuses any further S3 call for the session without calling the model', async () => {
    const h = await harness([{ text: fixture('advB.v1.declined.json') }]);
    expect(await attack(h)).toMatchObject({ kind: 'refused', why: 'declined' });
    expect(await attack(h)).toMatchObject({ kind: 'refused', why: 'blocked' });
    expect(h.calls).toBe(1);
  });

  it('a safety refusal (response-error) is refused/blocked and never retried', async () => {
    const h = await harness([{ refuse: true }]);
    expect(await attack(h)).toMatchObject({ kind: 'refused', why: 'blocked' });
    expect(h.calls).toBe(1);
  });

  it('MAX_TOKENS → truncated, unreadable JSON → unreadable: neither is resent nor offers Try again', async () => {
    const t = await harness([{ text: '{"audit_status":"ok"', finish: 'MAX_TOKENS' }]);
    expect(await attack(t)).toMatchObject({ kind: 'failed', state: 'truncated', retry: false, copyId: 'copy.err.cloudFailed' });
    expect(t.calls).toBe(1);
    const u = await harness([{ text: 'I would rather not.' }]);
    expect(await attack(u)).toMatchObject({ kind: 'failed', state: 'unreadable', retry: false });
    expect(u.calls).toBe(1);
  });

  it('a network error is retried once by the gate, then offers Try again; 429 waits 60 s', async () => {
    const n = await harness([{ err: { code: 'fetch-error' } }]);
    expect(await attack(n)).toMatchObject({ kind: 'failed', state: 'error', code: 'CLOUD_NETWORK', retry: true, copyId: 'copy.err.network' });
    expect(n.calls).toBe(2);
    const q = await harness([{ err: { code: 'fetch-error', status: 429 } }]);
    expect(await attack(q)).toMatchObject({ kind: 'failed', code: 'CLOUD_QUOTA', retry: true, retryAfterMs: 60_000 });
  });

  it('kill switch, offline and the daily cap are notSent: nothing reaches the model', async () => {
    const k = await harness([{ text: fixture('advB.v1.ok.json') }], { killSwitch: true });
    expect(await attack(k)).toMatchObject({ kind: 'notSent', reason: 'KILL_SWITCH', copyId: 'copy.err.killSwitch', retry: false });
    const off = await harness([{ text: fixture('advB.v1.ok.json') }]);
    off.online = false;
    expect(await attack(off)).toMatchObject({ kind: 'notSent', reason: 'OFFLINE', retry: true });
    const cap = await harness([{ text: fixture('advB.v1.ok.json') }]);
    cap.capUsed = cap.config.dailyAdversaryCap;
    expect(await attack(cap)).toMatchObject({ kind: 'notSent', reason: 'DAILY_CAP', copyId: 'copy.err.dailyCap' });
    expect(k.calls + off.calls + cap.calls).toBe(0);
  });

  it('a face in the outgoing bytes is blocked by the gate (FACE), nothing sent', async () => {
    const h = await harness([{ text: fixture('advB.v1.ok.json') }]);
    h.faces = [{ x: 1, y: 1, w: 4, h: 4 }];
    expect(await attack(h)).toMatchObject({ kind: 'notSent', reason: 'FACE', copyId: 'copy.gate.blockedFace' });
    expect(h.calls).toBe(0);
  });
});
