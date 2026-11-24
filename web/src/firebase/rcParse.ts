// web/src/firebase/rcParse.ts: Remote Config strings → one validated, deep-frozen AppConfig (ARCH §13.2, §13.4;
// SPEC §16, AC-293, AC-295). Pure: no SDK import, so the parse is unit-tested in Node and mirrored by the iOS
// RemoteConfigService through shared/testvectors/rc.json (D-96, D-108). firebase/remoteConfig.ts feeds it.
// The ONLY key list and the ONLY defaults are /remoteconfig.template.json (AD-28): RC_DEFAULTS is derived from it and
// every default is parsed here at import, so a template edit that breaks a default throws and fails `npm run check`.
// Rules (D-108): an invalid value falls back to its default with a warning; an out-of-range number is clamped with a
// warning; three keys fail toward safety instead of the default (kill_switch → true, data_tier → free,
// grounding_enabled → false; D-108, D-118). Values are never
// echoed into warnings, so a hostile RC string can never reach the HUD or a log.
import template from '@root/remoteconfig.template.json';
import manifest from '@prompts/manifest.json';
import { DEFAULT_POLICY, effectivePolicy } from '../core/routing';
import { bandThresholdsOrDefault, DEFAULT_BANDS_M } from '../core/geo';
import { CLUE_TYPES, type BandThresholdsM, type ClueType, type RoutingPolicy } from '../core/types';
import {
  ADVERSARY_THINKING_LEVELS, EXPLAIN_THINKING_LEVELS, isExactModelId, TIMEOUT_MS_MAX, TIMEOUT_MS_MIN, type AdversaryThinking,
  type ExplainThinking, type TimeoutsMs,
} from '../ai/models';

// ---------- keys and defaults (straight from the template) ----------
export type RcKey = keyof typeof template.parameters;
/** The 28 keys, in template order. */
export const RC_KEYS: readonly RcKey[] = Object.freeze(Object.keys(template.parameters) as RcKey[]);
/** `rc.defaultConfig`: every template default string, unchanged (AC-295). */
export const RC_DEFAULTS: Readonly<Record<RcKey, string>> = Object.freeze(
  Object.fromEntries(RC_KEYS.map((k) => [k, template.parameters[k].defaultValue.value])) as Record<RcKey, string>);

export type ConfigSource = 'remote' | 'cached' | 'default';
/** `invalid`: the whole value was refused (default or fail-safe value used); `clamped`: a number was moved into range or
 *  to a whole number; `partial`: a JSON object was used, but some entries fell back to their defaults or were ignored. */
export type RcWarningReason = 'invalid' | 'clamped' | 'partial';
export interface RcWarning { readonly key: RcKey; readonly reason: RcWarningReason }

export const DATA_TIERS = ['paid', 'free'] as const;
export type DataTier = (typeof DATA_TIERS)[number];
/** `prompt_versions` keys (the bundled prompt families). The template default must name exactly these. */
export const PROMPT_FAMILIES = ['advA', 'advB', 'nanoPre', 'nanoVaultText', 'nanoRef', 'nanoFix', 'explain', 'fmPre'] as const;
export type PromptFamily = (typeof PROMPT_FAMILIES)[number];
const TIMEOUT_KEYS = ['advA', 'advB', 'explain', 'deviceImage', 'deviceText'] as const satisfies readonly (keyof TimeoutsMs)[];

/** Longest raw value accepted per kind, checked before any parsing (routing_policy has its own 8 KB cap, D-84). */
export const MAX_CHARS = { boolean: 16, number: 32, string: 64, json: 4096 } as const;

/** ARCH §13.4. Deep-frozen; field names match ai/models.ts ModelConfig, so `cfg()` can be passed to the factories. */
export interface AppConfig {
  readonly killSwitch: boolean;
  readonly routingPolicy: RoutingPolicy;
  /** routing.ts effectivePolicy's warning (the HUD logs copy.hud.policyRejected); not repeated in `warnings`. */
  readonly policyWarning: string | null;
  readonly adversaryModel: string;
  /** `adversary_fallback_models`: pass B's failover order after a 5xx/429 (D-165). Empty = no failover. */
  readonly adversaryFallbackModels: readonly string[];
  readonly adversaryThinking: AdversaryThinking;
  readonly explainCloudModel: string;
  readonly explainThinking: ExplainThinking;
  readonly promptVersions: Readonly<Record<PromptFamily, string>>;
  /** EFFECTIVE: `grounding_enabled && data_tier === 'paid'` (SPEC §16: free forces grounding off). */
  readonly groundingEnabled: boolean;
  readonly dataTier: DataTier;
  readonly dailyAdversaryCap: number;
  readonly maxFixRounds: number;
  readonly bandsM: Readonly<BandThresholdsM>;
  readonly autoMaskTypes: readonly ClueType[];
  readonly strictModeDefault: boolean;
  readonly fuzzyThreshold: number;
  readonly faceMinConfidence: number;
  readonly maskPadRatio: number;
  readonly cloudImageMaxPx: number;
  readonly nanoImageMaxPx: number;
  readonly ocrMaxPx: number;
  readonly timeoutsMs: Readonly<TimeoutsMs>;
  readonly judgeModeEnabled: boolean;
  readonly judgeCachedFallback: boolean;
  readonly judgeAutoplayDefault: boolean;
  readonly atlasEnabled: boolean;
  readonly extensionEnabled: boolean;
  readonly adversarySeed: number;
  readonly source: ConfigSource;
  /** One entry per key whose RC value was refused or adjusted (never the value itself). */
  readonly warnings: readonly RcWarning[];
}

// ---------- value parsers: a raw string → ok (maybe adjusted) or refused ----------
type Parse<T> = { ok: true; value: T; adjusted?: Exclude<RcWarningReason, 'invalid'> } | { ok: false };
interface Spec<T> {
  parse: (raw: string) => Parse<T>;
  /** Used instead of the default when the value is refused (fail toward safety, D-108). */
  failSafe?: T;
}
const NO: { ok: false } = { ok: false };
const yes = <T>(value: T, adjusted?: Exclude<RcWarningReason, 'invalid'>): Parse<T> => (adjusted ? { ok: true, value, adjusted } : { ok: true, value });
/** Only ASCII space, tab, CR and LF around a value are ignored (the same set on iOS; never BOM, NBSP or zero-width). */
const trimAscii = (s: string) => s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
const ASCII_WORD = /^[A-Za-z]+$/;
/** A JSON number, nothing else: no "+5", "0x10", ".5", "5.", "Infinity", "NaN" or digit separators. */
const NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/** "true" / "false", ASCII case-insensitive. */
function parseBoolean(raw: string): Parse<boolean> {
  if (raw.length > MAX_CHARS.boolean) return NO;
  const s = trimAscii(raw);
  if (!ASCII_WORD.test(s)) return NO;
  const l = s.toLowerCase();
  return l === 'true' ? yes(true) : l === 'false' ? yes(false) : NO;
}

/** One of `allowed`, compared after ASCII case folding to the list's own case (ASCII letters only). */
function oneOf<T extends string>(allowed: readonly T[], fold: 'upper' | 'lower') {
  return (raw: string): Parse<T> => {
    if (raw.length > MAX_CHARS.string) return NO;
    const s = trimAscii(raw);
    if (!ASCII_WORD.test(s)) return NO;
    const f = fold === 'upper' ? s.toUpperCase() : s.toLowerCase();
    return (allowed as readonly string[]).includes(f) ? yes(f as T) : NO;
  };
}

/** Exact model ID (ai/models.ts isExactModelId: lowercase, no spaces, never "-latest"); no trimming. */
function parseModelId(raw: string): Parse<string> {
  return raw.length <= MAX_CHARS.string && isExactModelId(raw) ? yes(raw) : NO;
}

/** At most this many `adversary_fallback_models` entries (each one is a whole extra gate call, D-165). */
export const MAX_FALLBACK_MODELS = 3;
/**
 * `adversary_fallback_models`: a JSON array of at most MAX_FALLBACK_MODELS distinct exact model IDs (isExactModelId; an
 * empty array = no failover). Anything else is refused whole, never partly used.
 */
function parseModelList(raw: string): Parse<string[]> {
  const p = parseJson(raw);
  if (!p.ok || !Array.isArray(p.json) || p.json.length > MAX_FALLBACK_MODELS) return NO;
  const out: string[] = [];
  for (const v of p.json as unknown[]) {
    if (!isExactModelId(v) || out.includes(v)) return NO;
    out.push(v);
  }
  return yes(out);
}

function toNumber(raw: string): number | null {
  if (raw.length > MAX_CHARS.number) return null;
  const s = trimAscii(raw);
  if (!NUMBER_RE.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null; // "1e999" → Infinity → refused
}

/** A number moved into [min, max] (and floored or rounded first when `whole`); `clamped` when that changed it. */
function clampedNumber(min: number, max: number, whole?: 'floor' | 'round') {
  return (raw: string): Parse<number> => {
    const n = toNumber(raw);
    if (n === null) return NO;
    const w = whole === 'floor' ? Math.floor(n) : whole === 'round' ? Math.round(n) : n;
    const v = Math.min(max, Math.max(min, w));
    return yes(v === 0 ? 0 : v, v !== n ? 'clamped' : undefined); // never -0
  };
}

/** A whole number in [min, max]; anything else is refused (a count or a seed is never silently moved). */
function integerIn(min: number, max: number) {
  return (raw: string): Parse<number> => {
    const n = toNumber(raw);
    return n !== null && Number.isInteger(n) && n >= min && n <= max ? yes(n === 0 ? 0 : n) : NO;
  };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
function parseJson(raw: string): { ok: true; json: unknown } | { ok: false } {
  if (raw.length > MAX_CHARS.json) return NO;
  try {
    return { ok: true, json: JSON.parse(raw) };
  } catch {
    return NO;
  }
}

const PROMPT_IDS: ReadonlySet<string> = new Set(Object.keys(manifest.prompts));
/** Default prompt IDs, needed by the per-entry fallback below; validated with everything else at import. */
const PROMPT_DEFAULTS = JSON.parse(RC_DEFAULTS.prompt_versions) as Record<PromptFamily, string>;
const isPromptIdFor = (fam: PromptFamily, v: unknown): v is string =>
  typeof v === 'string' && v.startsWith(`${fam}.`) && PROMPT_IDS.has(v);

/**
 * `prompt_versions`: a JSON object. Each family takes its RC ID only if that ID is bundled (shared/prompts/manifest.json)
 * and belongs to the family; otherwise the bundled default (v1). Unknown keys are ignored. Either case is `partial`.
 */
function parsePromptVersions(raw: string): Parse<Record<PromptFamily, string>> {
  const p = parseJson(raw);
  if (!p.ok || !isObj(p.json)) return NO;
  const o = p.json;
  const out = {} as Record<PromptFamily, string>;
  let partial = Object.keys(o).some((k) => !(PROMPT_FAMILIES as readonly string[]).includes(k));
  for (const fam of PROMPT_FAMILIES) {
    const v = Object.hasOwn(o, fam) ? o[fam] : undefined;
    if (isPromptIdFor(fam, v)) out[fam] = v;
    else { out[fam] = PROMPT_DEFAULTS[fam]; partial = true; }
  }
  return yes(out, partial ? 'partial' : undefined);
}

const BAND_KEYS = ['street', 'neighbourhood', 'district', 'city', 'country'] as const satisfies readonly (keyof BandThresholdsM)[];
/**
 * `bands_m`: core/geo bandThresholdsOrDefault (five strictly increasing metres; street/neighbourhood/district locked,
 * D-77), else refused. Unknown keys are ignored (`partial`).
 */
function parseBands(raw: string): Parse<BandThresholdsM> {
  const p = parseJson(raw);
  if (!p.ok || !isObj(p.json)) return NO;
  const t = bandThresholdsOrDefault(p.json);
  if (t === DEFAULT_BANDS_M) return NO; // geo returns that very object exactly when it refuses the table
  return yes(t, Object.keys(p.json).some((k) => !(BAND_KEYS as readonly string[]).includes(k)) ? 'partial' : undefined);
}

/** `auto_mask_types`: a JSON array of distinct CLUE_TYPES (an empty array is allowed); anything else is refused whole. */
function parseAutoMaskTypes(raw: string): Parse<ClueType[]> {
  const p = parseJson(raw);
  if (!p.ok || !Array.isArray(p.json) || p.json.length > CLUE_TYPES.length) return NO;
  const out: ClueType[] = [];
  for (const v of p.json as unknown[]) {
    if (typeof v !== 'string' || !(CLUE_TYPES as readonly string[]).includes(v) || out.includes(v as ClueType)) return NO;
    out.push(v as ClueType);
  }
  return yes(out);
}

/**
 * `timeouts_ms`: a JSON object. Each of the five jobs takes a finite JSON number, rounded and clamped to the factories'
 * 1 s–10 min (ai/models.ts); a missing or non-number entry takes its default; unknown keys are ignored. Any of that is
 * `partial`.
 */
const TIMEOUT_DEFAULTS = JSON.parse(RC_DEFAULTS.timeouts_ms) as TimeoutsMs;
function parseTimeouts(raw: string): Parse<TimeoutsMs> {
  const p = parseJson(raw);
  if (!p.ok || !isObj(p.json)) return NO;
  const o = p.json;
  const out = {} as TimeoutsMs;
  let partial = Object.keys(o).some((k) => !(TIMEOUT_KEYS as readonly string[]).includes(k));
  for (const k of TIMEOUT_KEYS) {
    const v = Object.hasOwn(o, k) ? o[k] : undefined;
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = Math.min(TIMEOUT_MS_MAX, Math.max(TIMEOUT_MS_MIN, Math.round(v)));
      if (out[k] !== v) partial = true;
    } else {
      out[k] = TIMEOUT_DEFAULTS[k];
      partial = true;
    }
  }
  return yes(out, partial ? 'partial' : undefined);
}

const bool: Spec<boolean> = { parse: parseBoolean };
const INT32_MAX = 2_147_483_647;

/** One spec per key except routing_policy (core/routing.ts effectivePolicy owns it). Ranges: ARCH §13.2. */
export const RC_SPECS = {
  kill_switch: { parse: parseBoolean, failSafe: true },
  adversary_model: { parse: parseModelId },
  adversary_fallback_models: { parse: parseModelList },
  adversary_thinking_level: { parse: oneOf(ADVERSARY_THINKING_LEVELS, 'upper') },
  explain_cloud_model: { parse: parseModelId },
  explain_thinking_level: { parse: oneOf(EXPLAIN_THINKING_LEVELS, 'upper') },
  prompt_versions: { parse: parsePromptVersions },
  grounding_enabled: { parse: parseBoolean, failSafe: false }, // refused → off, like data_tier → free (D-118)
  data_tier: { parse: oneOf(DATA_TIERS, 'lower'), failSafe: 'free' as DataTier },
  daily_adversary_cap: { parse: clampedNumber(1, 200, 'floor') },
  max_fix_rounds: { parse: integerIn(1, 10) },
  bands_m: { parse: parseBands },
  auto_mask_types: { parse: parseAutoMaskTypes },
  strict_mode_default: bool,
  fuzzy_threshold: { parse: clampedNumber(0.6, 0.98) },
  face_min_confidence: { parse: clampedNumber(0.2, 0.6) },
  mask_pad_ratio: { parse: clampedNumber(0, 0.5) },
  cloud_image_max_px: { parse: clampedNumber(768, 2048, 'floor') },
  nano_image_max_px: { parse: clampedNumber(256, 768, 'floor') },
  ocr_max_px: { parse: clampedNumber(800, 2048, 'round') },
  timeouts_ms: { parse: parseTimeouts },
  judge_mode_enabled: bool,
  judge_cached_fallback: bool,
  judge_autoplay_default: bool,
  atlas_enabled: bool,
  extension_enabled: bool,
  adversary_seed: { parse: integerIn(-INT32_MAX - 1, INT32_MAX) },
} satisfies { [K in Exclude<RcKey, 'routing_policy'>]: Spec<unknown> };
type SpecKey = keyof typeof RC_SPECS;
type ValueOf<K extends SpecKey> = (typeof RC_SPECS)[K] extends Spec<infer T> ? T : never;
export type ParsedKey<T> = { value: T; warning: RcWarningReason | null };

/** The template defaults, parsed. Throws (so `npm run check` fails) if any default is refused or adjusted. */
const DEFAULT_VALUES = Object.fromEntries((Object.keys(RC_SPECS) as SpecKey[]).map((k) => {
  const r = (RC_SPECS[k] as Spec<unknown>).parse(RC_DEFAULTS[k]);
  if (!r.ok || r.adjusted) throw new Error(`remoteconfig.template.json: ${k} default is ${r.ok ? r.adjusted : 'invalid'}`);
  return [k, r.value];
})) as { [K in SpecKey]: ValueOf<K> };
deepFreeze(DEFAULT_VALUES); // parseKey hands these out as fallbacks: never shared-mutable

/**
 * One key's RC value → its validated value and warning (shared/testvectors/rc.json runs every case through this).
 * A non-string (web only: an RC value is always a string) is `invalid`.
 */
export function parseKey<K extends SpecKey>(key: K, raw: unknown): ParsedKey<ValueOf<K>> {
  const spec = RC_SPECS[key] as Spec<ValueOf<K>>;
  const r = typeof raw === 'string' ? spec.parse(raw) : NO;
  if (!r.ok) return { value: spec.failSafe !== undefined ? spec.failSafe : DEFAULT_VALUES[key], warning: 'invalid' };
  return { value: r.value, warning: r.adjusted ?? null };
}

/**
 * Every key → the AppConfig (ARCH §13.4). `raw` maps RC keys to their active string values; a missing key takes the
 * template default with no warning (the SDK always has one through `defaultConfig`). Pure and deterministic.
 */
export function parseConfig(raw: Readonly<Partial<Record<string, unknown>>>, source: ConfigSource = 'default'): AppConfig {
  const warnings: RcWarning[] = [];
  const val = <K extends SpecKey>(k: K): ValueOf<K> => {
    const r = parseKey(k, Object.hasOwn(raw, k) ? raw[k] : RC_DEFAULTS[k]);
    if (r.warning) warnings.push({ key: k, reason: r.warning });
    return r.value;
  };
  // No routing_policy value at all → DEFAULT_POLICY itself (effectivePolicy(undefined)); the default string → an equal copy.
  const policy = effectivePolicy(Object.hasOwn(raw, 'routing_policy') ? raw.routing_policy : undefined);
  const dataTier = val('data_tier');
  const config: AppConfig = {
    killSwitch: val('kill_switch'),
    routingPolicy: policy.policy,
    policyWarning: policy.warning,
    adversaryModel: val('adversary_model'),
    adversaryFallbackModels: val('adversary_fallback_models'),
    adversaryThinking: val('adversary_thinking_level'),
    explainCloudModel: val('explain_cloud_model'),
    explainThinking: val('explain_thinking_level'),
    promptVersions: val('prompt_versions'),
    groundingEnabled: val('grounding_enabled') && dataTier === 'paid',
    dataTier,
    dailyAdversaryCap: val('daily_adversary_cap'),
    maxFixRounds: val('max_fix_rounds'),
    bandsM: val('bands_m'),
    autoMaskTypes: val('auto_mask_types'),
    strictModeDefault: val('strict_mode_default'),
    fuzzyThreshold: val('fuzzy_threshold'),
    faceMinConfidence: val('face_min_confidence'),
    maskPadRatio: val('mask_pad_ratio'),
    cloudImageMaxPx: val('cloud_image_max_px'),
    nanoImageMaxPx: val('nano_image_max_px'),
    ocrMaxPx: val('ocr_max_px'),
    timeoutsMs: val('timeouts_ms'),
    judgeModeEnabled: val('judge_mode_enabled'),
    judgeCachedFallback: val('judge_cached_fallback'),
    judgeAutoplayDefault: val('judge_autoplay_default'),
    atlasEnabled: val('atlas_enabled'),
    extensionEnabled: val('extension_enabled'),
    adversarySeed: val('adversary_seed'),
    source,
    warnings: warnings.sort((a, b) => RC_KEYS.indexOf(a.key) - RC_KEYS.indexOf(b.key)), // template order
  };
  return deepFreeze(config);
}

/** Freezes in place, depth first (the routing policy and the shared default objects are read-only anyway). */
function deepFreeze<T>(o: T): T {
  if (typeof o === 'object' && o !== null && !Object.isFrozen(o)) {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

/** The template defaults as an AppConfig: what cfg() returns before Remote Config has initialised. */
export const DEFAULT_CONFIG: AppConfig = parseConfig({}, 'default');
if (DEFAULT_CONFIG.warnings.length || DEFAULT_CONFIG.policyWarning !== null || DEFAULT_CONFIG.routingPolicy !== DEFAULT_POLICY) {
  throw new Error('remoteconfig.template.json: the defaults do not parse cleanly');
}

/** True when two configs hold the same values (cfg() keeps its object identity until something really changes). */
export function sameConfig(a: AppConfig, b: AppConfig): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
