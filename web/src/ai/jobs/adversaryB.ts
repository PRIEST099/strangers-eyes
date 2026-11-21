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
// Never calls the SDK: the gate is the only door (invariant 4); `run` is injectable so tests drive the REAL gate on fakes.
import type { AdversaryResult, GateBlockReason, Route } from '../../core/types';
import type { StringId } from '../../core/strings';
import { gate as appGate, gateNotices, type GateNotice, type GateRequest, type GateResult, type OutgoingImage } from '../egressGate';
import { blockCopy, GateBlocked, GateError, type GateErrorCode } from '../errors';
import { parseAdvB, ParseError, type ParsedAdvB } from '../parse';
import { render, systemText } from '../prompts';
import { ADV_B_SCHEMA } from '../schemas';
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
}

export type AttackOutcome =
  | { kind: 'result'; result: AdversaryResult; call: CallInfo }
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

export interface AdversaryBInput {
  sessionId: string;
  image: OutgoingImage;
  consent: ConsentToken;
  /** RC adversary_model (for the cache key and the HUD; the gate builds the model itself). */
  model: string;
  /** 'r1' first attack, 'r2' re-attack… */
  runId?: string;
  signal?: AbortSignal;
}
export interface AdversaryBDeps {
  run?: <T>(req: GateRequest<T>) => Promise<GateResult<T>>;
  notices?: { subscribe(fn: (n: GateNotice) => void): () => void };
  cache?: AdvBCache;
  clock?: () => number;
}

/** The pass-B request exactly as the gate's template check expects it. */
export function adversaryBRequest(i: AdversaryBInput): GateRequest<AdvBValue> {
  return {
    job: 'adversaryB', payloadClass: 'S3', sessionId: i.sessionId, judge: null,
    modelSpec: { kind: 'adversaryB', system: systemText(ADV_B_PROMPT), schema: ADV_B_SCHEMA },
    promptId: ADV_B_PROMPT, text: render(ADV_B_PROMPT), images: [i.image], consent: i.consent,
    parse: (raw) => parseAdvBText(raw),
    isDeclined: (v) => v.status === 'declined',
    ...(i.signal ? { signal: i.signal } : {}),
  };
}

function failedState(code: GateErrorCode): 'truncated' | 'unreadable' | 'error' {
  if (code === 'CLOUD_TRUNCATED') return 'truncated';
  if (code === 'PARSE_FAILED') return 'unreadable';
  return 'error';
}

/** Run pass B through the gate. Never throws for a gate outcome; an ABORTED call rethrows its GateError. */
export async function adversaryB(i: AdversaryBInput, deps: AdversaryBDeps = {}): Promise<AttackOutcome> {
  const run = deps.run ?? appGate;
  const clock = deps.clock ?? (() => performance.now());
  const key = cacheKey(i.sessionId, i.image.sha256, i.model);
  const hit = deps.cache?.get(key);
  if (hit) return hit.kind === 'result' ? { ...hit, call: { ...hit.call, route: 'CACHED', latencyMs: 0 } } : hit;

  let lastNotice: GateNotice | null = null;
  const off = (deps.notices ?? gateNotices).subscribe((n) => { if (n.job === 'adversaryB') lastNotice = n; });
  const t0 = clock();
  const call = (over: Partial<CallInfo> = {}): CallInfo => ({
    route: 'IN_CLOUD', source: null, latencyMs: Math.max(0, Math.round(clock() - t0)), ledgerId: null, model: i.model, ...over,
  });
  let out: AttackOutcome;
  try {
    const r = await run(adversaryBRequest(i));
    const v = r.value;
    const info = call({ route: r.route, source: r.inferenceSource ?? null, latencyMs: r.latencyMs, ledgerId: r.ledgerId });
    if (v.status === 'declined') {
      out = { kind: 'refused', why: 'declined', call: info };
    } else {
      const result: AdversaryResult = {
        runId: i.runId ?? 'r1', promptVersion: ADV_B_PROMPT, model: i.model, status: v.status,
        ...(v.declineReason !== undefined ? { declineReason: v.declineReason } : {}),
        sceneSummary: v.sceneSummary, hypotheses: v.hypotheses, clues: v.clues, inferences: v.inferences,
        sentImageSha256: i.image.sha256, sentFrame: i.image.frame, route: 'IN_CLOUD', latencyMs: r.latencyMs,
        echoedVaultIds: Array.isArray(v.echoedVaultIds) ? [...v.echoedVaultIds] : [],
      };
      out = { kind: 'result', result, call: info };
    }
  } catch (e) {
    if (e instanceof GateBlocked) {
      const n = lastNotice as GateNotice | null;
      const params = n && n.ledgerId === e.ledgerId ? n.params : undefined;
      out = {
        kind: 'notSent', reason: e.reason, copyId: blockCopy(e.reason).copyId, ...(params ? { params: { ...params } } : {}),
        retry: e.reason === 'OFFLINE', call: call({ route: 'BLOCKED', ledgerId: e.ledgerId }),
      };
    } else if (e instanceof GateError) {
      if (e.code === 'ABORTED') throw e;
      if (e.code === 'CLOUD_REFUSED' || e.code === 'CLOUD_DECLINED') {
        out = { kind: 'refused', why: 'blocked', call: call({ ledgerId: e.ledgerId }) };
      } else {
        const state = failedState(e.code);
        const retry = RETRYABLE.includes(e.code);
        // A cut-off or unreadable answer is not resent (D-129), so its copy must not say "Try again" (D-138).
        const copyId: StringId = state === 'error' && e.copyId ? e.copyId : 'copy.err.cloudFailed';
        out = {
          kind: 'failed', state, code: e.code, copyId, retry, ...(e.code === 'CLOUD_QUOTA' ? { retryAfterMs: RATE_LIMIT_RETRY_MS } : {}),
          call: call({ ledgerId: e.ledgerId }),
        };
      }
    } else {
      out = { kind: 'failed', state: 'error', code: 'INTERNAL', copyId: 'copy.err.cloudFailed', retry: false, call: call() };
    }
  } finally {
    off();
  }
  // Only final answers are cached: a transient failure must be retryable, and a refusal stays a refusal.
  if (out.kind === 'result' || out.kind === 'refused') deps.cache?.set(key, out);
  return out;
}
