// T-069 / T-071 / T-086 slice (D-139): the Send → Attack → Verdict transitions in ui/checkState.ts and the pure helpers
// in ui/check/sendFlow.ts (tier line AC-131, cloud-off states, verdict from pass B or the on-device findings).
import { describe, expect, it } from 'vitest';
import type { AttackOutcome } from '../../ai/jobs/adversaryB';
import type { DryRun } from '../../ai/preflight';
import type { AdversaryResult, Clue, VaultItem } from '../../core/types';
import { FLOW_IDLE, PRESCREEN_IDLE, checkReducer, goesToVerdict, maskedCandidate, type CheckAction, type CheckState, type PrescreenOutcome } from '../checkState';
import { resultStatus } from '../importTransfer';
import { INITIAL_STATUS } from '../systemStatus';
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
  { pos: { current: 'prescreen', reached: 'prescreen' }, importStatus: READY, prescreen: PRESCREEN_IDLE, epoch: 1, flow: FLOW_IDLE },
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
    expect(consentTierCopy('free')).toBe('copy.consent.tierFree');
    expect(consentTierCopy('paid')).toBe('copy.consent.tierPaid');
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
});
