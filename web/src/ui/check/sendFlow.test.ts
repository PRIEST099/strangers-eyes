// T-069 / T-071 / T-086 slice (D-139): the Send → Attack → Verdict transitions in ui/checkState.ts and the pure helpers
// in ui/check/sendFlow.ts (tier line AC-131, cloud-off states, verdict from pass B or the on-device findings).
import { describe, expect, it } from 'vitest';
import type { AttackOutcome } from '../../ai/jobs/adversaryB';
import type { DryRun } from '../../ai/preflight';
import type { AdversaryResult, Clue, VaultItem } from '../../core/types';
import {
  FIX_IDLE, FLOW_IDLE, PRESCREEN_IDLE, REATTACK_IDLE, checkReducer, declinedInSession, fixBlocked, goesToVerdict, latestResult, maskedCandidate,
  settledReattack, type CheckAction, type CheckState, type PrescreenOutcome,
} from '../checkState';
import { compareVerdicts, comparisonHeadline } from '../../core/verdict';
import { compareRows, receiptParams } from './fixFlow';
import { resultStatus } from '../importTransfer';
import { INITIAL_STATUS } from '../systemStatus';
import { DEFAULT_CONFIG } from '../../firebase/rcParse';
import { caughtOf, consentTierCopy, groundingOffered, sendBlockedCopy, userUnmaskedBoxes, verdictOf } from './sendFlow';

const SHA = '1'.repeat(64);
const READY = resultStatus({
  ok: true, master: {} as HTMLCanvasElement, jpeg: new Blob([]), width: 800, height: 600, sha256: SHA, format: 'jpeg', hadGps: false,
  orientation: null, gpsWarning: null,
});
const vaultClue: Clue = {
  id: 't0-2', source: 'tier0_ocr_vault', readers: 'tier0', type: 'name_text', box: { x: 100, y: 100, w: 80, h: 20 }, boxPrecision: 'exact',
  severity: 'high', removable: true, vaultHits: ['vi_000000000001'], masked: true, userUnmasked: false, maskReason: 'vault_text',
};
const OUTCOME: PrescreenOutcome = { findings: [{ clue: vaultClue }], failed: [], width: 800, height: 600, mode: 'standard', autoMaskTypes: [], padRatio: 0.15 };
const run = (s: CheckState, ...as: CheckAction[]) => as.reduce(checkReducer, s);
const steps: CheckAction[] = (['metadata', 'faces', 'text', 'vault'] as const).map((step) => ({ type: 'prescreenStep', run: 1, report: { step, status: 'done', count: 0, ms: 1 } }));
const onPrescreen: CheckState = run(
  { pos: { current: 'prescreen', reached: 'prescreen' }, importStatus: READY, prescreen: PRESCREEN_IDLE, epoch: 1, flow: FLOW_IDLE, fix: FIX_IDLE, reattack: REATTACK_IDLE },
  { type: 'prescreenStart', run: 1, sha256: SHA }, ...steps, { type: 'prescreenDone', run: 1, outcome: OUTCOME },
);
const dry = (over: Partial<DryRun> = {}): DryRun => ({
  image: { jpeg: new Blob([]), base64: '', sha256: '2'.repeat(64), mime: 'image/jpeg', frame: { id: 'cloud', width: 8, height: 6, cropInMaster: { x: 0, y: 0, w: 800, h: 600 } } },
  bytes: 10, masks: [], autoMasked: 0, userHits: 0, failed: [], facesVisible: 0, vaultVisible: 0, ...over,
});
const call = { route: 'IN_CLOUD' as const, source: 'in_cloud' as const, latencyMs: 900, ledgerId: 'l1', model: 'm' };
const VAULT: VaultItem[] = [
  { id: 'vi_000000000001', kind: 'child_name', label: 'Lucas', aliases: [], createdAt: 1 },
  { id: 'vi_000000000003', kind: 'employer', label: 'City General Hospital', aliases: [], createdAt: 1 },
];
const result = (over: Partial<AdversaryResult> = {}): AdversaryResult => ({
  runId: 'r1', promptVersion: 'advB.v1', model: 'm', status: 'ok', sceneSummary: 's', clues: [], echoedVaultIds: [],
  hypotheses: [{ id: 'h1', label: 'Harbourside', level: 'neighbourhood', lat: 0.5, lng: -30.5, radiusKm: 1, confidence: 'medium', clueIds: [] }],
  inferences: [{ id: 'i1', kind: 'workplace', value: 'City General Hospital', confidence: 'high', clueIds: [] }],
  sentImageSha256: '2'.repeat(64), sentFrame: dry().image.frame, route: 'IN_CLOUD', latencyMs: 900, ...over,
});

describe('Send → Attack → Verdict transitions (D-139)', () => {
  const onSend = run(onPrescreen, { type: 'toSend' });
  const ready = run(onSend, { type: 'preflightStart', run: 0 }, { type: 'preflightDone', run: 0, dry: dry() });

  it('toSend opens Send from a finished pre-screen; the dry run carries the flow run; a stale report is ignored', () => {
    expect(onSend.pos.current).toBe('send');
    expect(run(onSend, { type: 'preflightStart', run: 7 })).toBe(onSend);
    expect(ready.flow.send.kind).toBe('ready');
    expect(run(ready, { type: 'preflightDone', run: 0, dry: dry() })).toBe(ready);
  });

  it('AC-132: cancel sends nothing, returns to the editor and drops the dry run (a new run number)', () => {
    const c = run(ready, { type: 'cancelSend' });
    expect([c.pos.current, c.flow.send.kind, c.flow.attack.kind, c.flow.run]).toEqual(['prescreen', 'idle', 'idle', 1]);
    expect(run(c, { type: 'attackDone', run: 0, outcome: { kind: 'refused', why: 'blocked', call } })).toBe(c);
  });

  it('Send is refused while the dry run names a failure (AC-133)', () => {
    const bad = run(onSend, { type: 'preflightStart', run: 0 }, { type: 'preflightDone', run: 0, dry: dry({ failed: ['faces'] }) });
    expect(run(bad, { type: 'sent', run: 0 })).toBe(bad);
  });

  it('sent → Attack; a final outcome opens the Verdict by itself; a retryable one waits for Try again', () => {
    const sent = run(ready, { type: 'sent', run: 0 });
    expect([sent.pos.current, sent.flow.attack.kind]).toEqual(['attack', 'running']);
    const ok = run(sent, { type: 'attackDone', run: 0, outcome: { kind: 'result', result: result(), call } });
    expect(ok.pos.current).toBe('verdict');
    const net: AttackOutcome = { kind: 'failed', state: 'error', code: 'CLOUD_NETWORK', copyId: 'copy.err.network', retry: true, call };
    const failed = run(sent, { type: 'attackDone', run: 0, outcome: net });
    expect(failed.pos.current).toBe('attack');
    expect(run(failed, { type: 'retryAttack', run: 0 }).flow.attack.kind).toBe('running');
    expect(run(failed, { type: 'toVerdict' }).pos.current).toBe('verdict');
  });

  it('invariant 7: a refusal can never be retried', () => {
    const refused = run(ready, { type: 'sent', run: 0 }, { type: 'attackDone', run: 0, outcome: { kind: 'refused', why: 'declined', call } });
    expect(refused.pos.current).toBe('verdict');
    expect(run(refused, { type: 'retryAttack', run: 0 })).toBe(refused);
    expect(goesToVerdict({ kind: 'failed', state: 'truncated', code: 'CLOUD_TRUNCATED', copyId: 'copy.err.cloudFailed', retry: false, call })).toBe(true);
  });

  it('an edit drops a stale dry run; after Send the masks are locked; a new import resets the flow', () => {
    const back = run(ready, { type: 'selectStep', step: 'prescreen' });
    const edited = run(back, { type: 'edit', op: { op: 'toggle', id: 't0-2' } });
    expect([edited.flow.send.kind, edited.flow.run]).toEqual(['idle', 1]);
    const sent = run(ready, { type: 'sent', run: 0 }, { type: 'selectStep', step: 'prescreen' });
    expect(run(sent, { type: 'edit', op: { op: 'toggle', id: 't0-2' } })).toBe(sent);
    const fresh = run(sent, { type: 'importStatus', status: { kind: 'busy' } });
    expect([fresh.flow.send.kind, fresh.flow.attack.kind, fresh.pos.current]).toEqual(['idle', 'idle', 'import']);
  });
});

describe('sendFlow helpers', () => {
  it('AC-131: the tier line follows data_tier; the grounding box is hidden on the free tier and until pass A exists', () => {
    expect(consentTierCopy({ dataTier: 'free', source: 'remote' })).toBe('copy.consent.tierFree');
    expect(consentTierCopy({ dataTier: 'paid', source: 'remote' })).toBe('copy.consent.tierPaid');
    expect(consentTierCopy({ dataTier: 'paid', source: 'cached' })).toBe('copy.consent.tierPaid');
  });

  it('T-161 fail safe: the paid-tier line never shows from the template default or with no config', () => {
    expect(DEFAULT_CONFIG.dataTier).toBe('free'); // the template default since D-165 (ARCH §13.3); the guard below covers 'paid'
    expect(DEFAULT_CONFIG.source).toBe('default');
    expect(consentTierCopy(DEFAULT_CONFIG)).toBe('copy.consent.tierFree'); // before RC loads, or after a failed fetch
    expect(consentTierCopy({ dataTier: 'paid', source: 'default' })).toBe('copy.consent.tierFree');
    expect(consentTierCopy(null)).toBe('copy.consent.tierFree');
    expect(consentTierCopy(undefined)).toBe('copy.consent.tierFree');
    expect(consentTierCopy({ dataTier: 'free', source: 'cached' })).toBe('copy.consent.tierFree');
  });

  it('pass A grounding box', () => {
    expect(groundingOffered(false)).toBe(false);
    expect(groundingOffered(true)).toBe(false); // pass A is not built (T-070)
    expect(groundingOffered(true, true)).toBe(true);
  });

  it('the sheet does not open offline, under the kill switch, at the cap, or after a BREACH', () => {
    expect(sendBlockedCopy({ online: true, status: INITIAL_STATUS, capUsed: 0 })).toBeNull();
    expect(sendBlockedCopy({ online: false, status: INITIAL_STATUS, capUsed: 0 })).toBe('copy.cap.offline');
    expect(sendBlockedCopy({ online: true, status: { ...INITIAL_STATUS, killSwitch: true }, capUsed: 0 })).toBe('copy.err.killSwitch');
    expect(sendBlockedCopy({ online: true, status: INITIAL_STATUS, capUsed: INITIAL_STATUS.dailyCap })).toBe('copy.err.dailyCap');
    expect(sendBlockedCopy({ online: true, status: { ...INITIAL_STATUS, tripwire: true }, capUsed: 0 })).toBe('copy.gate.tripwire');
  });

  it('un-ticked private items are the dry run user boxes; masked vault hits are "caught"', () => {
    const c = maskedCandidate(onPrescreen, SHA)!;
    expect(userUnmaskedBoxes(c)).toEqual([]);
    expect(caughtOf(c)).toEqual([{ vaultId: 'vi_000000000001', route: 'RULES_ONLY' }]);
    const off = maskedCandidate(run(onPrescreen, { type: 'edit', op: { op: 'toggle', id: 't0-2' } }), SHA)!;
    expect(userUnmaskedBoxes(off)).toEqual([vaultClue.box]);
    expect(caughtOf(off)).toEqual([]);
  });

  it('verdictOf: the rules referee over pass B links the workplace; a refusal is the partial verdict (no bands)', () => {
    const c = maskedCandidate(onPrescreen, SHA);
    const v = verdictOf({ kind: 'result', result: result(), call }, VAULT, c);
    expect(v.level).toBe('RED');
    expect(v.lines.some((l) => l.vaultId === 'vi_000000000003' && l.strength === 'exact')).toBe(true);
    expect(v.lines.some((l) => l.kind === 'caught' && l.vaultId === 'vi_000000000001')).toBe(true);
    const p = verdictOf({ kind: 'refused', why: 'declined', call }, VAULT, c);
    expect(p.level).toBe('PARTIAL');
    expect(p.pinBands).toEqual([]);
  });
  it('verdictOf with the referee outcome\'s matches (T-074): they replace the rules referee; [] links nothing', () => {
    const c = maskedCandidate(onPrescreen, SHA);
    const o = { kind: 'result' as const, result: result(), call };
    const claimId = result().inferences[0]?.id ?? 'i1';
    const dev = verdictOf(o, VAULT, c, { matches: [{ claimId, vaultId: 'vi_000000000003', strength: 'likely', reason: 'device', clueIds: [], route: 'ON_DEVICE' }] });
    expect(dev.lines.find((l) => l.vaultId === 'vi_000000000003')).toMatchObject({ strength: 'likely' });
    const none = verdictOf(o, VAULT, c, { matches: [] });
    expect(none.lines.some((l) => l.vaultId === 'vi_000000000003' && l.strength)).toBe(false);
    expect(receiptParams([o], 1).k).toBe(1);
  });
});

// T-078..T-080 (D-142, D-143): Fix → Re-attack in ui/checkState.ts, and the compare helpers in ui/check/fixFlow.ts.
describe('Fix → Re-attack transitions (D-143)', () => {
  const ready = run(onPrescreen, { type: 'toSend' }, { type: 'preflightStart', run: 0 }, { type: 'preflightDone', run: 0, dry: dry({ masks: [{ x: 0, y: 0, w: 9, h: 9 }] }) });
  const sent = run(ready, { type: 'sent', run: 0 });
  const onVerdict = run(sent, { type: 'attackDone', run: 0, outcome: { kind: 'result', result: result(), call } });
  const M = { x: 10, y: 10, w: 50, h: 50 };
  const onFix = run(onVerdict, { type: 'toFix', maxRounds: 3 });
  const applied = run(onFix, { type: 'toggleFixMask', clueId: 'c2' }, { type: 'applyFix', masks: [M], crop: null });
  const reReady = run(applied, { type: 'toReattack', maxRounds: 3 }, { type: 'reflightStart', run: 1 }, { type: 'reflightDone', run: 1, dry: dry({ masks: [M, M] }) });
  const resent = run(reReady, { type: 'resent', run: 1 });
  const after = (o: AttackOutcome) => run(resent, { type: 'reattackDone', run: 1, outcome: o });

  it('BUILT steps: Fix opens from a verdict on a pass-B result; Apply adds masks, keeps the step and starts a re-attack episode', () => {
    expect(sent.reattack.lastSentMasks).toBe(1);
    expect(onFix.pos.current).toBe('fix');
    expect(onFix.fix.unchecked).toEqual([]);
    expect(run(onFix, { type: 'applyFix', masks: [], crop: null })).toBe(onFix); // nothing ticked: no Apply
    expect(applied.pos.current).toBe('fix');
    expect(applied.fix).toEqual({ unchecked: [], cropOff: false, applied: { masks: [M], crop: null }, lastAdded: 1 });
    expect([applied.reattack.pending, applied.reattack.run]).toEqual([true, 1]);
    expect(run(applied, { type: 'cancelFix' }).pos.current).toBe('verdict');
  });

  it('the re-attack runs its own dry run, consent and pass B; a round counts when it is sent; the result is the new "after"', () => {
    expect(reReady.pos.current).toBe('reattack');
    expect(run(reReady, { type: 'reflightDone', run: 0, dry: dry() })).toBe(reReady); // a stale run
    expect(run(reReady, { type: 'cancelResend' }).pos.current).toBe('fix');
    expect([resent.reattack.rounds, resent.reattack.pending, resent.reattack.attack.kind, resent.reattack.lastSentMasks]).toEqual([1, false, 'running', 2]);
    const ok = after({ kind: 'result', result: result({ runId: 'r2' }), call });
    expect(settledReattack(ok)?.kind).toBe('result');
    expect(latestResult(ok)?.result.runId).toBe('r2');
    expect(fixBlocked(ok, 3)).toBeNull();
    expect(run(ok, { type: 'toFix', maxRounds: 3 }).pos.current).toBe('fix');
  });

  it('AC-195: no round past max_fix_rounds', () => {
    const ok = after({ kind: 'result', result: result(), call });
    expect(fixBlocked(ok, 1)).toBe('maxRounds');
    expect(run(ok, { type: 'toFix', maxRounds: 1 })).toBe(ok);
    expect(run(applied, { type: 'toReattack', maxRounds: 0 })).toBe(applied);
  });

  it('D-114/D-129: after any refusal there is no fix round and no re-attack', () => {
    const declined = run(sent, { type: 'attackDone', run: 0, outcome: { kind: 'refused', why: 'declined', call } });
    expect([declinedInSession(declined), fixBlocked(declined, 3)]).toEqual([true, 'declined']);
    expect(run(declined, { type: 'toFix', maxRounds: 3 })).toBe(declined);
    const reDeclined = after({ kind: 'refused', why: 'blocked', call });
    expect(fixBlocked(reDeclined, 3)).toBe('declined');
    expect(run(reDeclined, { type: 'toFix', maxRounds: 3 })).toBe(reDeclined);
  });

  it('a retryable re-attack failure is not settled until Try again succeeds or the user settles it; a new import resets fixing', () => {
    const net = after({ kind: 'failed', state: 'error', code: 'CLOUD_NETWORK', copyId: 'copy.err.network', retry: true, call });
    expect([settledReattack(net), fixBlocked(net, 3)]).toEqual([null, 'busy']);
    expect(run(net, { type: 'retryReattack', run: 1 }).reattack.attack.kind).toBe('running');
    expect(settledReattack(run(net, { type: 'reattackSettle' }))?.kind).toBe('failed');
    const fresh = run(net, { type: 'importStatus', status: { kind: 'busy' } });
    expect([fresh.fix, fresh.reattack.rounds, fresh.reattack.history]).toEqual([FIX_IDLE, 0, []]);
  });
});

describe('fixFlow helpers (AC-194)', () => {
  const c = maskedCandidate(onPrescreen, SHA);
  const before = verdictOf({ kind: 'result', result: result(), call }, VAULT, c);
  const fixed = result({ inferences: [], hypotheses: [{ id: 'h1', label: 'A coastal city', level: 'city', lat: 0.6, lng: -30.3, radiusKm: 25, confidence: 'low', clueIds: [] }] });
  const afterFix = verdictOf({ kind: 'result', result: fixed, call }, VAULT, c, { phase: 'after_fix' });

  it('a fixed re-attack is "Risk reduced"; the same answer again is "Still exposed"', () => {
    expect(afterFix.phase).toBe('after_fix');
    const cmp = compareVerdicts(before, afterFix);
    expect(cmp.riskReduced).toBe(true);
    expect(comparisonHeadline(cmp).copyId).toBe('copy.verdict.reduced');
    const same = compareVerdicts(before, verdictOf({ kind: 'result', result: result(), call }, VAULT, c, { phase: 'after_fix' }));
    expect(same.riskReduced).toBe(false);
    expect(comparisonHeadline(same).copyId).toBe('copy.verdict.still');
  });

  it('Before → After rows use KIND names and band or link words, never the label; the receipt counts cloud calls only', () => {
    const rows = compareRows(before, afterFix, VAULT);
    expect(rows.at(-1)).toMatch(/^Attacker's best guess: neighbourhood level \(attacker confidence \w+\) → city level \(attacker confidence \w+\)$/); // SR-07
    expect(rows.some((r) => r.includes('exact link → not linked'))).toBe(true);
    expect(rows.join(' ')).not.toMatch(/Lucas|City General/);
    expect(compareRows(before, verdictOf({ kind: 'refused', why: 'declined', call }, VAULT, c), VAULT)).toEqual([]);
    const cached = { ...call, route: 'CACHED' as const };
    expect(receiptParams([{ kind: 'result', result: result(), call }, { kind: 'result', result: fixed, call: cached }])).toEqual({ images: 1, requests: 1, k: 0, r: 0 });
    // F-332: only real fallbacks are counted (two guess checks on Nano, none on rules → 0; one rules fallback → 1)
    expect(receiptParams([{ kind: 'result', result: result(), call }], 2, 0).r).toBe(0);
    expect(receiptParams([{ kind: 'result', result: result(), call }], 0, 1).r).toBe(1);
  });
});
