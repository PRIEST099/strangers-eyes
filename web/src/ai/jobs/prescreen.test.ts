// T-066: the Nano pre-screen. Pure parts (AC-114 validation, ARCH §11.4 localisation, the Tier-0 merge) and the job
// through the REAL Egress Gate on fakes (device model and availability() faked; interlock, device queue, prompts and
// Ledger real). No network, no AI call, no Gemini Nano.
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

import type { EgressGate, GateModel, GateResponse, ModelSpec, OutgoingImage } from '../egressGate';
import { createEgressGate } from '../egressGate.testing';
import { setVaultScanner, tripwire } from '../tripwire';
import { createInterlock, type Interlock } from '../interlock';
import { createDeviceQueue } from '../deviceQueue';
import { createVaultScan } from '../vaultScan';
import { createMemoryLedger, type Ledger } from '../../core/ledger';
import { DEFAULT_CONFIG } from '../../firebase/rcParse';
import { checkCleanJpeg } from '../../tier0/exif';
import { ParseError } from '../parse';
import { gridCellRect } from '../../core/boxes';
import { applyPreTick } from '../../core/pretick';
import type { Clue, OcrWord } from '../../core/types';
import type { Tier0Finding } from '../../tier0/tier0';
import { localiseNanoClues, mergeNanoFindings, parseNanoPreText } from './prescreenClues';
import { NANO_PRE_PROMPT, nanoPrescreen, prescreenRequest } from './prescreen';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../../../../shared/prompts/fixtures/${name}`, import.meta.url)), 'utf8');

describe('parseNanoPreText (AC-114)', () => {
  it('accepts the ok fixture', () => {
    expect(parseNanoPreText(fixture('nanoPre.v1.ok.json'))).toEqual([
      { type: 'uniform_or_lanyard', text: 'HOSPITAL STAFF', region: 'bottom_center', severity: 'high' },
      { type: 'transit_sign', text: '38', region: 'top_right', severity: 'high' },
      { type: 'storefront_text', text: 'CAFE DU COIN', region: 'top_left', severity: 'medium' },
    ]);
  });
  it('drops items with a bad type (incl. non-pre-screen types), region, severity, extra keys or wrong types; at most 8', () => {
    const ok = { type: 'plate', text: 'AB12 CDE', region: 'middle_left', severity: 'high' };
    const raw = JSON.stringify({ clues: [
      { ...ok, type: 'architecture' }, { ...ok, type: 'face' }, { ...ok, region: 'center' }, { ...ok, severity: 'critical' },
      { ...ok, extra: 1 }, { ...ok, text: 5 }, 'plate', null,
      ...Array.from({ length: 10 }, () => ok),
    ] });
    const out = parseNanoPreText(raw);
    expect(out).toHaveLength(8);
    expect(out.every((c) => c.type === 'plate' && c.region === 'middle_left')).toBe(true);
  });
  it('throws ParseError for prose or a root without a clues array', () => {
    for (const raw of ['I see a street.', '[]', '{"clues":{}}', '{"items":[]}', 'null']) expect(() => parseNanoPreText(raw)).toThrow(ParseError);
    expect(parseNanoPreText('{"clues":[]}')).toEqual([]);
  });
});

const W = 900;
const H = 600;
const word = (text: string, x: number, y: number, w = 80, h = 30): OcrWord => ({ text, conf: 90, line: 0, box: { x, y, w, h } });

describe('localiseNanoClues (ARCH §11.4)', () => {
  it('boxes a clue by matching OCR words inside its cell (exact); otherwise the grid cell (approximate)', () => {
    const words = [word('HOSPITAL', 320, 500), word('STAFF', 410, 500), word('HOSPITAL', 20, 20) /* another cell */];
    const [a, b, c] = localiseNanoClues([
      { type: 'uniform_or_lanyard', text: 'HOSPITAL STAFF', region: 'bottom_center', severity: 'high' },
      { type: 'transit_sign', text: '38', region: 'top_right', severity: 'high' },
      { type: 'landmark', text: '', region: 'middle_center', severity: 'medium' },
    ], words, W, H);
    expect(a.clue).toMatchObject({ id: 'np-1', source: 'nano_prescreen', readers: 'nano', boxPrecision: 'exact', box: { x: 320, y: 500, w: 170, h: 30 } });
    expect(b.clue).toMatchObject({ boxPrecision: 'grid_cell', box: gridCellRect('top_right', W, H), localText: '38' });
    expect(c.clue).toMatchObject({ boxPrecision: 'grid_cell', box: gridCellRect('middle_center', W, H) });
    expect(c.clue.localText).toBeUndefined();
    // pre-ticks: a high grid-cell clue is flagged dashed in Standard, never silently masked
    expect(applyPreTick(b.clue, 'standard')).toMatchObject({ masked: false });
  });
});

describe('mergeNanoFindings (AC-111 "Both")', () => {
  const t0 = (over: Partial<Clue>): Tier0Finding => ({ clue: {
    id: 't0-1', source: 'tier0_ocr_vault', readers: 'tier0', type: 'name_text', box: { x: 300, y: 495, w: 200, h: 40 }, boxPrecision: 'exact',
    severity: 'high', removable: true, vaultHits: ['vi_kid'], masked: true, userUnmasked: false, maskReason: 'vault_text', ...over,
  } });
  it('an exact Nano clue over a Tier-0 finding marks it both; other Nano clues are added; Tier-0 input untouched', () => {
    const tier0 = [t0({})];
    const nano = localiseNanoClues([
      { type: 'name_text', text: 'HOSPITAL STAFF', region: 'bottom_center', severity: 'high' },
      { type: 'street_sign', text: '', region: 'top_left', severity: 'medium' },
    ], [word('HOSPITAL', 320, 500), word('STAFF', 410, 500)], W, H);
    const out = mergeNanoFindings(tier0, nano);
    expect(out.map((f) => [f.clue.id, f.clue.readers])).toEqual([['t0-1', 'both'], ['np-2', 'nano']]);
    expect(tier0[0].clue.readers).toBe('tier0');
  });
  it('never merges into a face, and grid-cell clues are always their own row', () => {
    const face = t0({ type: 'face', source: 'tier0_face', box: { x: 0, y: 0, w: W, h: H } });
    const nano = localiseNanoClues([{ type: 'name_text', text: 'X', region: 'top_left', severity: 'high' }], [word('X', 10, 10)], W, H);
    expect(mergeNanoFindings([face], nano).map((f) => f.clue.readers)).toEqual(['tier0', 'nano']);
  });
});

// ---------- through the gate ----------
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const seg = (m: number, p: number[]) => [0xff, m, ((p.length + 2) >> 8) & 0xff, (p.length + 2) & 0xff, ...p];
function jpeg(): Uint8Array<ArrayBuffer> {
  const parts = [0xff, 0xd8, ...seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), ...seg(0xdb, [0, ...new Array(64).fill(1)]),
    ...seg(0xc0, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]), ...seg(0xc4, [0, ...new Array(16).fill(0)]), ...seg(0xda, [1, 1, 0, 0, 63, 0]),
    0x42, 0x12, 0xff, 0x00, 0x42, 0xff, 0xd9];
  const b = new Uint8Array(new ArrayBuffer(parts.length));
  b.set(parts);
  return b;
}
const BYTES = jpeg();
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const image = (): OutgoingImage => ({
  jpeg: new Blob([BYTES], { type: 'image/jpeg' }), base64: Buffer.from(BYTES).toString('base64'), sha256: sha(BYTES), mime: 'image/jpeg',
  frame: { id: 'nano768', width: 16, height: 16, cropInMaster: { x: 0, y: 0, w: 16, h: 16 } },
});

interface H { g: EgressGate; ledger: Ledger; il: Interlock; calls: number; reply: string; avail: string; specs: ModelSpec[]; parts: Part[][] }
const live: H[] = [];
async function harness(reply: string, avail = 'available'): Promise<H> {
  const vs = createVaultScan({ loadReal: async () => [], register: setVaultScanner });
  await vs.init({ judge: false });
  const h = { reply, avail, calls: 0, specs: [], parts: [] } as unknown as H;
  const model: GateModel = {
    async generateContent(parts: Part[]) {
      h.calls++;
      h.parts.push(parts);
      const res: GateResponse = { text: () => h.reply, inferenceSource: 'on_device', candidates: [{ finishReason: 'STOP' }] };
      return { response: res };
    },
    async generateContentStream() { throw new Error('not streamed'); },
  };
  h.ledger = createMemoryLedger();
  h.il = createInterlock(tripwire);
  h.g = createEgressGate({
    cfg: () => DEFAULT_CONFIG, vault: vs, availabilityNow: async () => h.avail as 'available',
    prefs: { nanoEnabled: () => true, simulateNoNano: () => false },
    caps: { usedToday: () => 0, increment: () => 1 }, online: () => true, ensureAuth: async () => 'uid',
    interlock: h.il, tripwire, deviceQueue: createDeviceQueue(), buildModel: (spec) => { h.specs.push(spec); return model; }, ledger: h.ledger,
    status: { markTripwire: () => undefined, report: () => undefined, set: () => undefined }, notify: () => undefined, samples: async () => null,
    images: { checkClean: checkCleanJpeg, decode: async () => ({}), faces: async () => [], ocr: async () => [] },
    sha256Hex: async (b) => sha(b), now: () => Date.now(), clock: () => performance.now(), sleep: async () => undefined, random: () => 0.5,
    authTimeoutMs: 30, vaultReadyTimeoutMs: 30, deviceGraceMs: 10,
  });
  live.push(h);
  return h;
}
afterEach(() => { for (const h of live.splice(0)) { h.g.dispose(); h.il.dispose(); } });
const go = (h: H) => nanoPrescreen({ sessionId: 's-pre', image: image() }, { run: (r) => h.g.gate(r) });

describe('nanoPrescreen through the gate', () => {
  it('builds the S1 request (deviceJson image, nanoPre.v1, one image, a deterministic path)', () => {
    const r = prescreenRequest({ sessionId: 's', image: image() });
    expect([r.job, r.payloadClass, r.promptId, r.images.length, typeof r.deterministic]).toEqual(['preScreen', 'S1', NANO_PRE_PROMPT, 1, 'function']);
    expect(r.modelSpec).toMatchObject({ kind: 'deviceJson', io: 'image' });
  });
  it('Nano answers: ON_DEVICE with validated clues, the image goes to the device model only, one Ledger entry', async () => {
    const h = await harness(fixture('nanoPre.v1.ok.json'));
    const o = await go(h);
    expect([o.route, o.fallback, o.clues.length, h.calls]).toEqual(['ON_DEVICE', null, 3, 1]);
    expect(h.parts[0].some((p) => 'inlineData' in p)).toBe(true);
    expect(h.ledger.entries()[0]).toMatchObject({ route: 'ON_DEVICE', payloadClass: 'S1', bytesOut: 0, imagesOut: 0 });
  });
  it('no Nano: RULES_ONLY, no clues, the model is never built (fail closed)', async () => {
    const h = await harness('{"clues":[]}', 'unavailable');
    const o = await go(h);
    expect([o.route, o.fallback, o.clues.length, h.calls, h.specs.length]).toEqual(['RULES_ONLY', 'no_device', 0, 0, 0]);
  });
  it('unreadable output: RULES_ONLY "fallback: invalid output", device_failed (the Tier-0 results stand)', async () => {
    const h = await harness('There is a street sign.');
    const o = await go(h);
    expect([o.route, o.fallback, o.clues.length]).toEqual(['RULES_ONLY', 'device_failed', 0]);
    expect(o.notes).toContain('fallback: invalid output');
  });
  it('a thrown error never escapes', async () => {
    const o = await nanoPrescreen({ sessionId: 's', image: image() }, { run: async () => { throw new Error('x'); } });
    expect([o.route, o.fallback]).toEqual(['RULES_ONLY', 'device_failed']);
  });
});
