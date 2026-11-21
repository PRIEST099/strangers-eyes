// web/src/ai/egressGate.ts: THE ONLY DOOR TO FIREBASE AI LOGIC (CLAUDE.md invariants 1–8; SPEC §6–§7; ARCH §8).
// Every model call, on the device or in the cloud, goes through gate(). It is the only file that calls the SDK's
// content methods (check-boundaries R1); ai/models.ts builds the models (R2) and never calls them.
//
// One call, in order (ARCH §8.2 as built, D-111..D-114, D-129..D-131):
//   0. SNAPSHOT: the request is copied and frozen before the first await; every check reads the copy and the parts
//      sent are built from the checked bytes only (D-129: a caller cannot swap text, images or the spec mid-call).
//   1. class and capability: the class the policy expects for the job (S4 for device jobs in Judge Mode), the spec,
//      prompt template and image count that fit it, the S4 sample proof, then the class rules: S0/S1 run only after a
//      FRESH availability() check in this call, else RULES-ONLY with no SDK call (AC-021); after a BREACH nothing
//      reaches the cloud until reload (AC-022); kill switch, offline, the S3 daily cap and minted consent; a fresh
//      ensureAuth() before every cloud-capable call (D-110).
//   2. image re-check of the EXACT outgoing bytes of every cloud-capable image: a strict JPEG structure (jpegStrict.ts:
//      JFIF + optional ICC only), no APP1/APP13/GPS, the consented hash (S3) or the bundled sample allowlist (S4), zero
//      faces at RC face_min_confidence, zero OCR hits of the ACTIVE vault (the fake vault in Judge Mode, D-37; S4 skips
//      the OCR check and the prompt scan: its allowlist replaces them).
//   3. prompt scan of every dynamic segment (and anything posing as template text): S2 hit → RECLASSIFIED S2→S0
//      (D-15, never sent); S3 hit → VAULT_TEXT_IN_PROMPT / PIN_IN_PROMPT; then S3 must be exactly the template.
//   4. execute under the interlock (D-75: one pre-fetch permit; device-only calls hold the tripwire's local lock),
//      single-flight on the device queue, with the gate's own deadline (AbortSignal + race; RequestOptions.timeout
//      only bounds the headers, API-NOTES §1.9). Before every permit: BREACH and kill switch re-read (D-129). Retries
//      re-enter the interlock; never after a refusal, and never a cloud parse/truncation retry (invariant 7).
//   5. route verify: a device-only call that reports in_cloud, or a tripwire LOCAL_LOCK during it, is a BREACH, and
//      a BREACH aborts every cloud call in flight.
//   6. parse, then the pass-B echo scan. 7. exactly ONE Ledger entry per call, pending → done (AC-210).
// Vault strings, pins and OCR text stay in this module's memory: the Ledger gets IDs, kinds, hashes and numbers only
// (AC-045); toasts get the matched text as a parameter, never persisted.
import type { Part } from 'firebase/ai';
import { InferenceMode } from 'firebase/ai';
import { ai, ensureAuth } from '../firebase/init';
import { cfg as liveCfg, type AppConfig } from '../firebase/remoteConfig';
import { floorViolations, JOB_NAMES, jobClass, PAYLOAD_CLASSES } from '../core/routing';
import type { ConsentToken, GateBlockReason, ImageFrame, JobName, OcrWord, PayloadClass, Route, VaultItem, VaultKind, WebMode } from '../core/types';
import { ledger as appLedger, type Ledger, type LedgerPatch } from '../core/ledger';
import { caps as appCaps, prefs as appPrefs } from '../core/localPrefs';
import { kindDisplay } from '../core/kinds';
import type { StringId } from '../core/strings';
import { availabilityNow as liveAvailabilityNow, type NanoIo, type NanoState } from './capabilities';
import { interlock as appInterlock, InterlockError, type Interlock } from './interlock';
import { deviceQueue as appDeviceQueue, type DeviceQueue } from './deviceQueue';
import { tripwire as appTripwire, type Permit, type TripRecord, type TripwireObservation } from './tripwire';
import {
  coordinatesNearPins, echoScan, scanText, TEMPLATE_CANARY, VAULT_UNAVAILABLE, vaultScan as appVaultScan, type AdvBFreeText,
  type PinHit, type PinRef, type TextHit,
} from './vaultScan';
import { matchWords, type Term, type WordHit } from '../tier0/fuzzy';
import { MANIFEST, PROMPT_IDS, placeholders, render, segmentsText, systemText, type PromptId, type PromptSegment } from './prompts';
import { ADV_B_SCHEMA } from './schemas';
import {
  adversaryAModel, adversaryBModel, cloudParamsFor, deviceJsonModel, deviceTextModel, explainModel, jpegPart, judgeJsonModel,
  NoDeviceModelError, textPart,
} from './models';
import {
  blockCopy, classifyError, GateBlocked, GateError, GateTimeoutError, retriesAllowed, retryBucket, retryDelayMs, statusEventFor,
  type GateErrorCode, type RetryPolicy,
} from './errors';
import { validateOutgoingJpeg } from './jpegStrict';
import { registerGateFactory } from './egressGate.testing';
import { checkCleanJpeg, type CleanCheck } from '../tier0/exif';
import { detectFaces } from '../tier0/faces';
import { ocrCanvas } from '../tier0/ocr';
import { decodeOriented, toCanvas } from '../tier0/decode';
import { systemStatus } from '../ui/systemStatus';

export type { PromptSegment } from './prompts';
export type { RetryPolicy } from './errors';

// ---------- the contract (ARCH §8.1) ----------
export interface OutgoingImage { jpeg: Blob; base64: string; sha256: string; frame: ImageFrame; mime: 'image/jpeg' }
/** S4 proof: the sample and the ACTIVE fake vault object itself (identity, never a copy; AC-023). */
export interface SyntheticProof { sampleId: string; vault: readonly VaultItem[] }
export type ModelSpec =
  | { kind: 'deviceJson'; io: NanoIo; schema: object }      // S0/S1
  | { kind: 'deviceText' }                                  // S0 (explain after a D-15 reclassification, or jobs.explain = S0)
  | { kind: 'judgeJson'; io: NanoIo; schema: object }       // S4 (cloud model + thinking from RC)
  | { kind: 'explain' }                                     // S2 or S4 (instructions in the user turn)
  | { kind: 'adversaryA'; system: string }                  // S3 (model + thinking from RC)
  | { kind: 'adversaryB'; system: string; schema: object }; // S3
export interface GroundingCapture { html?: string; queries: string[]; sources: { uri: string; title: string }[] }
export interface ParseMeta { finishReason?: string; grounding?: GroundingCapture; inferenceSource: 'on_device' | 'in_cloud' }
export interface GateRequest<T> {
  job: JobName;
  payloadClass: PayloadClass;
  sessionId: string;
  judge: { sampleId: string } | null;
  modelSpec: ModelSpec;
  /** A manifest prompt id of the job's family, e.g. 'nanoRef.v1'. `text` must be its render() output. */
  promptId: string;
  /** The user turn (prompts.render); device-capable jobs carry ALL instructions here. */
  text: PromptSegment[];
  images: OutgoingImage[];
  /** Streamed jobs (pass A, explain). Never called with text a device-only call got from the cloud. */
  onChunk?: (text: string, src: 'on_device' | 'in_cloud') => void;
  /**
   * Throws (e.g. ParseError) for invalid output. `meta.grounding` is given to pass A only, whose parse must be the
   * identity packaging for display: grounded output is never parsed, cached, persisted or fed to code (invariant 8).
   */
  parse: (raw: string, meta: ParseMeta) => T;
  /** REQUIRED for S0, S1, S2 and S4 (the deterministic / template path, RULES-ONLY); FORBIDDEN for S3. */
  deterministic?: () => T | Promise<T>;
  /** REQUIRED for S3: a token from mintConsent() (the consent sheet), never a literal. */
  consent?: ConsentToken;
  /** REQUIRED for S4. */
  synthetic?: SyntheticProof;
  /** Optional: may only LOWER the job's RC `timeouts_ms` (D-131). */
  timeoutMs?: number;
  /** Optional: defaults to ARCH §9.2's budgets for the job. */
  retry?: RetryPolicy;
  /** A model decline in a parsed value (pass B `audit_status: "declined"`, pass A `DECLINED:`): never retried (AC-303). */
  isDeclined?: (value: T) => boolean;
  /** Cancels the call while it waits (interlock, device queue) or runs: GateError ABORTED. */
  signal?: AbortSignal;
}
export interface GateResult<T> {
  value: T;
  route: Route;
  /** The class the call finally ran as (S0 after RECLASSIFIED S2→S0). */
  payloadClass: PayloadClass;
  inferenceSource?: 'on_device' | 'in_cloud';
  latencyMs: number;
  ledgerId: string;
  grounding?: GroundingCapture;
  finishReason?: string;
  notes: string[];
  /** Time spent in the image re-check (AC-046 is measured in the browser; this is the number to log). */
  checksMs?: number;
}

/** The modes the gate runs a call in (PREFER_IN_CLOUD from RC runs as ONLY_IN_CLOUD, D-113). */
export type GateMode = 'ONLY_ON_DEVICE' | 'PREFER_ON_DEVICE' | 'ONLY_IN_CLOUD';

/** ARCH §9.2 retry budgets per job, used when the caller passes none. Cloud parse/truncation is never retried. */
export const DEFAULT_RETRY: Readonly<Record<JobName, RetryPolicy>> = Object.freeze({
  preScreen: { busy: 2, parse: 1, quota: 0, network: 0 },
  vaultTextMatch: { busy: 2, parse: 1, quota: 0, network: 0 },
  referee: { busy: 2, parse: 1, quota: 0, network: 0 },
  fixPlan: { busy: 2, parse: 1, quota: 0, network: 0 },
  explain: { busy: 0, parse: 0, quota: 0, network: 1 },
  adversaryA: { busy: 0, parse: 0, quota: 2, network: 1 },
  adversaryB: { busy: 0, parse: 0, quota: 2, network: 1 },
});

/** Which spec fits which class (ARCH §8.1). */
const SPEC_CLASSES: Readonly<Record<ModelSpec['kind'], readonly PayloadClass[]>> = {
  deviceJson: ['S0', 'S1'], deviceText: ['S0'], judgeJson: ['S4'], explain: ['S2', 'S4'], adversaryA: ['S3'], adversaryB: ['S3'],
};
/** Which spec fits which job. */
const SPEC_JOBS: Readonly<Record<ModelSpec['kind'], readonly JobName[]>> = {
  deviceJson: ['preScreen', 'vaultTextMatch', 'referee', 'fixPlan'],
  deviceText: ['explain'],
  judgeJson: ['preScreen', 'vaultTextMatch', 'referee', 'fixPlan'],
  explain: ['explain'],
  adversaryA: ['adversaryA'],
  adversaryB: ['adversaryB'],
};
/** The prompt family each job renders. */
const JOB_FAMILY: Readonly<Record<JobName, string>> = {
  preScreen: 'nanoPre', vaultTextMatch: 'nanoVaultText', referee: 'nanoRef', fixPlan: 'nanoFix', explain: 'explain',
  adversaryA: 'advA', adversaryB: 'advB',
};

export function specFitsClass(spec: ModelSpec, cls: PayloadClass): boolean {
  return !!spec && Object.hasOwn(SPEC_CLASSES, spec.kind) && SPEC_CLASSES[spec.kind].includes(cls);
}
export function specFitsJob(spec: ModelSpec, job: JobName): boolean {
  return !!spec && Object.hasOwn(SPEC_JOBS, spec.kind) && SPEC_JOBS[spec.kind].includes(job);
}
/** Images a spec takes: one for image io and the adversary, none otherwise. */
export function imagesFor(spec: ModelSpec): number {
  switch (spec.kind) {
    case 'deviceJson':
    case 'judgeJson': return spec.io === 'image' ? 1 : 0;
    case 'adversaryA':
    case 'adversaryB': return 1;
    default: return 0;
  }
}
const ioOf = (spec: ModelSpec): NanoIo => ((spec.kind === 'deviceJson' || spec.kind === 'judgeJson') && spec.io === 'image' ? 'image' : 'text');

// ---------- prompt templates ----------
interface TemplateCheck { ok: boolean; suspects: PromptSegment[] }
const templateCache = new Map<string, PromptSegment[]>();
/** The template's segment structure: render() with every variable blank (a `_JSON` variable renders as `null`). */
function templateOf(id: PromptId): PromptSegment[] {
  let t = templateCache.get(id);
  if (!t) {
    t = render(id, Object.fromEntries(placeholders(id).map((n) => [n, n.endsWith('_JSON') ? null : ''])));
    templateCache.set(id, t);
  }
  return t;
}
const isPromptId = (id: unknown): id is PromptId => typeof id === 'string' && (PROMPT_IDS as readonly string[]).includes(id)
  && Object.hasOwn(MANIFEST.prompts, id);
/**
 * Is `segs` exactly render(id, …)'s structure: the same static text, verbatim, with dynamic values in the same places?
 * `suspects` = what the prompt scan must read: every dynamic segment, and any "static" segment that is not template text
 * (a caller that flags a value as static cannot hide it from the scan).
 */
export function templateCheck(id: string, segs: readonly PromptSegment[]): TemplateCheck {
  const wellFormed = Array.isArray(segs) && segs.every((s) => s !== null && typeof s === 'object' && typeof s.text === 'string' && typeof s.dynamic === 'boolean');
  if (!wellFormed) return { ok: false, suspects: [] };
  if (!isPromptId(id)) return { ok: false, suspects: [...segs] };
  const tpl = templateOf(id);
  const statics = new Set(tpl.filter((s) => !s.dynamic).map((s) => s.text));
  const suspects = segs.filter((s) => s.dynamic || !statics.has(s.text));
  const ok = segs.length === tpl.length && segs.every((s, i) => s.dynamic === tpl[i].dynamic && (s.dynamic || s.text === tpl[i].text));
  return { ok, suspects };
}

/** Prompt id of the job's family; S3's system instruction (and pass B's schema) must be the registered template's. */
function promptFits<T>(req: GateRequest<T>): boolean {
  if (!isPromptId(req.promptId) || req.promptId.split('.')[0] !== JOB_FAMILY[req.job]) return false;
  const spec = req.modelSpec;
  if (spec.kind === 'adversaryA' || spec.kind === 'adversaryB') {
    let sys: string;
    try { sys = systemText(req.promptId); } catch { return false; }
    if (spec.system !== sys) return false;
    if (spec.kind === 'adversaryB' && JSON.stringify(spec.schema) !== JSON.stringify(ADV_B_SCHEMA)) return false;
  }
  return true;
}

// ---------- consent (D-129): only tokens minted here are accepted ----------
const mintedConsents = new WeakSet<object>();
const SHA256_HEX = /^[0-9a-f]{64}$/;
/**
 * The consent sheet (SCR-07, T-069) mints the token for the exact image the user approved. The gate accepts only tokens
 * minted by this function in this page (membership, not shape), still within CONSENT_TTL_MS and for the same session.
 * `issuedAt` may be given only to backdate (tests); a future time is clamped to now.
 */
export function mintConsent(t: { sha256: string; sessionId: string }, issuedAt: number = Date.now()): ConsentToken {
  if (!t || typeof t.sha256 !== 'string' || !SHA256_HEX.test(t.sha256) || typeof t.sessionId !== 'string' || t.sessionId === '') {
    throw new TypeError('mintConsent: a lowercase sha256 hex digest and a session id are required');
  }
  const tok: ConsentToken = Object.freeze({ sha256: t.sha256, sessionId: t.sessionId, issuedAt: Math.min(Number(issuedAt) || 0, Date.now()) });
  mintedConsents.add(tok);
  return tok;
}

// ---------- the SDK surface the gate calls ----------
interface GroundingMetadataLike {
  searchEntryPoint?: { renderedContent?: string };
  webSearchQueries?: readonly string[];
  groundingChunks?: readonly { web?: { uri?: string; title?: string } }[];
}
export interface GateResponse {
  text(): string;
  inferenceSource?: string;
  candidates?: readonly { finishReason?: string; groundingMetadata?: GroundingMetadataLike }[];
}
export interface GateCallOptions { signal: AbortSignal; timeout: number }
/** The two GenerativeModel methods the gate uses (the SDK's GenerativeModel satisfies it; tests pass fakes). */
export interface GateModel {
  generateContent(request: Part[], options?: GateCallOptions): Promise<{ response: GateResponse }>;
  generateContentStream(request: Part[], options?: GateCallOptions): Promise<{ stream: AsyncIterable<GateResponse>; response: Promise<GateResponse> }>;
}

// ---------- dependencies (all injectable through egressGate.testing.ts for the unit tests) ----------
export interface GateVault {
  readonly ready: Promise<void>;
  mode(): 'unset' | 'real' | 'judge';
  activeTerms(): readonly Term[];
  activePins(): readonly PinRef[];
  judgeVault(): readonly VaultItem[] | null;
  threshold(): number;
  refresh(): Promise<void>;
}
export type CheckBitmap = object;
export interface ImageChecks {
  checkClean(jpeg: Blob): Promise<CleanCheck>;
  /** The outgoing JPEG decoded at ITS OWN size (never rescaled; D-30, AC-134). */
  decode(bytes: Uint8Array<ArrayBuffer>): Promise<CheckBitmap>;
  faces(bitmap: CheckBitmap, minConfidence: number): Promise<readonly unknown[]>;
  ocr(bitmap: CheckBitmap): Promise<readonly OcrWord[]>;
  release?(bitmap: CheckBitmap): void;
}
export interface SampleHashes { readonly imageSha256: string; readonly nano768Sha256: string }
/** The bundled Judge-Mode sample allowlist: read-only lookups. */
export interface SampleAllowlist { get(sampleId: string): SampleHashes | undefined }
export interface GateNotice {
  kind: 'toast' | 'banner' | 'queue' | 'note';
  copyId: StringId;
  /** {TEXT} (OCR text as read), {KIND}, {cap}: memory only, never logged or stored. */
  params?: Record<string, string>;
  reason?: GateBlockReason;
  devError?: boolean;
  job: JobName;
  ledgerId: string;
}
export interface GateStatus {
  markTripwire(): void;
  report(event: 'rateLimit' | 'network' | 'cloudFailed'): void;
  set(patch: { appCheckFailed?: boolean; authFailed?: boolean }): void;
}
export interface GateDeps {
  cfg: () => AppConfig;
  vault: GateVault;
  /**
   * Is the active index built from the latest committed vault (D-80 generation check)? Asked before every permit;
   * false → refresh, wait for the index and re-run the image and prompt checks. Absent until the vault store keeps a
   * generation counter (open item).
   */
  vaultFresh?: () => Promise<boolean>;
  availabilityNow: (io: NanoIo) => Promise<NanoState>;
  prefs: { nanoEnabled(): boolean; simulateNoNano(): boolean };
  caps: { usedToday(): number; increment(): number };
  /** navigator.onLine ∧ ¬simulateOffline (the gate adds its own "last request failed with a network error"). */
  online: () => boolean;
  ensureAuth: () => Promise<string | null>;
  interlock: Pick<Interlock, 'enterLocal' | 'enterCloud' | 'exit'>;
  tripwire: { grantCloud(p: Permit): void; lastTrip(): TripRecord | null; observe(fn: (o: TripwireObservation) => void): () => void };
  deviceQueue: Pick<DeviceQueue, 'run'>;
  buildModel: (spec: ModelSpec, mode: GateMode, config: AppConfig, job: JobName) => GateModel;
  ledger: Ledger;
  status: GateStatus;
  notify: (n: GateNotice) => void;
  /** Judge Mode's sample allowlist (the bundled samples/manifest.json, loaded once and frozen), or null. */
  samples: () => Promise<SampleAllowlist | null>;
  images: ImageChecks;
  sha256Hex: (bytes: Uint8Array<ArrayBuffer>) => Promise<string>;
  /** Epoch ms (consent age, Ledger timestamps). */
  now: () => number;
  /** Monotonic ms, the tripwire's clock (performance.now): latency and trip attribution. */
  clock: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  /** Defaults: 5 s (SPEC §7.1 step 4), 5 s, 2 s. */
  authTimeoutMs?: number;
  vaultReadyTimeoutMs?: number;
  /** After a device timeout, the device slot stays held up to this long for Nano to settle (D-131). */
  deviceGraceMs?: number;
}

/** ConsentToken TTL (SPEC §7.1 step 4: more than 10 min old is expired). */
export const CONSENT_TTL_MS = 10 * 60_000;
/** A consent "issued" this far in the future is refused (a clock that jumped). */
export const CONSENT_SKEW_MS = 5_000;
export const AUTH_TIMEOUT_MS = 5_000;
export const VAULT_READY_TIMEOUT_MS = 5_000;
export const DEVICE_GRACE_MS = 2_000;
/** After a cloud request fails with a network error, cloud-capable calls take the offline path this long (ARCH §8.2 online()). */
export const NETWORK_ERROR_HOLD_MS = 15_000;

export interface GateState { readonly compromised: boolean }
export interface EgressGate {
  gate<T>(req: GateRequest<T>): Promise<GateResult<T>>;
  state(): GateState;
  dispose(): void;
}

// ---------- small helpers ----------
const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new GateTimeoutError(ms)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e: unknown) => { clearTimeout(t); reject(e); });
  });
}
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
function decodeBase64(s: unknown): Uint8Array<ArrayBuffer> | null {
  if (typeof s !== 'string' || s.length === 0 || s.length % 4 !== 0 || !B64.test(s)) return null;
  let bin: string;
  try { bin = atob(s); } catch { return null; }
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function encodeBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
const equalBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
const srcOf = (s: unknown): 'on_device' | 'in_cloud' => (s === 'on_device' ? 'on_device' : 'in_cloud'); // SDK default: in_cloud
const finishOf = (r: GateResponse): string | undefined => r.candidates?.[0]?.finishReason;
/** Rejects with CallerAbort as soon as `sig` fires (a call queued behind a device call leaves the wait at once; the
 *  queued function itself sees the abort when its turn comes and returns without building a model). */
function untilAborted<X>(p: Promise<X>, sig: AbortSignal | undefined): Promise<X> {
  if (!sig) return p;
  return new Promise<X>((resolve, reject) => {
    const on = () => reject(new CallerAbort());
    if (sig.aborted) on();
    sig.addEventListener('abort', on, { once: true });
    p.then((v) => { sig.removeEventListener('abort', on); resolve(v); }, (e: unknown) => { sig.removeEventListener('abort', on); reject(e); });
  });
}
const nameOf = (e: unknown): string => (e instanceof Error ? e.name : typeof e);
function captureGrounding(gm: GroundingMetadataLike | undefined): GroundingCapture | undefined {
  if (!gm) return undefined;
  const g: GroundingCapture = {
    queries: [...(gm.webSearchQueries ?? [])].filter((q): q is string => typeof q === 'string'),
    sources: (gm.groundingChunks ?? []).flatMap((c) => (c.web?.uri ? [{ uri: c.web.uri, title: c.web.title ?? '' }] : [])),
  };
  const html = gm.searchEntryPoint?.renderedContent;
  if (typeof html === 'string') g.html = html;
  return g;
}
const isAdvBShape = (v: unknown): v is AdvBFreeText & object => typeof v === 'object' && v !== null
  && Array.isArray((v as AdvBFreeText).clues) && Array.isArray((v as AdvBFreeText).hypotheses) && Array.isArray((v as AdvBFreeText).inferences);
/** The OCR words a hit covers, as read (the toast's {TEXT}). */
function spanText(words: readonly OcrWord[], hit: WordHit): string {
  const s = hit.spans[0];
  return s ? words.slice(s[0], s[1] + 1).map((w) => w.text).join(' ') : '';
}
function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

/**
 * D-129: copy the request once, synchronously, before any await. Every property is read exactly once (a getter cannot
 * answer differently later), plain data is deep-copied and frozen, and the spec goes through JSON (no getters, no
 * prototypes). The fake vault keeps its identity (AC-023 compares it). A request that cannot be copied throws.
 */
function snapshot<T>(req: GateRequest<T>): { r: GateRequest<T>; consentMinted: boolean } {
  // Re-verification R5: copy with an index loop, never the caller's own (possibly Proxy-overridden) .map, and keep
  // only primitive strings, so nothing the checks read can change before the send.
  const copyEach = <U>(xs: unknown, f: (x: unknown) => U): U[] | null => {
    if (!Array.isArray(xs)) return null;
    const n = Number(xs.length);
    const out: U[] = [];
    for (let i = 0; i < n; i++) out.push(f(xs[i]));
    return out;
  };
  const str = (v: unknown): unknown => (typeof v === 'string' ? String(v) : v === undefined ? undefined : null);
  const textIn = req.text as unknown;
  const text = copyEach(textIn, (s) => {
    const o = (s ?? {}) as { text?: unknown; dynamic?: unknown };
    const t = str(o.text);
    const d = o.dynamic;
    return Object.freeze({ text: t, dynamic: d }) as PromptSegment;
  }) ?? (textIn as PromptSegment[]);
  const imagesIn = req.images as unknown;
  const images = copyEach(imagesIn, (img) => {
    const o = (img ?? {}) as Partial<OutgoingImage>;
    const jpeg = o.jpeg;
    const base64 = str(o.base64) as string;
    const sha256 = str(o.sha256) as string;
    const mime = str(o.mime) as OutgoingImage['mime'];
    const frame = o.frame ? deepFreeze(JSON.parse(JSON.stringify(o.frame)) as ImageFrame) : (o.frame as unknown as ImageFrame);
    return Object.freeze({ jpeg, base64, sha256, mime, frame }) as OutgoingImage;
  }) ?? (imagesIn as OutgoingImage[]);
  const specIn = req.modelSpec as unknown;
  const modelSpec = (specIn && typeof specIn === 'object' ? deepFreeze(JSON.parse(JSON.stringify(specIn))) : specIn) as ModelSpec;
  const consentIn = req.consent;
  const consent = consentIn && typeof consentIn === 'object'
    ? Object.freeze({ sha256: consentIn.sha256, sessionId: consentIn.sessionId, issuedAt: consentIn.issuedAt }) : undefined;
  const syntheticIn = req.synthetic;
  const synthetic = syntheticIn && typeof syntheticIn === 'object' ? Object.freeze({ sampleId: syntheticIn.sampleId, vault: syntheticIn.vault }) : undefined;
  const judgeIn = req.judge;
  const judge = judgeIn && typeof judgeIn === 'object' ? Object.freeze({ sampleId: judgeIn.sampleId }) : null;
  const retryIn = req.retry;
  const retry = retryIn && typeof retryIn === 'object'
    ? Object.freeze({ busy: retryIn.busy, parse: retryIn.parse, quota: retryIn.quota, network: retryIn.network }) : undefined;
  const r: GateRequest<T> = {
    job: req.job, payloadClass: req.payloadClass, sessionId: req.sessionId, judge, modelSpec, promptId: req.promptId,
    text: Object.freeze(text) as PromptSegment[], images: Object.freeze(images) as OutgoingImage[], parse: req.parse,
  };
  const onChunk = req.onChunk; if (onChunk !== undefined) r.onChunk = onChunk;
  const deterministic = req.deterministic; if (deterministic !== undefined) r.deterministic = deterministic;
  if (consent) r.consent = consent;
  if (synthetic) r.synthetic = synthetic;
  const timeoutMs = req.timeoutMs; if (timeoutMs !== undefined) r.timeoutMs = timeoutMs;
  if (retry) r.retry = retry;
  const isDeclined = req.isDeclined; if (isDeclined !== undefined) r.isDeclined = isDeclined;
  const signal = req.signal; if (signal !== undefined) r.signal = signal;
  return { r: Object.freeze(r), consentMinted: !!consentIn && mintedConsents.has(consentIn) };
}

interface RawResult { text: string; inferenceSource: 'on_device' | 'in_cloud'; finishReason?: string; grounding?: GroundingCapture }
interface Digest { bytes: Uint8Array<ArrayBuffer>; sha: string; consistent: boolean }
type DigestResult = { ok: true; d: Digest } | { ok: false; why: 'bad_base64' | 'check_failed' };
interface Snapshot { terms: readonly Term[]; pins: readonly PinRef[]; theta: number }
type PreSend = { kind: 'ok' } | { kind: 'block'; reason: GateBlockReason; hit?: { vaultId: string; kind: VaultKind }; text?: string }
  | { kind: 'error'; code: GateErrorCode } | { kind: 'reclassify'; hit: { vaultId: string; kind: VaultKind } };

interface Call<T> {
  req: GateRequest<T>;
  consentMinted: boolean;
  id: string;
  t0: number;
  config: AppConfig;
  cls: PayloadClass;
  judge: boolean;
  notes: string[];
  committed: boolean;
  mode: GateMode | null;
  deviceVerified: boolean;
  digests: Map<OutgoingImage, DigestResult>;
  checksMs?: number;
  snap: Snapshot;
  tpl: TemplateCheck;
}

interface Internal { reuseLedgerId?: string; notes?: string[]; t0?: number }

/** One call's outcome, thrown internally to unwind to gate() (never escapes this module). */
class Done<T> { readonly result: GateResult<T>; constructor(result: GateResult<T>) { this.result = result; } }
/** Internal signals raised inside an attempt and handled after the interlock is released. */
class BreachAbort extends Error { constructor() { super('gate: aborted by a BREACH'); this.name = 'BreachAbort'; } }
class KillSwitchNow extends Error { constructor() { super('gate: kill switch'); this.name = 'KillSwitchNow'; } }
class CallerAbort extends Error { constructor() { super('gate: aborted by the caller'); this.name = 'CallerAbort'; } }

// ---------- the gate ----------
function createGate(deps: GateDeps): EgressGate {
  const state = { compromised: false };
  /** Sessions and images whose adversary refused or declined: no re-attack (CLAUDE.md invariant 7, AC-303). Page lifetime. */
  const refusedSessions = new Set<string>();
  const refusedImages = new Set<string>();
  /** Every cloud attempt in flight: a BREACH aborts them all (D-129). */
  const liveCloud = new Set<AbortController>();
  let networkErrorAt = Number.NEGATIVE_INFINITY;
  /** Request bytes the tripwire saw per live call (permit id = Ledger id). */
  const bytesById = new Map<string, number>();
  const stopObserving = deps.tripwire.observe((o) => {
    const b = bytesById.get(o.permitId);
    if (b !== undefined) bytesById.set(o.permitId, b + o.bytes);
  });
  const authTimeoutMs = deps.authTimeoutMs ?? AUTH_TIMEOUT_MS;
  const vaultTimeoutMs = deps.vaultReadyTimeoutMs ?? VAULT_READY_TIMEOUT_MS;
  const deviceGraceMs = deps.deviceGraceMs ?? DEVICE_GRACE_MS;

  const online = () => deps.online() && deps.clock() - networkErrorAt >= NETWORK_ERROR_HOLD_MS;
  // D-117: prefs.nanoEnabled() already folds in the simulation; simulateNoNano() is asked first for the right note.
  const nanoOff = (): string | null => (deps.prefs.simulateNoNano() ? 'simulated' : !deps.prefs.nanoEnabled() ? 'Nano off' : null);
  const unavailableNote = (s: NanoState) => (s === 'downloading' || s === 'downloadable' ? 'fallback: model downloading' : 'fallback: no on-device model');
  const bytesOf = <T>(c: Call<T>) => bytesById.get(c.id) ?? 0;
  const latency = <T>(c: Call<T>) => Math.max(0, Math.round(deps.clock() - c.t0));
  const cloudModel = <T>(c: Call<T>) => {
    try { return cloudParamsFor(c.config, c.req.job).model; } catch { return 'cloud'; }
  };
  const hasRules = <T>(c: Call<T>) => typeof c.req.deterministic === 'function';
  const aborted = <T>(c: Call<T>) => c.req.signal?.aborted === true;

  function commit<T>(c: Call<T>, patch: LedgerPatch): void {
    if (c.committed) throw new Error('egressGate: a call committed its Ledger entry twice');
    c.committed = true;
    deps.ledger.commit(c.id, { payloadClass: c.cls, latencyMs: latency(c), ...patch });
  }

  function notify<T>(c: Call<T>, n: Omit<GateNotice, 'job' | 'ledgerId'>): void {
    try { deps.notify({ ...n, job: c.req.job, ledgerId: c.id }); } catch { /* a UI listener never breaks the gate */ }
  }

  // ----- outcomes -----
  function block<T>(c: Call<T>, reason: GateBlockReason, hit?: { vaultId: string; kind: VaultKind }, extra: { text?: string; error?: GateErrorCode; note?: string } = {}): never {
    const bc = blockCopy(reason);
    const notes = extra.note ? [...c.notes, extra.note] : [...c.notes];
    commit(c, {
      route: 'BLOCKED', mode: c.mode ?? c.config.routingPolicy.classes[c.cls]?.web ?? 'RULES', model: 'none', bytesOut: bytesOf(c), imagesOut: 0, notes,
      blocked: { reason, ...(hit ? { vaultId: hit.vaultId, vaultKind: hit.kind } : {}) },
      ...(extra.error ? { error: extra.error } : {}),
    });
    const params: Record<string, string> = {};
    if (reason === 'VAULT_TEXT_IN_IMAGE') params.TEXT = extra.text ?? '';
    if ((reason === 'VAULT_TEXT_IN_PROMPT' || reason === 'PIN_IN_PROMPT') && hit) {
      params.KIND = kindDisplay(hit.kind, c.snap.pins.find((p) => p.vaultId === hit.vaultId)?.label);
    }
    if (reason === 'DAILY_CAP') params.cap = String(c.config.dailyAdversaryCap);
    if (reason === 'TRIPWIRE') deps.status.markTripwire();
    notify(c, { kind: bc.surface, copyId: bc.copyId, reason, devError: bc.devError, ...(Object.keys(params).length ? { params } : {}) });
    throw new GateBlocked(reason, c.id, hit ? { vaultId: hit.vaultId, vaultKind: hit.kind } : undefined);
  }

  async function rules<T>(c: Call<T>, note: string, error?: GateErrorCode): Promise<never> {
    const fn = c.req.deterministic;
    if (typeof fn !== 'function') throw new Error('egressGate: RULES-ONLY without a deterministic path'); // guarded in step 1
    const value = await fn();
    const bytes = bytesOf(c);
    const notes = [...c.notes, note];
    commit(c, { route: 'RULES_ONLY', mode: 'RULES', model: 'rules', bytesOut: bytes, imagesOut: bytes > 0 ? c.req.images.length : 0, notes, ...(error ? { error } : {}) });
    throw new Done<T>({ value, route: 'RULES_ONLY', payloadClass: c.cls, latencyMs: latency(c), ledgerId: c.id, notes, ...(c.checksMs !== undefined ? { checksMs: c.checksMs } : {}) });
  }

  /** A final failure without a deterministic path (S3), or a caller abort: the entry records the route tried and the error. */
  function fail<T>(c: Call<T>, code: GateErrorCode, opts: { note?: string; copyId?: StringId | null } = {}): never {
    const bytes = bytesOf(c);
    const notes = opts.note ? [...c.notes, opts.note] : [...c.notes];
    const route: Route = c.mode === 'ONLY_ON_DEVICE' ? 'ON_DEVICE' : 'IN_CLOUD';
    commit(c, { route, mode: c.mode ?? 'ONLY_IN_CLOUD', model: route === 'ON_DEVICE' ? 'gemini-nano' : cloudModel(c), bytesOut: bytes, imagesOut: bytes > 0 ? c.req.images.length : 0, notes, error: code });
    throw new GateError(code, { ledgerId: c.id, ...(opts.copyId !== undefined ? { copyId: opts.copyId } : {}) });
  }

  /** S2/S4 may use the device or the deterministic path; S3 fails (or is blocked). */
  async function failOrRules<T>(c: Call<T>, code: GateErrorCode, note: string, opts: { copyId?: StringId } = {}): Promise<never> {
    if (hasRules(c)) return rules(c, note, code);
    return fail(c, code, { note, ...opts });
  }

  /** After a BREACH (here or in another call): S3 BLOCKED TRIPWIRE, the rest RULES_ONLY. */
  async function afterBreach<T>(c: Call<T>): Promise<never> {
    if (hasRules(c)) return rules(c, 'tripwire');
    return block(c, 'TRIPWIRE');
  }

  /** AD-31 / AC-022: compromised for the page's life; every cloud call in flight aborted; ONE BLOCKED TRIPWIRE entry. */
  async function breach<T>(c: Call<T>, note: string): Promise<never> {
    state.compromised = true;
    for (const ctrl of [...liveCloud]) { try { ctrl.abort(new BreachAbort()); } catch { /* ignore */ } }
    deps.status.markTripwire();
    const notes = [...c.notes, note, '+rules'];
    commit(c, { route: 'BLOCKED', mode: c.mode ?? 'ONLY_ON_DEVICE', model: 'none', bytesOut: bytesOf(c), imagesOut: 0, notes, blocked: { reason: 'TRIPWIRE' }, error: 'BREACH' });
    notify(c, { kind: 'banner', copyId: 'copy.gate.tripwire', reason: 'TRIPWIRE', devError: false });
    const fn = c.req.deterministic;
    if (typeof fn !== 'function') throw new GateError('BREACH', { ledgerId: c.id });
    const value = await fn();
    throw new Done<T>({ value, route: 'RULES_ONLY', payloadClass: c.cls, latencyMs: latency(c), ledgerId: c.id, notes: ['tripwire', ...notes] });
  }

  /** D-15: an S2 payload with a vault string or pin coordinates runs as S0 (device) or the template; never sent. */
  async function reclassify<T>(c: Call<T>): Promise<never> {
    c.notes.push('RECLASSIFIED S2→S0');
    notify(c, { kind: 'note', copyId: 'copy.gate.reclassified', devError: false });
    if (!nanoOff() && !state.compromised && (await deps.availabilityNow('text')) === 'available') {
      c.committed = true; // the S0 call completes THIS entry (opts.reuseLedgerId): still one entry per call
      const result = await run<T>({ ...c.req, payloadClass: 'S0', modelSpec: { kind: 'deviceText' } }, { reuseLedgerId: c.id, notes: c.notes, t0: c.t0 });
      throw new Done<T>(result);
    }
    return rules(c, 'reclassified');
  }

  // ----- images -----
  async function digest<T>(c: Call<T>, img: OutgoingImage): Promise<DigestResult> {
    const cached = c.digests.get(img);
    if (cached) return cached;
    let r: DigestResult;
    const bytes = decodeBase64(img.base64);
    if (!bytes) r = { ok: false, why: 'bad_base64' };
    else {
      try {
        const sha = await deps.sha256Hex(bytes);
        let blobBytes: Uint8Array | null = null;
        try { blobBytes = new Uint8Array(await img.jpeg.arrayBuffer()); } catch { blobBytes = null; }
        r = { ok: true, d: { bytes, sha, consistent: blobBytes !== null && equalBytes(bytes, blobBytes) && sha === img.sha256 } };
      } catch {
        r = { ok: false, why: 'check_failed' };
      }
    }
    c.digests.set(img, r);
    return r;
  }

  /** AC-023: Judge Mode on, the sample in the bundled allowlist, the ACTIVE fake vault by identity, every image a sample hash. */
  async function syntheticOk<T>(c: Call<T>): Promise<boolean> {
    const { req } = c;
    const proof = req.synthetic;
    if (!req.judge || !proof || typeof proof.sampleId !== 'string' || proof.sampleId !== req.judge.sampleId) return false;
    if (deps.vault.mode() !== 'judge') return false;
    const jv = deps.vault.judgeVault();
    if (jv === null || proof.vault !== jv) return false;
    let allow: SampleAllowlist | null = null;
    try { allow = await deps.samples(); } catch { allow = null; }
    const s = allow?.get(proof.sampleId);
    if (!s) return false;
    for (const img of req.images) {
      const r = await digest(c, img);
      if (!r.ok || !r.d.consistent || (r.d.sha !== s.imageSha256 && r.d.sha !== s.nano768Sha256)) return false;
    }
    return true;
  }

  function consentOk<T>(c: Call<T>): boolean {
    const t = c.req.consent;
    if (!c.consentMinted || !t || typeof t.sha256 !== 'string' || typeof t.issuedAt !== 'number') return false;
    if (t.sessionId !== c.req.sessionId) return false;
    const now = deps.now();
    return t.issuedAt <= now + CONSENT_SKEW_MS && now - t.issuedAt <= CONSENT_TTL_MS;
  }

  /** ARCH §8.2 step 2 on the bytes the SDK will send (base64), which must also be the Blob shown and the hash recorded. */
  async function recheckImages<T>(c: Call<T>): Promise<PreSend> {
    const { req, cls } = c;
    for (const img of req.images) {
      if (!img || img.mime !== 'image/jpeg') return { kind: 'block', reason: 'BAD_MIME' };
      const r = await digest(c, img);
      if (!r.ok) return r.why === 'bad_base64' ? { kind: 'block', reason: 'BAD_MIME' } : { kind: 'error', code: 'CHECK_FAILED' };
      const { bytes, sha, consistent } = r.d;
      if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return { kind: 'block', reason: 'BAD_MIME' };
      if (!consistent) return { kind: 'block', reason: cls === 'S3' ? 'NO_CONSENT' : cls === 'S4' ? 'NOT_SYNTHETIC' : 'CLASS_MISMATCH' };
      // D-130: only what a canvas encoder writes (JFIF, one ICC profile, tables, frame, scans); anything else is metadata.
      if (!validateOutgoingJpeg(bytes).ok) return { kind: 'block', reason: 'EXIF' };
      let clean: CleanCheck;
      try { clean = await deps.images.checkClean(new Blob([bytes], { type: 'image/jpeg' })); } catch { return { kind: 'block', reason: 'EXIF' }; }
      if (!clean.clean) return { kind: 'block', reason: 'EXIF' };
      if (cls === 'S3' && sha !== req.consent?.sha256) return { kind: 'block', reason: 'NO_CONSENT' };
      let bmp: CheckBitmap;
      try { bmp = await deps.images.decode(bytes); } catch { return { kind: 'error', code: 'CHECK_FAILED' }; }
      try {
        let faces: readonly unknown[];
        try { faces = await deps.images.faces(bmp, c.config.faceMinConfidence); } catch { return { kind: 'error', code: 'CHECK_FAILED' }; }
        if (faces.length > 0) return { kind: 'block', reason: 'FACE' };
        if (cls !== 'S4') { // S4: the sample allowlist replaces the vault-text check (SPEC §7.1 step 5)
          let words: readonly OcrWord[];
          try { words = await deps.images.ocr(bmp); } catch { return { kind: 'error', code: 'CHECK_FAILED' }; }
          const hits = matchWords(words, c.snap.terms, c.snap.theta, 'image');
          const h = hits[0];
          if (h) return { kind: 'block', reason: 'VAULT_TEXT_IN_IMAGE', hit: { vaultId: h.term.vaultId, kind: h.term.kind }, text: spanText(words, h) };
        }
      } finally {
        try { deps.images.release?.(bmp); } catch { /* best effort */ }
      }
    }
    return { kind: 'ok' };
  }

  /** ARCH §8.2 step 3 (S2 and S3; S0/S1 never reach it; S4 is never scanned: its allowlist replaces it, D-37). */
  function promptScan<T>(c: Call<T>): PreSend {
    if (c.cls !== 'S2' && c.cls !== 'S3') return { kind: 'ok' };
    for (const seg of c.tpl.suspects) {
      const hit: TextHit | PinHit | null = scanText(seg.text, c.snap.terms, c.snap.theta) ?? coordinatesNearPins(seg.text, c.snap.pins);
      if (!hit) continue;
      const h = { vaultId: hit.vaultId, kind: hit.kind };
      if (c.cls === 'S2') return { kind: 'reclassify', hit: h };
      return { kind: 'block', reason: 'pin' in hit ? 'PIN_IN_PROMPT' : 'VAULT_TEXT_IN_PROMPT', hit: h };
    }
    if (c.cls === 'S3' && !c.tpl.ok) return { kind: 'block', reason: 'CLASS_MISMATCH' }; // after the scan (AC-040)
    return { kind: 'ok' };
  }

  /** Wait for the ACTIVE index (bounded) and snapshot it. False → nothing may be sent (VAULT_UNAVAILABLE). */
  async function vaultReady<T>(c: Call<T>, refresh: boolean): Promise<boolean> {
    try {
      if (refresh) await withTimeout(deps.vault.refresh(), vaultTimeoutMs);
      await withTimeout(deps.vault.ready, vaultTimeoutMs);
    } catch {
      return false;
    }
    const m = deps.vault.mode();
    if (c.judge ? m !== 'judge' : m !== 'real') return false;
    c.snap = { terms: deps.vault.activeTerms(), pins: deps.vault.activePins(), theta: deps.vault.threshold() };
    return true;
  }

  async function preSendChecks<T>(c: Call<T>): Promise<void> {
    const t = deps.clock();
    const img = await recheckImages(c);
    c.checksMs = Math.round(deps.clock() - t);
    await settle(c, img);
    await settle(c, promptScan(c));
  }
  async function settle<T>(c: Call<T>, r: PreSend): Promise<void> {
    if (r.kind === 'ok') return;
    if (r.kind === 'block') block(c, r.reason, r.hit, r.text !== undefined ? { text: r.text } : {});
    if (r.kind === 'reclassify') await reclassify(c);
    if (r.kind === 'error') await failOrRules(c, r.code, `fallback: ${r.code}`);
  }

  /** Before every permit: the D-80 generation check. A change re-runs the checks on the new index (once). */
  async function freshBeforePermit<T>(c: Call<T>): Promise<void> {
    if (!deps.vaultFresh) return;
    let fresh = false;
    try { fresh = await deps.vaultFresh(); } catch { fresh = false; }
    if (fresh) return;
    if (!(await vaultReady(c, true))) await failOrRules(c, 'VAULT_UNAVAILABLE', 'fallback: vault index not ready');
    c.digests.clear();
    await preSendChecks(c);
    let again = false;
    try { again = await deps.vaultFresh(); } catch { again = false; }
    if (!again) await failOrRules(c, 'VAULT_UNAVAILABLE', 'fallback: vault index not ready');
  }

  /** The tripwire refused THIS attempt's fetch: its record is newer than the attempt and its text is in the error. */
  function attributedTrip(err: unknown, since: number): TripRecord | null {
    const t = deps.tripwire.lastTrip();
    if (!t || t.at < since) return null;
    let e: unknown = err;
    for (let i = 0; i < 4 && e; i++) {
      const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
      if (msg.includes(`tripwire:${t.reason}`)) return t;
      e = (e as { cause?: unknown }).cause;
    }
    return null;
  }

  const kindOf = <T>(c: Call<T>, vaultId: string): VaultKind =>
    c.snap.terms.find((t) => t.vaultId === vaultId)?.kind ?? c.snap.pins.find((p) => p.vaultId === vaultId)?.kind ?? 'other_text';

  // ----- the invoke (ARCH §9.4) -----
  interface InvokeOpts {
    timeoutMs: number; deviceOnly: boolean; cloudCapable: boolean; grounding: boolean; signal?: AbortSignal;
    onChunk?: (t: string, src: 'on_device' | 'in_cloud') => void; delivered: { value: boolean }; pending: { p: Promise<unknown> | null };
  }
  async function invokeModel(model: GateModel, parts: Part[], o: InvokeOpts): Promise<RawResult> {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectNow: (e: unknown) => void = () => undefined;
    const deadline = new Promise<never>((_, reject) => {
      rejectNow = reject;
      timer = setTimeout(() => {
        const e = new GateTimeoutError(o.timeoutMs);
        ctrl.abort(e); // aborts the fetch, the body read and the stream (cloud); the device ignores it (race below)
        reject(e);
      }, o.timeoutMs);
    });
    deadline.catch(() => undefined);
    // A BREACH elsewhere (liveCloud) or the caller's signal ends this attempt at once.
    const onAbort = () => { const e = ctrl.signal.reason ?? new CallerAbort(); rejectNow(e); };
    ctrl.signal.addEventListener('abort', onAbort);
    const onCaller = () => ctrl.abort(new CallerAbort());
    o.signal?.addEventListener('abort', onCaller);
    if (o.cloudCapable) liveCloud.add(ctrl);
    const race = <X>(p: Promise<X>): Promise<X> => Promise.race([p, deadline]);
    const opts: GateCallOptions = { signal: ctrl.signal, timeout: o.timeoutMs };
    let iter: AsyncIterator<GateResponse> | null = null;
    let finished = false;
    try {
      if (!o.onChunk) {
        const p = model.generateContent(parts, opts);
        o.pending.p = p;
        const r = await race(p);
        const res = r.response;
        const text = res.text(); // throws response-error on SAFETY, SPII, blocklist… (CLOUD_REFUSED)
        const g = o.grounding ? captureGrounding(res.candidates?.[0]?.groundingMetadata) : undefined;
        const fr = finishOf(res);
        finished = true;
        return { text, inferenceSource: srcOf(res.inferenceSource), ...(fr !== undefined ? { finishReason: fr } : {}), ...(g ? { grounding: g } : {}) };
      }
      const sp = model.generateContentStream(parts, opts);
      o.pending.p = sp;
      const sr = await race(sp);
      sr.response.catch(() => undefined); // an abandoned stream must not leave the SDK's aggregate unhandled (P1)
      iter = sr.stream[Symbol.asyncIterator]();
      let text = '';
      let src: 'on_device' | 'in_cloud' | null = null;
      let gm: GroundingMetadataLike | undefined;
      for (;;) {
        const n = await race(iter.next());
        if (n.done) break;
        const chunk = n.value;
        const s = srcOf(chunk.inferenceSource);
        src = s;
        if (o.deviceOnly && s !== 'on_device') return { text, inferenceSource: s }; // BREACH: nothing more is shown
        if (o.grounding) gm = chunk.candidates?.[0]?.groundingMetadata ?? gm; // the aggregate overwrites it (API-NOTES §1.13)
        const t = chunk.text();
        text += t;
        if (t) {
          o.delivered.value = true;
          try { o.onChunk(t, s); } catch { /* a UI callback never breaks the call */ }
        }
      }
      const final = await race(sr.response);
      const fr = finishOf(final);
      if (o.grounding) gm = final.candidates?.[0]?.groundingMetadata ?? gm;
      const g = o.grounding ? captureGrounding(gm) : undefined;
      finished = true;
      return {
        text, inferenceSource: final.inferenceSource !== undefined ? srcOf(final.inferenceSource) : (src ?? 'in_cloud'),
        ...(fr !== undefined ? { finishReason: fr } : {}), ...(g ? { grounding: g } : {}),
      };
    } finally {
      clearTimeout(timer);
      liveCloud.delete(ctrl);
      ctrl.signal.removeEventListener('abort', onAbort);
      o.signal?.removeEventListener('abort', onCaller);
      if (!finished) {
        if (!ctrl.signal.aborted) { try { ctrl.abort(new Error('gate: attempt abandoned')); } catch { /* ignore */ } }
        if (iter?.return) { try { void iter.return().catch(() => undefined); } catch { /* ignore */ } }
      }
    }
  }

  /** RC `timeouts_ms` is the authority; a caller value may only lower it (D-131). */
  const timeoutFor = <T>(c: Call<T>): number => {
    let rc = 60_000;
    try { rc = cloudParamsFor(c.config, c.req.job).timeoutMs; } catch { /* default */ }
    const t = c.req.timeoutMs;
    return typeof t === 'number' && Number.isInteger(t) && t > 0 ? Math.min(t, rc) : rc;
  };
  const retryOf = <T>(c: Call<T>): RetryPolicy => {
    const r = c.req.retry;
    return r && typeof r === 'object' ? r : DEFAULT_RETRY[c.req.job];
  };

  /** Enter the interlock; the caller's signal releases a waiting call (InterlockError → ABORTED). */
  async function enter<T>(c: Call<T>, kind: 'local' | 'cloud'): Promise<void> {
    const sig = c.req.signal;
    const onAbort = () => deps.interlock.exit(c.id);
    sig?.addEventListener('abort', onAbort);
    try {
      if (kind === 'local') await deps.interlock.enterLocal(c.id);
      else await deps.interlock.enterCloud(c.id);
    } finally {
      sig?.removeEventListener('abort', onAbort);
    }
    if (aborted(c)) throw new CallerAbort();
  }

  // ----- step 4–7: execute, verify, parse, commit -----
  async function execute<T>(c: Call<T>): Promise<GateResult<T>> {
    const { req } = c;
    const io = ioOf(req.modelSpec);
    const timeoutMs = timeoutFor(c);
    const retry = retryOf(c);
    const used = new Map<string, number>();
    let vaultRetries = 0;
    for (;;) {
      const mode = c.mode as GateMode;
      const deviceOnly = mode === 'ONLY_ON_DEVICE';
      const usesDevice = mode !== 'ONLY_IN_CLOUD';
      if (aborted(c)) fail(c, 'ABORTED', { copyId: null });
      if (!deviceOnly) {
        if (state.compromised) await afterBreach(c);
        if (deps.cfg().killSwitch) { await killSwitchNow(c); continue; } // P3: re-read before every cloud attempt
        await freshBeforePermit(c);
      }
      const since = performance.now(); // the tripwire's clock
      const bytesBefore = bytesOf(c);
      const delivered = { value: false };
      const pending: { p: Promise<unknown> | null } = { p: null };
      let raw: RawResult | null = null;
      let err: unknown = null;
      try {
        if (deviceOnly) {
          await enter(c, 'local');
        } else {
          await enter(c, 'cloud');
          // D-129: the wait may have been long; a BREACH or the kill switch since then stops the call before its permit.
          if (state.compromised) throw new BreachAbort();
          if (deps.cfg().killSwitch) throw new KillSwitchNow();
          deps.tripwire.grantCloud({ id: c.id, scanText: c.cls !== 'S4' }); // S4: the allowlist replaces the text scan
        }
        const attempt = async (): Promise<RawResult> => {
          if (aborted(c)) throw new CallerAbort();
          if (deviceOnly && !(await deps.availabilityNow(io) === 'available')) throw new NoDeviceModelError(); // fresh, in the slot
          // D-129: the parts are built from the snapshot: the text checked in step 3, the base64 decoded and checked in step 2.
          const parts: Part[] = [textPart(segmentsText(req.text)), ...req.images.map((i) => {
            const d = c.digests.get(i);
            if (d && d.ok) return jpegPart(encodeBase64(d.d.bytes));
            // Re-verification R4/M53: a cloud-capable call sends ONLY bytes decoded and checked in step 2; never the caller's.
            if (!deviceOnly) throw new Error('gate: image without a checked digest');
            return jpegPart(i.base64);
          })];
          // Built HERE, after the fresh check, never cached: the SDK reads the on-device API only when it builds a
          // model, and one built without it sends ONLY_ON_DEVICE to the cloud (F-125; models throw NoDeviceModelError).
          const model = deps.buildModel(req.modelSpec, mode, c.config, req.job);
          try {
            return await invokeModel(model, parts, {
              timeoutMs, deviceOnly, cloudCapable: !deviceOnly, grounding: req.job === 'adversaryA', delivered, pending,
              ...(req.signal ? { signal: req.signal } : {}), ...(req.onChunk ? { onChunk: req.onChunk } : {}),
            });
          } catch (e) {
            // D-131: Nano may still be running after a device timeout: keep the device slot (and lock) a little longer.
            if (e instanceof GateTimeoutError && usesDevice && pending.p && bytesOf(c) === bytesBefore) {
              await Promise.race([pending.p.then(() => undefined, () => undefined), sleepMs(deviceGraceMs)]);
            }
            throw e;
          }
        };
        raw = usesDevice ? await untilAborted(deps.deviceQueue.run(attempt), req.signal) : await attempt();
      } catch (e) {
        err = e;
      } finally {
        deps.interlock.exit(c.id); // exitLocal(), or revokeCloud(id) if the permit was never used
      }
      const attemptBytes = bytesOf(c) - bytesBefore;

      // Handled AFTER the interlock is released (ARCH §8.2 step 4).
      let code: GateErrorCode | null = null;
      if (err !== null) {
        if (err instanceof CallerAbort || (aborted(c) && err instanceof InterlockError)) fail(c, 'ABORTED', { copyId: null });
        if (err instanceof KillSwitchNow) { await killSwitchNow(c); continue; }
        const trip = attributedTrip(err, since);
        if (trip) {
          if (trip.reason === 'LOCAL_LOCK') {
            if (deviceOnly) return breach(c, 'tripwire: local lock');
            c.notes.push('tripwire: local lock (not sent)'); // a cloud fetch refused while a local call held the lock
            code = 'CLOUD_NETWORK';
          } else if (trip.reason === 'VAULT_TEXT') {
            const vid = trip.vaultId ?? '';
            if (vid === TEMPLATE_CANARY) block(c, 'CLASS_MISMATCH', undefined, { error: 'TEMPLATE_CANARY', note: 'tripwire: template canary' });
            if (vid === VAULT_UNAVAILABLE) {
              // The index was reloading when the fetch went out: refused before leaving, never a leak or a BREACH.
              if (vaultRetries < 1 && (await vaultReady(c, false))) { vaultRetries++; c.digests.clear(); await preSendChecks(c); continue; }
              return failOrRules(c, 'VAULT_UNAVAILABLE', 'fallback: vault index not ready');
            }
            if (c.cls === 'S2') return reclassify(c);
            block(c, 'VAULT_TEXT_IN_PROMPT', { vaultId: vid, kind: kindOf(c, vid) }, { note: 'tripwire: vault text' });
          } else {
            block(c, 'CLASS_MISMATCH', undefined, { note: `tripwire: ${trip.reason}` }); // NO_PERMIT, NO_SCANNER, UNSCANNABLE_BODY
          }
        } else if (err instanceof BreachAbort || (state.compromised && !deviceOnly)) {
          return afterBreach(c);
        } else if (err instanceof InterlockError) {
          return failOrRules(c, 'INTERNAL', 'fallback: interlock');
        } else {
          // P2: a PREFER_ON_DEVICE attempt that sent nothing failed on the device, not in the cloud.
          code = classifyError(err, { deviceOnly: deviceOnly || (mode === 'PREFER_ON_DEVICE' && attemptBytes === 0) });
        }
      }

      if (raw) {
        // Step 5: route verify. A device-only call that reports in_cloud is a BREACH (AC-022, AD-31).
        if (deviceOnly && raw.inferenceSource !== 'on_device') return breach(c, 'in_cloud from a device-only call');
        if (raw.finishReason === 'MAX_TOKENS' && !delivered.value) {
          code = 'CLOUD_TRUNCATED'; // MAX_TOKENS does not throw (API-NOTES §1.10); a streamed answer already shown is kept
        } else {
          let value: T;
          try {
            value = req.parse(raw.text, {
              inferenceSource: raw.inferenceSource,
              ...(raw.finishReason !== undefined ? { finishReason: raw.finishReason } : {}),
              ...(raw.grounding && req.job === 'adversaryA' ? { grounding: raw.grounding } : {}),
            });
          } catch {
            code = 'PARSE_FAILED';
            value = undefined as T;
          }
          if (code === null) return finishDone(c, raw, value, attemptBytes);
        }
      }

      // Retry or give up (each retry re-enters the interlock above).
      const final = code ?? 'INTERNAL';
      const cloudSide = !deviceOnly && !(mode === 'PREFER_ON_DEVICE' && attemptBytes === 0)
        && (mode === 'ONLY_IN_CLOUD' || attemptBytes > 0 || raw?.inferenceSource === 'in_cloud');
      const bucket = retryBucket(final) ?? final;
      const n = (used.get(bucket) ?? 0) + 1;
      used.set(bucket, n);
      // Invariant 7: an answer from the cloud that does not parse, or is cut off, may be a refusal in plain text: never resent.
      const refusalLike = cloudSide && (final === 'PARSE_FAILED' || final === 'CLOUD_TRUNCATED');
      const allowed = delivered.value || refusalLike ? 0 : retriesAllowed(final, retry, { cloud: cloudSide });
      if (n <= allowed) {
        await deps.sleep(retryDelayMs(final, n, deps.random));
        continue;
      }
      return finalFailure(c, final, cloudSide);
    }
  }

  /** The kill switch flipped during the call: S3 BLOCKED, S2/S4 the device or the template. */
  async function killSwitchNow<T>(c: Call<T>): Promise<void> {
    await deviceOrRules(c, 'kill switch', c.cls === 'S3' ? 'KILL_SWITCH' : null);
  }

  async function finalFailure<T>(c: Call<T>, code: GateErrorCode, cloudSide: boolean): Promise<never> {
    if (cloudSide) {
      if (code === 'CLOUD_NETWORK') networkErrorAt = deps.clock();
      if (code === 'CLOUD_AUTH') deps.status.set({ appCheckFailed: true });
      // SCR-22 per-call banners only when nothing took the call's place (S3): S2/S4 fell back and queued nothing.
      const ev = statusEventFor(code);
      if (ev && !hasRules(c)) deps.status.report(ev);
    }
    if (c.cls === 'S3' && code === 'CLOUD_REFUSED') {
      markRefused(c);
      if (c.req.job === 'adversaryB' && bytesOf(c) > 0) deps.caps.increment(); // the model ran
    }
    const note = code === 'DEVICE_UNAVAILABLE' ? 'fallback: no on-device model'
      : code === 'PARSE_FAILED' || code === 'DEVICE_FAILED' ? 'fallback: invalid output' : `fallback: ${code}`;
    return failOrRules(c, code, note);
  }

  function markRefused<T>(c: Call<T>): void {
    refusedSessions.add(c.req.sessionId);
    if (c.req.consent?.sha256) refusedImages.add(c.req.consent.sha256);
    for (const img of c.req.images) {
      const d = c.digests.get(img);
      if (d && d.ok) refusedImages.add(d.d.sha);
    }
  }

  async function finishDone<T>(c: Call<T>, raw: RawResult, parsed: T, attemptBytes: number): Promise<GateResult<T>> {
    const { req } = c;
    const bytes = bytesOf(c);
    let route: Route = raw.inferenceSource === 'on_device' ? 'ON_DEVICE' : 'IN_CLOUD';
    if (route === 'ON_DEVICE' && attemptBytes > 0) {
      route = 'IN_CLOUD'; // the tripwire saw this attempt's request: the Ledger never under-reports what left
      c.notes.push('tripwire saw a request for an on-device answer');
    }
    if ((c.cls === 'S2' || c.cls === 'S4') && c.mode === 'PREFER_ON_DEVICE' && route === 'IN_CLOUD') c.notes.push('fallback: no on-device model');
    let value = parsed;
    if (req.job === 'adversaryB' && route === 'IN_CLOUD' && isAdvBShape(value)) {
      // Response-side scan of PASS B ONLY, free-text fields only, against the vault that was scanned (D-65).
      value = { ...value, echoedVaultIds: echoScan(value, c.snap.terms, c.snap.theta) } as T;
      const n = (value as { echoedVaultIds: string[] }).echoedVaultIds.length;
      if (n > 0) c.notes.push(`echo: ${n}`);
    }
    let declined = false;
    try { declined = req.isDeclined?.(value) === true; } catch { declined = false; }
    if (declined) {
      c.notes.push('declined');
      if (c.cls === 'S3') markRefused(c); // no re-attack after a decline (invariant 7)
    }
    // D-129: hashes of the CHECKED bytes only (a device-only image is hashed here, from the snapshot).
    const shas: string[] = [];
    for (const img of req.images) {
      const d = await digest(c, img);
      if (d.ok) shas.push(d.d.sha);
    }
    commit(c, {
      route, mode: c.mode as WebMode, model: route === 'ON_DEVICE' ? 'gemini-nano' : cloudModel(c), inferenceSource: raw.inferenceSource,
      bytesOut: bytes, imagesOut: route === 'IN_CLOUD' ? req.images.length : 0, imageSha256: shas,
      ...(raw.grounding && req.job === 'adversaryA' ? { groundedQueries: raw.grounding.queries.length } : {}),
      notes: [...c.notes], ...(declined ? { error: 'CLOUD_DECLINED' } : {}),
    });
    if (route === 'IN_CLOUD') {
      networkErrorAt = Number.NEGATIVE_INFINITY;
      deps.status.set({ appCheckFailed: false });
      if (req.job === 'adversaryB') deps.caps.increment(); // one run per A+B pair
    }
    return {
      value, route, payloadClass: c.cls, inferenceSource: raw.inferenceSource, latencyMs: latency(c), ledgerId: c.id, notes: [...c.notes],
      ...(raw.grounding && req.job === 'adversaryA' ? { grounding: raw.grounding } : {}), ...(raw.finishReason !== undefined ? { finishReason: raw.finishReason } : {}),
      ...(c.checksMs !== undefined ? { checksMs: c.checksMs } : {}),
    };
  }

  /** S2/S4 that cannot use the cloud now: the device if Nano is on and ready (fresh), else the deterministic path. */
  async function deviceOrRules<T>(c: Call<T>, note: string, reasonIfNone: GateBlockReason | null, error?: GateErrorCode): Promise<void> {
    if ((c.cls === 'S2' || c.cls === 'S4') && !nanoOff() && (await deps.availabilityNow(ioOf(c.req.modelSpec))) === 'available') {
      c.mode = 'ONLY_ON_DEVICE';
      c.deviceVerified = true;
      c.notes.push(note);
      return;
    }
    if (hasRules(c)) await rules(c, note, error);
    if (reasonIfNone) block(c, reasonIfNone);
    if (error) fail(c, error, { note, ...(error === 'CLOUD_AUTH' ? { copyId: 'copy.err.auth' as StringId } : {}) });
    block(c, 'CLASS_MISMATCH');
  }

  // ----- step 1–3 -----
  async function steps<T>(c: Call<T>): Promise<GateResult<T>> {
    const { req, config: C } = c;
    const P = C.routingPolicy;
    if (aborted(c)) fail(c, 'ABORTED', { copyId: null });
    if (floorViolations(P).length > 0) block(c, 'CLASS_FLOOR'); // belt and braces: cfg() is already floored (D-84)
    if (!(PAYLOAD_CLASSES as readonly string[]).includes(c.cls) || !(JOB_NAMES as readonly string[]).includes(req.job)) block(c, 'CLASS_MISMATCH');
    // The active vault must be the request's (D-37): a Judge-route boot leaves the fake vault active.
    const vmode = deps.vault.mode();
    if (!c.judge && vmode === 'judge') block(c, 'CLASS_MISMATCH', undefined, { note: 'judge vault active' });
    if (c.judge && vmode !== 'judge') block(c, c.cls === 'S4' ? 'NOT_SYNTHETIC' : 'CLASS_MISMATCH', undefined, { note: 'judge vault not active' });

    // ── 1. class, spec, template, proof ──
    const expected = jobClass(P, req.job, c.judge);
    if (c.cls !== expected && !(expected === 'S2' && c.cls === 'S0')) block(c, 'CLASS_MISMATCH');
    const spec = req.modelSpec;
    if (!spec || typeof spec !== 'object' || !specFitsClass(spec, c.cls) || !specFitsJob(spec, req.job)) block(c, 'CLASS_MISMATCH');
    if (!Array.isArray(req.images) || req.images.length !== imagesFor(spec)) block(c, 'CLASS_MISMATCH');
    if (!promptFits(req)) block(c, 'CLASS_MISMATCH');
    c.tpl = templateCheck(req.promptId, req.text);
    if (!c.tpl.ok && c.cls !== 'S3') block(c, 'CLASS_MISMATCH'); // S3: after the prompt scan, so a vault hit keeps its reason
    if (c.cls !== 'S3' && !hasRules(c)) block(c, 'CLASS_MISMATCH');
    if (c.cls === 'S3' && req.deterministic !== undefined) block(c, 'CLASS_MISMATCH', undefined, { note: 'S3 has no deterministic path' });
    if (c.cls === 'S4' && !(await syntheticOk(c))) block(c, 'NOT_SYNTHETIC');
    // T-103 / AC-131: no pass A without grounding (free tier). Silent and distinct: not a "private data" block (D-131).
    if (req.job === 'adversaryA' && !C.groundingEnabled) fail(c, 'GROUNDING_OFF', { note: 'grounding off', copyId: null });

    // ── capability and policy ──
    const pol = P.classes[c.cls];
    const io = ioOf(spec);
    if (c.cls === 'S0' || c.cls === 'S1') {
      if (pol.web !== 'ONLY_ON_DEVICE' || pol.cloud) block(c, 'CLASS_FLOOR'); // unreachable after the floor
      if (state.compromised) await rules(c, 'tripwire');
      const off = nanoOff();
      if (off) await rules(c, off);
      const av = await deps.availabilityNow(io); // fresh, never cached (AC-007, AC-021)
      if (av !== 'available') await rules(c, unavailableNote(av));
      c.mode = 'ONLY_ON_DEVICE';
      c.deviceVerified = true;
    } else {
      if (state.compromised) await afterBreach(c); // S3 after a BREACH: no fetch until reload
      if (c.cls === 'S3') {
        if (!pol.cloud) block(c, 'KILL_SWITCH', undefined, { note: 'policy: S3 cloud off' }); // D-113: an operator switch
        if (pol.web !== 'ONLY_IN_CLOUD') block(c, 'CLASS_FLOOR');
        c.mode = 'ONLY_IN_CLOUD';
      } else {
        let mode: GateMode = pol.web === 'ONLY_ON_DEVICE' ? 'ONLY_ON_DEVICE' : pol.web === 'ONLY_IN_CLOUD' ? 'ONLY_IN_CLOUD' : 'PREFER_ON_DEVICE';
        if (pol.web === 'PREFER_IN_CLOUD') { mode = 'ONLY_IN_CLOUD'; c.notes.push('policy: PREFER_IN_CLOUD runs as ONLY_IN_CLOUD'); }
        if (!pol.cloud && mode !== 'ONLY_ON_DEVICE') { mode = 'ONLY_ON_DEVICE'; c.notes.push('policy: cloud off'); } // D-84 (a)
        const off = nanoOff();
        if (off) {
          if (mode === 'ONLY_ON_DEVICE') await rules(c, off);
          mode = 'ONLY_IN_CLOUD'; // AC-277: IN_CLOUD (Nano off)
          c.notes.push(off);
        }
        c.mode = mode;
      }
      if (c.mode !== 'ONLY_ON_DEVICE' && C.killSwitch) await deviceOrRules(c, 'kill switch', c.cls === 'S3' ? 'KILL_SWITCH' : null);
      if (c.mode !== 'ONLY_ON_DEVICE' && !online()) await deviceOrRules(c, 'offline', c.cls === 'S3' ? 'OFFLINE' : null);
      if (c.mode !== 'ONLY_ON_DEVICE' && c.cls === 'S3') {
        const sha = req.consent?.sha256;
        if (refusedSessions.has(req.sessionId) || (typeof sha === 'string' && refusedImages.has(sha))) {
          fail(c, 'CLOUD_REFUSED', { note: 'no re-attack after a refusal or decline' });
        }
        if (deps.caps.usedToday() >= C.dailyAdversaryCap) block(c, 'DAILY_CAP');
        if (!consentOk(c)) block(c, 'NO_CONSENT');
      }
      if (c.mode === 'ONLY_ON_DEVICE') {
        // D-84 (b): a fresh availability() before ANY device-only call; without it the SDK sends it to the cloud.
        if (!c.deviceVerified) {
          const av = await deps.availabilityNow(io);
          if (av !== 'available') await rules(c, unavailableNote(av));
          c.deviceVerified = true;
        }
      } else {
        // AC-291 / D-110: a fresh ensureAuth() before every cloud-capable call; null or a timeout → CLOUD_AUTH.
        let uid: string | null = null;
        try { uid = await withTimeout(deps.ensureAuth(), authTimeoutMs); } catch { uid = null; }
        if (uid === null) {
          deps.status.set({ authFailed: true });
          await deviceOrRules(c, 'sign-in failed', null, 'CLOUD_AUTH');
        } else {
          deps.status.set({ authFailed: false });
        }
      }
    }

    // ── 2–3. image re-check and prompt scan (cloud-capable calls only) ──
    if (c.mode !== 'ONLY_ON_DEVICE') {
      if (!(await vaultReady(c, false))) await failOrRules(c, 'VAULT_UNAVAILABLE', 'fallback: vault index not ready');
      await preSendChecks(c);
    }

    // ── 4–7 ──
    return execute(c);
  }

  async function run<T>(reqIn: GateRequest<T>, opts: Internal = {}): Promise<GateResult<T>> {
    let req: GateRequest<T>;
    let consentMinted: boolean;
    let config: AppConfig;
    let id: string;
    try {
      ({ r: req, consentMinted } = snapshot(reqIn)); // D-129: before any await
      config = deps.cfg();
      id = opts.reuseLedgerId ?? deps.ledger.begin({
        sessionId: typeof req.sessionId === 'string' ? req.sessionId : '', judge: req.judge !== null, job: req.job,
        payloadClass: req.payloadClass, promptVersion: isPromptId(req.promptId) ? req.promptId : null,
      });
    } catch (e) {
      throw new GateError('INTERNAL', { ledgerId: null, detail: nameOf(e) });
    }
    const judge = req.judge !== null;
    const own = !bytesById.has(id);
    if (own) bytesById.set(id, 0);
    const c: Call<T> = {
      req, consentMinted, id, t0: opts.t0 ?? deps.clock(), config, cls: req.payloadClass, judge, notes: [...(opts.notes ?? [])],
      committed: false, mode: null, deviceVerified: false, digests: new Map(), snap: { terms: [], pins: [], theta: deps.vault.threshold() },
      tpl: { ok: false, suspects: [] },
    };
    try {
      return await steps(c);
    } catch (e) {
      if (e instanceof Done) return (e as Done<T>).result;
      if (e instanceof GateBlocked || e instanceof GateError) throw e;
      if (!c.committed) {
        try {
          commit(c, { route: c.mode === 'ONLY_IN_CLOUD' ? 'IN_CLOUD' : 'BLOCKED', mode: c.mode ?? 'RULES', model: 'none', bytesOut: bytesOf(c), notes: [...c.notes], error: 'INTERNAL' });
        } catch { /* the Ledger itself failed */ }
      }
      throw new GateError('INTERNAL', { ledgerId: id, detail: nameOf(e) }); // the exception's name only, never its text
    } finally {
      if (own) bytesById.delete(id);
    }
  }

  return {
    gate: (req) => run(req),
    state: () => ({ compromised: state.compromised }),
    dispose: stopObserving,
  };
}
// Re-verification issue 2: the test seam is wired only under Vitest, so production code can never build a second gate
// through it (and the bundler drops the seam from dist).
if (import.meta.env.MODE === 'test') registerGateFactory(createGate);

// ---------- the app's instance ----------
/**
 * Judge Mode's allowlist: the bundled `/samples/manifest.json` (ARCH §3.1), fetched once from this origin, validated and
 * frozen (D-131). There is no setter: app code cannot widen it. A failed load is retried by the next S4 call.
 */
let samplesLoad: Promise<SampleAllowlist | null> | null = null;
export function parseSampleManifest(json: unknown): SampleAllowlist | null {
  const list = (json as { samples?: unknown } | null)?.samples;
  if (!Array.isArray(list)) return null;
  const table: Record<string, SampleHashes> = Object.create(null) as Record<string, SampleHashes>;
  for (const s of list as unknown[]) {
    const o = s as { id?: unknown; imageSha256?: unknown; nano768Sha256?: unknown } | null;
    if (!o || typeof o.id !== 'string' || typeof o.imageSha256 !== 'string' || typeof o.nano768Sha256 !== 'string') return null;
    if (!SHA256_HEX.test(o.imageSha256) || !SHA256_HEX.test(o.nano768Sha256) || Object.hasOwn(table, o.id)) return null;
    table[o.id] = Object.freeze({ imageSha256: o.imageSha256, nano768Sha256: o.nano768Sha256 });
  }
  Object.freeze(table);
  return Object.freeze({ get: (id: string) => (Object.hasOwn(table, id) ? table[id] : undefined) });
}
function bundledSamples(): Promise<SampleAllowlist | null> {
  samplesLoad ??= fetch('/samples/manifest.json', { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : null))
    .then((j: unknown) => parseSampleManifest(j))
    .catch(() => null)
    .then((a) => { if (!a) samplesLoad = null; return a; });
  return samplesLoad;
}

/** Toasts, banners and notes for the UI (SCR-10 toast, SCR-22 banners, HUD). Memory only. */
const noticeListeners = new Set<(n: GateNotice) => void>();
export const gateNotices = {
  subscribe(fn: (n: GateNotice) => void): () => void {
    noticeListeners.add(fn);
    return () => { noticeListeners.delete(fn); };
  },
  emit(n: GateNotice): void { for (const l of [...noticeListeners]) l(n); },
};

/** The SDK model for a spec and the gate's mode (ARCH §9.3 factories; S0/S1 throw NoDeviceModelError without an adapter). Not exported (D-131). */
function sdkModel(spec: ModelSpec, mode: GateMode, config: AppConfig, job: JobName): GateModel {
  const cloudMode = mode === 'ONLY_IN_CLOUD' ? InferenceMode.ONLY_IN_CLOUD : InferenceMode.PREFER_ON_DEVICE;
  switch (spec.kind) {
    case 'deviceJson': return deviceJsonModel(ai, spec.io, spec.schema);
    case 'deviceText': return deviceTextModel(ai);
    case 'judgeJson':
      return mode === 'ONLY_ON_DEVICE' ? deviceJsonModel(ai, spec.io, spec.schema) : judgeJsonModel(ai, spec.io, spec.schema, cloudParamsFor(config, job), cloudMode);
    case 'explain':
      return mode === 'ONLY_ON_DEVICE' ? deviceTextModel(ai) : explainModel(ai, cloudParamsFor(config, 'explain'), cloudMode);
    case 'adversaryA': return adversaryAModel(ai, spec.system, cloudParamsFor(config, 'adversaryA'));
    case 'adversaryB': return adversaryBModel(ai, spec.system, cloudParamsFor(config, 'adversaryB'), spec.schema);
    default: {
      const never: never = spec;
      throw new RangeError(`egressGate: unknown model spec ${String((never as { kind?: unknown }).kind)}`);
    }
  }
}

// ---------- DEV ONLY: the fake adversary (D-137) ----------
// A DEV build can answer pass B from web/src/dev/fakeAdversary.ts instead of the SDK, so the Check flow can be driven
// end to end in a browser without spending the cloud quota. Only the MODEL is swapped: every other gate step (class,
// kill switch, offline, cap, consent, the image re-check, the prompt scan, the Ledger, the echo scan) runs for real.
// The fake model lives here because only this file may name the content methods (check-boundaries R1). A production
// build has none of it: appDeps picks devBuildModel only under import.meta.env.DEV, the setter returns at once in a
// production build, and the fake's strings carry the DEV marker, so scripts/check-dist.mjs fails if any of it ships.
/**
 * One fake pass-B answer: JSON text (with an optional finishReason), a safety refusal, an HTTP/network error, or a hang.
 * `textFor` (D-144) computes the text from the base64 images the gate is sending (after every check has passed), so a
 * re-attack on a fixed image can answer differently; it only reads them, and only in a DEV build.
 */
export interface DevFakeReply {
  text?: string; finishReason?: string; refuse?: boolean; status?: number; network?: boolean; hang?: boolean; delayMs?: number;
  textFor?: (imagesBase64: readonly string[]) => Promise<string>;
}
type DevFake = (job: JobName) => DevFakeReply | null;
let devFake: DevFake | null = null;
/** DEV ONLY: install (or clear, null) the fake adversary. Does nothing in a production build. */
export function devSetFakeAdversary(fn: DevFake | null): void {
  if (!import.meta.env.DEV) return;
  devFake = fn;
}
function devFakeModel(r: DevFakeReply): GateModel {
  const answer = async (opts?: GateCallOptions, parts: readonly Part[] = []): Promise<GateResponse> => {
    const signal = opts?.signal;
    const wait = (ms: number) => new Promise<void>((res, rej) => {
      const id = r.hang ? undefined : setTimeout(res, ms);
      signal?.addEventListener('abort', () => { clearTimeout(id); rej(new DOMException('aborted', 'AbortError')); });
    });
    await wait(r.delayMs ?? 0);
    const err = (code: string, status?: number) => Object.assign(new Error(`__SE_DEV_ONLY__ fake adversary: ${code}`), {
      code, ...(status !== undefined ? { customErrorData: { status } } : {}),
    });
    if (r.network) throw err('fetch-error');
    if (r.status !== undefined) throw err('fetch-error', r.status);
    const images = parts.flatMap((p) => {
      const d = (p as { inlineData?: { data?: unknown } }).inlineData?.data;
      return typeof d === 'string' ? [d] : [];
    });
    const text = r.textFor ? await r.textFor(images) : r.text ?? '';
    return {
      text: () => { if (r.refuse) throw err('response-error'); return text; },
      inferenceSource: 'in_cloud',
      candidates: [{ finishReason: r.finishReason ?? 'STOP' }],
    };
  };
  return {
    async generateContent(parts, opts) { return { response: await answer(opts, parts) }; },
    async generateContentStream() { throw new Error('__SE_DEV_ONLY__ fake adversary: pass B is not streamed'); },
  };
}
// ---------- DEV ONLY: the fake Gemini Nano (D-147) ----------
// A DEV build can answer the on-device jobs (referee, pre-screen…) from web/src/dev/fakeNano.ts, so the ON_DEVICE path
// can be shown in a browser without Gemini Nano (8 GB machines, a Chrome not set up). While it is active (`?fakeNano=`
// in the URL), availability() reports 'available' AND every device-capable model is the fake: the two are switched
// together, so the gate never builds a real SDK device model on a fake 'available' (a model without the browser's
// on-device API would run in the cloud, F-125). Only availability and the model are swapped: the gate's class rules,
// the interlock, the device queue, the route check (an answer must say on_device), the parse and the Ledger run for
// real. A production build has none of it (appDeps picks these only under import.meta.env.DEV; the marker strings
// make scripts/check-dist.mjs fail if any of it ships).
/** One fake on-device answer: fixed text, text computed from the prompt the gate built, or a hang. */
export interface DevNanoReply { text?: string; textFor?: (prompt: string) => string; hang?: boolean; delayMs?: number }
interface DevNano { active(): boolean; reply(job: JobName): DevNanoReply | null }
let devNano: DevNano | null = null;
/** DEV ONLY: install (or clear, null) the fake Gemini Nano. Does nothing in a production build. */
export function devSetFakeNano(fake: DevNano | null): void {
  if (!import.meta.env.DEV) return;
  devNano = fake;
}
const devNanoActive = (): boolean => {
  try { return devNano?.active() === true; } catch { return false; }
};
function devNanoModel(r: DevNanoReply | null): GateModel {
  const answer = async (opts?: GateCallOptions, parts: readonly Part[] = []): Promise<GateResponse> => {
    if (!r) throw new Error('__SE_DEV_ONLY__ fake nano: no answer for this job');
    const signal = opts?.signal;
    await new Promise<void>((res, rej) => {
      const id = r.hang ? undefined : setTimeout(res, r.delayMs ?? 0);
      signal?.addEventListener('abort', () => { clearTimeout(id); rej(new DOMException('aborted', 'AbortError')); });
    });
    const prompt = parts.map((p) => (typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : '')).join('');
    const text = r.textFor ? r.textFor(prompt) : r.text ?? '';
    return { text: () => text, inferenceSource: 'on_device', candidates: [{ finishReason: 'STOP' }] };
  };
  return {
    async generateContent(parts, opts) { return { response: await answer(opts, parts) }; },
    async generateContentStream() { throw new Error('__SE_DEV_ONLY__ fake nano: not streamed'); },
  };
}
async function devAvailabilityNow(io: NanoIo): Promise<NanoState> {
  return devNanoActive() ? 'available' : liveAvailabilityNow(io);
}

function devBuildModel(spec: ModelSpec, mode: GateMode, config: AppConfig, job: JobName): GateModel {
  const cloudOnly = spec.kind === 'adversaryA' || spec.kind === 'adversaryB' || mode === 'ONLY_IN_CLOUD';
  if (!cloudOnly && devNanoActive()) return devNanoModel(devNano?.reply(job) ?? null);
  const r = spec.kind === 'adversaryB' && devFake ? devFake(job) : null;
  return r ? devFakeModel(r) : sdkModel(spec, mode, config, job);
}

async function webSha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The outgoing JPEG decoded at its own size: faces and OCR run on exactly these pixels (D-30). */
async function decodeAtOwnSize(bytes: Uint8Array<ArrayBuffer>): Promise<HTMLCanvasElement> {
  const bmp = await decodeOriented(new Blob([bytes], { type: 'image/jpeg' }));
  try {
    return toCanvas(bmp, Number.POSITIVE_INFINITY);
  } finally {
    bmp.close();
  }
}

function appDeps(): GateDeps {
  return {
    cfg: liveCfg,
    vault: appVaultScan,
    availabilityNow: import.meta.env.DEV ? devAvailabilityNow : liveAvailabilityNow, // D-147: DEV fake Nano
    prefs: appPrefs,
    caps: appCaps,
    online: () => (typeof navigator === 'undefined' || navigator.onLine !== false) && !appPrefs.simulateOffline(),
    ensureAuth,
    interlock: appInterlock,
    tripwire: appTripwire,
    deviceQueue: appDeviceQueue,
    buildModel: import.meta.env.DEV ? devBuildModel : sdkModel, // D-137: the DEV fake adversary; production always the SDK
    ledger: appLedger,
    status: systemStatus,
    notify: (n) => gateNotices.emit(n),
    samples: bundledSamples,
    images: {
      checkClean: checkCleanJpeg,
      decode: decodeAtOwnSize,
      faces: (b, t) => detectFaces(b as HTMLCanvasElement, t),
      ocr: (b) => ocrCanvas(b as HTMLCanvasElement, { union: true }),
      release: (b) => { const cv = b as HTMLCanvasElement; cv.width = 0; cv.height = 0; },
    },
    sha256Hex: webSha256,
    now: () => Date.now(),
    clock: () => performance.now(),
    sleep: sleepMs,
    random: Math.random,
  };
}

let appGate: EgressGate | null = null;
const theGate = (): EgressGate => (appGate ??= createGate(appDeps()));

/** THE door: every Firebase AI Logic call in the app goes through here (jobs.ts builds the requests). */
export function gate<T>(req: GateRequest<T>): Promise<GateResult<T>> {
  return theGate().gate(req);
}
/** Page-lifetime BREACH state (AC-022), mirrored into CheckSession.compromised by the pipeline. */
export function gateState(): GateState {
  return theGate().state();
}
