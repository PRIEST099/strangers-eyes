import { describe, expect, it } from 'vitest';
import { AIError, AIErrorCode } from 'firebase/ai';
import {
  blockCopy, classifyError, classifyStatus, errorCopy, GateBlocked, GateError, GateTimeoutError, isAiErrorLike, NEVER_RETRY,
  retriesAllowed, retryBucket, retryDelayMs, statusEventFor, type GateErrorCode,
} from './errors';
import { NoDeviceModelError } from './models';
import { createMemoryLedger, LedgerError } from '../core/ledger';
import type { GateBlockReason } from '../core/types';

const dev = { deviceOnly: true };
const cloud = { deviceOnly: false };
const fetchErr = (status?: number) => new AIError(AIErrorCode.FETCH_ERROR, 'x', status === undefined ? undefined : { status, statusText: '' });

describe('classifyError (ARCH §17 "Detected by")', () => {
  it('HTTP statuses', () => {
    expect(classifyError(fetchErr(429), cloud)).toBe('CLOUD_QUOTA');
    expect(classifyError(fetchErr(401), cloud)).toBe('CLOUD_AUTH');
    expect(classifyError(fetchErr(403), cloud)).toBe('CLOUD_AUTH');
    expect(classifyError(fetchErr(400), cloud)).toBe('CLOUD_BAD_REQUEST');
    expect(classifyError(fetchErr(413), cloud)).toBe('CLOUD_BAD_REQUEST');
    expect(classifyError(fetchErr(503), cloud)).toBe('CLOUD_SERVER');
    expect(classifyError(fetchErr(), cloud)).toBe('CLOUD_NETWORK');
    expect(classifyStatus(500)).toBe('CLOUD_SERVER');
  });
  it('SDK codes', () => {
    expect(classifyError(new AIError(AIErrorCode.RESPONSE_ERROR, 'SAFETY'), cloud)).toBe('CLOUD_REFUSED');
    expect(classifyError(new AIError(AIErrorCode.API_NOT_ENABLED, 'x'), dev)).toBe('DEVICE_UNAVAILABLE');
    expect(classifyError(new AIError(AIErrorCode.API_NOT_ENABLED, 'x', { status: 403, statusText: '' }), cloud)).toBe('CLOUD_BAD_REQUEST');
    expect(classifyError(new AIError(AIErrorCode.UNSUPPORTED, 'x'), dev)).toBe('DEVICE_UNAVAILABLE');
    expect(classifyError(new AIError(AIErrorCode.SESSION_CLOSED, 'x'), dev)).toBe('DEVICE_BUSY');
    expect(classifyError(new AIError(AIErrorCode.PARSE_FAILED, 'x'), cloud)).toBe('PARSE_FAILED');
    expect(classifyError(new AIError(AIErrorCode.ERROR, 'Error fetching from https://h/x: fetch failed'), cloud)).toBe('CLOUD_NETWORK');
    expect(classifyError(new AIError(AIErrorCode.ERROR, 'other'), dev)).toBe('DEVICE_FAILED');
    expect(classifyError(new AIError(AIErrorCode.ERROR, 'other'), cloud)).toBe('CLOUD_SERVER');
    expect(classifyError(new AIError(AIErrorCode.INVALID_SCHEMA, 'x'), cloud)).toBe('CLOUD_BAD_REQUEST');
    expect(classifyError(new AIError(AIErrorCode.INVALID_SCHEMA, 'x'), dev)).toBe('DEVICE_FAILED');
  });
  it('timeouts, device errors and unknowns', () => {
    expect(classifyError(new GateTimeoutError(5), cloud)).toBe('TIMEOUT');
    expect(classifyError(new DOMException('a', 'AbortError'), cloud)).toBe('TIMEOUT');
    expect(classifyError(new DOMException('a', 'TimeoutError'), cloud)).toBe('TIMEOUT');
    expect(classifyError(new NoDeviceModelError(), dev)).toBe('DEVICE_UNAVAILABLE');
    expect(classifyError(new DOMException('a', 'QuotaExceededError'), dev)).toBe('DEVICE_INPUT_TOO_LARGE');
    expect(classifyError(new DOMException('a', 'InvalidStateError'), dev)).toBe('DEVICE_BUSY');
    expect(classifyError(new Error('?'), dev)).toBe('DEVICE_FAILED');
    expect(classifyError('?', cloud)).toBe('CLOUD_SERVER');
    expect(isAiErrorLike({ code: 'nope', message: '' })).toBe(false);
    expect(isAiErrorLike(fetchErr(1))).toBe(true);
  });
});

describe('retries (AC-303: a refusal or decline is never retried)', () => {
  const policy = { busy: 2, parse: 1, quota: 2, network: 1 };
  it('never-retry codes get 0 whatever the policy says', () => {
    for (const c of NEVER_RETRY) expect(retriesAllowed(c, { busy: 9, parse: 9, quota: 9, network: 9 }, { cloud: true })).toBe(0);
    expect(NEVER_RETRY).toEqual(expect.arrayContaining(['CLOUD_REFUSED', 'CLOUD_DECLINED', 'BREACH', 'CLOUD_AUTH', 'CLOUD_BAD_REQUEST']));
  });
  it('families draw on their budget; at most 3; a device timeout is never retried, a cloud one at most once', () => {
    expect(retriesAllowed('DEVICE_BUSY', policy, { cloud: false })).toBe(2);
    expect(retriesAllowed('PARSE_FAILED', policy, { cloud: true })).toBe(1);
    expect(retriesAllowed('CLOUD_TRUNCATED', policy, { cloud: true })).toBe(1);
    expect(retriesAllowed('CLOUD_QUOTA', policy, { cloud: true })).toBe(2);
    expect(retriesAllowed('CLOUD_NETWORK', policy, { cloud: true })).toBe(1);
    expect(retriesAllowed('CLOUD_QUOTA', { ...policy, quota: 50 }, { cloud: true })).toBe(3);
    expect(retriesAllowed('CLOUD_QUOTA', { ...policy, quota: -1 }, { cloud: true })).toBe(0);
    expect(retriesAllowed('TIMEOUT', { ...policy, network: 3 }, { cloud: true })).toBe(0); // D-158
    expect(retriesAllowed('TIMEOUT', policy, { cloud: false })).toBe(0);
    expect(retryBucket('CLOUD_SERVER')).toBe('network');
    expect(retryBucket('CLOUD_REFUSED')).toBeNull();
  });
  it('delays: busy 1 s, quota 2 s then 6 s, network 2 s, parse at once; jitter ±20 %', () => {
    const mid = () => 0.5;
    expect(retryDelayMs('DEVICE_BUSY', 1, mid)).toBe(1000);
    expect(retryDelayMs('CLOUD_QUOTA', 1, mid)).toBe(2000);
    expect(retryDelayMs('CLOUD_QUOTA', 2, mid)).toBe(6000);
    expect(retryDelayMs('CLOUD_NETWORK', 1, mid)).toBe(2000);
    expect(retryDelayMs('PARSE_FAILED', 1, mid)).toBe(0);
    expect(retryDelayMs('CLOUD_QUOTA', 1, () => 0)).toBe(1600);
    expect(retryDelayMs('CLOUD_QUOTA', 1, () => 1)).toBe(2400);
    expect(retryDelayMs('CLOUD_QUOTA', 1, () => Number.NaN)).toBe(2000);
  });
});

describe('copy (ARCH §17, §8.7; SPEC §7.2, SCR-22)', () => {
  it('error copy: 400 is copy.err.cloudFailed (F-128), refusals copy.adv.declined, device failures none', () => {
    expect(errorCopy('CLOUD_BAD_REQUEST')).toBe('copy.err.cloudFailed');
    expect(errorCopy('CLOUD_REFUSED')).toBe('copy.adv.declined');
    expect(errorCopy('CLOUD_QUOTA')).toBe('copy.err.rateLimit');
    expect(errorCopy('CLOUD_NETWORK')).toBe('copy.err.network');
    expect(errorCopy('BREACH')).toBe('copy.gate.tripwire');
    expect(errorCopy('DEVICE_FAILED')).toBeNull();
    expect(errorCopy('TIMEOUT')).toBe('copy.adv.truncated');
    expect(errorCopy('PARSE_FAILED')).toBe('copy.adv.truncated');
    expect(errorCopy('CLOUD_TRUNCATED')).toBe('copy.adv.truncated');
    expect(errorCopy('CLOUD_DECLINED')).toBe('copy.adv.declined');
    expect(errorCopy('CLOUD_SERVER')).toBe('copy.err.network');
    expect(errorCopy('GROUNDING_OFF')).toBeNull();
    expect(errorCopy('ABORTED')).toBeNull();
    expect(statusEventFor('TIMEOUT')).toBeNull(); // no "queued" banner for a timeout (D-131)
    expect(statusEventFor('CLOUD_SERVER')).toBe('network');
    expect(retriesAllowed('GROUNDING_OFF', { busy: 3, parse: 3, quota: 3, network: 3 }, { cloud: true })).toBe(0);
    expect(new GateError('INTERNAL', { detail: 'Error' }).message).toBe('gate:INTERNAL (Error)');
    expect(statusEventFor('CLOUD_QUOTA')).toBe('rateLimit');
    expect(statusEventFor('CLOUD_BAD_REQUEST')).toBe('cloudFailed');
    expect(statusEventFor('CLOUD_REFUSED')).toBeNull();
    expect(new GateError('CLOUD_AUTH', { copyId: 'copy.err.auth' }).copyId).toBe('copy.err.auth');
    expect(new GateError('CLOUD_AUTH').copyId).toBe('copy.err.appCheck');
  });
  it('every block reason has its SPEC §7.2 copy and surface', () => {
    const want: Record<GateBlockReason, [string, string]> = {
      VAULT_TEXT_IN_IMAGE: ['copy.gate.blockedVaultText', 'toast'], FACE: ['copy.gate.blockedFace', 'toast'],
      EXIF: ['copy.gate.blockedMetadata', 'toast'], BAD_MIME: ['copy.gate.blockedMetadata', 'toast'],
      VAULT_TEXT_IN_PROMPT: ['copy.gate.blockedPrompt', 'toast'], PIN_IN_PROMPT: ['copy.gate.blockedPrompt', 'toast'],
      NO_CONSENT: ['copy.gate.blockedConsent', 'toast'], CLASS_FLOOR: ['copy.gate.blockedClass', 'toast'],
      CLASS_MISMATCH: ['copy.gate.blockedClass', 'toast'], NOT_SYNTHETIC: ['copy.gate.blockedClass', 'toast'],
      KILL_SWITCH: ['copy.err.killSwitch', 'banner'], DAILY_CAP: ['copy.err.dailyCap', 'banner'],
      OFFLINE: ['copy.queue.queued', 'queue'], TRIPWIRE: ['copy.gate.tripwire', 'banner'],
    };
    for (const [r, [copy, surface]] of Object.entries(want)) expect(blockCopy(r as GateBlockReason)).toMatchObject({ copyId: copy, surface });
  });
  it('GateBlocked carries ids and kinds only', () => {
    const b = new GateBlocked('VAULT_TEXT_IN_PROMPT', 'le_1', { vaultId: 'vi_1', vaultKind: 'child_name' });
    expect(JSON.stringify({ ...b, message: b.message })).not.toMatch(/lucas/i);
    expect(b.reason).toBe('VAULT_TEXT_IN_PROMPT');
    const codes: GateErrorCode[] = ['VAULT_UNAVAILABLE', 'TEMPLATE_CANARY', 'CHECK_FAILED', 'INTERNAL'];
    for (const c of codes) expect(errorCopy(c)).toBe('copy.err.cloudFailed');
  });
});

describe('core/ledger.ts (the minimal in-memory writer the gate needs; T-063 replaces it)', () => {
  it('begin → pending; commit → done once; record; newest 500', () => {
    let n = 0;
    const l = createMemoryLedger({ now: () => 7, newId: () => `le_${++n}`, max: 3 });
    const id = l.begin({ sessionId: 's', judge: false, job: 'referee', payloadClass: 'S0', promptVersion: 'nanoRef.v1' });
    expect(l.entries()[0]).toMatchObject({ id, status: 'pending', route: 'BLOCKED', bytesOut: 0, ts: 7 });
    l.commit(id, { route: 'ON_DEVICE', bytesOut: 0, notes: ['x'] });
    expect(l.entries()[0]).toMatchObject({ status: 'done', route: 'ON_DEVICE', notes: ['x'], facesInOutgoing: 0, vaultItemsInOutgoing: 0 });
    expect(() => l.commit(id, { route: 'IN_CLOUD' })).toThrow(LedgerError);
    expect(() => l.commit('nope', { route: 'IN_CLOUD' })).toThrow(LedgerError);
    const d2 = l.begin({ sessionId: 's', judge: false, job: 'referee', payloadClass: 'S0', promptVersion: null });
    l.commit(d2, { route: 'RULES_ONLY' });
    for (let i = 0; i < 4; i++) l.begin({ sessionId: 's', judge: false, job: 'referee', payloadClass: 'S0', promptVersion: null });
    // newest 3 kept, but a PENDING entry is never evicted (its call still has to commit it): the two done ones go first
    expect(l.entries()).toHaveLength(4);
    expect(l.entries().every((e) => e.status === 'pending')).toBe(true);
    const last = l.entries()[3].id;
    l.commit(last, { route: 'ON_DEVICE' });
    l.begin({ sessionId: 's', judge: false, job: 'referee', payloadClass: 'S0', promptVersion: null });
    expect(l.entries().map((e) => e.id)).not.toContain(last);
    let calls = 0;
    const off = l.subscribe(() => { calls++; });
    l.clear();
    off();
    expect(l.entries()).toHaveLength(0);
    expect(calls).toBe(1);
  });
});
