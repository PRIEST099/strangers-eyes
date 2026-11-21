// T-102: every Remote Config key parsed with validation (AC-293); the bundled defaults equal the template (AC-295).
// Cases: shared/testvectors/rc.json (one section per key, D-108), shared with the iOS RemoteConfigService port.
import { describe, expect, it, vi } from 'vitest';
import template from '@root/remoteconfig.template.json';
import manifest from '@prompts/manifest.json';
import rcVectors from '@vectors/rc.json';
import { DEFAULT_POLICY, effectivePolicy } from '../core/routing';
import { CLUE_TYPES } from '../core/types';
import { clampFuzzyThreshold } from '../tier0/fuzzy';
import { clampPadRatio } from '../core/boxes';
import { clampMaxPx } from '../core/frames';
import type { ModelConfig } from '../ai/models';
import {
  DEFAULT_CONFIG, MAX_CHARS, parseConfig, parseKey, PROMPT_FAMILIES, RC_DEFAULTS, RC_KEYS, RC_SPECS, sameConfig, type AppConfig,
  type RcKey,
} from './rcParse';

// faces.ts and ocr.ts load MediaPipe / Tesseract at import; only their pure clamp helpers are used here.
vi.mock('@mediapipe/tasks-vision', () => ({ FaceDetector: {}, FilesetResolver: {} }));
vi.mock('tesseract.js', () => ({ createWorker: vi.fn(), OEM: {}, PSM: {} }));
const { clampFaceMinConfidence } = await import('../tier0/faces');
const { clampOcrMaxPx } = await import('../tier0/ocr');

type SpecKey = keyof typeof RC_SPECS;
type Input = { raw: string } | { notString: unknown } | { repeat: { text: string; times: number } } | { padTo: number };
interface Case { name: string; input: Input; expect: { value: unknown; warning: string | null } }
interface Section { key: SpecKey; type: string; rule: string; cases: Case[] }
const V = rcVectors as unknown as Record<string, unknown> & { keyConventions: string[]; effectiveConfig: { cases: { name: string; raw: Record<string, string>; expect: Partial<AppConfig> }[] } };
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const SPEC_KEYS = RC_KEYS.filter((k): k is SpecKey => k !== 'routing_policy');
const section = (k: SpecKey) => V[camel(k)] as Section;

function inputOf(key: SpecKey, i: Input): unknown {
  if ('raw' in i) return i.raw;
  if ('notString' in i) return i.notString;
  if ('repeat' in i) return i.repeat.text.repeat(i.repeat.times);
  const d = RC_DEFAULTS[key];
  return d.slice(0, -1) + ' '.repeat(i.padTo - d.length) + d.slice(-1);
}

// ARCH §13.2, typed by hand: what the template defaults must parse to (AC-295).
const EXPECTED: Omit<AppConfig, 'routingPolicy'> = {
  killSwitch: false, policyWarning: null, adversaryModel: 'gemini-3.8-flash', adversaryThinking: 'MEDIUM',
  explainCloudModel: 'gemini-3.5-flash-lite', explainThinking: 'LOW',
  promptVersions: { advA: 'advA.v1', advB: 'advB.v1', nanoPre: 'nanoPre.v1', nanoVaultText: 'nanoVaultText.v1', nanoRef: 'nanoRef.v1',
    nanoFix: 'nanoFix.v1', explain: 'explain.v1', fmPre: 'fmPre.v1' },
  groundingEnabled: true, dataTier: 'paid', dailyAdversaryCap: 20, maxFixRounds: 3,
  bandsM: { street: 250, neighbourhood: 1000, district: 5000, city: 30000, country: 500000 },
  autoMaskTypes: ['name_text', 'house_number', 'plate', 'mail_or_document', 'screen'], strictModeDefault: false,
  fuzzyThreshold: 0.8, faceMinConfidence: 0.3, maskPadRatio: 0.15, cloudImageMaxPx: 1536, nanoImageMaxPx: 768, ocrMaxPx: 1600,
  timeoutsMs: { advA: 90000, advB: 60000, explain: 20000, deviceImage: 60000, deviceText: 30000 },
  judgeModeEnabled: true, judgeCachedFallback: true, judgeAutoplayDefault: true, atlasEnabled: true, extensionEnabled: false,
  adversarySeed: 0, source: 'default', warnings: [],
};

describe('defaults (AC-295)', () => {
  it('RC_DEFAULTS is every template default string, unchanged, in template order', () => {
    const params = template.parameters as Record<string, { defaultValue: { value: string } }>;
    expect(RC_KEYS).toEqual(Object.keys(params));
    expect(RC_KEYS).toHaveLength(27);
    expect(RC_DEFAULTS).toEqual(Object.fromEntries(Object.entries(params).map(([k, p]) => [k, p.defaultValue.value])));
    expect(Object.isFrozen(RC_DEFAULTS) && Object.isFrozen(RC_KEYS)).toBe(true);
  });
  it('the template defaults parse to ARCH §13.2 exactly, with no warning, and the routing default is DEFAULT_POLICY', () => {
    const { routingPolicy, ...rest } = DEFAULT_CONFIG;
    expect(rest).toEqual(EXPECTED);
    expect(routingPolicy).toBe(DEFAULT_POLICY);
    expect(parseConfig(RC_DEFAULTS)).toEqual(DEFAULT_CONFIG); // given explicitly = taken from the template
  });
  it('the prompt defaults are the bundled v1 prompts, one per family', () => {
    expect(Object.keys(DEFAULT_CONFIG.promptVersions)).toEqual([...PROMPT_FAMILIES]);
    for (const id of Object.values(DEFAULT_CONFIG.promptVersions)) expect(manifest.prompts).toHaveProperty([id]);
  });
  it('has a parser for every key but routing_policy (core/routing owns that one), and nothing else', () => {
    expect(Object.keys(RC_SPECS).sort()).toEqual(SPEC_KEYS.slice().sort());
  });
  it('fits ai/models.ts ModelConfig as is (field names and types, ARCH §13.4)', () => {
    const m: ModelConfig = DEFAULT_CONFIG; // a compile-time check
    expect(m.timeoutsMs.advB).toBe(60000);
  });
  it('refuses at import a template whose default breaks its own rule', async () => {
    vi.resetModules();
    const broken = structuredClone(template);
    broken.parameters.daily_adversary_cap.defaultValue.value = '500'; // would be clamped
    vi.doMock('@root/remoteconfig.template.json', () => ({ default: broken }));
    await expect(import('./rcParse')).rejects.toThrow(/daily_adversary_cap default is clamped/);
    vi.doUnmock('@root/remoteconfig.template.json');
    vi.resetModules();
  });
});

describe('shared/testvectors/rc.json: one section per key (AC-293)', () => {
  it('has a section for every key except routing_policy, each with the template valueType', () => {
    for (const k of SPEC_KEYS) {
      const s = section(k);
      expect(s, k).toBeDefined();
      expect(s.key).toBe(k);
      expect(s.type, k).toBe((template.parameters as Record<string, { valueType: string }>)[k].valueType);
    }
    const sections = Object.keys(V).filter((n) => !['description', 'routingPolicy', 'keyConventions', 'effectiveConfig'].includes(n));
    expect(sections.sort()).toEqual(SPEC_KEYS.map(camel).sort());
  });

  for (const k of SPEC_KEYS) {
    describe(k, () => {
      const s = section(k);
      it.each(s.cases)('$name', (c) => {
        const r = parseKey(k, inputOf(k, c.input));
        expect(r.value).toEqual(c.expect.value);
        expect(r.warning).toBe(c.expect.warning);
      });
      it('covers the default, a good value, and a refused value', () => {
        expect(s.cases.some((c) => 'raw' in c.input && c.input.raw === RC_DEFAULTS[k] && c.expect.warning === null)).toBe(true);
        expect(s.cases.filter((c) => c.expect.warning === null).length).toBeGreaterThanOrEqual(2);
        expect(s.cases.some((c) => c.expect.warning === 'invalid' && 'raw' in c.input)).toBe(true);
        expect(s.cases.some((c) => 'notString' in c.input)).toBe(true);
      });
    });
  }

  it('covers every clamp at both ends and every JSON object key with a partial case', () => {
    for (const k of ['daily_adversary_cap', 'fuzzy_threshold', 'face_min_confidence', 'mask_pad_ratio', 'cloud_image_max_px', 'nano_image_max_px', 'ocr_max_px'] as const) {
      const clamped = section(k).cases.filter((c) => c.expect.warning === 'clamped').map((c) => c.expect.value);
      expect(new Set(clamped).size, k).toBeGreaterThanOrEqual(2);
    }
    for (const k of ['prompt_versions', 'bands_m', 'timeouts_ms'] as const) {
      expect(section(k).cases.some((c) => c.expect.warning === 'partial'), k).toBe(true);
    }
  });

  it('leaves Object.prototype unpolluted after the "__proto__" cases', () => {
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).advA).toBeUndefined();
    expect(({} as Record<string, unknown>).street).toBeUndefined();
  });

  it.each(V.effectiveConfig.cases)('effectiveConfig: $name', (c) => {
    expect(parseConfig(c.raw)).toMatchObject(c.expect);
  });
});

describe('parity with the consumers\' own clamps (they re-clamp; both must agree)', () => {
  const sweep = [-1e9, -1, -0.5, 0, 0.1, 0.19, 0.2, 0.25, 0.3, 0.5, 0.59, 0.6, 0.61, 0.8, 0.97, 0.98, 0.99, 1, 2, 100, 255.9, 256, 300,
    767.5, 768, 769, 799.4, 799.6, 800, 1024, 1536.6, 1599.5, 2047.9, 2048, 2048.4, 2049, 4096, 1e9];
  const asRaw = (n: number) => String(n);
  const helpers: [SpecKey, (x: unknown) => number][] = [
    ['fuzzy_threshold', clampFuzzyThreshold], ['face_min_confidence', clampFaceMinConfidence], ['mask_pad_ratio', clampPadRatio],
    ['cloud_image_max_px', (x) => clampMaxPx('cloud', x)], ['nano_image_max_px', (x) => clampMaxPx('nano768', x)],
    ['ocr_max_px', clampOcrMaxPx],
  ];
  it.each(helpers)('%s', (k, helper) => {
    for (const n of sweep) expect(parseKey(k, asRaw(n)).value, `${k}(${n})`).toBe(helper(n));
    expect(parseKey(k, 'junk').value).toBe(helper(undefined)); // refused → the same default the helper falls back to
  });
});

describe('parseConfig', () => {
  const hostile: Record<RcKey, string> = Object.fromEntries(RC_KEYS.map((k) => [k, '{"__proto__":{"x":1}} <script>alert(1)</script>'])) as Record<RcKey, string>;

  it('a value of junk everywhere: defaults (kill switch ON, tier free), one warning per key, nothing echoed', () => {
    const c = parseConfig(hostile, 'remote');
    expect(c.killSwitch).toBe(true); // fail closed (D-108)
    expect(c.dataTier).toBe('free');
    expect(c.groundingEnabled).toBe(false);
    expect(c.routingPolicy).toBe(DEFAULT_POLICY);
    expect(c.policyWarning).toBe('invalid_json');
    expect(c.warnings.map((w) => w.key)).toEqual(SPEC_KEYS);
    expect(c.warnings.every((w) => w.reason === 'invalid' && Object.keys(w).join() === 'key,reason')).toBe(true);
    expect(JSON.stringify(c)).not.toMatch(/script|alert|__proto__/);
    const { routingPolicy: _p, killSwitch: _k, dataTier: _d, groundingEnabled: _g, policyWarning: _w, warnings: _ws, source, ...rest } = c;
    const { routingPolicy: _p2, killSwitch: _k2, dataTier: _d2, groundingEnabled: _g2, policyWarning: _w2, warnings: _ws2, source: _s2, ...defaults } = DEFAULT_CONFIG;
    expect(rest).toEqual(defaults);
    expect(source).toBe('remote');
  });

  it('takes good remote values and reports only the keys it changed', () => {
    const c = parseConfig({ kill_switch: 'true', adversary_model: 'gemini-4-hydrogen', daily_adversary_cap: '500', fuzzy_threshold: '0.9',
      timeouts_ms: '{"advA":1}', routing_policy: RC_DEFAULTS.routing_policy.replace('"S2":{"web":"PREFER_ON_DEVICE"', '"S2":{"web":"ONLY_ON_DEVICE"') }, 'remote');
    expect(c).toMatchObject({ killSwitch: true, adversaryModel: 'gemini-4-hydrogen', dailyAdversaryCap: 200, fuzzyThreshold: 0.9, policyWarning: null });
    expect(c.timeoutsMs.advA).toBe(1000);
    expect(c.routingPolicy.classes.S2.web).toBe('ONLY_ON_DEVICE');
    expect(c.warnings).toEqual([{ key: 'daily_adversary_cap', reason: 'clamped' }, { key: 'timeouts_ms', reason: 'partial' }]);
  });

  it('carries the routing warning from effectivePolicy (the HUD logs copy.hud.policyRejected) and floors the policy', () => {
    const loosened = RC_DEFAULTS.routing_policy.replace('"S0":{"web":"ONLY_ON_DEVICE"', '"S0":{"web":"PREFER_IN_CLOUD"');
    const c = parseConfig({ routing_policy: loosened });
    expect(c.policyWarning).toBe('floor: classes.S0.web');
    expect(c.policyWarning).toBe(effectivePolicy(loosened).warning);
    expect(c.routingPolicy.classes.S0.web).toBe('ONLY_ON_DEVICE');
    expect(c.warnings).toEqual([]); // routing is reported once, through policyWarning
  });

  it('is deeply frozen and shares nothing writable', () => {
    const c = parseConfig({ bands_m: '{"street":250,"neighbourhood":1000,"district":5000,"city":20000,"country":300000}' });
    for (const o of [c, c.bandsM, c.timeoutsMs, c.promptVersions, c.autoMaskTypes, c.warnings, c.routingPolicy, DEFAULT_CONFIG.bandsM]) {
      expect(Object.isFrozen(o)).toBe(true);
    }
    expect(() => { (c as { killSwitch: boolean }).killSwitch = true; }).toThrow(TypeError);
    expect(() => { (c.autoMaskTypes as string[]).push('plate'); }).toThrow(TypeError);
  });

  it('refuses a non-string value of any key (web only)', () => {
    const c = parseConfig({ max_fix_rounds: 5, kill_switch: false, bands_m: { street: 250 } });
    expect(c.maxFixRounds).toBe(3);
    expect(c.killSwitch).toBe(true);
    expect(c.warnings.map((w) => w.key)).toEqual(['kill_switch', 'max_fix_rounds', 'bands_m']);
  });

  it('only own keys of the input count', () => {
    const raw = Object.create({ kill_switch: 'true' }) as Record<string, string>;
    expect(parseConfig(raw).killSwitch).toBe(false);
  });

  it('auto_mask_types accepts only CLUE_TYPES and the length caps hold', () => {
    expect(parseKey('auto_mask_types', JSON.stringify(CLUE_TYPES)).value).toEqual([...CLUE_TYPES]);
    expect(parseKey('kill_switch', ' '.repeat(MAX_CHARS.boolean - 4) + 'true').value).toBe(true);
    expect(parseKey('adversary_seed', '0'.padStart(MAX_CHARS.number + 1, ' ')).warning).toBe('invalid');
  });

  it('sameConfig compares values, not identity', () => {
    expect(sameConfig(parseConfig({}), DEFAULT_CONFIG)).toBe(true);
    expect(sameConfig(parseConfig({}, 'cached'), DEFAULT_CONFIG)).toBe(false);
    expect(sameConfig(parseConfig({ kill_switch: 'true' }), DEFAULT_CONFIG)).toBe(false);
  });
});
