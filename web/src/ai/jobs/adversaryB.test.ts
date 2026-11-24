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
import { cloudParamsFor } from '../models';
import { checkCleanJpeg } from '../../tier0/exif';
import {
  ADV_B_PROMPT, adversaryB, adversaryBRequest, BREAKER_THRESHOLD, createAdvBBreaker, createAdvBCache, createAdvBPins, failoverOrder,
  isReattack, parseAdvBText, type AdvBBreaker, type AdvBCache, type AdvBPins,
} from './adversaryB';
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

type Reply = { text?: string; finish?: string; refuse?: boolean; hang?: boolean; err?: { code: string; status?: number } };
interface H { g: EgressGate; ledger: Ledger; il: Interlock; calls: number; replies: Reply[]; config: AppConfig; online: boolean; capUsed: number; notices: GateNotice[]; faces: unknown[]; models: string[]; banners: string[] }
const live: H[] = [];

function model(h: H): GateModel {
  return {
    async generateContent(_parts: Part[]) {
      h.calls++;
      const r = h.replies.length > 1 ? h.replies.shift()! : h.replies[0];
      if (r.hang) return new Promise<never>(() => undefined); // never answers: the gate's own deadline must fire
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
  const h = { replies, calls: 0, config: { ...DEFAULT_CONFIG, ...over }, online: true, capUsed: 0, notices: [], faces: [], models: [], banners: [] } as unknown as H;
  h.ledger = createMemoryLedger();
  h.il = createInterlock(tripwire);
  h.g = createEgressGate({
    cfg: () => h.config, vault: vs, availabilityNow: async () => 'unavailable',
    prefs: { nanoEnabled: () => false, simulateNoNano: () => false },
    caps: { usedToday: () => h.capUsed, increment: () => ++h.capUsed }, online: () => h.online, ensureAuth: async () => 'uid',
    interlock: h.il, tripwire, deviceQueue: createDeviceQueue(),
    buildModel: (_spec, _mode, config, job) => { h.models.push(cloudParamsFor(config, job).model); return model(h); }, ledger: h.ledger,
    status: { markTripwire: () => undefined, report: (ev) => { h.banners.push(ev); }, set: () => undefined }, notify: (n) => h.notices.push(n),
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

describe('D-165: pass-B model failover (every attempt is its own gate call)', () => {
  const FB1 = 'gemini-4-hydrogen';
  const FB2 = 'gemini-3.1-flash-lite';
  const overloaded: Reply = { err: { code: 'fetch-error', status: 503 } };
  const quota: Reply = { err: { code: 'fetch-error', status: 429 } };
  const fb = (h: H, fallbacks: string[], breaker: AdvBBreaker = createAdvBBreaker(), cache?: AdvBCache) => adversaryB(
    { sessionId: SESSION, image: image(), consent: mintConsent({ sha256: sha(IMG_BYTES), sessionId: SESSION }), model: MODEL },
    { run: (r) => h.g.gate(r), notices: { subscribe: () => () => undefined }, fallbackModels: fallbacks, breaker, ...(cache ? { cache } : {}) },
  );
  const withFallbacks = (replies: Reply[], fallbacks: string[] = [FB1, FB2]) => harness(replies, { adversaryFallbackModels: fallbacks });

  it('failoverOrder: primary first, then the RC list in order, deduplicated, tripped models skipped, never empty', () => {
    const b = createAdvBBreaker(1);
    expect(failoverOrder(MODEL, [], b)).toEqual([MODEL]);
    expect(failoverOrder(MODEL, [FB1, MODEL, FB2, FB1], b)).toEqual([MODEL, FB1, FB2]);
    b.serverError(MODEL);
    expect(failoverOrder(MODEL, [FB1, FB2], b)).toEqual([FB1, FB2]);
    b.serverError(FB1); b.serverError(FB2);
    expect(failoverOrder(MODEL, [FB1, FB2], b)).toEqual([MODEL]); // all tripped: the primary alone
    b.answered(FB1);
    expect(failoverOrder(MODEL, [FB1, FB2], b)).toEqual([FB1]);
  });

  it('the RC default [] changes nothing: a 5xx is one gate call (with its own retry), no failover', async () => {
    const h = await harness([overloaded]);
    const o = await fb(h, []);
    expect(o).toMatchObject({ kind: 'failed', code: 'CLOUD_SERVER', retry: true });
    expect(o.call.failoverFrom).toBeUndefined();
    expect(h.ledger.entries()).toHaveLength(1);
    expect(new Set(h.models)).toEqual(new Set([MODEL]));
  });

  it('5xx on the primary → the next RC model, through the gate: a second Ledger entry on that model, same consented image', async () => {
    const h = await withFallbacks([overloaded, overloaded, { text: fixture('advB.v1.ok.json') }]);
    const o = await fb(h, [FB1, FB2]);
    expect(o.kind).toBe('result');
    if (o.kind !== 'result') return;
    expect(o.result.model).toBe(FB1);
    expect(o.call).toMatchObject({ model: FB1, route: 'IN_CLOUD', failoverFrom: [MODEL] });
    expect(h.models).toEqual([MODEL, MODEL, FB1]); // the gate's own 5xx retry on the primary, then one call on FB1
    const entries = h.ledger.entries();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.model)).toEqual([MODEL, FB1]);
    expect(entries.every((e) => e.job === 'adversaryB' && e.payloadClass === 'S3')).toBe(true);
    expect(entries[1].imageSha256).toEqual([sha(IMG_BYTES)]);
    expect(h.capUsed).toBe(1); // only the run that answered counts
    expect(h.banners).toEqual([]); // the primary's failure banner was deferred, and the failover answered
  });

  it('429 on the primary also fails over; every model failing returns the LAST failure and raises one banner', async () => {
    const h = await withFallbacks([quota, quota, quota, overloaded]);
    const o = await fb(h, [FB1]);
    expect(o).toMatchObject({ kind: 'failed', code: 'CLOUD_SERVER', retry: true, call: { model: FB1, failoverFrom: [MODEL] } });
    expect(h.ledger.entries().map((e) => e.model)).toEqual([MODEL, FB1]);
    expect(h.banners).toEqual(['network']); // only the last attempt reports
  });

  it('each failover attempt runs the gate checks again: a face → notSent, the fallback never sees the image', async () => {
    const h = await withFallbacks([overloaded]);
    const first = h.g.gate.bind(h.g);
    let n = 0;
    const o = await adversaryB(
      { sessionId: SESSION, image: image(), consent: mintConsent({ sha256: sha(IMG_BYTES), sessionId: SESSION }), model: MODEL },
      { run: async (r) => { if (n++ === 1) h.faces = [{ x: 1, y: 1, w: 4, h: 4 }]; return first(r); },
        notices: { subscribe: () => () => undefined }, fallbackModels: [FB1], breaker: createAdvBBreaker() },
    );
    expect(o).toMatchObject({ kind: 'notSent', reason: 'FACE' });
    expect(h.models).toEqual([MODEL, MODEL]);
    expect(h.ledger.entries()).toHaveLength(2);
  });

  it('the gate refuses a model RC does not pin (CLASS_MISMATCH), so a caller cannot pick any model', async () => {
    const h = await harness([overloaded]); // RC lists no fallbacks
    const o = await fb(h, [FB1]); // a stale or forged list on the caller's side
    expect(o).toMatchObject({ kind: 'notSent', reason: 'CLASS_MISMATCH' });
    expect(h.models).toEqual([MODEL, MODEL]);
    const r = adversaryBRequest({ sessionId: SESSION, image: image(), consent: mintConsent({ sha256: sha(IMG_BYTES), sessionId: SESSION }), model: MODEL }, { model: 'gemini-9-x' });
    await expect(h.g.gate(r)).rejects.toMatchObject({ reason: 'CLASS_MISMATCH' });
  });

  it('no failover after a decline, a safety block, a timeout, a truncated or an unreadable answer', async () => {
    const cases: [Reply, Record<string, unknown>][] = [
      [{ text: fixture('advB.v1.declined.json') }, { kind: 'refused', why: 'declined' }],
      [{ refuse: true }, { kind: 'refused', why: 'blocked' }],
      [{ text: '{"audit_status":"ok"', finish: 'MAX_TOKENS' }, { kind: 'failed', state: 'truncated' }],
      [{ text: 'I would rather not.' }, { kind: 'failed', state: 'unreadable' }],
    ];
    for (const [reply, want] of cases) {
      const h = await withFallbacks([reply]);
      expect(await fb(h, [FB1, FB2])).toMatchObject(want);
      expect(h.models).toEqual([MODEL]);
      expect(h.ledger.entries()).toHaveLength(1);
    }
    // A timeout (D-158: never retried, never failed over): the model never answers and the gate's deadline fires.
    const t = await withFallbacks([{ hang: true }]);
    const o = await adversaryB(
      { sessionId: SESSION, image: image(), consent: mintConsent({ sha256: sha(IMG_BYTES), sessionId: SESSION }), model: MODEL },
      { run: (r) => t.g.gate({ ...r, timeoutMs: 30 }), notices: { subscribe: () => () => undefined }, fallbackModels: [FB1, FB2], breaker: createAdvBBreaker() },
    );
    expect(o).toMatchObject({ kind: 'failed', state: 'error', code: 'TIMEOUT', call: { model: MODEL } });
    expect(t.models).toEqual([MODEL]);
    expect(t.ledger.entries()).toHaveLength(1);
  });

  it('a decline on a fallback is final: no third model, and the gate refuses any further attack', async () => {
    const h = await withFallbacks([overloaded, overloaded, { text: fixture('advB.v1.declined.json') }]);
    expect(await fb(h, [FB1, FB2])).toMatchObject({ kind: 'refused', why: 'declined', call: { model: FB1 } });
    expect(h.models).toEqual([MODEL, MODEL, FB1]);
    expect(await fb(h, [FB1, FB2])).toMatchObject({ kind: 'refused', why: 'blocked' });
    expect(h.models).toHaveLength(3);
  });

  it(`breaker: after ${BREAKER_THRESHOLD} consecutive 5xx attempts a model is skipped for the session; an answer resets it`, async () => {
    const breaker = createAdvBBreaker();
    const h = await withFallbacks([overloaded], [FB1]);
    for (let k = 0; k < BREAKER_THRESHOLD; k++) await fb(h, [FB1], breaker); // both models 5xx every time
    expect(breaker.tripped(MODEL) && breaker.tripped(FB1)).toBe(true);
    const before = h.models.length;
    await fb(h, [FB1], breaker); // everything tripped: the primary alone, once
    expect(h.models.slice(before)).toEqual([MODEL, MODEL]);

    const b2 = createAdvBBreaker();
    const h2 = await withFallbacks([{ text: fixture('advB.v1.ok.json') }], [FB1]);
    b2.serverError(MODEL); b2.serverError(MODEL); // the primary is already tripped this session
    const o = await fb(h2, [FB1], b2);
    expect(o).toMatchObject({ kind: 'result', call: { model: FB1 } });
    expect(h2.models[0]).toBe(FB1); // straight to the fallback: no wasted call on the overloaded primary
    expect(o.call.failoverFrom).toBeUndefined();
    b2.answered(MODEL);
    expect(b2.tripped(MODEL)).toBe(false);
  });

  it('a 429 does not trip the breaker (quota is not overload)', async () => {
    const breaker = createAdvBBreaker(1);
    const h = await withFallbacks([quota]);
    await fb(h, [FB1], breaker);
    expect(breaker.tripped(MODEL) || breaker.tripped(FB1)).toBe(false);
  });

  it('a failover result is cached under the primary key: a revisit is CACHED with no new gate call', async () => {
    const h = await withFallbacks([overloaded, overloaded, { text: fixture('advB.v1.ok.json') }]);
    const cache = createAdvBCache();
    await fb(h, [FB1], createAdvBBreaker(), cache);
    const again = await fb(h, [FB1], createAdvBBreaker(), cache);
    expect(again).toMatchObject({ kind: 'result', call: { route: 'CACHED', model: FB1 } });
    expect(h.models).toHaveLength(3);
  });

  // The attack before a fix and the re-attack after it must face the SAME model, or "Risk reduced" could come from a
  // model swap instead of the user's fix.
  const run = (h: H, runId: string, pins: AdvBPins, breaker: AdvBBreaker = createAdvBBreaker(), fallbacks: string[] = [FB1, FB2]) => adversaryB(
    { sessionId: SESSION, image: image(), consent: mintConsent({ sha256: sha(IMG_BYTES), sessionId: SESSION }), model: MODEL, runId },
    { run: (r) => h.g.gate(r), notices: { subscribe: () => () => undefined }, fallbackModels: fallbacks, breaker, pins },
  );

  it('isReattack: r1 and no runId are the first attack; r2, r3… are re-attacks', () => {
    expect([isReattack(undefined), isReattack('r1'), isReattack('r2'), isReattack('r3')]).toEqual([false, false, true, true]);
  });

  it('a re-attack is pinned to the model that answered r1, even when the primary is healthy again', async () => {
    const h = await withFallbacks([overloaded, overloaded, { text: fixture('advB.v1.ok.json') }]);
    const pins = createAdvBPins();
    const r1 = await run(h, 'r1', pins);
    expect(r1).toMatchObject({ kind: 'result', result: { model: FB1 } });
    expect(pins.get(SESSION)).toBe(FB1);
    const r2 = await run(h, 'r2', pins);
    expect(r2).toMatchObject({ kind: 'result', result: { model: FB1 }, call: { model: FB1 } });
    expect(r2.call.failoverFrom).toBeUndefined();
    expect(h.models).toEqual([MODEL, MODEL, FB1, FB1]); // r2 went straight to FB1, the primary was not asked
    expect(h.ledger.entries().map((e) => e.model)).toEqual([MODEL, FB1, FB1]);
  });

  it('a re-attack never fails over: an overloaded r1 model is a Try again, not a different attacker', async () => {
    const h = await withFallbacks([{ text: fixture('advB.v1.ok.json') }, overloaded]);
    const pins = createAdvBPins();
    expect(await run(h, 'r1', pins)).toMatchObject({ kind: 'result', result: { model: MODEL } });
    const r2 = await run(h, 'r2', pins);
    expect(r2).toMatchObject({ kind: 'failed', code: 'CLOUD_SERVER', retry: true, call: { model: MODEL } });
    expect(r2.call.failoverFrom).toBeUndefined();
    expect(h.models).toEqual([MODEL, MODEL, MODEL]); // r1, then r2 and the gate's own retry: never FB1 or FB2
    expect(h.banners).toEqual(['network']); // the single attempt reports its failure (nothing deferred)
  });

  it('a re-attack ignores the breaker: a tripped r1 model is still the one asked', async () => {
    const h = await withFallbacks([{ text: fixture('advB.v1.ok.json') }]);
    const pins = createAdvBPins();
    const breaker = createAdvBBreaker();
    await run(h, 'r1', pins, breaker);
    for (let k = 0; k < BREAKER_THRESHOLD; k++) breaker.serverError(MODEL);
    expect(breaker.tripped(MODEL)).toBe(true);
    expect(await run(h, 'r2', pins, breaker)).toMatchObject({ kind: 'result', result: { model: MODEL } });
    expect(h.models).toEqual([MODEL, MODEL]);
  });

  it('a re-attack with no live r1 answer (e.g. a recorded replay) uses the primary alone, no failover', async () => {
    const h = await withFallbacks([overloaded]);
    const o = await run(h, 'r2', createAdvBPins());
    expect(o).toMatchObject({ kind: 'failed', code: 'CLOUD_SERVER', call: { model: MODEL } });
    expect(new Set(h.models)).toEqual(new Set([MODEL]));
  });

  it('a retried r1 may fail over and moves the pin; a cached r1 revisit keeps it', async () => {
    const h = await withFallbacks([overloaded, overloaded, { text: fixture('advB.v1.ok.json') }]);
    const pins = createAdvBPins();
    pins.set(SESSION, 'stale-model');
    const cache = createAdvBCache();
    const once = await adversaryB(
      { sessionId: SESSION, image: image(), consent: mintConsent({ sha256: sha(IMG_BYTES), sessionId: SESSION }), model: MODEL, runId: 'r1' },
      { run: (r) => h.g.gate(r), notices: { subscribe: () => () => undefined }, fallbackModels: [FB1], breaker: createAdvBBreaker(), pins, cache },
    );
    expect(once).toMatchObject({ kind: 'result', result: { model: FB1 } });
    expect(pins.get(SESSION)).toBe(FB1);
    pins.set(SESSION, 'stale-model');
    const again = await adversaryB(
      { sessionId: SESSION, image: image(), consent: mintConsent({ sha256: sha(IMG_BYTES), sessionId: SESSION }), model: MODEL, runId: 'r1' },
      { run: (r) => h.g.gate(r), notices: { subscribe: () => () => undefined }, fallbackModels: [FB1], breaker: createAdvBBreaker(), pins, cache },
    );
    expect(again).toMatchObject({ kind: 'result', call: { route: 'CACHED' } });
    expect(pins.get(SESSION)).toBe(FB1);
  });
});
