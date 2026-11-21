// T-105 Judge Mode: the bundled placeholder samples, the fake vault, the S4 jobs through the REAL Egress Gate on fakes
// (egressGate.testing), the CACHED replay and autoplay. No network, no AI call, no Gemini Nano; the real vault's loader is
// a spy that must never run.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.mock('../../firebase/init', () => ({ ai: {}, ensureAuth: vi.fn(async () => 'uid'), authReady: Promise.resolve('uid') }));
vi.mock('../../firebase/remoteConfig', async () => {
  const m = await import('../../firebase/rcParse');
  return { cfg: () => m.DEFAULT_CONFIG, DEFAULT_CONFIG: m.DEFAULT_CONFIG };
});
vi.mock('../../tier0/faces', () => ({ detectFaces: vi.fn() }));
vi.mock('../../tier0/ocr', () => ({ ocrCanvas: vi.fn() }));
import type { EgressGate, GateModel, GateResponse, OutgoingImage } from '../../ai/egressGate';
import { parseSampleManifest } from '../../ai/egressGate';
import { createEgressGate } from '../../ai/egressGate.testing';
import { setVaultScanner, tripwire } from '../../ai/tripwire';
import { createInterlock, type Interlock } from '../../ai/interlock';
import { createDeviceQueue } from '../../ai/deviceQueue';
import { createVaultScan, termsOf } from '../../ai/vaultScan';
import { validateOutgoingJpeg } from '../../ai/jpegStrict';
import { parseAdvB } from '../../ai/parse';
import { adversaryBRequest, type AttackOutcome } from '../../ai/jobs/adversaryB';
import { nanoPrescreen } from '../../ai/jobs/prescreen';
import { referee } from '../../ai/jobs/referee';
import { createMemoryLedger, type Ledger } from '../../core/ledger';
import { DEFAULT_CONFIG } from '../../firebase/rcParse';
import { checkCleanJpeg } from '../../tier0/exif';
import type { AdversaryResult, VaultItem } from '../../core/types';
import { activateJudgeVault, claimJudge, JUDGE_IDS, makeJudgeVault, parseJudgeManifest, round3, sampleUrl } from '../../vault/judgeVault';
import {
  autoDelay, boxIntoCrop, coachFor, fixedRecordingApplies, liveUnavailable, nextAutoAction, recordedOutcome, type AutoView,
} from './judgeFlow';

const SAMPLES = fileURLToPath(new URL('../../../public/samples/', import.meta.url));
const file = (name: string) => readFileSync(`${SAMPLES}${name}`);
const MANIFEST_JSON: unknown = JSON.parse(file('manifest.json').toString('utf8'));
const MANIFEST = parseJudgeManifest(MANIFEST_JSON)!;
const bytes = (name: string): Uint8Array<ArrayBuffer> => { const b = file(name); const out = new Uint8Array(new ArrayBuffer(b.length)); out.set(b); return out; };
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

describe('the bundled placeholder samples (AC-244 pre-check; D-150)', () => {
  it('parse as the Judge manifest AND as the gate allowlist; every hash is the file on disk', () => {
    expect(MANIFEST.samples.map((s) => s.id)).toEqual(['judge-01', 'judge-02', 'judge-03']);
    expect(MANIFEST.placeholder).toBe(true);
    const allow = parseSampleManifest(MANIFEST_JSON)!;
    for (const s of MANIFEST.samples) {
      expect(s.placeholder).toBe(true);
      expect(sha(file(s.image))).toBe(s.imageSha256);
      expect(sha(file(s.nano768))).toBe(s.nano768Sha256);
      expect(allow.get(s.id)).toEqual({ imageSha256: s.imageSha256, nano768Sha256: s.nano768Sha256 });
    }
  });
  it('every image is a clean JPEG the gate itself would send (JFIF only: no EXIF/XMP/ICC, nothing after EOI)', async () => {
    for (const s of MANIFEST.samples) for (const f of [s.image, s.nano768]) {
      const b = bytes(f);
      expect(validateOutgoingJpeg(b)).toMatchObject({ ok: true });
      expect((await checkCleanJpeg(new Blob([b], { type: 'image/jpeg' }))).clean).toBe(true);
    }
  });
  it('the recorded pass-B files are valid advB.v1 with open-ocean coordinates only; the fixed one drops the removable clues', () => {
    for (const s of MANIFEST.samples) {
      const first = parseAdvB(JSON.parse(file(s.cachedAdvB).toString('utf8')));
      const fixed = parseAdvB(JSON.parse(file(s.cachedAdvBFixed).toString('utf8')));
      expect(first.repairs).toEqual([]);
      for (const h of [...first.hypotheses, ...fixed.hypotheses]) {
        expect(Math.abs(h.lat)).toBeLessThan(1); // the open South Atlantic test area: no land within 100 km
        expect(h.lng).toBeGreaterThan(-31);
        expect(h.lng).toBeLessThan(-30);
      }
      const gone = first.clues.filter((c) => !fixed.clues.some((f) => f.id === c.id));
      expect(gone.length).toBeGreaterThan(0);
      expect(gone.every((c) => c.removable)).toBe(true);
      expect(fixed.clues.every((c) => !c.removable)).toBe(true);
    }
  });
  it('rejects a manifest with a bad hash, a duplicate id or a path in a file name', () => {
    const base = JSON.parse(JSON.stringify(MANIFEST_JSON)) as { samples: Record<string, unknown>[] };
    const bad = (f: (m: typeof base) => void) => { const m = JSON.parse(JSON.stringify(base)) as typeof base; f(m); return parseJudgeManifest(m); };
    expect(bad((m) => { m.samples[0].imageSha256 = 'ABC'; })).toBeNull();
    expect(bad((m) => { m.samples[1].id = 'judge-01'; })).toBeNull();
    expect(bad((m) => { m.samples[0].image = '../secret.jpg'; })).toBeNull();
    expect(bad((m) => { m.samples[0].cachedAdvB = 'https://x.test/a.json'; })).toBeNull();
    expect(() => sampleUrl('../x.jpg')).toThrow();
    expect(sampleUrl('judge-01.jpg')).toBe('/samples/judge-01.jpg');
  });
});

describe('the fake vault (SCR-17; D-26, D-37)', () => {
  it('Home / City General Hospital / Lucas / SE 1234, pins rounded to 3 decimals, frozen; "Home" adds no text term', () => {
    const v = makeJudgeVault({ fakeVault: { homePin: { lat: 0.50049, lng: -30.50051 }, workPin: { lat: 0.53, lng: -30.46 } } });
    expect(v.map((x) => [x.kind, x.label])).toEqual([['home_pin', 'Home'], ['work_pin', 'City General Hospital'], ['child_name', 'Lucas'], ['plate', 'SE 1234']]);
    expect(v[0].pin).toMatchObject({ lat: 0.5, lng: -30.501, source: 'synthetic' });
    expect(round3(0.12345)).toBe(0.123);
    expect(Object.isFrozen(v) && Object.isFrozen(v[0])).toBe(true);
    expect(termsOf(v).map((t) => t.vaultId)).not.toContain(JUDGE_IDS.home);
    expect(makeJudgeVault(MANIFEST)).not.toBe(makeJudgeVault(MANIFEST)); // a new object per visit: Exit discards it
  });
  it('the module never touches the real vault store', () => {
    const src = readFileSync(fileURLToPath(new URL('../../vault/judgeVault.ts', import.meta.url)), 'utf8').replace(/\/\/[^\n]*/g, '');
    expect(src).not.toMatch(/vaultStore|indexedDB|localStorage|loadVault/);
  });
  it('claimJudge: a StrictMode remount never unseals the real vault; the last release restores it on the next tick', () => {
    const queue: (() => void)[] = [];
    const defer = (fn: () => void) => { queue.push(fn); };
    let mode = 'judge';
    const scan = { mode: () => mode, useReal: vi.fn(async () => { mode = 'real'; }) };
    const r1 = claimJudge(scan, defer);
    r1(); // StrictMode's simulated unmount…
    const r2 = claimJudge(scan, defer); // …and remount before the deferred check runs
    queue.splice(0).forEach((f) => f());
    expect(scan.useReal).not.toHaveBeenCalled();
    r2(); r2(); // Exit (a second release is a no-op)
    queue.splice(0).forEach((f) => f());
    expect(scan.useReal).toHaveBeenCalledTimes(1);
  });
  it('activateJudgeVault switches once per vault object', () => {
    let jv: readonly VaultItem[] | null = null;
    const scan = { judgeVault: () => jv, useJudge: vi.fn(async (v: readonly VaultItem[]) => { jv = v; }) };
    const v = makeJudgeVault(MANIFEST);
    activateJudgeVault(scan, v); activateJudgeVault(scan, v);
    expect(scan.useJudge).toHaveBeenCalledTimes(1);
  });
});

// ---------- the S4 jobs through the real gate ----------
interface H { g: EgressGate; ledger: Ledger; il: Interlock; loadReal: ReturnType<typeof vi.fn>; replies: Record<string, string>; jv: readonly VaultItem[] }
const live: H[] = [];
function cloudModel(h: H, job: string): GateModel {
  return {
    async generateContent() {
      const res: GateResponse = { text: () => h.replies[job] ?? '{}', inferenceSource: 'in_cloud', candidates: [{ finishReason: 'STOP' }] };
      return { response: res };
    },
    async generateContentStream() { throw new Error('not streamed'); },
  };
}
async function judgeHarness(): Promise<H> {
  const loadReal = vi.fn(async (): Promise<VaultItem[]> => { throw new Error('the real vault must never be read in Judge Mode'); });
  const vs = createVaultScan({ loadReal, register: setVaultScanner });
  await vs.init({ judge: true });
  const jv = makeJudgeVault(MANIFEST);
  await vs.useJudge(jv);
  const h = { loadReal, replies: {}, jv } as unknown as H;
  h.ledger = createMemoryLedger();
  h.il = createInterlock(tripwire);
  h.g = createEgressGate({
    cfg: () => DEFAULT_CONFIG, vault: vs,
    availabilityNow: async () => 'unavailable', // a judge laptop without Nano: S4 runs IN_CLOUD
    prefs: { nanoEnabled: () => true, simulateNoNano: () => false },
    caps: { usedToday: () => 0, increment: () => 1 }, online: () => true, ensureAuth: async () => 'uid',
    interlock: h.il, tripwire, deviceQueue: createDeviceQueue(),
    buildModel: (_spec, _mode, _cfg, job) => cloudModel(h, job), ledger: h.ledger,
    status: { markTripwire: () => undefined, report: () => undefined, set: () => undefined }, notify: () => undefined,
    samples: async () => parseSampleManifest(MANIFEST_JSON),
    images: { checkClean: checkCleanJpeg, decode: async () => ({}), faces: async () => [], ocr: async () => [] },
    sha256Hex: async (b) => sha(b), now: () => Date.now(), clock: () => performance.now(), sleep: async () => undefined, random: () => 0.5,
    authTimeoutMs: 30, vaultReadyTimeoutMs: 30, deviceGraceMs: 10,
  });
  live.push(h);
  return h;
}
afterEach(() => { for (const h of live.splice(0)) { h.g.dispose(); h.il.dispose(); } });

const outImg = (b: Uint8Array<ArrayBuffer>): OutgoingImage => ({
  jpeg: new Blob([b], { type: 'image/jpeg' }), base64: Buffer.from(b).toString('base64'), sha256: sha(b), mime: 'image/jpeg',
  frame: { id: 'nano768', width: 768, height: 576, cropInMaster: { x: 0, y: 0, w: 1600, h: 1200 } },
});
const ADV: Pick<AdversaryResult, 'inferences' | 'hypotheses'> = {
  inferences: [{ id: 'i1', kind: 'workplace', value: 'A hospital (staff lanyard)', confidence: 'medium', clueIds: ['c2'] }],
  hypotheses: [],
};

describe('S4 in Judge Mode (D-151; AC-023, AC-048, AC-242)', () => {
  it('the referee runs as S4 with the fake vault and comes back IN_CLOUD, "Lucas" in its prompt allowed; the real vault is never read', async () => {
    const h = await judgeHarness();
    h.replies.referee = JSON.stringify({ matches: [{ claim_id: 'c1', vault_id: 'v1', strength: 'likely', reason: 'hospital' }] });
    const r = await referee({ sessionId: 's', adv: ADV, vault: h.jv, judge: { sampleId: 'judge-01', vault: h.jv } }, { run: (q) => h.g.gate(q) });
    expect(r.route).toBe('IN_CLOUD');
    expect(r.matches.some((m) => m.vaultId === JUDGE_IDS.work && m.strength === 'likely' && m.route === 'IN_CLOUD')).toBe(true);
    const e = h.ledger.entries().at(-1)!;
    expect([e.payloadClass, e.route, e.judge]).toEqual(['S4', 'IN_CLOUD', true]);
    expect(h.loadReal).not.toHaveBeenCalled();
  });
  it('a copy of the fake vault (not the object itself) fails the S4 proof: BLOCKED NOT_SYNTHETIC, the rules decide', async () => {
    const h = await judgeHarness();
    const copy = h.jv.map((x) => ({ ...x }));
    const r = await referee({ sessionId: 's', adv: ADV, vault: copy, judge: { sampleId: 'judge-01', vault: copy } }, { run: (q) => h.g.gate(q) });
    expect(r.route).toBe('RULES_ONLY');
    expect(h.ledger.entries().at(-1)).toMatchObject({ route: 'BLOCKED', blocked: { reason: 'NOT_SYNTHETIC' } });
  });
  it('the pre-screen sends the bundled nano768 file as S4 (IN_CLOUD); any other image is BLOCKED NOT_SYNTHETIC', async () => {
    const h = await judgeHarness();
    h.replies.preScreen = JSON.stringify({ clues: [{ type: 'street_sign', text: '', region: 'top_right', severity: 'medium' }] });
    const s = MANIFEST.samples[0];
    const ok = await nanoPrescreen({ sessionId: 's', image: outImg(bytes(s.nano768)), judge: { sampleId: s.id, vault: h.jv } }, { run: (q) => h.g.gate(q) });
    expect([ok.route, ok.clues.length]).toEqual(['IN_CLOUD', 1]);
    const other = await nanoPrescreen({ sessionId: 's', image: outImg(bytes(MANIFEST.samples[1].nano768)), judge: { sampleId: s.id, vault: h.jv } }, { run: (q) => h.g.gate(q) });
    expect(other.route).toBe('RULES_ONLY');
    expect(h.ledger.entries().at(-1)).toMatchObject({ route: 'BLOCKED', blocked: { reason: 'NOT_SYNTHETIC' } });
    expect(h.loadReal).not.toHaveBeenCalled();
  });
  it('pass B in Judge Mode stays S3 and carries the sample id (the gate refuses an untagged request while the fake vault is active)', () => {
    const img = outImg(bytes(MANIFEST.samples[0].image));
    const r = adversaryBRequest({ sessionId: 's', image: img, consent: { sha256: img.sha256, sessionId: 's', issuedAt: 0 } as never, model: 'm', judge: { sampleId: 'judge-01' } });
    expect([r.payloadClass, r.judge]).toEqual(['S3', { sampleId: 'judge-01' }]);
    expect(adversaryBRequest({ sessionId: 's', image: img, consent: {} as never, model: 'm' }).judge).toBeNull();
  });
});

// ---------- CACHED replay and autoplay ----------
const call = { route: 'BLOCKED' as const, source: null, latencyMs: 0, ledgerId: 'l', model: 'm' };
describe('the CACHED replay (AC-243, AC-246)', () => {
  it('replaces only unavailability (offline, kill switch, cap, auth, 400, 429, network), never a refusal or a bad answer', () => {
    const notSent = (reason: string): AttackOutcome => ({ kind: 'notSent', reason: reason as never, copyId: 'copy.cap.offline', retry: false, call });
    const failed = (code: string, state: 'error' | 'truncated' | 'unreadable' = 'error'): AttackOutcome => ({ kind: 'failed', state, code: code as never, copyId: 'copy.err.cloudFailed', retry: false, call });
    for (const r of ['OFFLINE', 'KILL_SWITCH', 'DAILY_CAP']) expect(liveUnavailable(notSent(r))).toBe(true);
    for (const r of ['FACE', 'VAULT_TEXT_IN_IMAGE', 'NO_CONSENT', 'TRIPWIRE']) expect(liveUnavailable(notSent(r))).toBe(false);
    for (const c of ['CLOUD_QUOTA', 'CLOUD_AUTH', 'CLOUD_BAD_REQUEST', 'CLOUD_NETWORK']) expect(liveUnavailable(failed(c))).toBe(true);
    for (const c of ['CLOUD_SERVER', 'TIMEOUT', 'INTERNAL']) expect(liveUnavailable(failed(c))).toBe(false);
    expect(liveUnavailable(failed('PARSE_FAILED', 'unreadable'))).toBe(false);
    expect(liveUnavailable({ kind: 'refused', why: 'declined', call })).toBe(false);
  });
  it('a recording becomes a CACHED result badged with its date and model, validated like a live pass B', () => {
    const s = MANIFEST.samples[0];
    const json: unknown = JSON.parse(file(s.cachedAdvB).toString('utf8'));
    const frame = { id: 'cloud' as const, width: 1536, height: 1152, cropInMaster: { x: 0, y: 0, w: 1600, h: 1200 } };
    const o = recordedOutcome(json, { runId: 'r1', sentImageSha256: 'a'.repeat(64), sentFrame: frame, recordedAt: s.recordedAt, model: s.model, echo: () => [] }, 1600, 1200);
    expect(o.kind).toBe('result');
    if (o.kind !== 'result') return;
    expect([o.call.route, o.result.route, o.recorded]).toEqual(['CACHED', 'CACHED', { recordedAt: s.recordedAt, model: s.model }]);
    expect(o.result.clues.find((c) => c.id === 'c2')?.box2d).toEqual([700, 300, 860, 470]);
    expect(() => recordedOutcome({ audit_status: 'nope' }, { runId: 'r1', sentImageSha256: '', sentFrame: frame, recordedAt: '', model: '', echo: () => [] }, 1600, 1200)).toThrow();
  });
  it('the "after fix" recording stands only when the masks sent hide every clue it dropped; a crop counts, boxes follow the crop', () => {
    const s = MANIFEST.samples[0];
    const first = parseAdvB(JSON.parse(file(s.cachedAdvB).toString('utf8')));
    const fixed = parseAdvB(JSON.parse(file(s.cachedAdvBFixed).toString('utf8')));
    const px = (b: number[]) => ({ x: (b[1] / 1000) * 1600 - 5, y: (b[0] / 1000) * 1200 - 5, w: ((b[3] - b[1]) / 1000) * 1600 + 10, h: ((b[2] - b[0]) / 1000) * 1200 + 10 });
    const masks = first.clues.filter((c) => c.removable).map((c) => px(c.box2d));
    expect(fixedRecordingApplies(first, fixed, masks, null, 1600, 1200)).toBe(true);
    expect(fixedRecordingApplies(first, fixed, masks.slice(1), null, 1600, 1200)).toBe(false);
    // the street sign (top right) cut away by a crop instead of a mask
    expect(fixedRecordingApplies(first, fixed, masks.slice(1), { x: 0, y: 300, w: 1600, h: 900 }, 1600, 1200)).toBe(true);
    expect(boxIntoCrop([500, 0, 1000, 500], { x: 0, y: 600, w: 1600, h: 600 }, 1600, 1200)).toEqual([0, 0, 1000, 500]);
  });
});

describe('autoplay (SCR-17)', () => {
  const v = (over: Partial<AutoView>): AutoView => ({
    current: 'import', importReady: false, canSend: false, sendReady: false, cloudOff: false, cachedFallback: true, attackDone: false,
    fixAvailable: false, planHasFix: false, reattackPending: false, reSendReady: false, afterSettled: false, ...over,
  });
  it('walks pre-screen → consent (3 s) → attack → verdict → fix → re-attack, and stops at the re-attack verdict', () => {
    expect(nextAutoAction(v({ current: 'prescreen', canSend: true }))).toBe('toSend');
    expect(nextAutoAction(v({ current: 'send', sendReady: true }))).toBe('send');
    expect(autoDelay('send')).toBe(3000);
    expect(nextAutoAction(v({ current: 'attack', attackDone: true }))).toBe('toVerdict');
    expect(nextAutoAction(v({ current: 'verdict', fixAvailable: true, planHasFix: true }))).toBe('toFix');
    expect(nextAutoAction(v({ current: 'fix', planHasFix: true }))).toBe('applyFix');
    expect(nextAutoAction(v({ current: 'fix', planHasFix: true, reattackPending: true }))).toBe('toReattack');
    expect(nextAutoAction(v({ current: 'reattack', reSendReady: true }))).toBe('resend');
    expect(nextAutoAction(v({ current: 'reattack', reSendReady: true, afterSettled: true }))).toBeNull();
  });
  it('waits on a failure or nothing to fix; with the cloud off it uses the recording only when RC allows it', () => {
    expect(nextAutoAction(v({ current: 'prescreen', canSend: false }))).toBeNull();
    expect(nextAutoAction(v({ current: 'verdict', fixAvailable: true, planHasFix: false }))).toBeNull();
    expect(nextAutoAction(v({ current: 'send', sendReady: true, cloudOff: true }))).toBe('useRecorded');
    expect(nextAutoAction(v({ current: 'send', sendReady: true, cloudOff: true, cachedFallback: false }))).toBeNull();
    expect(nextAutoAction(v({ current: 'reattack', reSendReady: true, cloudOff: true }))).toBe('useRecordedAgain');
  });
  it('has a coach mark for every step after the import', () => {
    for (const s of ['prescreen', 'send', 'attack', 'verdict', 'fix', 'reattack'] as const) expect(coachFor(s).length).toBeGreaterThan(0);
  });
});
