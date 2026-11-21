import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { initializeApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, ThinkingLevel, type GenerativeModel, type Part } from 'firebase/ai';
import vectors from '@vectors/fuzzy.json';
import okFixture from '@prompts/fixtures/advB.v1.ok.json';
import {
  canaryLines, coordinatesNearPins, createVaultScan, echoFreeText, echoScan, isGenericPinLabel, pinsOf, scanText, stripStatic,
  TEMPLATE_CANARY, termsOf, tripwireScanner, vaultScan, VAULT_UNAVAILABLE, type PinRef, type VaultScanDeps,
} from './vaultScan';
import { installTripwire, setVaultScanner, tripwire, type VaultScanner } from './tripwire';
import { CLOUD_TEXT_PROMPTS, MANIFEST, nonContentStrings, render, segmentsText, staticSegments, systemText } from './prompts';
import { ADV_B_SCHEMA } from './schemas';
import { parseAdvB } from './parse';
import { addItem, burnVault } from '../vault/vaultStore';
import { gpsWarningFor, pinsWhenReady } from '../tier0/gpsWarning';
import type { Pin, VaultItem, VaultKind } from '../core/types';

// ---------- helpers ----------
const PIN: Pin = { lat: 0.5, lng: -30.5, accuracyM: 0, capturedAt: 1, source: 'synthetic' };   // open Atlantic: synthetic
let seq = 0;
function item(kind: VaultKind, label: string, aliases: string[] = [], pin?: Partial<Pin>): VaultItem {
  return { id: `v-${++seq}-${kind}`, kind, label, aliases, createdAt: 1, ...(pin ? { pin: { ...PIN, ...pin } } : {}) };
}
const ids = (xs: readonly { vaultId: string }[]) => xs.map((x) => x.vaultId);

// ---------- shared/testvectors/fuzzy.json: termsOf and coordinatesNearPins ----------
interface VItem { id: string; kind: VaultKind; label: string; aliases: string[]; pin?: { lat: number; lng: number } }
type VCase =
  | { fn: 'termsOf'; name: string; vault: VItem[]; expect: [string, string, boolean][] }
  | { fn: 'coords'; name: string; text: string; pins: PinRef[]; expect: string | null }
  | { fn: 'match' | 'normalize' | 'alnum' | 'tokens' | 'tokenSim' | 'clampThreshold'; name: string };
const V = vectors as unknown as { cases: VCase[] };
const casesOf = <F extends VCase['fn']>(fn: F) => V.cases.filter((c): c is Extract<VCase, { fn: F }> => c.fn === fn);
const toItem = ({ pin, ...rest }: VItem): VaultItem => ({ ...rest, createdAt: 1, ...(pin ? { pin: { ...PIN, ...pin } } : {}) });

describe('fuzzy.json: termsOf (D-36, AC-088) and coordinatesNearPins (PIN_IN_PROMPT)', () => {
  for (const c of casesOf('termsOf')) {
    it(`termsOf: ${c.name}`, () => {
      expect(termsOf(c.vault.map(toItem)).map((t) => [t.vaultId, t.text, t.digit])).toEqual(c.expect);
    });
  }
  for (const c of casesOf('coords')) {
    it(`coordinatesNearPins: ${c.name}`, () => {
      expect(coordinatesNearPins(c.text, c.pins)?.vaultId ?? null).toBe(c.expect);
    });
  }
});

describe('term index', () => {
  it('AC-088: a prompt containing "home" is not caught by a pin labelled "Home"; a named pin is', () => {
    const home = item('home_pin', 'Home', [], {});
    const depot = item('work_pin', 'Riverside Depot', ['RD Depot'], { lat: 0.6 });
    const terms = termsOf([home, depot]);
    expect(scanText('a photo taken at home, near the river', terms)).toBeNull();
    expect(scanText('staff of the Riverside Depot', terms)?.vaultId).toBe(depot.id);
    expect(['', '  ', 'Home', 'my home', 'WORK', 'Office', 'school', 'Flat'].every(isGenericPinLabel)).toBe(true);
    expect(isGenericPinLabel('Gran’s house')).toBe(false);
  });
  it('AC-088: a generic label or alias never becomes a term, whatever the kind; the real names still do (T-054 review round 4)', () => {
    const gran = item('place_pin', "Grandma's", ['Home', 'Rosehill Cottage'], {});
    const clinic = item('employer', 'Wrenfield Clinic', ['Work', 'OFFICE', '', 'Wrenfield']);
    const area = item('area_name', 'Lindqvist Heights', ['my home', 'Place']);
    const terms = termsOf([gran, clinic, area]);
    expect(terms.map((t) => [t.vaultId, t.text])).toEqual([
      [gran.id, "Grandma's"], [gran.id, 'Rosehill Cottage'],
      [clinic.id, 'Wrenfield Clinic'], [clinic.id, 'Wrenfield'],
      [area.id, 'Lindqvist Heights'],
    ]);
    for (const text of ['a photo taken at home', 'back to work after lunch', 'the office is closed', 'my home office', 'a nice place']) {
      expect(scanText(text, terms), text).toBeNull();
      expect(tripwireScanner(terms, [])([text]), text).toBeNull();
    }
    expect(scanText("lunch at Grandma's", terms)?.vaultId).toBe(gran.id);
    expect(scanText('lunch at Grandma', terms)?.vaultId).toBe(gran.id);
    expect(scanText('a Wrenfield badge', terms)?.vaultId).toBe(clinic.id);
    expect(scanText('Lindqvist Heights at dusk', terms)?.vaultId).toBe(area.id);
  });

  it('pinsOf keeps every pin (generic labels included) and nothing else', () => {
    const home = item('home_pin', 'Home', [], {});
    const lucas = item('child_name', 'Lucas');
    expect(pinsOf([home, lucas])).toEqual([{ vaultId: home.id, kind: 'home_pin', lat: 0.5, lng: -30.5 }]);
  });
  it('scanText reports the matched vault string for the local toast only, with id and kind', () => {
    const lucas = item('child_name', 'Lucas');
    expect(scanText('where is LUCA5 now', termsOf([lucas]))).toEqual({ vaultId: lucas.id, kind: 'child_name', text: 'Lucas', matched: 'LUCA5' });
    expect(scanText('tag: L U C A S.', termsOf([lucas]))?.matched).toBe('L U C A S.');
  });
});

// ---------- tripwire scanner order (ARCH §8.4, D-65) ----------
describe('tripwireScanner: exact skip, canary, strip, scan', () => {
  const lucas = item('child_name', 'Lucas');
  const medium = item('other_text', 'Medium');
  const road = item('street_name', 'Landmark Road');
  const high = item('other_text', 'High');
  const scan = tripwireScanner(termsOf([lucas, medium, road, high]), []);

  it('1. skips a string value only when it EXACTLY equals a non-content string', () => {
    expect(nonContentStrings().has('MEDIUM')).toBe(true);
    expect(nonContentStrings().has('medium')).toBe(true);
    expect(nonContentStrings().has('landmark')).toBe(true);
    expect(scan(['MEDIUM', 'medium', 'landmark', 'high', 'user', 'application/json'])).toBeNull();
    expect(scan(['medium rare'])).toEqual({ vaultId: medium.id });   // never by substring
    expect(scan(['the Landmark Road bus stop'])).toEqual({ vaultId: road.id });
  });
  it('2. a device-only prompt in a cloud body is a canary hit', () => {
    const lines = canaryLines();
    expect(lines.length).toBeGreaterThan(5);
    const cloudStatic = staticSegments();
    for (const l of lines) expect(cloudStatic.some((c) => c.includes(l)), l).toBe(false);
    const deviceIds = Object.keys(MANIFEST.prompts).filter((id) => !CLOUD_TEXT_PROMPTS.includes(id));
    expect(deviceIds.sort()).toEqual(['fmPre.v1', 'nanoFix.v1', 'nanoPre.v1', 'nanoRef.v1', 'nanoVaultText.v1']);
    const nano = segmentsText(render('nanoVaultText.v1', { TEXTS_JSON: [{ id: 'w1', text: 'BUS' }], VAULT_JSON: [] }));
    expect(scan([nano])).toEqual({ vaultId: TEMPLATE_CANARY });
    const ref = segmentsText(render('nanoRef.v1', { CLAIMS_JSON: [], VAULT_JSON: [] }));
    expect(scan(['context: ' + ref])).toEqual({ vaultId: TEMPLATE_CANARY });
    // the cloud prompts themselves never trip the canary
    expect(scan([systemText('advB.v1'), segmentsText(render('advB.v1')), systemText('advA.v1'), segmentsText(render('advA.v1'))])).toBeNull();
  });
  it('3. strips cloud template text, then 4. scans what remains', () => {
    const explain = (evidence: string) => segmentsText(render('explain.v1', { CLUE_TYPE: 'transit_sign', REGION: 'top_right', EVIDENCE: evidence, REVEALS: 'street' }));
    expect(scan([explain('Bus stop sign with a route number')])).toBeNull();
    expect(scan([explain('A name tag reading LUCAS')])).toEqual({ vaultId: lucas.id });
    expect(stripStatic(explain('XYZ'))).toEqual(['transit_sign', 'top_right', 'XYZ', 'street']);
    expect(stripStatic(systemText('advB.v1'))).toEqual([]);
  });
  it('also catches coordinates within 1 km of a pin (defence in depth for PIN_IN_PROMPT)', () => {
    const home = item('home_pin', 'Home', [], {});
    const s = tripwireScanner(termsOf([home]), pinsOf([home]));
    expect(s(['somewhere around 0.5031, -30.5022'])).toEqual({ vaultId: home.id });
    expect(s(['somewhere around 0.6031, -30.5022'])).toBeNull();
  });
});

// ---------- the real firebase/ai request body through the real tripwire (T-058 Verify) ----------
describe('tripwire + vaultScan on an advB request body built by firebase/ai', () => {
  const realFetch = globalThis.fetch;
  const bodies: string[] = [];
  const canned = { candidates: [{ content: { role: 'model', parts: [{ text: '{"audit_status":"no_location_signal","scene_summary":"","clues":[],"hypotheses":[],"inferences":[]}' }] }, finishReason: 'STOP', index: 0 }] };
  const spy = vi.fn(async (_url: unknown, init?: RequestInit) => {
    bodies.push(typeof init?.body === 'string' ? init.body : '');
    return new Response(JSON.stringify(canned), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  let model: GenerativeModel;
  let permit = 0;
  const IMAGE: Part = { type: 'inlineData', inlineData: { mimeType: 'image/jpeg', data: Buffer.from('not really a jpeg: LUCAS Medium Landmark').toString('base64') } };
  const advBText = segmentsText(render('advB.v1'));
  const send = async (parts: Part[]) => {
    const id = `t-${++permit}`;
    tripwire.grantCloud({ id, scanText: true });
    const before = spy.mock.calls.length;
    try {
      await model.generateContent(parts);
      return { sent: spy.mock.calls.length === before + 1, trip: null };
    } catch {
      tripwire.revokeCloud(id);
      return { sent: spy.mock.calls.length > before, trip: tripwire.lastTrip() };
    }
  };

  beforeAll(() => {
    globalThis.fetch = spy as unknown as typeof fetch;   // no request ever leaves this process
    installTripwire();
    // Same shape as the pass-B call (dev/spikes/adversaryRun.ts, ARCH §9.3): ONLY_IN_CLOUD, system rules, JSON schema, thinking MEDIUM.
    const app = initializeApp({ apiKey: 'test-api-key', projectId: 'test-project', appId: '1:1:web:1' }, 'vaultscan-test');
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    model = getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: 'test-model',
        systemInstruction: systemText('advB.v1'),
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: ADV_B_SCHEMA, maxOutputTokens: 16384, thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM } },
      },
    });
  });
  afterAll(() => { globalThis.fetch = realFetch; });

  it('the captured body has the shape the scanner expects (system rules, schema, MEDIUM, text + inlineData parts)', async () => {
    setVaultScanner(tripwireScanner([], []));
    const r = await send([{ type: 'text', text: advBText }, IMAGE]);
    expect(r).toEqual({ sent: true, trip: null });
    const body = JSON.parse(bodies[bodies.length - 1]) as {
      systemInstruction: { parts: { text: string }[] };
      generationConfig: { responseJsonSchema: unknown; thinkingConfig: { thinkingLevel: string } };
      contents: { role: string; parts: { text?: string; inlineData?: { mimeType: string } }[] }[];
    };
    expect(body.systemInstruction.parts[0].text).toBe(systemText('advB.v1'));
    expect(body.generationConfig.responseJsonSchema).toEqual(ADV_B_SCHEMA);
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('MEDIUM');
    expect(body.contents[0].role).toBe('user');
    expect(body.contents[0].parts[0].text).toBe(advBText);
    expect(body.contents[0].parts[1].inlineData?.mimeType).toBe('image/jpeg');
  });

  it('vault labels "Medium" and "Landmark Road" do not trip on the pass-B request', async () => {
    const vault = [item('other_text', 'Medium'), item('street_name', 'Landmark Road'), item('other_text', 'High'), item('area_name', 'Neighbourhood Centre')];
    setVaultScanner(tripwireScanner(termsOf(vault), pinsOf(vault)));
    expect(await send([{ type: 'text', text: advBText }, IMAGE])).toEqual({ sent: true, trip: null });
  });

  it('"Lucas" in a user text part trips VAULT_TEXT and nothing is sent', async () => {
    const lucas = item('child_name', 'Lucas');
    const vault = [lucas, item('other_text', 'Medium'), item('street_name', 'Landmark Road')];
    setVaultScanner(tripwireScanner(termsOf(vault), pinsOf(vault)));
    const r = await send([{ type: 'text', text: advBText }, IMAGE, { type: 'text', text: 'The child in the photo is called Lucas.' }]);
    expect(r.sent).toBe(false);
    expect(r.trip).toMatchObject({ reason: 'VAULT_TEXT', vaultId: lucas.id });
  });

  it('a device prompt sent to the cloud trips the template canary', async () => {
    setVaultScanner(tripwireScanner([], []));
    const nano = segmentsText(render('nanoPre.v1'));
    const r = await send([{ type: 'text', text: nano }, IMAGE]);
    expect(r.sent).toBe(false);
    expect(r.trip).toMatchObject({ reason: 'VAULT_TEXT', vaultId: TEMPLATE_CANARY });
  });

  it('the default vaultScan instance registers the real vault with the tripwire (boot, ARCH §15.1)', async () => {
    await burnVault();
    const lucas = await addItem({ kind: 'child_name', label: 'Lucas', aliases: [] });
    await vaultScan.init({ judge: false });
    expect(vaultScan.mode()).toBe('real');
    expect(ids(vaultScan.activeTerms())).toEqual([lucas.id]);
    expect(await send([{ type: 'text', text: advBText }, IMAGE])).toEqual({ sent: true, trip: null });
    expect((await send([{ type: 'text', text: 'L U C A S' }])).trip).toMatchObject({ reason: 'VAULT_TEXT', vaultId: lucas.id });
    await burnVault();
    vaultScan.clearReal();
    expect(vaultScan.activeTerms()).toEqual([]);
  });
});

// ---------- pass-B echo scan (D-65: free-text fields only) ----------
describe('echo scan', () => {
  const ok = parseAdvB(okFixture);
  it('reads scene_summary, decline_reason, evidence, label and value only', () => {
    const texts = echoFreeText(ok);
    expect(texts[0]).toBe(okFixture.scene_summary);
    expect(texts).toContain(okFixture.clues[2].evidence);
    expect(texts).toContain(okFixture.hypotheses[0].label);
    expect(texts).toContain(okFixture.inferences[0].value);
    expect(texts).not.toContain('medium');
    expect(texts).not.toContain('c1');
    expect(echoFreeText({ declineReason: 'Not appropriate', clues: [], hypotheses: [], inferences: [] })).toEqual(['Not appropriate']);
  });
  it('vault labels "Medium" and "Landmark Road" are not echoed by the advB.v1.ok fixture (enum values are never scanned)', () => {
    const vault = [item('other_text', 'Medium'), item('street_name', 'Landmark Road'), item('other_text', 'High'), item('employer', 'City General Hospital')];
    expect(echoScan(ok, termsOf(vault))).toEqual([]);
  });
  it('a vault string in a free-text field is echoed, once per item', () => {
    const paris = item('area_name', 'Paris');
    const lucas = item('child_name', 'Lucas');
    expect(echoScan(ok, termsOf([paris, lucas]))).toEqual([paris.id]);   // hypotheses[].label "Paris"
    const leaky = parseAdvB({ ...okFixture, scene_summary: 'A bag with a LUCAS name tag.', inferences: [{ ...okFixture.inferences[0], value: 'Lucas school run' }] });
    expect(echoScan(leaky, termsOf([lucas, paris]))).toEqual([lucas.id, paris.id]);
  });
});

// ---------- the active index (ARCH §8.4, R-14, D-37, AC-241) ----------
function harness(load: () => Promise<readonly VaultItem[]>) {
  const registered: VaultScanner[] = [];
  const loadReal = vi.fn(load);
  const deps: VaultScanDeps = { loadReal, register: (fn) => { registered.push(fn); } };
  const vs = createVaultScan(deps);
  const last = () => registered[registered.length - 1];
  return { vs, loadReal, registered, last };
}
const deferred = <T,>() => {
  let resolve: (v: T) => void = () => {};
  let reject: (e: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('createVaultScan: the ACTIVE vault', () => {
  const realKid = item('child_name', 'Ellery');
  const realHome = item('home_pin', 'Maple Cottage', [], { lat: 0.9 });
  const judgeKid = item('child_name', 'Lucas');
  const judgeHome = item('home_pin', 'Home', [], { lat: 0.2, source: 'synthetic' });
  const REAL = [realKid, realHome];
  const JUDGE_VAULT: readonly VaultItem[] = [judgeKid, judgeHome];

  it('boot outside Judge Mode loads the real vault once and registers its scanner', async () => {
    const h = harness(async () => REAL);
    await h.vs.init({ judge: false });
    await h.vs.ready;
    expect(h.loadReal).toHaveBeenCalledTimes(1);
    expect(h.vs.mode()).toBe('real');
    expect(ids(h.vs.activeTerms())).toEqual([realKid.id, realHome.id]);
    expect(ids(h.vs.activePins())).toEqual([realHome.id]);
    expect(h.last()(['Ellery at the park'])).toEqual({ vaultId: realKid.id });
    expect(h.last()(['Lucas at the park'])).toBeNull();
    expect(h.vs.scanText('ELLERY')?.vaultId).toBe(realKid.id);
  });

  it('booting into Judge Mode never loads the real vault (D-37, AC-241); useJudge activates JUDGE_VAULT only', async () => {
    const h = harness(async () => REAL);
    await h.vs.init({ judge: true });
    expect(h.vs.mode()).toBe('judge');
    expect(h.vs.activeTerms()).toEqual([]);
    expect(h.last()(['Ellery and Lucas'])).toBeNull();   // empty index until useJudge
    await h.vs.useJudge(JUDGE_VAULT);
    await h.vs.refresh();                                  // a vault edit in Judge Mode never loads the real vault
    expect(h.loadReal).not.toHaveBeenCalled();
    expect(h.vs.judgeVault()).toBe(JUDGE_VAULT);           // identity, for the gate's S4 check
    expect(ids(h.vs.activeTerms())).toEqual([judgeKid.id]);   // "Home" pin: no text terms (AC-088)
    expect(ids(h.vs.activePins())).toEqual([judgeHome.id]);
    expect(h.last()(['LUCAS'])).toEqual({ vaultId: judgeKid.id });   // the forced-leak beat still blocks
    expect(h.last()(['Ellery'])).toBeNull();
  });

  it('entering Judge Mode drops the real terms and pins; exiting reloads them; every switch re-registers (R-14)', async () => {
    const h = harness(async () => REAL);
    await h.vs.init({ judge: false });
    const n0 = h.registered.length;
    await h.vs.useJudge(JUDGE_VAULT);
    expect(h.registered.length).toBe(n0 + 1);
    expect(h.vs.activeTerms().some((t) => t.vaultId === realKid.id)).toBe(false);
    expect(h.vs.activePins().some((p) => p.vaultId === realHome.id)).toBe(false);
    expect(h.last()(['Ellery'])).toBeNull();
    await h.vs.useReal();
    expect(h.loadReal).toHaveBeenCalledTimes(2);
    expect(h.vs.mode()).toBe('real');
    expect(h.vs.judgeVault()).toBeNull();
    expect(h.last()(['Ellery'])).toEqual({ vaultId: realKid.id });
    expect(h.last()(['Lucas'])).toBeNull();
    expect(h.registered.length).toBeGreaterThan(n0 + 1);
  });

  it('fails closed while the real vault loads, and a load that finishes after useJudge is discarded', async () => {
    const d = deferred<readonly VaultItem[]>();
    const h = harness(() => d.promise);
    const boot = h.vs.init({ judge: false });
    expect(h.last()(['anything at all'])).toEqual({ vaultId: VAULT_UNAVAILABLE });
    await h.vs.useJudge(JUDGE_VAULT);
    d.resolve(REAL);
    await boot;
    expect(h.vs.mode()).toBe('judge');
    expect(ids(h.vs.activeTerms())).toEqual([judgeKid.id]);
    expect(h.last()(['Ellery'])).toBeNull();
  });

  it('if the real vault cannot be read, `ready` rejects and every scanned cloud call trips', async () => {
    const h = harness(async () => { throw new Error('VaultCorruptError'); });
    await expect(h.vs.init({ judge: false })).rejects.toThrow('VaultCorruptError');
    await expect(h.vs.ready).rejects.toThrow('VaultCorruptError');
    expect(h.vs.activeTerms()).toEqual([]);
    expect(h.last()(['describe the scene'])).toEqual({ vaultId: VAULT_UNAVAILABLE });
    h.vs.setFuzzyThreshold(0.7);                           // never unblocks
    expect(h.last()(['describe the scene'])).toEqual({ vaultId: VAULT_UNAVAILABLE });
  });

  it('before init, refresh and clearReal do nothing (boot has not chosen real or Judge Mode yet)', async () => {
    const h = harness(async () => REAL);
    h.vs.clearReal();
    // refresh settles at once: there is nothing to rebuild yet. It used to return the boot promise, which never settles
    // before init(), so a Burn vault that failed before boot never settled either (T-054 review round 3).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<string>((res) => { timer = setTimeout(() => res('pending'), 200); });
    expect(await Promise.race([h.vs.refresh().then(() => 'resolved'), late])).toBe('resolved');
    clearTimeout(timer);
    h.vs.setFuzzyThreshold(0.9);
    expect(h.loadReal).not.toHaveBeenCalled();
    expect(h.registered).toEqual([]);                      // the tripwire stays fail-closed (NO_SCANNER) until init
    expect(h.vs.mode()).toBe('unset');
  });

  it('refresh rebuilds after an edit; clearReal empties at once after Burn', async () => {
    let items: readonly VaultItem[] = [realKid];
    const h = harness(async () => items);
    await h.vs.init({ judge: false });
    items = [realKid, judgeKid];
    await h.vs.refresh();
    expect(ids(h.vs.activeTerms())).toEqual([realKid.id, judgeKid.id]);
    h.vs.clearReal();
    expect(h.vs.activeTerms()).toEqual([]);
    expect(h.last()(['Ellery and Lucas'])).toBeNull();
    await h.vs.ready;
  });

  it('setFuzzyThreshold clamps the RC value and re-registers the scanner', async () => {
    const h = harness(async () => [item('child_name', 'Lucas')]);
    await h.vs.init({ judge: false });
    expect(h.last()(['LUKAS'])).not.toBeNull();            // 0.8 ≥ 0.8 (a possessive like LUCAS'S now matches exactly, D-77)
    h.vs.setFuzzyThreshold(0.9);
    expect(h.vs.threshold()).toBe(0.9);
    expect(h.last()(['LUKAS'])).toBeNull();
    h.vs.setFuzzyThreshold(5);
    expect(h.vs.threshold()).toBe(0.98);
    h.vs.setFuzzyThreshold('0.1');
    expect(h.vs.threshold()).toBe(0.8);
  });

  it('bound helpers use the active index: matchWords (Tier-0 / gate image re-check), coordinates, echo', async () => {
    const h = harness(async () => REAL);
    await h.vs.useJudge(JUDGE_VAULT);
    expect(h.vs.matchWords([{ text: 'L' }, { text: 'U' }, { text: 'C' }, { text: 'A' }, { text: 'S' }]).map((x) => [x.term.vaultId, x.spans]))
      .toEqual([[judgeKid.id, [[0, 4]]]]);
    expect(h.vs.coordinatesNearPins('0.2004, -30.5003')?.vaultId).toBe(judgeHome.id);
    expect(h.vs.coordinatesNearPins('0.9004, -30.5003')).toBeNull();   // the real home pin is not active
    expect(h.vs.echoScan({ sceneSummary: 'Lucas and Ellery', clues: [], hypotheses: [], inferences: [] })).toEqual([judgeKid.id]);
    expect(h.loadReal).not.toHaveBeenCalled();
  });
});

// ---------- T-054 review round 2: coalesced reloads, boot finishes an interrupted burn, place_pin labels ----------
describe('createVaultScan: reloads are coalesced and fail closed (T-054 review round 2)', () => {
  const kid = item('child_name', 'Ellery');
  const kid2 = item('child_name', 'Lucas');

  /** A real-mode index whose every load is a deferred the test settles, with the vault-change listener captured. */
  function manual() {
    const loads: Array<ReturnType<typeof deferred<readonly VaultItem[]>>> = [];
    const registered: VaultScanner[] = [];
    let changed: () => void = () => {};
    const vs = createVaultScan({
      loadReal: () => { const d = deferred<readonly VaultItem[]>(); loads.push(d); return d.promise; },
      register: (fn) => { registered.push(fn); },
      onVaultChange: (l) => { changed = l; },
    });
    return { vs, loads, last: () => registered[registered.length - 1], change: () => changed() };
  }

  it('N vault changes while a reload runs cost ONE more load, and the stale result is never installed', async () => {
    const h = manual();
    const boot = h.vs.init({ judge: false });
    await vi.waitFor(() => expect(h.loads).toHaveLength(1));
    h.loads[0].resolve([kid]);
    await boot;
    expect(ids(h.vs.activeTerms())).toEqual([kid.id]);

    h.change();                                            // a change: the reload starts at once
    expect(h.loads).toHaveLength(2);
    for (let i = 0; i < 5; i++) h.change();                // five more (every tab announcing) while it runs
    expect(h.loads).toHaveLength(2);                       // queued nothing
    expect(h.last()(['Ellery'])).toEqual({ vaultId: VAULT_UNAVAILABLE });   // blocked meanwhile (fail closed)

    h.loads[1].resolve([kid]);                             // read before the later changes: stale
    await vi.waitFor(() => expect(h.loads).toHaveLength(3));
    expect(h.vs.activeTerms()).toEqual([]);                // ...so it was never installed
    expect(h.last()(['Ellery'])).toEqual({ vaultId: VAULT_UNAVAILABLE });

    h.loads[2].resolve([kid, kid2]);
    await h.vs.ready;
    expect(ids(h.vs.activeTerms())).toEqual([kid.id, kid2.id]);
    expect(h.last()(['Lucas'])).toEqual({ vaultId: kid2.id });
    expect(h.loads).toHaveLength(3);                       // boot + 2, never boot + 6
  });

  it('a failed reload stays blocked and rejects `ready`; a change during it still gets its own load', async () => {
    const h = manual();
    const boot = h.vs.init({ judge: false });
    await vi.waitFor(() => expect(h.loads).toHaveLength(1));
    h.loads[0].resolve([kid]);
    await boot;
    h.change();
    h.change();
    h.loads[1].reject(new Error('BurnPendingError'));     // the first read fails, but the vault changed meanwhile
    await vi.waitFor(() => expect(h.loads).toHaveLength(3));
    h.loads[2].reject(new Error('BurnPendingError'));
    await expect(h.vs.ready).rejects.toThrow('BurnPendingError');
    expect(h.last()(['anything'])).toEqual({ vaultId: VAULT_UNAVAILABLE });
    h.change();                                            // the next change retries
    h.loads[3].resolve([kid2]);
    await h.vs.ready;
    expect(ids(h.vs.activeTerms())).toEqual([kid2.id]);
  });

  it('a switch to Judge Mode abandons a running reload: its result is never installed and it loads nothing more', async () => {
    const h = manual();
    const boot = h.vs.init({ judge: false });
    await vi.waitFor(() => expect(h.loads).toHaveLength(1));
    h.loads[0].resolve([kid]);
    await boot;
    h.change();
    h.change();
    await h.vs.useJudge([kid2]);
    h.loads[1].resolve([kid]);
    await new Promise((r) => setTimeout(r, 10));
    expect(h.loads).toHaveLength(2);
    expect(h.vs.mode()).toBe('judge');
    expect(ids(h.vs.activeTerms())).toEqual([kid2.id]);
  });
});

describe('createVaultScan: boot finishes an interrupted burn in BOTH modes (T-054 review round 2, D-37)', () => {
  function booting(finish: () => Promise<void>) {
    const log: string[] = [];
    const registered: VaultScanner[] = [];
    const loadReal = vi.fn(async (): Promise<readonly VaultItem[]> => { log.push('loadReal'); return [item('child_name', 'Ellery')]; });
    const vs = createVaultScan({
      loadReal,
      register: (fn) => { registered.push(fn); },
      finishPendingBurn: async () => { log.push('finish'); await finish(); },
    });
    return { vs, log, loadReal, last: () => registered[registered.length - 1] };
  }

  it('Judge Mode: finishes the burn first, never loads the real vault, then installs the empty index', async () => {
    const h = booting(async () => {});
    const boot = h.vs.init({ judge: true });
    expect(h.vs.mode()).toBe('judge');
    expect(h.last()(['anything'])).toEqual({ vaultId: VAULT_UNAVAILABLE });   // fail closed until it is done
    await boot;
    expect(h.log).toEqual(['finish']);
    expect(h.loadReal).not.toHaveBeenCalled();
    expect(h.last()(['anything'])).toBeNull();
  });

  it('Judge Mode still boots when the burn cannot finish yet (the marker stays; the next boot retries)', async () => {
    const h = booting(async () => { throw new Error('BurnPendingError'); });
    await h.vs.init({ judge: true });
    expect(h.vs.mode()).toBe('judge');
    expect(h.loadReal).not.toHaveBeenCalled();
    expect(h.last()(['anything'])).toBeNull();
  });

  it('real vault: the burn is finished before the load; if it cannot be, the index stays blocked and `ready` rejects', async () => {
    const ok = booting(async () => {});
    await ok.vs.init({ judge: false });
    expect(ok.log).toEqual(['finish', 'loadReal']);
    const stuck = booting(async () => { throw new Error('BurnPendingError'); });
    await expect(stuck.vs.init({ judge: false })).rejects.toThrow('BurnPendingError');
    await expect(stuck.vs.ready).rejects.toThrow('BurnPendingError');
    expect(stuck.loadReal).not.toHaveBeenCalled();
    expect(stuck.last()(['anything'])).toEqual({ vaultId: VAULT_UNAVAILABLE });
  });
});

describe('PinRef label: a place_pin near the photo GPS shows its own label as {KIND} (SPEC §17.3, T-053)', () => {
  const gym = item('place_pin', 'Gym', [], { lat: 0.7 });
  const home = item('home_pin', 'Home', [], { lat: 0.2 });

  it('createVaultScan → pinsWhenReady → gpsWarningFor shows GYM, not PLACE', async () => {
    const h = harness(async () => [gym, home]);
    await h.vs.init({ judge: false });
    const pins = await pinsWhenReady(h.vs);
    const w = gpsWarningFor({ latitude: 0.7001, longitude: -30.5 }, pins);
    expect(w.near.map((n) => [n.kind, n.kindDisplay])).toEqual([['place_pin', 'GYM']]);
  });

  it('only a place_pin carries its label, and no hit (PinHit, tripwire result) ever carries it', async () => {
    expect(pinsOf([gym, home])).toEqual([
      { vaultId: gym.id, kind: 'place_pin', lat: 0.7, lng: -30.5, label: 'Gym' },
      { vaultId: home.id, kind: 'home_pin', lat: 0.2, lng: -30.5 },
    ]);
    const h = harness(async () => [gym]);
    await h.vs.init({ judge: false });
    expect(h.vs.coordinatesNearPins('at 0.7001, -30.5002')).toEqual({ vaultId: gym.id, kind: 'place_pin', pin: true });
    expect(h.last()(['at 0.7001, -30.5002'])).toEqual({ vaultId: gym.id });
  });
});

describe('D-80: the vault generation check (isFresh, asked by the gate before every permit)', () => {
  const kid = item('child_name', 'Ellery');
  const judgeKid = item('child_name', 'Lucas');
  function genHarness(load: () => Promise<readonly VaultItem[]>) {
    let g: number | null = 0;
    const registered: VaultScanner[] = [];
    const loadReal = vi.fn(load);
    const vs = createVaultScan({ loadReal, register: (fn) => { registered.push(fn); }, generation: () => g });
    return { vs, loadReal, set: (v: number | null) => { g = v; }, get: () => g };
  }

  it('fresh after a load; stale once another tab commits (counter bumped, no announcement yet); fresh after refresh', async () => {
    const h = genHarness(async () => [kid]);
    await h.vs.init({ judge: false });
    await h.vs.ready;
    expect(h.vs.isFresh()).toBe(true);
    h.set(1); // a save committed elsewhere
    expect(h.vs.isFresh()).toBe(false);
    await h.vs.refresh();
    expect(h.vs.isFresh()).toBe(true);
  });

  it('a change that commits DURING a load leaves the new index stale (read before the load), never fresh', async () => {
    const d = deferred<readonly VaultItem[]>();
    const h = genHarness(() => d.promise);
    const boot = h.vs.init({ judge: false });
    expect(h.vs.isFresh()).toBe(false); // blocked while loading
    await vi.waitFor(() => expect(h.loadReal).toHaveBeenCalledTimes(1));
    h.set(1); // committed after the load started reading
    d.resolve([kid]);
    await boot;
    await h.vs.ready;
    expect(h.vs.isFresh()).toBe(false);
  });

  it('Judge Mode (fake vault) is always fresh; without a counter (storage unavailable) the old behaviour stands', async () => {
    const h = genHarness(async () => [kid]);
    await h.vs.init({ judge: true });
    h.vs.useJudge([judgeKid]);
    h.set(7);
    expect(h.vs.isFresh()).toBe(true);
    const n = genHarness(async () => [kid]);
    n.set(null);
    await n.vs.init({ judge: false });
    await n.vs.ready;
    expect(n.vs.isFresh()).toBe(true);
  });
});
