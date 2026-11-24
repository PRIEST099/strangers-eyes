// web/src/ai/jobs/adversaryB.ts: adversary pass B, the structured attack (S3; SPEC SCR-08, §17.5; ARCH §10.6; T-071).
// Builds the ONE request shape the gate accepts for pass B (advB.v1 system + user turn + schema, the consented image),
// and turns the gate's answer into an AttackOutcome the Check screen can show honestly:
//   result   audit_status ok / no_location_signal: the validated pass B (parseAdvB, the strict parser). This JSON is the
//            ONLY input the referee, the fix planner and the verdict ever get (invariant 8).
//   refused  declined (audit_status "declined") or blocked (a safety refusal, CLOUD_REFUSED): "on-device findings
//            only", never retried, never rephrased; the gate itself refuses any further S3 call for the session and the
//            image (invariant 7, D-129).
//   notSent  the gate refused before sending (kill switch, offline, daily cap, consent, a face or vault text in the
//            image, a BREACH…). Nothing left the device.
//   failed   truncated (MAX_TOKENS), unreadable (not valid JSON / schema), or error (network, 5xx, 429, timeout, a
//            bug). Only network / 5xx / timeout / 429 offer Try again (an identical request); a cut-off or unreadable
//            answer may be a plain-text refusal, so it is never resent (D-129, D-138).
// A per-session cache keyed by sessionId + sha256 + model + prompt version answers a revisit without a new gate call or
// Ledger entry (AC-147). Every outcome carries the call's route, source and latency for the Router HUD.
// Model failover (D-165): when an attempt fails with CLOUD_SERVER (5xx) or CLOUD_QUOTA (429) AFTER the gate's own
// retries, the next model of RC `adversary_fallback_models` is tried once, as a NEW gate call (its own Ledger entry,
// the same consent token and image, every gate check again). Never after a refusal, a decline, a safety block, a
// timeout (D-158) or a truncated/unreadable answer (invariant 7), and never after notSent. A page-lifetime breaker
// skips a model after BREAKER_THRESHOLD consecutive 5xx attempts. The RC default is [] (no failover).
// Same attacker before and after a fix (D-165 fix): failover applies to the FIRST attack (r1) only. The model that
// answered r1 is remembered per session, and every re-attack (r2, r3…) of that session is pinned to it: one gate call
// on that model, no failover, the breaker ignored. An overloaded attacker then gives a Try again, never a different
// (maybe weaker) model whose answer the comparison would read as "Risk reduced".
// Never calls the SDK: the gate is the only door (invariant 4); `run` is injectable so tests drive the REAL gate on fakes.
import type { AdversaryResult, GateBlockReason, Route } from '../../core/types';
import type { StringId } from '../../core/strings';
import { gate as appGate, gateNotices, type GateNotice, type GateRequest, type GateResult, type OutgoingImage } from '../egressGate';
import { blockCopy, GateBlocked, GateError, type GateErrorCode } from '../errors';
import { parseAdvB, ParseError, type ParsedAdvB } from '../parse';
import { render, systemText } from '../prompts';
import { ADV_B_SCHEMA } from '../schemas';
import { cfg as liveCfg } from '../../firebase/remoteConfig';
import type { ConsentToken } from '../../core/types';

export const ADV_B_PROMPT = 'advB.v1';

/** What the gate hands back for pass B: the parsed JSON plus the gate's response-side echo scan. */
export type AdvBValue = ParsedAdvB & { echoedVaultIds?: string[] };

/** The gate's parse step for pass B: JSON, then the strict validator. Anything else is a ParseError (unreadable). */
export function parseAdvBText(raw: string): ParsedAdvB {
  let j: unknown;
  try { j = JSON.parse(raw); } catch { throw new ParseError('pass B: not JSON'); }
  return parseAdvB(j);
}

/** One call as the Router HUD shows it. */
export interface CallInfo {
  route: Route;
  source: 'on_device' | 'in_cloud' | null;
  latencyMs: number | null;
  ledgerId: string | null;
  model: string;
  /** D-165: the models that failed with a 5xx/429 before this one answered or failed (absent when none did). */
  failoverFrom?: string[];
}

export type AttackOutcome =
  | { kind: 'result'; result: AdversaryResult; call: CallInfo; recorded?: { recordedAt: string; model: string } } // recorded: Judge Mode CACHED replay (T-105)
  | { kind: 'refused'; why: 'declined' | 'blocked'; call: CallInfo }
  | { kind: 'notSent'; reason: GateBlockReason; copyId: StringId; params?: Record<string, string>; retry: boolean; call: CallInfo }
  | { kind: 'failed'; state: 'truncated' | 'unreadable' | 'error'; code: GateErrorCode; copyId: StringId; retry: boolean; retryAfterMs?: number; call: CallInfo };

/** SCR-08: the 429 Try again enables after 60 s. */
export const RATE_LIMIT_RETRY_MS = 60_000;
/** Transient failures a user may resend as the identical request. */
const RETRYABLE: readonly GateErrorCode[] = ['CLOUD_NETWORK', 'CLOUD_SERVER', 'TIMEOUT', 'CLOUD_QUOTA'];

export interface AdvBCache {
  get(key: string): AttackOutcome | undefined;
  set(key: string, v: AttackOutcome): void;
}
export function createAdvBCache(): AdvBCache {
  const m = new Map<string, AttackOutcome>();
  return { get: (k) => m.get(k), set: (k, v) => { m.set(k, v); } };
}
export const cacheKey = (sessionId: string, sha256: string, model: string): string => `${sessionId}|${sha256}|${model}|${ADV_B_PROMPT}`;

// ---------- model failover (D-165) ----------
/** The only gate errors that move pass B to the next RC model: server overload (5xx) and quota (429). */
export const FAILOVER_CODES: readonly GateErrorCode[] = ['CLOUD_SERVER', 'CLOUD_QUOTA'];
/** Consecutive 5xx attempts (each already includes the gate's own retry) after which a model is skipped. */
export const BREAKER_THRESHOLD = 2;
/** Per-model circuit breaker. The app's lives for the page (the browsing session); tests inject their own. */
export interface AdvBBreaker {
  tripped(model: string): boolean;
  /** An attempt on `model` ended in CLOUD_SERVER (after the gate's retries). */
  serverError(model: string): void;
  /** `model` answered (a result, a decline or a safety block): its count starts again. */
  answered(model: string): void;
}
export function createAdvBBreaker(threshold: number = BREAKER_THRESHOLD): AdvBBreaker {
  const fails = new Map<string, number>();
  return {
    tripped: (m) => (fails.get(m) ?? 0) >= threshold,
    serverError: (m) => { fails.set(m, (fails.get(m) ?? 0) + 1); },
    answered: (m) => { fails.delete(m); },
  };
}
const pageBreaker = createAdvBBreaker();

/** The model that answered each session's first attack (r1); re-attacks are pinned to it. Tests inject their own. */
export interface AdvBPins {
  get(sessionId: string): string | undefined;
  set(sessionId: string, model: string): void;
}
export function createAdvBPins(): AdvBPins {
  const m = new Map<string, string>();
  return { get: (s) => m.get(s), set: (s, model) => { m.set(s, model); } };
}
const pagePins = createAdvBPins();
/** r1 (or no runId) is the first attack; any other runId is a re-attack after a fix (T-080). */
export const isReattack = (runId: string | undefined): boolean => (runId ?? 'r1') !== 'r1';

/**
 * The models one attack may try, in order: the primary (RC adversary_model), then the RC fallbacks, without duplicates
 * and without models the breaker tripped. If every model is tripped, the primary alone (a Try again still sends).
 */
export function failoverOrder(primary: string, fallbacks: readonly string[], breaker: AdvBBreaker): string[] {
  const all = [primary, ...fallbacks].filter((m, i, a) => typeof m === 'string' && m.length > 0 && a.indexOf(m) === i);
  const open = all.filter((m) => !breaker.tripped(m));
  return open.length > 0 ? open : [primary];
}

export interface AdversaryBInput {
  sessionId: string;
  image: OutgoingImage;
  consent: ConsentToken;
  /** RC adversary_model (for the cache key and the HUD; the gate builds the model itself). */
  model: string;
  /** 'r1' first attack, 'r2' re-attack… */
  runId?: string;
  signal?: AbortSignal;
  /** Judge Mode: the sample being checked (the gate refuses a non-Judge request while the fake vault is active). */
  judge?: { sampleId: string };
}
export interface AdversaryBDeps {
  run?: <T>(req: GateRequest<T>) => Promise<GateResult<T>>;
  notices?: { subscribe(fn: (n: GateNotice) => void): () => void };
  cache?: AdvBCache;
  clock?: () => number;
  /** RC adversary_fallback_models (default: cfg()'s). The gate re-checks every named model against its own config. */
  fallbackModels?: readonly string[];
  breaker?: AdvBBreaker;
  /** Which model answered each session's r1 (default: page lifetime). */
  pins?: AdvBPins;
}

/**
 * The pass-B request exactly as the gate's template check expects it. `failover` (D-165) names an RC fallback model
 * (the primary attempt names none, so the gate uses adversary_model as before) and/or defers the failure banner
 * because another attempt follows.
 */
export function adversaryBRequest(i: AdversaryBInput, failover: { model?: string; deferFailureBanner?: boolean } = {}): GateRequest<AdvBValue> {
  return {
    job: 'adversaryB', payloadClass: 'S3', sessionId: i.sessionId, judge: i.judge ? { sampleId: i.judge.sampleId } : null,
    modelSpec: { kind: 'adversaryB', system: systemText(ADV_B_PROMPT), schema: ADV_B_SCHEMA, ...(failover.model !== undefined ? { model: failover.model } : {}) },
    ...(failover.deferFailureBanner === true ? { deferFailureBanner: true } : {}),
    promptId: ADV_B_PROMPT, text: render(ADV_B_PROMPT), images: [i.image], consent: i.consent,
    parse: (raw) => parseAdvBText(raw),
    isDeclined: (v) => v.status === 'declined',
    ...(i.signal ? { signal: i.signal } : {}),
  };
}

// ---------- DEV ONLY: Judge Mode live recordings (RUNBOOK §6.2b step 5; D-161) ----------
// web/src/dev/judgeRecord.ts (installed by App.tsx inside `if (import.meta.env.DEV)`, opt-in with `?recordJudge=1`) may
// receive the RAW pass-B text of a live Judge Mode answer, only after the strict parser and every gate check accepted
// it and it was not a decline. Pass B only, never pass A (invariant 8); Judge Mode only (fake vault, sample photos). A
// production build has none of it: the setter returns at once, so the recorder is always null.
export interface DevJudgeRecording {
  sampleId: string;
  runId: string;
  model: string;
  sentImageSha256: string;
  cropInMaster: OutgoingImage['frame']['cropInMaster'];
  raw: string;
}
let devJudgeRecorder: ((r: DevJudgeRecording) => void) | null = null;
/** DEV ONLY: install (or clear, null) the Judge Mode recorder. Does nothing in a production build. */
export function devSetJudgeRecorder(fn: ((r: DevJudgeRecording) => void) | null): void {
  if (!import.meta.env.DEV) return;
  devJudgeRecorder = fn;
}

function failedState(code: GateErrorCode): 'truncated' | 'unreadable' | 'error' {
  if (code === 'CLOUD_TRUNCATED') return 'truncated';
  if (code === 'PARSE_FAILED') return 'unreadable';
  return 'error';
}

/**
 * Run pass B through the gate, failing over to the RC fallback models on a 5xx/429 (D-165). Never throws for a gate
 * outcome; an ABORTED call rethrows its GateError.
 */
export async function adversaryB(i: AdversaryBInput, deps: AdversaryBDeps = {}): Promise<AttackOutcome> {
  const run = deps.run ?? appGate;
  const clock = deps.clock ?? (() => performance.now());
  const pins = deps.pins ?? pagePins;
  const reattack = isReattack(i.runId);
  // A re-attack faces the model that answered r1 (the primary when r1 never got a live answer), never a failover.
  const pinned = reattack ? (pins.get(i.sessionId) ?? i.model) : undefined;
  const key = cacheKey(i.sessionId, i.image.sha256, pinned ?? i.model);
  const hit = deps.cache?.get(key);
  if (hit) {
    if (!reattack && hit.kind === 'result') pins.set(i.sessionId, hit.result.model);
    return hit.kind === 'result' ? { ...hit, call: { ...hit.call, route: 'CACHED', latencyMs: 0 } } : hit;
  }

  const breaker = deps.breaker ?? pageBreaker;
  let fallbacks: readonly string[] = [];
  try { fallbacks = deps.fallbackModels ?? liveCfg().adversaryFallbackModels; } catch { fallbacks = []; }
  const order = pinned !== undefined ? [pinned] : failoverOrder(i.model, Array.isArray(fallbacks) ? fallbacks : [], breaker);

  let lastNotice: GateNotice | null = null;
  const off = (deps.notices ?? gateNotices).subscribe((n) => { if (n.job === 'adversaryB') lastNotice = n; });
  const t0 = clock();
  const failed: string[] = [];
  let out: AttackOutcome = { kind: 'failed', state: 'error', code: 'INTERNAL', copyId: 'copy.err.cloudFailed', retry: false,
    call: { route: 'IN_CLOUD', source: null, latencyMs: 0, ledgerId: null, model: i.model } };
  try {
    for (let n = 0; n < order.length; n++) {
      const model = order[n];
      const more = n + 1 < order.length;
      out = await attempt(model, model === i.model ? undefined : model, more, failed.length > 0 ? [...failed] : undefined);
      if (out.kind === 'result' || out.kind === 'refused') { breaker.answered(model); break; }
      // D-165: only an overloaded or rate-limited model fails over; anything else is final (invariant 7, D-158).
      if (out.kind !== 'failed' || out.state !== 'error' || !FAILOVER_CODES.includes(out.code)) break;
      if (out.code === 'CLOUD_SERVER') breaker.serverError(model);
      failed.push(model);
    }
  } finally {
    off();
  }
  if (!reattack && out.kind === 'result') pins.set(i.sessionId, out.result.model);
  // Only final answers are cached: a transient failure must be retryable, and a refusal stays a refusal.
  if (out.kind === 'result' || out.kind === 'refused') deps.cache?.set(key, out);
  return out;

  /** One gate call on `model` (`specModel` undefined = the RC primary, exactly the pre-D-165 request). */
  async function attempt(model: string, specModel: string | undefined, deferBanner: boolean, failoverFrom: string[] | undefined): Promise<AttackOutcome> {
    const call = (over: Partial<CallInfo> = {}): CallInfo => ({
      route: 'IN_CLOUD', source: null, latencyMs: Math.max(0, Math.round(clock() - t0)), ledgerId: null, model,
      ...(failoverFrom ? { failoverFrom } : {}), ...over,
    });
    try {
      const req = adversaryBRequest(i, { ...(specModel !== undefined ? { model: specModel } : {}), ...(deferBanner ? { deferFailureBanner: true } : {}) });
      // DEV recorder only (null in production): keep the raw text the strict parser accepted.
      let devRaw: string | null = null;
      const rec = import.meta.env.DEV && i.judge ? devJudgeRecorder : null;
      const r = await run(rec ? { ...req, parse: (t: string, meta) => { const p = req.parse(t, meta); devRaw = t; return p; } } : req);
      const v = r.value;
      const info = call({ route: r.route, source: r.inferenceSource ?? null, latencyMs: r.latencyMs, ledgerId: r.ledgerId });
      if (v.status === 'declined') return { kind: 'refused', why: 'declined', call: info };
      if (rec && i.judge && devRaw !== null && r.route === 'IN_CLOUD') {
        rec({ sampleId: i.judge.sampleId, runId: i.runId ?? 'r1', model, sentImageSha256: i.image.sha256, cropInMaster: i.image.frame.cropInMaster, raw: devRaw });
      }
      const result: AdversaryResult = {
        runId: i.runId ?? 'r1', promptVersion: ADV_B_PROMPT, model, status: v.status,
        ...(v.declineReason !== undefined ? { declineReason: v.declineReason } : {}),
        sceneSummary: v.sceneSummary, hypotheses: v.hypotheses, clues: v.clues, inferences: v.inferences,
        sentImageSha256: i.image.sha256, sentFrame: i.image.frame, route: 'IN_CLOUD', latencyMs: r.latencyMs,
        echoedVaultIds: Array.isArray(v.echoedVaultIds) ? [...v.echoedVaultIds] : [],
      };
      return { kind: 'result', result, call: info };
    } catch (e) {
      if (e instanceof GateBlocked) {
        const nt = lastNotice as GateNotice | null;
        const params = nt && nt.ledgerId === e.ledgerId ? nt.params : undefined;
        return {
          kind: 'notSent', reason: e.reason, copyId: blockCopy(e.reason).copyId, ...(params ? { params: { ...params } } : {}),
          retry: e.reason === 'OFFLINE', call: call({ route: 'BLOCKED', ledgerId: e.ledgerId }),
        };
      }
      if (e instanceof GateError) {
        if (e.code === 'ABORTED') throw e;
        if (e.code === 'CLOUD_REFUSED' || e.code === 'CLOUD_DECLINED') {
          return { kind: 'refused', why: 'blocked', call: call({ ledgerId: e.ledgerId }) };
        }
        const state = failedState(e.code);
        const retry = RETRYABLE.includes(e.code);
        // A cut-off or unreadable answer is not resent (D-129), so its copy must not say "Try again" (D-138).
        const copyId: StringId = state === 'error' && e.copyId ? e.copyId : 'copy.err.cloudFailed';
        return {
          kind: 'failed', state, code: e.code, copyId, retry, ...(e.code === 'CLOUD_QUOTA' ? { retryAfterMs: RATE_LIMIT_RETRY_MS } : {}),
          call: call({ ledgerId: e.ledgerId }),
        };
      }
      return { kind: 'failed', state: 'error', code: 'INTERNAL', copyId: 'copy.err.cloudFailed', retry: false, call: call() };
    }
  }
}
