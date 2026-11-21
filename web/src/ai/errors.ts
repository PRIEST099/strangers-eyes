// web/src/ai/errors.ts: the Egress Gate's error codes, classification, retry rules and user copy (ARCH §17, §8.7).
// Pure: no SDK calls (check-boundaries R1 keeps every model call in ai/egressGate.ts). The SDK's AIError is matched by
// shape (`code` plus `customErrorData.status`), so tests can build errors without the SDK and a bundling change in the
// SDK's class identity cannot make the gate misclassify (API-NOTES §1.10).
import type { GateBlockReason } from '../core/types';
import type { StringId } from '../core/strings';

/**
 * ARCH §17's codes, plus four the gate needed (D-112):
 * - VAULT_UNAVAILABLE: the active vault index was not ready (reloading after a vault change, or unreadable). Nothing
 *   was sent; never a vault leak and never a BREACH (T-058/T-093 reviews).
 * - TEMPLATE_CANARY: the static text of a device-only prompt reached a cloud body and the tripwire refused it (D-65).
 * - CHECK_FAILED: a required pre-send check (face model, OCR, decode, hashing) could not run, so nothing was sent.
 * - INTERNAL: an unexpected exception inside the gate itself (a bug); the call's Ledger entry still closes. Its message
 *   carries the exception's NAME only, never its text (which could hold a vault string; T-062 review).
 * - GROUNDING_OFF (D-131): pass A asked for while grounding is off (`grounding_enabled` false or the free tier). Silent:
 *   no toast; the caller shows pass B's scene summary and `copy.adv.notesOff`.
 * - ABORTED (D-131): the caller's AbortSignal fired (queued or in flight). No copy.
 */
export type GateErrorCode = 'DEVICE_UNAVAILABLE' | 'DEVICE_BUSY' | 'DEVICE_INPUT_TOO_LARGE' | 'DEVICE_FAILED'
  | 'CLOUD_REFUSED' | 'CLOUD_DECLINED' | 'CLOUD_TRUNCATED' | 'CLOUD_QUOTA' | 'CLOUD_AUTH' | 'CLOUD_BAD_REQUEST'
  | 'CLOUD_SERVER' | 'CLOUD_NETWORK' | 'PARSE_FAILED' | 'TIMEOUT' | 'BREACH'
  | 'VAULT_UNAVAILABLE' | 'TEMPLATE_CANARY' | 'CHECK_FAILED' | 'INTERNAL' | 'GROUNDING_OFF' | 'ABORTED';

/** Retries per call by error family (ARCH §8.1, §9.2). A refusal or decline is never retried, whatever this says. */
export interface RetryPolicy { busy: number; parse: number; quota: number; network: number }

/** A call that failed after the gate's retries (or could not be attempted). The Ledger entry is already committed. */
export class GateError extends Error {
  readonly code: GateErrorCode;
  readonly ledgerId: string | null;
  /** The copy the UI shows for this failure (SPEC §11), or null when the caller shows its own RULES-ONLY badge. */
  readonly copyId: StringId | null;
  constructor(code: GateErrorCode, opts: { ledgerId?: string | null; copyId?: StringId | null; detail?: string } = {}) {
    super(`gate:${code}${opts.detail ? ` (${opts.detail})` : ''}`);
    this.name = 'GateError';
    this.code = code;
    this.ledgerId = opts.ledgerId ?? null;
    this.copyId = opts.copyId === undefined ? errorCopy(code) : opts.copyId;
  }
}

/**
 * A call the gate refused (ARCH §8.2 BLOCK). Nothing was sent. `vaultId`/`vaultKind` are item IDs and kinds only;
 * the matched text never travels in this error (it is in the toast params, memory only; AC-045).
 */
export class GateBlocked extends Error {
  readonly reason: GateBlockReason;
  readonly ledgerId: string;
  readonly vaultId?: string;
  readonly vaultKind?: string;
  constructor(reason: GateBlockReason, ledgerId: string, hit?: { vaultId?: string; vaultKind?: string }) {
    super(`gate:blocked:${reason}`);
    this.name = 'GateBlocked';
    this.reason = reason;
    this.ledgerId = ledgerId;
    if (hit?.vaultId !== undefined) this.vaultId = hit.vaultId;
    if (hit?.vaultKind !== undefined) this.vaultKind = hit.vaultKind;
  }
}

/** The gate's own deadline fired (RequestOptions.timeout only bounds the headers; API-NOTES §1.9). */
export class GateTimeoutError extends Error {
  constructor(ms: number) {
    super(`gate: deadline of ${ms} ms passed`);
    this.name = 'GateTimeoutError';
  }
}

// ---------- classification (ARCH §17 "Detected by") ----------
/** AIErrorCode values of firebase/ai 3.1.0 (API-NOTES §1.10). */
export const AI_ERROR_CODES: readonly string[] = ['error', 'request-error', 'response-error', 'fetch-error', 'session-closed',
  'invalid-content', 'api-not-enabled', 'already-initialized', 'invalid-schema', 'no-api-key', 'no-app-id', 'no-model',
  'no-project-id', 'parse-failed', 'unsupported'];

export interface AiErrorLike { code: string; message: string; customErrorData?: { status?: number } }

/** True for the SDK's AIError (by shape: a known AIErrorCode string in `code`). */
export function isAiErrorLike(e: unknown): e is AiErrorLike {
  if (typeof e !== 'object' || e === null) return false;
  const code = (e as { code?: unknown }).code;
  return typeof code === 'string' && AI_ERROR_CODES.includes(code) && typeof (e as { message?: unknown }).message === 'string';
}

const statusOf = (e: AiErrorLike): number | undefined => {
  const s = e.customErrorData?.status;
  return typeof s === 'number' && Number.isFinite(s) ? s : undefined;
};
const nameOf = (e: unknown): string => (typeof e === 'object' && e !== null && typeof (e as { name?: unknown }).name === 'string'
  ? (e as { name: string }).name : '');

/** An HTTP status → code (SPEC SCR-22; ARCH §17). */
export function classifyStatus(status: number): GateErrorCode {
  if (status === 429) return 'CLOUD_QUOTA';
  if (status === 401 || status === 403) return 'CLOUD_AUTH';
  if (status >= 500) return 'CLOUD_SERVER';
  return 'CLOUD_BAD_REQUEST'; // 400 (wrong thinking level, schema too large), 404, 413 …: a bug, never retried
}

/**
 * Map anything an invoke can throw to a GateErrorCode. `deviceOnly`: the call was built ONLY_ON_DEVICE, so an SDK
 * error cannot be a cloud error. Parse errors from the caller's parser are classified by the gate itself (PARSE_FAILED).
 */
export function classifyError(e: unknown, ctx: { deviceOnly: boolean }): GateErrorCode {
  if (e instanceof GateTimeoutError) return 'TIMEOUT';
  const name = nameOf(e);
  if (name === 'AbortError' || name === 'TimeoutError') return 'TIMEOUT'; // our deadline or the SDK's header timeout
  if (name === 'NoDeviceModelError') return 'DEVICE_UNAVAILABLE';
  if (name === 'QuotaExceededError') return 'DEVICE_INPUT_TOO_LARGE'; // Chrome: the prompt is too large for Nano
  if (isAiErrorLike(e)) {
    const status = statusOf(e);
    switch (e.code) {
      case 'fetch-error':
        return status === undefined ? 'CLOUD_NETWORK' : classifyStatus(status);
      case 'api-not-enabled':
        // Device: availability() said 'unavailable'. Cloud: HTTP 403 SERVICE_DISABLED (the AI Logic API is off in the
        // project), an operator error that a retry cannot fix.
        return status === undefined ? 'DEVICE_UNAVAILABLE' : 'CLOUD_BAD_REQUEST';
      case 'unsupported':
        return 'DEVICE_UNAVAILABLE';
      case 'response-error':
        return 'CLOUD_REFUSED'; // SAFETY, SPII, BLOCKLIST, PROHIBITED_CONTENT, RECITATION, promptFeedback.blockReason
      case 'session-closed':
        return 'DEVICE_BUSY';
      case 'parse-failed':
      case 'invalid-content':
        return 'PARSE_FAILED';
      case 'error':
        // The SDK wraps a failed fetch() (offline, DNS, CORS, the tripwire's throw) as code 'error'.
        if (/Error fetching from/.test(e.message)) return 'CLOUD_NETWORK';
        return ctx.deviceOnly ? 'DEVICE_FAILED' : 'CLOUD_SERVER';
      case 'already-initialized':
        return 'DEVICE_FAILED';
      default:
        // request-error, invalid-schema, no-api-key, no-app-id, no-model, no-project-id: configuration bugs.
        return ctx.deviceOnly ? 'DEVICE_FAILED' : 'CLOUD_BAD_REQUEST';
    }
  }
  if (name === 'InvalidStateError' || name === 'NotAllowedError') return ctx.deviceOnly ? 'DEVICE_BUSY' : 'CLOUD_SERVER';
  return ctx.deviceOnly ? 'DEVICE_FAILED' : 'CLOUD_SERVER';
}

// ---------- retries (ARCH §17 "Retry") ----------
/** Codes that are never retried: a refusal is never re-prompted (AC-303, Gemini API terms), and the rest cannot heal. */
// DEVICE_INPUT_TOO_LARGE: ARCH §17's "1 retry after trimming lists" belongs to ai/jobs.ts, which builds the lists; the
// gate cannot trim a rendered prompt, and resending it unchanged would fail again (D-131).
export const NEVER_RETRY: readonly GateErrorCode[] = ['CLOUD_REFUSED', 'CLOUD_DECLINED', 'CLOUD_AUTH', 'CLOUD_BAD_REQUEST',
  'BREACH', 'DEVICE_UNAVAILABLE', 'DEVICE_INPUT_TOO_LARGE', 'TEMPLATE_CANARY', 'CHECK_FAILED', 'INTERNAL', 'VAULT_UNAVAILABLE',
  'GROUNDING_OFF', 'ABORTED'];

/** The RetryPolicy budget a code draws on (codes of one family share it), or null when it is never retried. */
export function retryBucket(code: GateErrorCode): keyof RetryPolicy | null {
  if (NEVER_RETRY.includes(code)) return null;
  switch (code) {
    case 'DEVICE_BUSY': return 'busy';
    case 'DEVICE_FAILED':
    case 'PARSE_FAILED':
    case 'CLOUD_TRUNCATED': return 'parse';
    case 'CLOUD_QUOTA': return 'quota';
    case 'CLOUD_SERVER':
    case 'CLOUD_NETWORK':
    case 'TIMEOUT': return 'network';
    default: return null;
  }
}

/**
 * How many retries `code` gets under `policy` (at most 3 per family). `cloud`: the failed attempt went (or would have
 * gone) to the cloud; a device TIMEOUT is never retried (the AbortSignal does not reach the device; ARCH §17), a cloud
 * one at most once.
 */
export function retriesAllowed(code: GateErrorCode, policy: RetryPolicy, ctx: { cloud: boolean }): number {
  const bucket = retryBucket(code);
  if (bucket === null) return 0;
  const raw = policy[bucket];
  const n = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 3) : 0;
  if (code === 'TIMEOUT') return ctx.cloud ? Math.min(1, n) : 0;
  return n;
}

/** Delay before retry number `retry` (1-based), jittered ±20 % (ARCH §17: busy 1 s; quota 2 s then 6 s; network 2 s). */
export function retryDelayMs(code: GateErrorCode, retry: number, random: () => number = Math.random): number {
  let base: number;
  switch (code) {
    case 'DEVICE_BUSY': base = 1000; break;
    case 'CLOUD_QUOTA': base = retry <= 1 ? 2000 : 6000; break;
    case 'CLOUD_SERVER':
    case 'CLOUD_NETWORK':
    case 'TIMEOUT': base = 2000; break;
    default: return 0; // parse / truncated: resend the identical request at once
  }
  const r = random();
  const jitter = Number.isFinite(r) ? 0.8 + 0.4 * Math.min(1, Math.max(0, r)) : 1;
  return Math.round(base * jitter);
}

// ---------- user copy ----------
/**
 * What the user sees for a failed call (ARCH §17 "User sees"). HTTP 400 follows SPEC SCR-22 (`copy.err.cloudFailed`),
 * not ARCH §17's earlier `copy.adv.truncated` (F-128). CLOUD_AUTH from a failed anonymous sign-in uses
 * `copy.err.auth`; the gate passes that copy explicitly. Device failures return null: the caller shows its RULES-ONLY
 * badge (`copy.prescreen.rulesOnly`, `copy.ref.rules`, `copy.fix.rules`).
 */
export function errorCopy(code: GateErrorCode): StringId | null {
  switch (code) {
    case 'CLOUD_REFUSED':
    case 'CLOUD_DECLINED':
      return 'copy.adv.declined';
    case 'CLOUD_TRUNCATED':
    case 'PARSE_FAILED':
    case 'TIMEOUT':
      return 'copy.adv.truncated';
    case 'CLOUD_QUOTA':
      return 'copy.err.rateLimit';
    case 'CLOUD_AUTH':
      return 'copy.err.appCheck';
    case 'CLOUD_SERVER':
    case 'CLOUD_NETWORK':
      return 'copy.err.network';
    case 'BREACH':
      return 'copy.gate.tripwire';
    case 'CLOUD_BAD_REQUEST':
    case 'VAULT_UNAVAILABLE':
    case 'TEMPLATE_CANARY':
    case 'CHECK_FAILED':
    case 'INTERNAL':
      return 'copy.err.cloudFailed';
    default:
      return null;
  }
}

/**
 * The SCR-22 per-call banner a final failure reports through ui/systemStatus `report(…)` (after retries), if any. The
 * gate reports only failures WITHOUT a deterministic fallback (S3): an S2/S4 call that fell back to the device or the
 * template queued nothing and lost nothing (D-131).
 */
export function statusEventFor(code: GateErrorCode): 'rateLimit' | 'network' | 'cloudFailed' | null {
  switch (code) {
    case 'CLOUD_QUOTA': return 'rateLimit';
    case 'CLOUD_NETWORK':
    case 'CLOUD_SERVER': return 'network';
    case 'CLOUD_BAD_REQUEST': return 'cloudFailed';
    default: return null; // TIMEOUT included: "Lost connection. Your check is queued." would be untrue (D-131)
  }
}

/** ARCH §8.7 / SPEC §7.2: how each block reason is shown. */
export interface BlockCopy { copyId: StringId; surface: 'toast' | 'banner' | 'queue'; devError: boolean }
export function blockCopy(reason: GateBlockReason): BlockCopy {
  switch (reason) {
    case 'VAULT_TEXT_IN_IMAGE': return { copyId: 'copy.gate.blockedVaultText', surface: 'toast', devError: false };
    case 'FACE': return { copyId: 'copy.gate.blockedFace', surface: 'toast', devError: false };
    case 'EXIF':
    case 'BAD_MIME': return { copyId: 'copy.gate.blockedMetadata', surface: 'toast', devError: false };
    case 'VAULT_TEXT_IN_PROMPT':
    case 'PIN_IN_PROMPT': return { copyId: 'copy.gate.blockedPrompt', surface: 'toast', devError: false };
    case 'NO_CONSENT': return { copyId: 'copy.gate.blockedConsent', surface: 'toast', devError: false };
    case 'CLASS_FLOOR':
    case 'CLASS_MISMATCH':
    case 'NOT_SYNTHETIC': return { copyId: 'copy.gate.blockedClass', surface: 'toast', devError: true };
    case 'KILL_SWITCH': return { copyId: 'copy.err.killSwitch', surface: 'banner', devError: false };
    case 'DAILY_CAP': return { copyId: 'copy.err.dailyCap', surface: 'banner', devError: false };
    case 'OFFLINE': return { copyId: 'copy.queue.queued', surface: 'queue', devError: false };
    case 'TRIPWIRE': return { copyId: 'copy.gate.tripwire', surface: 'banner', devError: false };
    default: {
      const never: never = reason;
      throw new RangeError(`errors: no copy for block reason ${String(never)}`);
    }
  }
}
