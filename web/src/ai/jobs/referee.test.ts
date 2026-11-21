// T-074: the on-device referee through the REAL Egress Gate (egressGate.testing createEgressGate) on fakes: the device
// model and availability() are fakes; the vault index, interlock, prompts, device queue and Ledger are real.
// No network, no AI call, no Gemini Nano.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

import type { EgressGate, GateModel, GateResponse, ModelSpec } from '../egressGate';
import { createEgressGate } from '../egressGate.testing';
import { setVaultScanner, tripwire } from '../tripwire';
import { createInterlock, type Interlock } from '../interlock';
import { createDeviceQueue } from '../deviceQueue';
import { createVaultScan } from '../vaultScan';
import { createMemoryLedger, type Ledger } from '../../core/ledger';
import { DEFAULT_CONFIG } from '../../firebase/rcParse';
import { checkCleanJpeg } from '../../tier0/exif';
import { segmentsText } from '../prompts';
import { ParseError } from '../parse';
import { refereeClaims, refereeVaultItems } from '../../core/referee';
import type { AdversaryResult, VaultItem } from '../../core/types';
import {
  MAX_CLAIMS, MAX_VAULT, NANO_REF_PROMPT, deviceFailedNote, parseRefereeText, referee, refereePrompt, refereeRequest, refereeText,
  shortReason,
} from './referee';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../../../../shared/prompts/fixtures/${name}`, import.meta.url)), 'utf8');

const PIN = (lat: number, lng: number): NonNullable<VaultItem['pin']> => ({ lat, lng, accuracyM: 0, capturedAt: 1, source: 'synthetic' });
// Synthetic vault (invariant 9): an open-ocean test pin and invented names.
const VAULT: VaultItem[] = [
  { id: 'vi_home', kind: 'home_pin', label: 'Home', aliases: [], pin: PIN(0.51234, -30.48765), createdAt: 1 },
  { id: 'vi_work', kind: 'work_pin', label: 'City General Hospital', aliases: ['CGH'], pin: PIN(0.53321, -30.44987), createdAt: 2 },
  { id: 'vi_kid', kind: 'child_name', label: 'Lucas', aliases: [], createdAt: 3 },
];
type Adv = Pick<AdversaryResult, 'inferences' | 'hypotheses'>;
const ADV: Adv = {
  inferences: [
    { id: 'i1', kind: 'workplace', value: 'hospital staff lanyard logo', confidence: 'high', clueIds: ['c2'] },
    { id: 'i2', kind: 'home_area', value: 'Harbourside neighbourhood', confidence: 'medium', clueIds: ['c1'] },
  ],
  hypotheses: [
    { id: 'h1', label: 'Harbourside, a coastal city district', level: 'neighbourhood', lat: 0.5, lng: -30.5, radiusKm: 1.2, confidence: 'medium', clueIds: ['c1'] },
  ],
};
const SESSION = 's-ref';

interface H { g: EgressGate; ledger: Ledger; il: Interlock; calls: number; replies: (string | Error | 'hang')[]; avail: string; nano: boolean; cloudy: boolean; specs: ModelSpec[]; prompts: string[] }
const live: H[] = [];

function deviceModel(h: H): GateModel {
  return {
    async generateContent(parts: Part[], opts?: { signal?: AbortSignal }) {
      h.calls++;
      h.prompts.push(parts.map((p) => (p as { text?: string }).text ?? '').join(''));
      const r = h.replies.length > 1 ? h.replies.shift()! : h.replies[0];
      if (r === 'hang') await new Promise((_, rej) => opts?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
      if (r instanceof Error) throw r;
      const res: GateResponse = { text: () => r as string, inferenceSource: h.cloudy ? 'in_cloud' : 'on_device', candidates: [{ finishReason: 'STOP' }] };
      return { response: res };
    },
    async generateContentStream() { throw new Error('not streamed'); },
  };
}

async function harness(replies: H['replies'], over: Partial<Pick<H, 'avail' | 'nano' | 'cloudy'>> = {}): Promise<H> {
  const vs = createVaultScan({ loadReal: async () => VAULT, register: setVaultScanner });
  await vs.init({ judge: false });
  const h = { replies, calls: 0, avail: 'available', nano: true, cloudy: false, specs: [], prompts: [], ...over } as unknown as H;
  h.ledger = createMemoryLedger();
  h.il = createInterlock(tripwire);
  h.g = createEgressGate({
    cfg: () => DEFAULT_CONFIG, vault: vs,
    availabilityNow: async () => h.avail as 'available',
    prefs: { nanoEnabled: () => h.nano, simulateNoNano: () => false },
    caps: { usedToday: () => 0, increment: () => 1 }, online: () => true, ensureAuth: async () => 'uid',
    interlock: h.il, tripwire, deviceQueue: createDeviceQueue(),
    buildModel: (spec) => { h.specs.push(spec); return deviceModel(h); }, ledger: h.ledger,
    status: { markTripwire: () => undefined, report: () => undefined, set: () => undefined }, notify: () => undefined,
    samples: async () => null,
    images: { checkClean: checkCleanJpeg, decode: async () => ({}), faces: async () => [], ocr: async () => [] },
    sha256Hex: async () => '0'.repeat(64), now: () => Date.now(), clock: () => performance.now(), sleep: async () => undefined, random: () => 0.5,
    authTimeoutMs: 30, vaultReadyTimeoutMs: 30, deviceGraceMs: 10,
  });
  live.push(h);
  return h;
}
afterEach(() => { for (const h of live.splice(0)) { h.g.dispose(); h.il.dispose(); } });

const run = (h: H, adv: Adv = ADV, vault: readonly VaultItem[] = VAULT) => referee({ sessionId: SESSION, adv, vault }, { run: (r) => h.g.gate(r) });
const promptOf = (adv: Adv = ADV, vault: readonly VaultItem[] = VAULT) => refereePrompt(refereeClaims(adv), refereeVaultItems(vault))!;

describe('refereePrompt (ARCH §10.9)', () => {
  it('aliases claims c1.. and vault items v1.., prompt kinds, label / aliases; a generic pin is skipped', () => {
    const p = promptOf();
    expect(p.claims).toEqual([
      { id: 'c1', kind: 'workplace', value: 'hospital staff lanyard logo' },
      { id: 'c2', kind: 'home_area', value: 'Harbourside neighbourhood' },
      { id: 'c3', kind: 'area', value: 'Harbourside, a coastal city district' },
    ]);
    expect(p.vault).toEqual([{ id: 'v1', kind: 'work', label: 'City General Hospital / CGH' }, { id: 'v2', kind: 'child_name', label: 'Lucas' }]);
    expect(p.claimOf.get('c3')?.id).toBe('h1');
    expect(p.itemOf.get('v1')?.id).toBe('vi_work');
  });
  it('caps at 12 claims and 20 items; null when either list is empty', () => {
    const many: Adv = { inferences: Array.from({ length: 15 }, (_, k) => ({ id: `i${k}`, kind: 'other' as const, value: `v${k}`, confidence: 'low' as const, clueIds: [] })), hypotheses: [] };
    const big = Array.from({ length: 25 }, (_, k): VaultItem => ({ id: `vi_${k}`, kind: 'person_name', label: `Name${k}`, aliases: [], createdAt: k }));
    const p = promptOf(many, big);
    expect([p.claims.length, p.vault.length]).toEqual([MAX_CLAIMS, MAX_VAULT]);
    expect(refereePrompt([], refereeVaultItems(VAULT))).toBeNull();
    expect(refereePrompt(refereeClaims(ADV), [])).toBeNull();
    expect(refereePrompt(refereeClaims(ADV), [{ id: 'vi_h', kind: 'home_pin', label: 'Home', aliases: ['my home'] }])).toBeNull();
  });
  it('AC-162: the rendered prompt holds no coordinate-like number (vault pins and hypothesis lat/lng)', () => {
    const text = segmentsText(refereeText(promptOf()));
    expect(text).not.toMatch(/-?\d{1,3}\.\d{2,}/);
    for (const v of [...VAULT.flatMap((x) => (x.pin ? [x.pin.lat, x.pin.lng] : [])), 0.5, -30.5]) expect(text).not.toContain(String(v));
    // raw items with coordinates passed straight in: still only id, kind and label
    const raw = refereePrompt(refereeClaims(ADV), VAULT as unknown as Parameters<typeof refereePrompt>[1])!;
    expect(segmentsText(refereeText(raw))).not.toMatch(/\d\.\d{3}/);
  });
  it('builds the S0 request the gate expects (deviceJson text, runtime enums, a deterministic path, no image)', () => {
    const p = promptOf();
    const r = refereeRequest({ sessionId: SESSION }, p, []);
    expect([r.job, r.payloadClass, r.promptId, r.images.length, typeof r.deterministic]).toEqual(['referee', 'S0', NANO_REF_PROMPT, 0, 'function']);
    const spec = r.modelSpec as { kind: string; io: string; schema: { properties: { matches: { items: { properties: Record<string, { enum?: string[] }> } } } } };
    expect([spec.kind, spec.io]).toEqual(['deviceJson', 'text']);
    expect(spec.schema.properties.matches.items.properties.claim_id.enum).toEqual(['c1', 'c2', 'c3']);
    expect(spec.schema.properties.matches.items.properties.vault_id.enum).toEqual(['v1', 'v2']);
  });
});

describe('parseRefereeText (AC-161)', () => {
  const p = () => promptOf();
  it('maps the ok fixture back to local ids, ON_DEVICE, with the claim clue ids', () => {
    const fx = JSON.parse(fixture('nanoRef.v1.ok.json')) as { matches: { vault_id: string }[] };
    fx.matches[0].vault_id = 'v1';
    expect(parseRefereeText(JSON.stringify(fx), p())).toEqual([
      { claimId: 'i1', vaultId: 'vi_work', strength: 'likely', reason: 'Hospital staff lanyard points to the hospital workplace', clueIds: ['c2'], route: 'ON_DEVICE' },
    ]);
  });
  it('drops unknown ids (the unknown_ids fixture keeps only its valid pair)', () => {
    const raw = fixture('nanoRef.v1.unknown_ids.json').replaceAll('"v2"', '"v1"');
    expect(parseRefereeText(raw, p()).map((m) => [m.claimId, m.vaultId, m.strength])).toEqual([['i1', 'vi_work', 'likely']]);
  });
  it('drops bad strengths, extra keys, wrong types, incompatible kinds; keeps the stronger duplicate; cuts long reasons', () => {
    const raw = JSON.stringify({ matches: [
      { claim_id: 'c1', vault_id: 'v1', strength: 'certain', reason: 'x' },
      { claim_id: 'c1', vault_id: 'v1', strength: 'exact', reason: 'x', note: 'extra' },
      { claim_id: 'c1', vault_id: 'v1', strength: 'likely', reason: 7 },
      'c1',
      { claim_id: 'c1', vault_id: 'v2', strength: 'exact', reason: 'workplace vs child name: not a §17.4 pair' },
      { claim_id: '__proto__', vault_id: 'v1', strength: 'exact', reason: 'x' },
      { claim_id: 'c1', vault_id: 'v1', strength: 'possible', reason: 'weak' },
      { claim_id: 'c1', vault_id: 'v1', strength: 'likely', reason: 'one two three four five six seven eight nine ten eleven twelve thirteen' },
      { claim_id: 'c1', vault_id: 'v1', strength: 'possible', reason: 'weaker again' },
    ] });
    const out = parseRefereeText(raw, p());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ claimId: 'i1', vaultId: 'vi_work', strength: 'likely', reason: 'one two three four five six seven eight nine ten eleven twelve' });
    expect(shortReason('  a   b ')).toBe('a b');
  });
  it('throws ParseError for non-JSON or a root that is not {matches: [...]}', () => {
    for (const raw of ['Sorry, I cannot help.', '[]', '{"matches":{}}', 'null', '{"hits":[]}']) expect(() => parseRefereeText(raw, p())).toThrow(ParseError);
    expect(parseRefereeText('{"matches":[]}', p())).toEqual([]);
  });
});

describe('referee through the gate', () => {
  it('Nano answers: ON_DEVICE, device matches unioned with the rules (+rules), one Ledger entry, no image', async () => {
    const h = await harness([JSON.stringify({ matches: [{ claim_id: 'c1', vault_id: 'v1', strength: 'exact', reason: 'Names the hospital' }] })]);
    const o = await run(h);
    expect(o.route).toBe('ON_DEVICE');
    expect(o.fallback).toBeNull();
    expect(o.matches.find((m) => m.vaultId === 'vi_work')).toMatchObject({ claimId: 'i1', strength: 'exact', route: 'ON_DEVICE', reason: 'Names the hospital' });
    expect(o.notes).toContain('+rules');
    expect(h.calls).toBe(1);
    expect(h.specs[0]).toMatchObject({ kind: 'deviceJson', io: 'text' });
    const e = h.ledger.entries();
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ route: 'ON_DEVICE', payloadClass: 'S0', bytesOut: 0, imagesOut: 0 });
    // the vault label reached the DEVICE prompt (S0), its coordinates did not
    expect(h.prompts[0]).toContain('City General Hospital');
    expect(h.prompts[0]).not.toContain('0.53321');
  });
  it('the rules strength is kept when stronger; a rules-only pair stays RULES_ONLY in the union', async () => {
    const h = await harness([JSON.stringify({ matches: [{ claim_id: 'c1', vault_id: 'v1', strength: 'possible', reason: 'maybe' }] })]);
    const o = await run(h);
    const m = o.matches.find((x) => x.claimId === 'i1' && x.vaultId === 'vi_work');
    expect(m).toMatchObject({ strength: 'likely', route: 'ON_DEVICE' }); // device found the pair, rules strength kept
  });
  it('no Nano: RULES_ONLY from the deterministic path, the model is never built (fail closed)', async () => {
    for (const avail of ['unavailable', 'no-api', 'downloadable']) {
      const h = await harness(['{"matches":[]}'], { avail });
      const o = await run(h);
      expect([o.route, o.fallback, h.calls, h.specs.length]).toEqual(['RULES_ONLY', 'no_device', 0, 0]);
      expect(o.matches.map((m) => [m.claimId, m.vaultId, m.strength, m.route])).toEqual([['i1', 'vi_work', 'likely', 'RULES_ONLY']]);
      expect(h.ledger.entries()[0]).toMatchObject({ route: 'RULES_ONLY', bytesOut: 0 });
    }
  });
  it('Nano off in Settings: RULES_ONLY, no model', async () => {
    const h = await harness(['{"matches":[]}'], { nano: false });
    const o = await run(h);
    expect([o.route, o.fallback, h.calls]).toEqual(['RULES_ONLY', 'no_device', 0]);
  });
  it('unreadable output twice: RULES_ONLY "fallback: invalid output" (AC-161), labelled device_failed', async () => {
    const h = await harness(['I think the hospital one.']);
    const o = await run(h);
    expect([o.route, o.fallback, h.calls]).toEqual(['RULES_ONLY', 'device_failed', 2]);
    expect(o.notes).toContain('fallback: invalid output');
    expect(o.matches.every((m) => m.route === 'RULES_ONLY')).toBe(true);
  });
  it('a hang past the referee timeout: RULES_ONLY, device_failed', async () => {
    const h = await harness(['hang']);
    const o = await referee({ sessionId: SESSION, adv: ADV, vault: VAULT, timeoutMs: 30 }, { run: (r) => h.g.gate(r) });
    expect([o.route, o.fallback]).toEqual(['RULES_ONLY', 'device_failed']);
    expect(o.notes.some(deviceFailedNote)).toBe(true);
  });
  it('a device answer that claims in_cloud is a BREACH: RULES_ONLY, never that answer', async () => {
    const h = await harness([JSON.stringify({ matches: [{ claim_id: 'c2', vault_id: 'v1', strength: 'exact', reason: 'x' }] })], { cloudy: true });
    const o = await run(h);
    expect(o.route).toBe('RULES_ONLY');
    expect(o.matches.some((m) => m.claimId === 'i2')).toBe(false);
    expect(h.ledger.entries()[0]).toMatchObject({ route: 'BLOCKED', blocked: { reason: 'TRIPWIRE' } });
  });
  it('an empty vault or no claims: no gate call at all (an empty enum is invalid), rules decide', async () => {
    const h = await harness(['{"matches":[]}']);
    const o = await run(h, ADV, [VAULT[0]]);
    expect([o.route, o.fallback, o.matches.length, h.ledger.entries().length]).toEqual(['RULES_ONLY', 'skipped', 0, 0]);
    const o2 = await run(h, { inferences: [], hypotheses: [] });
    expect([o2.fallback, h.ledger.entries().length]).toEqual(['skipped', 0]);
  });
  it('a thrown gate error never escapes: rules, device_failed', async () => {
    const o = await referee({ sessionId: SESSION, adv: ADV, vault: VAULT }, { run: async () => { throw new Error('boom'); } });
    expect([o.route, o.fallback, o.matches.length]).toEqual(['RULES_ONLY', 'device_failed', 1]);
  });
});
