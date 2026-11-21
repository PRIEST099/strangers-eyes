// web/src/core/routing.ts — routing policy as data, with a hard floor in code (ARCH §7; SPEC §6.1, D-14 = AD-04, AC-020).
// The bundled default is the `routing_policy` default in /remoteconfig.template.json (AD-28): never a hand-kept copy.
// HARD_FLOOR is the opposite: it is CODE, deliberately not read from the template, so neither a Remote Config value
// nor an edit to the template can loosen S0 or S1. Pure functions; the HUD and the gate consume the result.
import template from '@root/remoteconfig.template.json';
import type { StringId } from './strings';
import type { ClassPolicy, IosMode, JobName, NoModelFallback, PayloadClass, RoutingPolicy, WebMode } from './types';

// ---------- enum sets: a `Record<Union, true>` literal fails to compile if a member is missing or extra ----------
const CLASS_SET: Record<PayloadClass, true> = { S0: true, S1: true, S2: true, S3: true, S4: true };
const JOB_SET: Record<JobName, true> = {
  preScreen: true, vaultTextMatch: true, referee: true, fixPlan: true, explain: true, adversaryA: true, adversaryB: true };
const WEB_SET: Record<WebMode, true> = { ONLY_ON_DEVICE: true, PREFER_ON_DEVICE: true, PREFER_IN_CLOUD: true, ONLY_IN_CLOUD: true };
const IOS_SET: Record<IosMode, true> = { ON_DEVICE_SESSION: true, HYBRID_MODEL: true, CLOUD: true, NONE: true };
const NO_MODEL_SET: Record<NoModelFallback, true> = { DETERMINISTIC: true, TIER0: true, CLOUD: true, NONE: true };

/** S0..S4 in order (the HUD Policy table, AC-026). */
export const PAYLOAD_CLASSES: readonly PayloadClass[] = Object.freeze(Object.keys(CLASS_SET) as PayloadClass[]);
/** Every job in the policy, in ARCH §7 order. */
export const JOB_NAMES: readonly JobName[] = Object.freeze(Object.keys(JOB_SET) as JobName[]);
const CLASS_FIELDS = ['web', 'ios', 'noModel', 'cloud'] as const satisfies readonly (keyof ClassPolicy)[];

/** The only policy shape this code understands. Any other `version` is rejected (D-84). */
export const POLICY_VERSION = 1;
/**
 * RC values longer than this are rejected before JSON.parse. The default is about 640 characters, and a
 * pretty-printed copy about 1.5 KB.
 */
export const MAX_POLICY_CHARS = 8 * 1024;
/** What the HUD logs whenever `warning` is set (SPEC §11, AC-020). */
export const POLICY_REJECTED_COPY = 'copy.hud.policyRejected' as const satisfies StringId;

type Allowed<T> = readonly T[];
type ClassFloor = { readonly [K in keyof ClassPolicy]?: Allowed<ClassPolicy[K]> };
export interface HardFloor {
  readonly classes: Readonly<Partial<Record<PayloadClass, ClassFloor>>>;
  readonly jobs: Readonly<Record<JobName, Allowed<PayloadClass>>>;
}

/**
 * ARCH §7 step 2. Each listed entry must hold one of its allowed values; anything else keeps the bundled value
 * for that entry. Unlisted entries (S2, S4, and S3 except `web`) are RC-tunable (step 3).
 */
export const HARD_FLOOR: HardFloor = deepFreeze({
  classes: {
    S0: { web: ['ONLY_ON_DEVICE'], ios: ['ON_DEVICE_SESSION'], noModel: ['DETERMINISTIC'], cloud: [false] },
    S1: { web: ['ONLY_ON_DEVICE'], ios: ['ON_DEVICE_SESSION'], noModel: ['TIER0'], cloud: [false] },
    S3: { web: ['ONLY_IN_CLOUD'] },
  },
  jobs: {
    preScreen: ['S1'],
    vaultTextMatch: ['S0'],
    referee: ['S0'],
    fixPlan: ['S0'],
    explain: ['S2', 'S0'], // S0 is a tightening: the explainer then never falls back to the cloud
    adversaryA: ['S3'],
    adversaryB: ['S3'],
  },
});

/**
 * ARCH §7 step 4: in Judge Mode the device jobs run as S4. The gate still demands a SyntheticProof for every S4 call
 * (AC-023); this list only picks the class.
 */
export const JUDGE_DEVICE_JOBS: readonly JobName[] = Object.freeze(['preScreen', 'vaultTextMatch', 'referee', 'fixPlan', 'explain']);

export type PolicyRejection = 'not_string' | 'too_large' | 'invalid_json' | 'bad_shape' | 'bad_version' | 'unknown_enum' | 'floor';
export interface EffectivePolicy {
  /** Deep-frozen at runtime and deep-readonly in type (D-95). Always floor-compliant. */
  policy: RoutingPolicy;
  /**
   * null when the RC value was taken as is. Otherwise `<PolicyRejection>` or `<PolicyRejection>: <paths>`, where the
   * paths are built from this module's own key lists, never echoed from the RC value. The HUD logs
   * POLICY_REJECTED_COPY and may show this detail in the developer view.
   */
  warning: string | null;
}

// ---------- parsing (step 1) ----------
type Obj = Record<string, unknown>;
export type ParsedPolicy = { ok: true; policy: RoutingPolicy } | { ok: false; reason: PolicyRejection; path: string };

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isOneOf = <T extends string>(set: Record<T, true>, v: unknown): v is T => typeof v === 'string' && Object.hasOwn(set, v);
/** Own keys exactly equal to `keys` (JSON.parse makes "__proto__" an own key, so it counts as an extra key). */
const hasExactKeys = (o: Obj, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));
const fail = (reason: PolicyRejection, path: string): ParsedPolicy => ({ ok: false, reason, path });

function enumField<T extends string>(set: Record<T, true>, v: unknown, path: string): T | ParsedPolicy {
  if (typeof v !== 'string') return fail('bad_shape', path);
  return isOneOf(set, v) ? v : fail('unknown_enum', path);
}

function parseClass(v: unknown, path: string): ClassPolicy | ParsedPolicy {
  if (!isObj(v) || !hasExactKeys(v, CLASS_FIELDS)) return fail('bad_shape', path);
  const web = enumField(WEB_SET, v.web, `${path}.web`);
  if (typeof web !== 'string') return web;
  const ios = enumField(IOS_SET, v.ios, `${path}.ios`);
  if (typeof ios !== 'string') return ios;
  const noModel = enumField(NO_MODEL_SET, v.noModel, `${path}.noModel`);
  if (typeof noModel !== 'string') return noModel;
  if (typeof v.cloud !== 'boolean') return fail('bad_shape', `${path}.cloud`);
  return { web, ios, noModel, cloud: v.cloud };
}

/** A JSON-parsed value → a full, valid RoutingPolicy, or the first problem found. Fixed depth: never recursive. */
export function parsePolicy(v: unknown): ParsedPolicy {
  if (!isObj(v) || !hasExactKeys(v, ['version', 'classes', 'jobs'])) return fail('bad_shape', '(root)');
  if (typeof v.version !== 'number') return fail('bad_shape', 'version');
  if (v.version !== POLICY_VERSION) return fail('bad_version', 'version');
  const rawClasses = v.classes;
  if (!isObj(rawClasses) || !hasExactKeys(rawClasses, PAYLOAD_CLASSES)) return fail('bad_shape', 'classes');
  const classes = {} as Record<PayloadClass, ClassPolicy>;
  for (const c of PAYLOAD_CLASSES) {
    const p = parseClass(rawClasses[c], `classes.${c}`);
    if ('ok' in p) return p;
    classes[c] = p;
  }
  const rawJobs = v.jobs;
  if (!isObj(rawJobs) || !hasExactKeys(rawJobs, JOB_NAMES)) return fail('bad_shape', 'jobs');
  const jobs = {} as Record<JobName, PayloadClass>;
  for (const j of JOB_NAMES) {
    const c = enumField(CLASS_SET, rawJobs[j], `jobs.${j}`);
    if (typeof c !== 'string') return c;
    jobs[j] = c;
  }
  return { ok: true, policy: { version: v.version, classes, jobs } };
}

// ---------- the hard floor (step 2) ----------
/** The floor paths `policy` violates, e.g. `classes.S0.web`, `jobs.referee`. Empty = compliant. */
export function floorViolations(policy: RoutingPolicy): string[] {
  const out: string[] = [];
  for (const c of PAYLOAD_CLASSES) {
    const rules = HARD_FLOOR.classes[c];
    if (!rules) continue;
    for (const k of CLASS_FIELDS) if (!allows(rules[k], policy.classes[c][k])) out.push(`classes.${c}.${k}`);
  }
  for (const j of JOB_NAMES) if (!HARD_FLOOR.jobs[j].includes(policy.jobs[j])) out.push(`jobs.${j}`);
  return out;
}

const allows = <T>(allowed: Allowed<T> | undefined, v: T) => allowed === undefined || allowed.includes(v);

/** Every violating entry keeps the bundled value; everything else is the candidate's. */
function applyFloor(cand: RoutingPolicy, bundled: RoutingPolicy): { policy: RoutingPolicy; violations: string[] } {
  const violations = floorViolations(cand);
  const classes = {} as Record<PayloadClass, ClassPolicy>;
  for (const c of PAYLOAD_CLASSES) {
    const pick = <K extends keyof ClassPolicy>(k: K): ClassPolicy[K] =>
      violations.includes(`classes.${c}.${k}`) ? bundled.classes[c][k] : cand.classes[c][k];
    classes[c] = { web: pick('web'), ios: pick('ios'), noModel: pick('noModel'), cloud: pick('cloud') };
  }
  const jobs = {} as Record<JobName, PayloadClass>;
  for (const j of JOB_NAMES) jobs[j] = violations.includes(`jobs.${j}`) ? bundled.jobs[j] : cand.jobs[j];
  return { policy: { version: cand.version, classes, jobs }, violations };
}

// ---------- the bundled default ----------
/** The template's routing_policy string → a frozen policy. Throws unless it is valid AND floor-compliant. */
export function loadBundledDefault(raw: string): RoutingPolicy {
  let json: unknown;
  try { json = JSON.parse(raw); } catch { throw new Error('remoteconfig.template.json: routing_policy default is not JSON'); }
  const p = parsePolicy(json);
  if (!p.ok) throw new Error(`remoteconfig.template.json: routing_policy default is invalid (${p.reason}: ${p.path})`);
  const bad = floorViolations(p.policy);
  if (bad.length) throw new Error(`remoteconfig.template.json: routing_policy default breaks the hard floor (${bad.join(', ')})`);
  return deepFreeze(p.policy);
}

/**
 * The `routing_policy` default from /remoteconfig.template.json, validated at import. A template edit that breaks
 * the shape or the floor throws here, so `npm run check` fails instead of the app shipping it.
 */
export const DEFAULT_POLICY: RoutingPolicy = loadBundledDefault(template.parameters.routing_policy.defaultValue.value);

// ---------- the loader ----------
const fallback = (reason: PolicyRejection, path?: string): EffectivePolicy =>
  ({ policy: DEFAULT_POLICY, warning: path ? `${reason}: ${path}` : reason });

/**
 * ARCH §7: the RC `routing_policy` string → the policy in force.
 * - `undefined` (no RC value yet) → the bundled default, no warning.
 * - Not a string, over MAX_POLICY_CHARS, invalid JSON, a wrong shape (missing, extra or mistyped keys), another
 *   `version`, or an unknown enum value → the bundled default as a whole, with a warning.
 * - Otherwise each hard-floor violation keeps the bundled value for that entry, with a warning; the rest of the RC
 *   value (S2, S4, S3 except `web`, `jobs.explain` S2 → S0) is taken as is.
 * User and developer downgrades (AD-33) are the gate's job, not this function's (step 5).
 */
export function effectivePolicy(rcValue: unknown): EffectivePolicy {
  if (rcValue === undefined) return { policy: DEFAULT_POLICY, warning: null };
  if (typeof rcValue !== 'string') return fallback('not_string');
  if (rcValue.length > MAX_POLICY_CHARS) return fallback('too_large');
  let json: unknown;
  try { json = JSON.parse(rcValue); } catch { return fallback('invalid_json'); }
  const parsed = parsePolicy(json);
  if (!parsed.ok) return fallback(parsed.reason, parsed.path);
  const { policy, violations } = applyFloor(parsed.policy, DEFAULT_POLICY);
  return { policy: deepFreeze(policy), warning: violations.length ? `floor: ${violations.join(', ')}` : null };
}

/** The class a job runs as: S4 for the device jobs in Judge Mode (step 4), otherwise the policy's class. */
export function jobClass(policy: RoutingPolicy, job: JobName, judgeMode: boolean): PayloadClass {
  return judgeMode && JUDGE_DEVICE_JOBS.includes(job) ? 'S4' : policy.jobs[job];
}

function deepFreeze<T>(o: T): T {
  if (typeof o === 'object' && o !== null && !Object.isFrozen(o)) {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}
