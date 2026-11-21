// web/src/ai/models.ts: the ONLY file that calls getGenerativeModel (check-boundaries R2). It builds model objects and
// never calls them: generateContent and friends live in ai/egressGate.ts only (R1). ARCH §9.2–9.3; API-NOTES §1.3,
// §1.7–1.8, §1.11, §1.13. Port of the [compiled] research/day1-artifacts/arch/src/models.ts with the D-91 changes.
// Device rule (API-NOTES §1.3/§1.7): the device path ignores systemInstruction, generationConfig and tools, so EVERY
// instruction for a device-capable job travels in the first text part of the user turn (D-04). systemInstruction is
// used only by the cloud-only adversary (S3). No temperature, topP, topK, candidateCount or penalties anywhere
// (ignored or HTTP 400 on Gemini 3.x+, API-NOTES §1.11). Model IDs, thinking levels and timeouts come from Remote
// Config (ARCH §13.2) through ModelConfig; firebase/remoteConfig.ts cfg() parses them, these factories re-check them.
import {
  getGenerativeModel, InferenceMode, ThinkingLevel, type AI, type GenerationConfig, type GenerativeModel, type InlineDataPart,
  type TextPart,
} from 'firebase/ai';
import { ioOptions, NANO_TEXT_IO, type DeviceModelInitializer, type NanoIo } from './capabilities';
import type { JobName, PayloadClass } from '../core/types';

// ---------- modes per payload class (CLAUDE.md invariant 3; SPEC §6; ARCH §9.2) ----------
/**
 * The SDK mode each class is built with. S0/S1 are ONLY_ON_DEVICE in code, whatever RC says (the gate's fresh
 * availability() check before every call is what keeps them off the cloud: without window.LanguageModel the SDK sends
 * ONLY_ON_DEVICE to the cloud silently, API-NOTES §1.4). S2 may instead be ONLY_IN_CLOUD when the user turned Nano
 * off (AC-277). S4 is PREFER_ON_DEVICE so judges without Nano see a real cloud fallback.
 */
export const CLASS_MODE = {
  S0: InferenceMode.ONLY_ON_DEVICE,
  S1: InferenceMode.ONLY_ON_DEVICE,
  S2: InferenceMode.PREFER_ON_DEVICE,
  S3: InferenceMode.ONLY_IN_CLOUD,
  S4: InferenceMode.PREFER_ON_DEVICE,
} as const satisfies Record<PayloadClass, InferenceMode>;
/** The two modes the S2 explainer may use (AC-277). */
export type ExplainMode = typeof InferenceMode.PREFER_ON_DEVICE | typeof InferenceMode.ONLY_IN_CLOUD;

// ---------- Remote Config values the factories need (ARCH §13.2, §13.4 AppConfig field names) ----------
/** `adversary_thinking_level`: MINIMAL is an HTTP 400 on gemini-3.8-flash and gemini-4-* (API-NOTES §1.11). */
export const ADVERSARY_THINKING_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
/** `explain_thinking_level`: Flash-Lite accepts all four. */
export const EXPLAIN_THINKING_LEVELS = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const;
export type AdversaryThinking = (typeof ADVERSARY_THINKING_LEVELS)[number];
export type ExplainThinking = (typeof EXPLAIN_THINKING_LEVELS)[number];
export interface TimeoutsMs { advA: number; advB: number; explain: number; deviceImage: number; deviceText: number }
/** The AppConfig subset the models read (same field names as ARCH §13.4, so `cfg()` can be passed as is). */
export interface ModelConfig {
  adversaryModel: string;
  adversaryThinking: AdversaryThinking;
  explainCloudModel: string;
  explainThinking: ExplainThinking;
  timeoutsMs: TimeoutsMs;
  /** `adversary_seed`: 0 = not sent; otherwise cast into generationConfig [UNVERIFIED that it has any effect: U-11]. */
  adversarySeed: number;
}
/** The cloud side of one model: exact model ID, thinking level and the request timeout. */
export interface CloudParams { model: string; thinkingLevel: ExplainThinking; timeoutMs: number; seed?: number }

/** Exact model ID ("gemini-3.8-flash", "gemini-4-hydrogen"): lowercase, no spaces, never a "-latest" alias (API-NOTES §1.12). */
export function isExactModelId(s: unknown): s is string {
  return typeof s === 'string' && s.length <= 64 && /^[a-z0-9][a-z0-9.-]*$/.test(s) && !/-latest$/.test(s);
}
/** RequestOptions.timeout bounds: the SDK default is 180 s; anything outside 1 s–10 min is a config bug. */
export const TIMEOUT_MS_MIN = 1_000;
export const TIMEOUT_MS_MAX = 600_000;

/**
 * ARCH §9.2 "Cloud model" and "Timeout" columns. The adversary passes use `adversary_model`; the explainer and the S4
 * (Judge Mode) cloud side of the device jobs use `explain_cloud_model`. Device-job timeouts: `deviceImage` for the
 * image pre-screen, `deviceText` for the text jobs.
 */
export function cloudParamsFor(cfg: ModelConfig, job: JobName): CloudParams {
  const t = cfg.timeoutsMs;
  switch (job) {
    case 'adversaryA':
    case 'adversaryB':
      return { model: cfg.adversaryModel, thinkingLevel: cfg.adversaryThinking, timeoutMs: job === 'adversaryA' ? t.advA : t.advB,
        ...(cfg.adversarySeed !== 0 ? { seed: cfg.adversarySeed } : {}) };
    case 'explain':
      return { model: cfg.explainCloudModel, thinkingLevel: cfg.explainThinking, timeoutMs: t.explain };
    case 'preScreen':
      return { model: cfg.explainCloudModel, thinkingLevel: cfg.explainThinking, timeoutMs: t.deviceImage };
    case 'vaultTextMatch':
    case 'referee':
    case 'fixPlan':
      return { model: cfg.explainCloudModel, thinkingLevel: cfg.explainThinking, timeoutMs: t.deviceText };
    default: {
      const unknown: never = job;
      throw new RangeError(`models: no cloud parameters for job ${String(unknown)}`);
    }
  }
}

/**
 * Output caps. U-12 (whether thinking tokens count toward maxOutputTokens) is open, so none is low; MAX_TOKENS does
 * not throw, it truncates (API-NOTES §1.10). Pass B uses 16384, the only pass-B value ever exercised (T-031; D-91).
 */
export const MAX_OUTPUT_TOKENS = { judge: 2048, explain: 512, adversaryA: 4096, adversaryB: 16384 } as const;

// ---------- small helpers ----------
type JsonSchema = Record<string, unknown>;
/**
 * A PLAIN JSON Schema object for Chrome's responseConstraint and the cloud's responseJsonSchema (D-04; U-04: Schema
 * instances are unverified as responseConstraint). A fresh copy per use, so the SDK never shares our object.
 */
function plainSchema(schema: object): JsonSchema {
  const copy: unknown = JSON.parse(JSON.stringify(schema));
  if (copy === null || typeof copy !== 'object' || Array.isArray(copy)) throw new TypeError('models: a response schema must be a JSON object');
  return copy as JsonSchema;
}

function checkCloud(c: CloudParams, levels: readonly string[]): void {
  if (!isExactModelId(c.model)) throw new RangeError('models: the cloud model must be an exact model id (never -latest)');
  if (!levels.includes(c.thinkingLevel)) throw new RangeError('models: thinking level not allowed for this model');
  if (!Number.isInteger(c.timeoutMs) || c.timeoutMs < TIMEOUT_MS_MIN || c.timeoutMs > TIMEOUT_MS_MAX) {
    throw new RangeError('models: timeoutMs must be an integer from 1000 to 600000');
  }
  if (c.seed !== undefined && !Number.isSafeInteger(c.seed)) throw new RangeError('models: seed must be an integer');
}

/** generationConfig for the cloud: the given fields plus thinkingConfig (and the U-11 seed cast when non-zero). */
function cloudGenerationConfig(c: CloudParams, fields: GenerationConfig): GenerationConfig {
  const gc: GenerationConfig = { ...fields, thinkingConfig: { thinkingLevel: ThinkingLevel[c.thinkingLevel] } };
  if (c.seed) (gc as GenerationConfig & { seed?: number }).seed = c.seed;   // not in the type; forwarded unchanged (API-NOTES §1.11)
  return gc;
}

/** A text part. v13 parts are a discriminated union: every literal needs `type` (API-NOTES §1.8). */
export const textPart = (text: string): TextPart => ({ type: 'text', text });

/** Our re-encoded JPEG as an inline part: bare base64 (no "data:…;base64," prefix), mimeType image/jpeg (API-NOTES §1.8). */
export function jpegPart(base64: string): InlineDataPart {
  if (base64.length === 0 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new TypeError('jpegPart: expected bare base64 JPEG data (no data: prefix)');
  }
  return { type: 'inlineData', inlineData: { data: base64, mimeType: 'image/jpeg' } };
}

// ---------- device adapter check (fail closed) ----------
/** Thrown when a device-only model would have no on-device adapter (and would therefore go to the cloud). */
export class NoDeviceModelError extends Error {
  constructor() {
    super('models: no on-device model API when the model was built; a device-only model would run in the cloud');
    this.name = 'NoDeviceModelError';
  }
}
/**
 * The SDK reads the browser's on-device API only inside getGenerativeModel (chromeAdapterFactory, API-NOTES §1.3–1.4;
 * [VERIFIED: src 13.4.0]). A model built without it has no adapter, and then EVERY call, ONLY_ON_DEVICE included, goes
 * to the SDK's default cloud model. `chromeAdapter` is a TypeScript-private field of GenerativeModel, read on purpose:
 * it is exactly what the SDK captured, so this check cannot disagree with the SDK.
 */
const hasDeviceAdapter = (m: GenerativeModel): boolean => (m as unknown as { chromeAdapter?: unknown }).chromeAdapter != null;
function deviceOnly(m: GenerativeModel): GenerativeModel {
  if (!hasDeviceAdapter(m)) throw new NoDeviceModelError();
  return m;
}

// ---------- the factories (ARCH §9.3) ----------
/**
 * S0/S1 structured job (vault-text match, referee, fix plan; the S1 pre-screen with io 'image'). ONLY_ON_DEVICE and
 * no inCloudParams: nothing here is ever meant for the cloud. createOptions is the very object capabilities.ts passes
 * to availability() (D-86). Throws NoDeviceModelError when the SDK saw no on-device API (F-125): the gate's fresh
 * availability() check runs before every call anyway; this keeps a model that could only reach the cloud from existing.
 */
export function deviceJsonModel(ai: AI, io: NanoIo, schema: object): GenerativeModel {
  return deviceOnly(getGenerativeModel(ai, {
    mode: CLASS_MODE.S0,
    onDeviceParams: { createOptions: ioOptions(io), promptOptions: { responseConstraint: plainSchema(schema) } },
  }));
}

/**
 * "Download Gemini Nano" through the SDK's own path (SPEC SCR-02, AC-073; API-NOTES §1.6; D-87): returns a
 * DeviceModelInitializer that builds an ONLY_ON_DEVICE model with the createOptions of `io` (the same frozen object
 * availabilityNow(io) checks) and calls its initializeDeviceModel(onProgress). The model is built when the returned
 * function runs, so call it synchronously in the click handler (user activation). It only downloads, never prompts.
 * Rejects with NoDeviceModelError when the SDK saw no on-device API: its initializeDeviceModel would resolve doing
 * nothing, and the UI would report "downloaded" (F-125). Any synchronous throw also becomes a rejection.
 * Caveat (API-NOTES §1.6): the SDK never destroys the session its create() resolves to, so the model stays resident;
 * capabilities.ts's direct path (no initializer, the default per D-87) destroys it at once.
 */
export function initializeDeviceModelFor(ai: AI, io: NanoIo): DeviceModelInitializer {
  return (onProgress) => {
    try {
      const m = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { createOptions: ioOptions(io) } });
      if (!hasDeviceAdapter(m)) return Promise.reject(new NoDeviceModelError());
      return m.initializeDeviceModel(onProgress);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  };
}

/** S0 plain-text job: the explainer after a D-15 reclassification (vault text found in an S2 payload). Fails closed like deviceJsonModel. */
export function deviceTextModel(ai: AI): GenerativeModel {
  return deviceOnly(getGenerativeModel(ai, { mode: CLASS_MODE.S0, onDeviceParams: { createOptions: NANO_TEXT_IO } }));
}

/**
 * S4 Judge Mode, generic over the device jobs (preScreen, vaultTextMatch, referee, fixPlan): the same schema on the
 * device and in the cloud, PREFER_ON_DEVICE so judges without Nano get a real cloud fallback. `mode` is
 * ONLY_IN_CLOUD when the user turned Nano off (AC-277; the gate passes it, T-062), as for explainModel.
 */
export function judgeJsonModel(ai: AI, io: NanoIo, schema: object, cloud: CloudParams, mode: ExplainMode = CLASS_MODE.S4): GenerativeModel {
  if (mode !== InferenceMode.PREFER_ON_DEVICE && mode !== InferenceMode.ONLY_IN_CLOUD) throw new RangeError('judgeJsonModel: mode must be PREFER_ON_DEVICE or ONLY_IN_CLOUD');
  checkCloud(cloud, EXPLAIN_THINKING_LEVELS);
  return getGenerativeModel(ai, {
    mode,
    onDeviceParams: { createOptions: ioOptions(io), promptOptions: { responseConstraint: plainSchema(schema) } },
    inCloudParams: {
      model: cloud.model,
      generationConfig: cloudGenerationConfig(cloud, {
        responseMimeType: 'application/json', responseJsonSchema: plainSchema(schema), maxOutputTokens: MAX_OUTPUT_TOKENS.judge,
      }),
    },
  }, { timeout: cloud.timeoutMs });
}

/**
 * S2 explainer (and S4 explain in Judge Mode): public text only, with the SDK's real cloud fallback. Its instructions
 * are the first user-turn segment for both sides (D-04): no systemInstruction, no initialPrompts (U-44 open).
 * `mode` is PREFER_ON_DEVICE, or ONLY_IN_CLOUD when the user turned Nano off (AC-277).
 */
export function explainModel(ai: AI, cloud: CloudParams, mode: ExplainMode = CLASS_MODE.S2): GenerativeModel {
  if (mode !== InferenceMode.PREFER_ON_DEVICE && mode !== InferenceMode.ONLY_IN_CLOUD) throw new RangeError('explainModel: mode must be PREFER_ON_DEVICE or ONLY_IN_CLOUD');
  checkCloud(cloud, EXPLAIN_THINKING_LEVELS);
  return getGenerativeModel(ai, {
    mode,
    onDeviceParams: { createOptions: NANO_TEXT_IO },
    inCloudParams: { model: cloud.model, generationConfig: cloudGenerationConfig(cloud, { maxOutputTokens: MAX_OUTPUT_TOKENS.explain }) },
  }, { timeout: cloud.timeoutMs });
}

/** S3 pass A: Search-grounded, streamed, display-only (never parsed). Tools only ever on an ONLY_IN_CLOUD model (API-NOTES §1.4). */
export function adversaryAModel(ai: AI, system: string, cloud: CloudParams): GenerativeModel {
  checkCloud(cloud, ADVERSARY_THINKING_LEVELS);
  return getGenerativeModel(ai, {
    mode: CLASS_MODE.S3,
    inCloudParams: {
      model: cloud.model, systemInstruction: system, tools: [{ googleSearch: {} }],
      generationConfig: cloudGenerationConfig(cloud, { maxOutputTokens: MAX_OUTPUT_TOKENS.adversaryA }),
    },
  }, { timeout: cloud.timeoutMs });
}

/** S3 pass B: ungrounded structured JSON (no tools). Never sees pass A. */
export function adversaryBModel(ai: AI, system: string, cloud: CloudParams, schema: object): GenerativeModel {
  checkCloud(cloud, ADVERSARY_THINKING_LEVELS);
  return getGenerativeModel(ai, {
    mode: CLASS_MODE.S3,
    inCloudParams: {
      model: cloud.model, systemInstruction: system,
      generationConfig: cloudGenerationConfig(cloud, {
        responseMimeType: 'application/json', responseJsonSchema: plainSchema(schema), maxOutputTokens: MAX_OUTPUT_TOKENS.adversaryB,
      }),
    },
  }, { timeout: cloud.timeoutMs });
}
