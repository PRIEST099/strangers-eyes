// ui/checkState.ts, the pre-screen half (T-068, D-121, D-123): start → step reports → done (the editor), stale runs
// ignored, fail-closed lines, retry, edits, the masked frame candidate, and the view helpers and vault wait.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Clue } from '../../core/types';
import { STRINGS } from '../../core/strings';
import type { Tier0Finding } from '../../tier0/tier0';
import {
  CHECK_START, PENDING_LINES, PRESCREEN_IDLE, checkReducer, maskedCandidate, type CheckAction, type CheckState, type PrescreenOutcome,
} from '../checkState';
import { resultStatus } from '../importTransfer';
import { clueLabelId, lineCopy, nanoLineCopy, readerLabelId, rowDetail, severityLabelId } from './prescreenView';
import { vaultIndexReady, withTimeout } from './runPrescreen';
import { createEditor } from './editor';

const SHA = '1'.repeat(64);
const READY = resultStatus({
  ok: true, master: {} as HTMLCanvasElement, jpeg: new Blob([]), width: 800, height: 600, sha256: SHA, format: 'jpeg', hadGps: false,
  orientation: null, gpsWarning: null,
});
const face: Clue = {
  id: 't0-1', source: 'tier0_face', readers: 'tier0', type: 'face', box: { x: 10, y: 10, w: 40, h: 40 }, boxPrecision: 'exact',
  severity: 'high', removable: true, vaultHits: [], masked: true, userUnmasked: false, maskReason: 'face',
};
const OUTCOME: PrescreenOutcome = {
  findings: [{ clue: face }], failed: [], width: 800, height: 600, mode: 'standard',
  autoMaskTypes: ['name_text', 'house_number', 'plate', 'mail_or_document', 'screen'], padRatio: 0.15,
};
const onPrescreen: CheckState = { pos: { current: 'prescreen', reached: 'prescreen' }, importStatus: READY, prescreen: PRESCREEN_IDLE, epoch: 1 };
const run = (s: CheckState, ...as: CheckAction[]) => as.reduce(checkReducer, s);
const ALL_DONE: CheckAction[] = (['metadata', 'faces', 'text', 'vault'] as const).map((step) => ({ type: 'prescreenStep', run: 1, report: { step, status: 'done', count: 1, ms: 5 } }));

describe('pre-screen transitions', () => {
  it('start (photo ready) → running with every line pending; a step report updates its line', () => {
    let s = run(onPrescreen, { type: 'prescreenStart', run: 1, sha256: SHA });
    expect(s.prescreen).toEqual({ kind: 'running', run: 1, sha256: SHA, lines: PENDING_LINES });
    s = run(s, { type: 'prescreenStep', run: 1, report: { step: 'faces', status: 'running' } });
    s = run(s, { type: 'prescreenStep', run: 1, report: { step: 'faces', status: 'done', count: 2, ms: 31 } });
    expect(s.prescreen.kind === 'running' && s.prescreen.lines.faces).toEqual({ status: 'done', count: 2, ms: 31 });
    expect(s.prescreen.kind === 'running' && s.prescreen.lines.text).toEqual({ status: 'pending' });
  });

  it('start is refused without a ready photo, and while a run is in progress', () => {
    for (const importStatus of [CHECK_START.importStatus, { kind: 'busy' } as const]) {
      const s = { ...onPrescreen, importStatus };
      expect(run(s, { type: 'prescreenStart', run: 1, sha256: SHA })).toBe(s);
    }
    const s = run(onPrescreen, { type: 'prescreenStart', run: 1, sha256: SHA });
    expect(run(s, { type: 'prescreenStart', run: 2, sha256: SHA })).toBe(s);
  });

  it('start is accepted once per epoch, and only with the current epoch as its run (D-133: no double Tier-0)', () => {
    expect(run(onPrescreen, { type: 'prescreenStart', run: 0, sha256: SHA })).toBe(onPrescreen); // a stale epoch
    expect(run(onPrescreen, { type: 'prescreenStart', run: 2, sha256: SHA })).toBe(onPrescreen); // a future one
    const done = run(onPrescreen, { type: 'prescreenStart', run: 1, sha256: SHA }, ...ALL_DONE, { type: 'prescreenDone', run: 1, outcome: OUTCOME });
    expect(run(done, { type: 'prescreenStart', run: 1, sha256: SHA })).toBe(done); // not again once done
  });

  it('a new import and an accepted retry each start a new epoch; a refused retry does not', () => {
    expect(run(onPrescreen, { type: 'importStatus', status: { kind: 'busy' } }).epoch).toBe(2);
    const failed = run(onPrescreen, { type: 'prescreenStart', run: 1, sha256: SHA }, { type: 'prescreenDone', run: 1, outcome: OUTCOME });
    const retried = run(failed, { type: 'retry' });
    expect(retried.epoch).toBe(2);
    expect(run(retried, { type: 'prescreenStart', run: 2, sha256: SHA }).prescreen.kind).toBe('running');
    expect(run(onPrescreen, { type: 'retry' }).epoch).toBe(1);
  });

  it('a line forced to failed keeps the latency it reported', () => {
    const s = run(onPrescreen, { type: 'prescreenStart', run: 1, sha256: SHA },
      { type: 'prescreenStep', run: 1, report: { step: 'faces', status: 'done', count: 0, ms: 12 } },
      { type: 'prescreenDone', run: 1, outcome: { ...OUTCOME, failed: ['faces'] } });
    expect(s.prescreen.kind === 'done' && s.prescreen.lines.faces).toEqual({ status: 'failed', ms: 12 });
  });

  it('reports and results of another run are ignored (a photo replaced mid-run)', () => {
    const s = run({ ...onPrescreen, epoch: 2 }, { type: 'prescreenStart', run: 2, sha256: SHA });
    expect(run(s, { type: 'prescreenStep', run: 1, report: { step: 'faces', status: 'done', count: 9 } })).toBe(s);
    expect(run(s, { type: 'prescreenDone', run: 1, outcome: OUTCOME })).toBe(s);
    // the photo is replaced: the old run's result lands on an idle pre-screen and changes nothing
    const replaced = run(s, { type: 'importStatus', status: { kind: 'busy' } });
    expect(run(replaced, { type: 'prescreenDone', run: 2, outcome: OUTCOME })).toBe(replaced);
    const again = run({ ...replaced, importStatus: READY }, { type: 'prescreenStart', run: 3, sha256: SHA }); // same photo, new epoch
    expect(run(again, { type: 'prescreenDone', run: 2, outcome: OUTCOME })).toBe(again);
  });

  it('done → the editor with the pre-ticks applied and the lines as reported', () => {
    const s = run(onPrescreen, { type: 'prescreenStart', run: 1, sha256: SHA }, ...ALL_DONE, { type: 'prescreenDone', run: 1, outcome: OUTCOME });
    expect(s.prescreen.kind).toBe('done');
    if (s.prescreen.kind !== 'done') return;
    expect(s.prescreen.failed).toEqual([]);
    expect(s.prescreen.editor).toEqual(createEditor(OUTCOME.findings, { width: 800, height: 600 }, OUTCOME));
    expect(s.prescreen.lines.vault).toEqual({ status: 'done', count: 1, ms: 5 });
  });

  it('fail closed: a step that never reported done is failed, whatever the outcome says', () => {
    const s = run(onPrescreen, { type: 'prescreenStart', run: 1, sha256: SHA }, ...ALL_DONE.slice(0, 2), { type: 'prescreenDone', run: 1, outcome: OUTCOME });
    expect(s.prescreen.kind === 'done' && s.prescreen.failed).toEqual(['text', 'vault']);
    expect(s.prescreen.kind === 'done' && s.prescreen.lines.text).toEqual({ status: 'failed' });
  });

  it('a failed step in the outcome is failed even if its line said done', () => {
    const s = run(onPrescreen, { type: 'prescreenStart', run: 1, sha256: SHA }, ...ALL_DONE, { type: 'prescreenDone', run: 1, outcome: { ...OUTCOME, failed: ['faces'] } });
    expect(s.prescreen.kind === 'done' && s.prescreen.failed).toEqual(['faces']);
    expect(s.prescreen.kind === 'done' && s.prescreen.lines.faces.status).toBe('failed');
  });

  it('retry drops a failed pre-screen (Check runs it again); a clean one is kept', () => {
    const failed = run(onPrescreen, { type: 'prescreenStart', run: 1, sha256: SHA }, { type: 'prescreenDone', run: 1, outcome: OUTCOME });
    expect(run(failed, { type: 'retry' }).prescreen).toBe(PRESCREEN_IDLE);
    const ok = run(onPrescreen, { type: 'prescreenStart', run: 1, sha256: SHA }, ...ALL_DONE, { type: 'prescreenDone', run: 1, outcome: OUTCOME });
    expect(run(ok, { type: 'retry' })).toBe(ok);
    expect(run(onPrescreen, { type: 'retry' })).toBe(onPrescreen);
  });

  it('edit applies to a finished pre-screen only; a no-op edit returns the same state', () => {
    expect(run(onPrescreen, { type: 'edit', op: { op: 'addDefault' } })).toBe(onPrescreen);
    const done = run(onPrescreen, { type: 'prescreenStart', run: 1, sha256: SHA }, ...ALL_DONE, { type: 'prescreenDone', run: 1, outcome: OUTCOME });
    expect(run(done, { type: 'edit', op: { op: 'toggle', id: 'nope' } })).toBe(done);
    const edited = run(done, { type: 'edit', op: { op: 'toggle', id: 't0-1' } });
    expect(edited.prescreen.kind === 'done' && edited.prescreen.editor.items[0].clue).toMatchObject({ masked: false, userUnmasked: true });
  });

  it('a new import drops the finished pre-screen and goes back to Import', () => {
    const done = run(onPrescreen, { type: 'prescreenStart', run: 1, sha256: SHA }, ...ALL_DONE, { type: 'prescreenDone', run: 1, outcome: OUTCOME });
    const next = run(done, { type: 'importStatus', status: { kind: 'busy' } });
    expect(next.prescreen).toBe(PRESCREEN_IDLE);
    expect(next.pos).toEqual({ current: 'import', reached: 'import' });
  });
});

describe('maskedCandidate', () => {
  const done = run(onPrescreen, { type: 'prescreenStart', run: 1, sha256: SHA }, ...ALL_DONE, { type: 'prescreenDone', run: 1, outcome: OUTCOME });
  it('is the editor\'s candidate for the photo Check holds', () => {
    const c = maskedCandidate(done, SHA);
    expect(c).toMatchObject({ masterSha256: SHA, width: 800, height: 600, blockedBy: [], route: 'RULES_ONLY' });
    expect(c?.masks).toEqual([{ x: 6, y: 6, w: 48, h: 48 }]); // 40 px face: 4 px a side (15% would be 3)
  });
  it('is null without a finished pre-screen, or for another photo, or with no photo held', () => {
    expect(maskedCandidate(onPrescreen, SHA)).toBeNull();
    expect(maskedCandidate(done, '2'.repeat(64))).toBeNull();
    expect(maskedCandidate(done, null)).toBeNull();
    expect(maskedCandidate({ ...done, importStatus: { kind: 'busy' } }, SHA)).toBeNull();
  });
  it('carries the failed steps, so T-069 can refuse to send (fail closed)', () => {
    const failed = run(onPrescreen, { type: 'prescreenStart', run: 1, sha256: SHA }, { type: 'prescreenDone', run: 1, outcome: OUTCOME });
    expect(maskedCandidate(failed, SHA)?.blockedBy).toEqual(['metadata', 'faces', 'text', 'vault']);
  });
});

describe('prescreenView', () => {
  it('lineCopy: SPEC SCR-06 line texts, busy and failed variants', () => {
    expect(lineCopy('faces', { status: 'done', count: 2 })).toEqual({ id: 'ui.prescreen.facesDone', params: { n: 2 } });
    expect(lineCopy('text', { status: 'done', count: 14 })).toEqual({ id: 'ui.prescreen.textDone', params: { n: 14 } });
    expect(lineCopy('vault', { status: 'done' })).toEqual({ id: 'ui.prescreen.vaultDone', params: { n: 0 } });
    expect(lineCopy('metadata', { status: 'done', ms: 3 })).toEqual({ id: 'ui.prescreen.metadataName' });
    expect(lineCopy('faces', { status: 'running' })).toEqual({ id: 'ui.prescreen.busy', name: 'ui.prescreen.facesName' });
    expect(lineCopy('vault', { status: 'pending' })).toEqual({ id: 'ui.prescreen.busy', name: 'ui.prescreen.vaultName' });
    expect(lineCopy('text', { status: 'failed' })).toEqual({ id: 'ui.prescreen.lineFailed', name: 'ui.prescreen.textName' });
    expect(STRINGS['ui.prescreen.facesDone']).toBe('Finding faces ({n})');
    expect(STRINGS['ui.prescreen.textDone']).toBe('Reading text ({n} words)');
    expect(STRINGS['ui.prescreen.vaultDone']).toBe('Checking against your vault ({n} matches)');
    expect(STRINGS['ui.prescreen.metadataName']).toBe('Removing metadata');
  });

  it('nanoLineCopy: honest per capability state until T-066', () => {
    expect(nanoLineCopy('a')).toBe('ui.prescreen.nanoPending');
    expect(nanoLineCopy('a-prime')).toBe('copy.prescreen.textOnly');
    expect(nanoLineCopy('b')).toBe('copy.prescreen.rulesOnly');
    expect(nanoLineCopy('c')).toBe('copy.prescreen.rulesOnly');
    expect(nanoLineCopy(null)).toBe('copy.prescreen.rulesOnly');
  });

  it('labels: type (phone has its own), reader, severity', () => {
    expect(clueLabelId({ clue: face })).toBe('ui.clue.face');
    expect(clueLabelId({ clue: { ...face, type: 'other' }, regexKind: 'phone' })).toBe('ui.clue.phone');
    expect(clueLabelId({ clue: { ...face, type: 'plate' }, regexKind: 'plate' })).toBe('ui.clue.plate');
    expect(readerLabelId('tier0')).toBe('ui.editor.reader.tier0');
    expect(readerLabelId('both')).toBe('ui.editor.reader.both');
    expect(readerLabelId('user')).toBeNull();
    expect(severityLabelId('medium')).toBe('ui.editor.severity.medium');
  });

  it('rowDetail: a masked vault hit names its text and kind; an unmasked one says nothing (warnVault does)', () => {
    const vault: Tier0Finding = { clue: { ...face, type: 'name_text', vaultHits: ['v1'], localText: 'LUCAS', maskReason: 'vault_text' }, vaultKinds: ['child_name'] };
    const item = { ...vault, flag: 'none' as const, approximate: false };
    expect(rowDetail(item, 'Name or text')).toEqual({ id: 'copy.prescreen.vaultHit', params: { TEXT: 'LUCAS', kind: "child's name" } });
    expect(rowDetail({ ...item, clue: { ...item.clue, masked: false } }, 'Name or text')).toBeNull();
    const amber = { clue: { ...face, type: 'street_sign' as const, masked: false }, flag: 'possible' as const, approximate: false };
    expect(rowDetail(amber, 'Street sign')).toEqual({ id: 'copy.prescreen.possible', params: { type: 'street sign' } });
    expect(rowDetail({ ...amber, clue: { ...amber.clue, masked: true } }, 'Street sign')).toBeNull(); // ticked: no longer "Not masked"
    expect(rowDetail({ ...amber, approximate: true }, 'Street sign')).toEqual({ id: 'copy.prescreen.approximate', params: { type: 'street sign' } });
    expect(rowDetail({ clue: face, flag: 'none', approximate: false }, 'Face')).toBeNull();
  });
});

describe('vaultIndexReady (fail closed)', () => {
  afterEach(() => { vi.useRealTimers(); });
  it('true once the index is built', async () => {
    expect(await vaultIndexReady({ mode: () => 'real', ready: Promise.resolve() })).toBe(true);
  });
  it('false before boot chose a vault, when it cannot be read, or after the timeout', async () => {
    expect(await vaultIndexReady({ mode: () => 'unset', ready: new Promise<void>(() => {}) }, 60_000)).toBe(false); // at once: `unset` never settles
    expect(await vaultIndexReady({ mode: () => 'real', ready: Promise.reject(new Error('sealed')) })).toBe(false);
    vi.useFakeTimers();
    const p = vaultIndexReady({ mode: () => 'real', ready: new Promise<void>(() => {}) }, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toBe(false);
  });
  it('a switch to an index that cannot be built, while waiting, is false', async () => {
    const src = { mode: () => 'real', ready: Promise.resolve() as Promise<void> };
    const failing = Promise.reject(new Error('sealed'));
    failing.catch(() => undefined);
    void src.ready.then(() => { src.ready = failing; });
    expect(await vaultIndexReady(src)).toBe(false);
  });

  it('a switch that replaces `ready` while waiting is awaited', async () => {
    let resolveNext!: () => void;
    const next = new Promise<void>((r) => { resolveNext = r; });
    const src = { mode: () => 'judge', ready: Promise.resolve() as Promise<void> };
    const first = src.ready;
    void first.then(() => { src.ready = next; setTimeout(resolveNext, 0); });
    expect(await vaultIndexReady(src)).toBe(true);
  });
});

describe('withTimeout (a stalled face model fails its step closed)', () => {
  afterEach(() => { vi.useRealTimers(); });
  it('passes a value or a rejection through, and rejects after the timeout', async () => {
    expect(await withTimeout(Promise.resolve(7), 10, 'x')).toBe(7);
    await expect(withTimeout(Promise.reject(new Error('boom')), 10, 'x')).rejects.toThrow('boom');
    vi.useFakeTimers();
    const p = withTimeout(new Promise<never>(() => {}), 60_000, 'face model');
    const seen = p.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(59_999);
    let settled = false;
    void p.then(() => {}, () => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await seen).toBe('face model: timed out after 60000 ms');
    expect(vi.getTimerCount()).toBe(0);
    expect(await withTimeout(Promise.resolve('loaded'), 60_000, 'face model')).toBe('loaded');
    expect(vi.getTimerCount()).toBe(0); // a reader that answered in time leaves no timer behind
  });
});
