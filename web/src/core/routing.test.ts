import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import template from '@root/remoteconfig.template.json';
import manifest from '@prompts/manifest.json';
import en from '@strings/en.json';
import rcVectors from '@vectors/rc.json';
import {
  DEFAULT_POLICY, effectivePolicy, floorViolations, HARD_FLOOR, JOB_NAMES, jobClass, JUDGE_DEVICE_JOBS, loadBundledDefault,
  MAX_POLICY_CHARS, parsePolicy, PAYLOAD_CLASSES, POLICY_REJECTED_COPY, POLICY_VERSION,
} from './routing';
import type { IosMode, JobName, NoModelFallback, PayloadClass, RoutingPolicy, WebMode } from './types';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// ARCH §7, typed by hand: the template default must equal it (so DEFAULT_POLICY really comes from the template).
const EXPECTED: RoutingPolicy = {
  version: 1,
  classes: {
    S0: { web: 'ONLY_ON_DEVICE', ios: 'ON_DEVICE_SESSION', noModel: 'DETERMINISTIC', cloud: false },
    S1: { web: 'ONLY_ON_DEVICE', ios: 'ON_DEVICE_SESSION', noModel: 'TIER0', cloud: false },
    S2: { web: 'PREFER_ON_DEVICE', ios: 'HYBRID_MODEL', noModel: 'CLOUD', cloud: true },
    S3: { web: 'ONLY_IN_CLOUD', ios: 'CLOUD', noModel: 'CLOUD', cloud: true },
    S4: { web: 'PREFER_ON_DEVICE', ios: 'HYBRID_MODEL', noModel: 'CLOUD', cloud: true },
  },
  jobs: { preScreen: 'S1', vaultTextMatch: 'S0', referee: 'S0', fixPlan: 'S0', explain: 'S2', adversaryA: 'S3', adversaryB: 'S3' },
};
const WEB: WebMode[] = ['ONLY_ON_DEVICE', 'PREFER_ON_DEVICE', 'PREFER_IN_CLOUD', 'ONLY_IN_CLOUD'];
const IOS: IosMode[] = ['ON_DEVICE_SESSION', 'HYBRID_MODEL', 'CLOUD', 'NONE'];
const NO_MODEL: NoModelFallback[] = ['DETERMINISTIC', 'TIER0', 'CLOUD', 'NONE'];
const CLASSES: PayloadClass[] = ['S0', 'S1', 'S2', 'S3', 'S4'];
const JOBS: JobName[] = ['preScreen', 'vaultTextMatch', 'referee', 'fixPlan', 'explain', 'adversaryA', 'adversaryB'];

type Loose = Record<string, any>; // tests build hostile shapes on purpose
const base = (): Loose => structuredClone(EXPECTED);
/** The RC string for EXPECTED after `patch` edits a deep copy of it. */
const rc = (patch: (p: Loose) => void = () => {}) => { const p = base(); patch(p); return JSON.stringify(p); };
const rejected = (input: unknown, warning: string) => {
  const r = effectivePolicy(input);
  expect(r.warning).toBe(warning);
  expect(r.policy).toBe(DEFAULT_POLICY); // the bundled policy as a whole, never a partial merge
};

// ---------- shared/testvectors/rc.json (routingPolicy): the cases the iOS port runs too (D-96) ----------
type Edit = { path: string[]; value?: unknown; delete?: boolean };
type VInput = { absent: true } | { notString: unknown } | { raw: string } | { edits: Edit[] } | { padTo: number }
  | { repeat: { text: string; times: number } };
interface VCase { group: 'accept' | 'floor' | 'reject'; name: string; input: VInput; expect: { warning: string | null; policy: 'default' | { edits: Edit[] } } }
interface RoutingVectors { default: RoutingPolicy; maxChars: number; hardFloor: unknown; judgeDeviceJobs: JobName[]; cases: VCase[] }
const V = rcVectors.routingPolicy as unknown as RoutingVectors;

function applyEdits(edits: Edit[]): Loose {
  const p = structuredClone(V.default) as Loose;
  for (const ed of edits) {
    if (ed.path.includes('__proto__')) throw new Error('rc.json: "__proto__" cases must be raw strings');
    let o = p;
    for (const k of ed.path.slice(0, -1)) o = o[k];
    const last = ed.path[ed.path.length - 1];
    if (ed.delete) delete o[last];
    else o[last] = structuredClone(ed.value);
  }
  return p;
}
function inputOf(i: VInput): unknown {
  if ('absent' in i) return undefined;
  if ('notString' in i) return i.notString;
  if ('raw' in i) return i.raw;
  if ('edits' in i) return JSON.stringify(applyEdits(i.edits));
  if ('padTo' in i) { const s = JSON.stringify(V.default); return s.slice(0, -1) + ' '.repeat(i.padTo - s.length) + '}'; }
  return i.repeat.text.repeat(i.repeat.times);
}
const reasonOf = (w: string | null) => (w === null ? null : w.split(':')[0]);

// ---------- ARCH, read from the doc itself so the template can never drift from it ----------
const ARCH = readFileSync(join(ROOT, 'docs/ARCHITECTURE.md'), 'utf8');
function archSection(heading: RegExp, endAt: RegExp): string[] {
  const lines = ARCH.split('\n');
  const start = lines.findIndex((l) => heading.test(l));
  const end = lines.findIndex((l, i) => i > start && endAt.test(l));
  return start < 0 || end < 0 ? [] : lines.slice(start + 1, end);
}
function firstJsonBlock(lines: string[]): string {
  const a = lines.indexOf('```json');
  const b = lines.indexOf('```', a + 1);
  return a < 0 || b < 0 ? '' : lines.slice(a + 1, b).join('\n');
}
/** ARCH §13.2 rows: `| \`key\` | TYPE | default | meaning |`. */
function archRcTable(): { key: string; type: string; def: string; meaning: string }[] {
  return archSection(/^### 13\.2 Keys/, /^(### |\*\*Renames)/).flatMap((l) => {
    const m = /^\| `([a-z_]+)` \| (BOOLEAN|NUMBER|STRING|JSON) \| (.+?) \|(.*)\|$/.exec(l); // the meaning may be empty
    return m ? [{ key: m[1], type: m[2], def: m[3].replace(/^`(.*)`$/, '$1'), meaning: m[4].trim() }] : [];
  });
}

describe('remoteconfig.template.json', () => {
  const params = template.parameters as Record<string, { defaultValue: { value: string }; valueType: string; description: string }>;
  const table = archRcTable();

  it('has exactly the 28 keys of the ARCH §13.2 table (D-40; D-165 added adversary_fallback_models)', () => {
    expect(table).toHaveLength(28);
    expect(Object.keys(params).sort()).toEqual(table.map((r) => r.key).sort());
  });

  it('matches every (key, valueType, default) of the ARCH §13.2 table', () => {
    for (const { key, type, def } of table) {
      const p = params[key];
      expect(p.valueType, key).toBe(type);
      expect(typeof p.defaultValue.value, key).toBe('string');
      const v = p.defaultValue.value;
      if (key === 'routing_policy') {
        expect(def).toBe('§7');
        expect(JSON.parse(v), 'routing_policy = the ARCH §7 block').toEqual(JSON.parse(firstJsonBlock(archSection(/^## 7\. Routing policy/, /^## 8\./))));
      } else if (key === 'prompt_versions') {
        // The table elides the middle ("…"): check its explicit pairs, then pin the rest to the bundled v1 prompts.
        for (const [, k, id] of def.matchAll(/"(\w+)":"([\w.]+)"/g)) expect(JSON.parse(v)[k], `prompt_versions.${k}`).toBe(id);
        const v1 = Object.keys(manifest.prompts).filter((id) => id.endsWith('.v1'));
        expect(JSON.parse(v)).toEqual(Object.fromEntries(v1.map((id) => [id.slice(0, -'.v1'.length), id])));
      } else if (type === 'JSON') {
        expect(JSON.parse(v), key).toEqual(JSON.parse(def));
      } else {
        expect(v, key).toBe(def);
      }
      if (type === 'BOOLEAN') expect(['true', 'false'], key).toContain(v);
      if (type === 'NUMBER') expect(String(Number(v)), key).toBe(v);
    }
  });

  it('names every ARCH §13.2 clamp in the description', () => {
    let clamps = 0;
    for (const { key, meaning } of table) {
      const m = /Clamped (\d+(?:\.\d+)?)–(\d+(?:\.\d+)?)/.exec(meaning);
      if (!m) continue;
      clamps++;
      expect(params[key].description.toLowerCase(), key).toContain(`clamped ${m[1]}-${m[2]}`);
    }
    expect(clamps).toBe(7); // daily cap, fuzzy, face, mask pad, cloud px, nano px (D-98, added by T-102), OCR px
  });

  it('is byte-identical to the ARCH §13.3 block', () => {
    const block = firstJsonBlock(archSection(/^### 13\.3 `remoteconfig\.template\.json`/, /^### 13\.4/));
    expect(block.length).toBeGreaterThan(1000);
    expect(readFileSync(join(ROOT, 'remoteconfig.template.json'), 'utf8')).toBe(block + '\n');
  });
});

describe('DEFAULT_POLICY', () => {
  it('is the template routing_policy default, equal to ARCH §7 and to rc.json', () => {
    expect(DEFAULT_POLICY).toEqual(EXPECTED);
    expect(V.default).toEqual(EXPECTED);
    expect(JSON.parse(template.parameters.routing_policy.defaultValue.value)).toEqual(EXPECTED);
    expect(DEFAULT_POLICY.version).toBe(POLICY_VERSION);
  });
  it('meets the hard floor', () => {
    expect(floorViolations(DEFAULT_POLICY)).toEqual([]);
  });
  it('is deeply frozen and readonly at compile time (D-95)', () => {
    const P = DEFAULT_POLICY;
    expect(Object.isFrozen(P) && Object.isFrozen(P.classes) && Object.isFrozen(P.classes.S0) && Object.isFrozen(P.jobs)).toBe(true);
    // Each line below must stay a compile error: tsc fails on an unused @ts-expect-error.
    // @ts-expect-error ClassPolicy fields are readonly
    expect(() => { P.classes.S2.web = 'ONLY_IN_CLOUD'; }).toThrow(TypeError);
    // @ts-expect-error classes is readonly
    expect(() => { P.classes.S0 = P.classes.S3; }).toThrow(TypeError);
    // @ts-expect-error jobs is readonly
    expect(() => { P.jobs.referee = 'S2'; }).toThrow(TypeError);
    // @ts-expect-error version is readonly
    expect(() => { P.version = 2; }).toThrow(TypeError);
    const { policy } = effectivePolicy(rc((p) => { p.classes.S2.web = 'PREFER_IN_CLOUD'; }));
    // @ts-expect-error EffectivePolicy.policy is readonly too
    expect(() => { policy.classes.S0.cloud = true; }).toThrow(TypeError);
  });
  it('refuses a template default that is not JSON, has the wrong shape, or breaks the floor', () => {
    expect(loadBundledDefault(rc())).toEqual(EXPECTED);
    expect(() => loadBundledDefault('{')).toThrow(/not JSON/);
    expect(() => loadBundledDefault(rc((p) => { delete p.jobs.referee; }))).toThrow(/invalid \(bad_shape: jobs\)/);
    expect(() => loadBundledDefault(rc((p) => { p.classes.S1.cloud = true; }))).toThrow(/hard floor \(classes\.S1\.cloud\)/);
    expect(() => loadBundledDefault(rc((p) => { p.jobs.fixPlan = 'S2'; }))).toThrow(/hard floor \(jobs\.fixPlan\)/);
  });
});

describe('constants', () => {
  it('pin HARD_FLOOR (every S0/S1 field to one value) and match rc.json', () => {
    expect(HARD_FLOOR.classes.S0).toEqual({ web: ['ONLY_ON_DEVICE'], ios: ['ON_DEVICE_SESSION'], noModel: ['DETERMINISTIC'], cloud: [false] });
    expect(HARD_FLOOR.classes.S1).toEqual({ web: ['ONLY_ON_DEVICE'], ios: ['ON_DEVICE_SESSION'], noModel: ['TIER0'], cloud: [false] });
    expect(HARD_FLOOR).toEqual(V.hardFloor);
  });
  it('freeze HARD_FLOOR deeply, so no caller can loosen it at runtime', () => {
    expect(Object.isFrozen(HARD_FLOOR.classes.S0)).toBe(true);
    expect(Object.isFrozen(HARD_FLOOR.classes.S0?.web)).toBe(true);
    expect(() => { (HARD_FLOOR.jobs.referee as unknown as string[]).push('S2'); }).toThrow(TypeError);
  });
  it('pin MAX_POLICY_CHARS to 8192 (rc.json maxChars)', () => {
    expect(MAX_POLICY_CHARS).toBe(8192);
    expect(V.maxChars).toBe(8192);
  });
  it('list the classes, jobs and Judge-Mode device jobs in ARCH order, frozen', () => {
    expect(PAYLOAD_CLASSES).toEqual(CLASSES);
    expect(JOB_NAMES).toEqual(JOBS);
    expect(JUDGE_DEVICE_JOBS).toEqual(V.judgeDeviceJobs);
    for (const list of [PAYLOAD_CLASSES, JOB_NAMES, JUDGE_DEVICE_JOBS]) {
      expect(Object.isFrozen(list)).toBe(true);
      expect(() => { (list as unknown as string[]).push('adversaryA'); }).toThrow(TypeError);
    }
  });
  it('name a copy ID that exists', () => {
    expect(en).toHaveProperty([POLICY_REJECTED_COPY]);
  });
});

describe('effectivePolicy: shared/testvectors/rc.json', () => {
  it.each(V.cases)('[$group] $name', (c) => {
    const r = effectivePolicy(inputOf(c.input));
    expect(r.warning).toBe(c.expect.warning);
    expect(r.policy).toEqual(c.expect.policy === 'default' ? V.default : applyEdits(c.expect.policy.edits));
    expect(floorViolations(r.policy)).toEqual([]);
    expect(Object.isFrozen(r.policy.classes.S0)).toBe(true);
    const reason = reasonOf(r.warning);
    if (reason !== null && reason !== 'floor') expect(r.policy).toBe(DEFAULT_POLICY); // rejected as a whole (D-84)
    expect(c.group).toBe(reason === null ? 'accept' : reason === 'floor' ? 'floor' : 'reject');
  });

  it('cover every single floor violation: 20 S0/S1 loosenings, 27 job moves, 3 S3.web moves', () => {
    const want: string[] = [];
    for (const c of ['S0', 'S1'] as const) {
      for (const [f, vals] of [['web', WEB], ['ios', IOS], ['noModel', NO_MODEL], ['cloud', [true, false]]] as const) {
        for (const v of vals) if (v !== EXPECTED.classes[c][f]) want.push(`classes.${c}.${f}=${v}`);
      }
    }
    for (const j of JOBS) {
      const allowed: PayloadClass[] = j === 'explain' ? ['S2', 'S0'] : [EXPECTED.jobs[j]];
      for (const c of CLASSES) if (!allowed.includes(c)) want.push(`jobs.${j}=${c}`);
    }
    for (const m of WEB) if (m !== 'ONLY_IN_CLOUD') want.push(`classes.S3.web=${m}`);
    expect(want).toHaveLength(50);
    const have = V.cases.filter((c) => c.group === 'floor' && 'edits' in c.input && !c.expect.warning?.includes(','))
      .map((c) => { const ed = (c.input as { edits: Edit[] }).edits[0]; return `${ed.path.join('.')}=${String(ed.value)}`; });
    expect(have.sort()).toEqual(want.sort());
  });

  it('cover every reason, and leave Object.prototype unpolluted', () => {
    const reasons = new Set(V.cases.map((c) => reasonOf(c.expect.warning)));
    expect([...reasons].sort((a, b) => String(a).localeCompare(String(b)))).toEqual(
      ['bad_shape', 'bad_version', 'floor', 'invalid_json', 'not_string', null, 'too_large', 'unknown_enum']);
    expect(V.cases.filter((c) => 'raw' in c.input && c.input.raw.includes('"__proto__":'))).toHaveLength(4);
    expect(({} as Loose).polluted).toBeUndefined();
    expect(({} as Loose).cloud).toBeUndefined();
  });
});

describe('effectivePolicy: web-only robustness', () => {
  it('returns a policy that shares nothing with the default', () => {
    const { policy } = effectivePolicy(rc((p) => { p.classes.S2.web = 'PREFER_IN_CLOUD'; }));
    expect(policy.classes.S0).not.toBe(DEFAULT_POLICY.classes.S0);
    expect(DEFAULT_POLICY.classes.S2.web).toBe('PREFER_ON_DEVICE');
  });
  it('rejects a symbol, a bigint and a function as not_string', () => {
    for (const v of [Symbol('p'), 10n, () => rc()]) rejected(v, 'not_string');
  });
  it('rejects a megabyte string field before parsing it', () => {
    rejected(rc((p) => { p.classes.S2.web = 'x'.repeat(1_000_000); }), 'too_large');
  });
  it('rejects deep nesting under the cap without recursing', () => {
    rejected('['.repeat(4000) + ']'.repeat(4000), 'bad_shape: (root)');
    rejected(rc().replace(/"S2":\{[^}]*\}/, `"S2":${'['.repeat(3000)}${']'.repeat(3000)}`), 'bad_shape: classes.S2');
    rejected(rc().replace('"version":1', `"version":${'{"a":'.repeat(1000)}1${'}'.repeat(1000)}`), 'bad_shape: version');
  });
});

describe('effectivePolicy: randomised well-formed policies (seeded)', () => {
  // mulberry32: deterministic, so a failure is reproducible.
  let seed = 0x5eed;
  const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const randomPolicy = (): RoutingPolicy => ({
    version: 1,
    classes: Object.fromEntries(CLASSES.map((c) => [c, rand() < 0.5 ? { ...EXPECTED.classes[c] }
      : { web: pick(WEB), ios: pick(IOS), noModel: pick(NO_MODEL), cloud: rand() < 0.5 }])) as RoutingPolicy['classes'],
    jobs: Object.fromEntries(JOBS.map((j) => [j, rand() < 0.5 ? EXPECTED.jobs[j] : pick(CLASSES)])) as RoutingPolicy['jobs'],
  });

  it('always meets the floor, pins S0/S1, and passes every unfloored entry through', () => {
    let accepted = 0;
    for (let i = 0; i < 3000; i++) {
      const cand = randomPolicy();
      const { policy, warning } = effectivePolicy(JSON.stringify(cand));
      expect(floorViolations(policy)).toEqual([]);
      expect(policy.classes.S0).toEqual(EXPECTED.classes.S0);
      expect(policy.classes.S1).toEqual(EXPECTED.classes.S1);
      expect(policy.classes.S2).toEqual(cand.classes.S2);
      expect(policy.classes.S4).toEqual(cand.classes.S4);
      expect({ ...policy.classes.S3, web: 'x' }).toEqual({ ...cand.classes.S3, web: 'x' });
      expect(policy.jobs.explain).toBe(['S2', 'S0'].includes(cand.jobs.explain) ? cand.jobs.explain : 'S2');
      expect(warning === null).toBe(floorViolations(cand).length === 0);
      if (warning === null) { accepted++; expect(policy).toEqual(cand); }
    }
    expect(accepted).toBeGreaterThan(0); // the generator really produces compliant policies too
  });
});

describe('parsePolicy', () => {
  it('reports the first problem with its path', () => {
    expect(parsePolicy(base())).toEqual({ ok: true, policy: EXPECTED });
    expect(parsePolicy({ ...base(), version: 3 })).toEqual({ ok: false, reason: 'bad_version', path: 'version' });
  });
  it('does not take inherited keys as present', () => {
    const child = Object.create(base()) as Loose;
    expect(parsePolicy(child)).toEqual({ ok: false, reason: 'bad_shape', path: '(root)' });
  });
});

describe('jobClass (ARCH §7 step 4)', () => {
  it('uses the policy outside Judge Mode', () => {
    for (const j of JOBS) expect(jobClass(DEFAULT_POLICY, j, false)).toBe(EXPECTED.jobs[j]);
    const { policy } = effectivePolicy(rc((p) => { p.jobs.explain = 'S0'; }));
    expect(jobClass(policy, 'explain', false)).toBe('S0');
  });
  it('runs the device jobs as S4 in Judge Mode and leaves the adversary in S3', () => {
    for (const j of V.judgeDeviceJobs) expect(jobClass(DEFAULT_POLICY, j, true)).toBe('S4');
    expect(jobClass(DEFAULT_POLICY, 'adversaryA', true)).toBe('S3');
    expect(jobClass(DEFAULT_POLICY, 'adversaryB', true)).toBe('S3');
  });
});
