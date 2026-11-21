// T-065: a spy on getGenerativeModel checks the exact options each factory passes (ARCH §9.3; API-NOTES §1.3, §1.7,
// §1.11, §1.13). The real firebase/ai constants (InferenceMode, ThinkingLevel) are kept; only the factory is mocked,
// so nothing here builds a real model or makes a network call.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/ai', async (importOriginal) => {
  const real = await importOriginal<typeof import('firebase/ai')>();
  // By default the fake model has an on-device adapter, as the SDK builds one in Chrome with the on-device API.
  return { ...real, getGenerativeModel: vi.fn(() => ({ fake: 'model', chromeAdapter: { mode: 'only_on_device' } })) };
});

import { getGenerativeModel, InferenceMode, ThinkingLevel, type AI } from 'firebase/ai';
import template from '@root/remoteconfig.template.json';
import {
  ADVERSARY_THINKING_LEVELS, adversaryAModel, adversaryBModel, CLASS_MODE, cloudParamsFor, deviceJsonModel, deviceTextModel,
  EXPLAIN_THINKING_LEVELS, explainModel, initializeDeviceModelFor, isExactModelId, jpegPart, judgeJsonModel, MAX_OUTPUT_TOKENS,
  NoDeviceModelError, textPart,
  type AdversaryThinking, type CloudParams, type ExplainThinking, type ModelConfig,
} from './models';
import { NANO_IMAGE_IO, NANO_TEXT_IO } from './capabilities';
import { ADV_B_SCHEMA, NANO_PRE_SCHEMA, refereeSchema } from './schemas';
import type { JobName } from '../core/types';

const spy = vi.mocked(getGenerativeModel);
const AI_SENTINEL = { app: { name: 'test' } } as unknown as AI;
type Params = {
  mode?: string;
  onDeviceParams?: { createOptions?: unknown; promptOptions?: { responseConstraint?: unknown } };
  inCloudParams?: {
    model?: string; systemInstruction?: unknown; tools?: unknown[];
    generationConfig?: Record<string, unknown> & { thinkingConfig?: Record<string, unknown> };
  };
  [k: string]: unknown;
};
/** The single getGenerativeModel call the factory made: [ai, params, requestOptions]. */
function lastCall(): { ai: unknown; p: Params; req: unknown } {
  expect(spy).toHaveBeenCalledTimes(1);
  const [ai, p, req] = spy.mock.calls[0] as unknown as [unknown, Params, unknown];
  return { ai, p, req };
}
/** Every key at any depth (generation and device options are small trees). */
function allKeys(o: unknown, out: string[] = []): string[] {
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { out.push(k); allKeys(v, out); }
  return out;
}
const FORBIDDEN = ['temperature', 'topP', 'topK', 'candidateCount', 'presencePenalty', 'frequencyPenalty', 'samplingMode', 'thinkingBudget'];
const isPlainDeep = (o: unknown): boolean => {
  if (o === null || typeof o !== 'object') return true;
  if (!Array.isArray(o) && Object.getPrototypeOf(o) !== Object.prototype) return false;
  return Object.values(o).every(isPlainDeep);
};

const SCHEMA = refereeSchema(['i1', 'h1'], ['v1', 'v2']);
const cloud = (over: Partial<CloudParams> = {}): CloudParams => ({ model: 'gemini-3.5-flash-lite', thinkingLevel: 'LOW', timeoutMs: 30_000, ...over });
const advCloud = (over: Partial<CloudParams> = {}): CloudParams => ({ model: 'gemini-4-hydrogen', thinkingLevel: 'MEDIUM', timeoutMs: 60_000, ...over });

beforeEach(() => spy.mockClear());

describe('modes per payload class (invariant 3)', () => {
  it('S0/S1 only on device, S2/S4 prefer on device, S3 only in cloud', () => {
    expect(CLASS_MODE).toEqual({
      S0: 'only_on_device', S1: 'only_on_device', S2: 'prefer_on_device', S3: 'only_in_cloud', S4: 'prefer_on_device',
    });
    expect(CLASS_MODE.S0).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(CLASS_MODE.S3).toBe(InferenceMode.ONLY_IN_CLOUD);
  });
  it('the RC thinking strings map 1:1 onto the SDK ThinkingLevel values (API-NOTES §1.11)', () => {
    for (const l of EXPLAIN_THINKING_LEVELS) expect(ThinkingLevel[l]).toBe(l);
    expect(ADVERSARY_THINKING_LEVELS).not.toContain('MINIMAL');
  });
});

describe('every factory: hybrid shape, no sampling knobs, nothing at the top level', () => {
  const factories: [string, () => unknown][] = [
    ['deviceJsonModel', () => deviceJsonModel(AI_SENTINEL, 'text', SCHEMA)],
    ['deviceTextModel', () => deviceTextModel(AI_SENTINEL)],
    ['judgeJsonModel', () => judgeJsonModel(AI_SENTINEL, 'image', NANO_PRE_SCHEMA, cloud())],
    ['explainModel', () => explainModel(AI_SENTINEL, cloud())],
    ['adversaryAModel', () => adversaryAModel(AI_SENTINEL, 'SYSTEM', advCloud({ seed: 7 }))],
    ['adversaryBModel', () => adversaryBModel(AI_SENTINEL, 'SYSTEM', advCloud({ seed: 7 }), ADV_B_SCHEMA)],
  ];
  for (const [name, make] of factories) {
    it(name, () => {
      const model = make();
      expect(model).toBe(spy.mock.results[0]?.value);   // returns exactly what the SDK returns
      const { ai, p, req } = lastCall();
      expect(ai).toBe(AI_SENTINEL);
      // With `mode` set the SDK ignores (and only warns about) every other top-level key (API-NOTES §1.3).
      for (const k of Object.keys(p)) expect(['mode', 'onDeviceParams', 'inCloudParams']).toContain(k);
      expect(typeof p.mode).toBe('string');
      const keys = allKeys([p, req]);
      for (const f of FORBIDDEN) expect(keys, f).not.toContain(f);
    });
  }
});

describe('deviceJsonModel / deviceTextModel (S0, S1)', () => {
  it('S0 text job: ONLY_ON_DEVICE, the shared text createOptions, a plain copy of the schema, no cloud params', () => {
    deviceJsonModel(AI_SENTINEL, 'text', SCHEMA);
    const { p, req } = lastCall();
    expect(p.mode).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(p.inCloudParams).toBeUndefined();
    expect(req).toBeUndefined();
    expect(p.onDeviceParams?.createOptions).toBe(NANO_TEXT_IO);   // the very object availability() is called with (D-86)
    const rc = p.onDeviceParams?.promptOptions?.responseConstraint;
    expect(rc).toEqual(SCHEMA);
    expect(rc).not.toBe(SCHEMA);
    expect(isPlainDeep(rc)).toBe(true);
  });
  it('S1 pre-screen: the shared image createOptions', () => {
    deviceJsonModel(AI_SENTINEL, 'image', NANO_PRE_SCHEMA);
    expect(lastCall().p.onDeviceParams?.createOptions).toBe(NANO_IMAGE_IO);
  });
  it('a Schema-like instance becomes a plain object (U-04); a non-object schema is refused', () => {
    class Fake { type = 'object'; toJSON() { return { type: 'object', required: ['a'] }; } }
    deviceJsonModel(AI_SENTINEL, 'text', new Fake());
    const rc = lastCall().p.onDeviceParams?.promptOptions?.responseConstraint;
    expect(rc).toEqual({ type: 'object', required: ['a'] });
    expect(isPlainDeep(rc)).toBe(true);
    expect(() => deviceJsonModel(AI_SENTINEL, 'text', [] as unknown as object)).toThrow(TypeError);
  });
  it('S0 plain text (D-15 reclassified explain): ONLY_ON_DEVICE, text io, no schema, no cloud', () => {
    deviceTextModel(AI_SENTINEL);
    const { p, req } = lastCall();
    expect(p).toEqual({ mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { createOptions: NANO_TEXT_IO } });
    expect(p.onDeviceParams?.createOptions).toBe(NANO_TEXT_IO);
    expect(req).toBeUndefined();
  });
});

describe('initializeDeviceModelFor (SCR-02 download through the SDK, D-87)', () => {
  it('builds nothing until called, then an ONLY_ON_DEVICE model with the io createOptions, and forwards progress', async () => {
    const init = vi.fn(() => Promise.resolve());
    spy.mockReturnValueOnce({ initializeDeviceModel: init, chromeAdapter: {} } as never);
    const initializer = initializeDeviceModelFor(AI_SENTINEL, 'image');
    expect(spy).not.toHaveBeenCalled();
    const onProgress = vi.fn();
    await expect(initializer(onProgress)).resolves.toBeUndefined();
    const { ai, p, req } = lastCall();
    expect(ai).toBe(AI_SENTINEL);
    expect(p).toEqual({ mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { createOptions: NANO_IMAGE_IO } });
    expect(p.onDeviceParams?.createOptions).toBe(NANO_IMAGE_IO);
    expect(req).toBeUndefined();
    expect(init).toHaveBeenCalledWith(onProgress);
  });
  it('the text initializer uses the text createOptions and passes a rejection through', async () => {
    spy.mockReturnValueOnce({ initializeDeviceModel: () => Promise.reject(new Error('no activation')), chromeAdapter: {} } as never);
    await expect(initializeDeviceModelFor(AI_SENTINEL, 'text')(() => {})).rejects.toThrow('no activation');
    expect(lastCall().p.onDeviceParams?.createOptions).toBe(NANO_TEXT_IO);
  });
});

describe('fail closed without an on-device adapter (F-125)', () => {
  const noAdapter = (extra: object = {}) => spy.mockReturnValueOnce({ fake: 'cloud-only model', ...extra } as never);
  it('deviceJsonModel and deviceTextModel throw instead of returning a model that would run in the cloud', () => {
    noAdapter();
    expect(() => deviceJsonModel(AI_SENTINEL, 'text', SCHEMA)).toThrow(NoDeviceModelError);
    noAdapter({ chromeAdapter: undefined });
    expect(() => deviceTextModel(AI_SENTINEL)).toThrow(NoDeviceModelError);
    noAdapter({ chromeAdapter: null });
    expect(() => deviceJsonModel(AI_SENTINEL, 'image', NANO_PRE_SCHEMA)).toThrow(NoDeviceModelError);
  });
  it('the cloud-capable factories do not need an adapter (PREFER / ONLY_IN_CLOUD fall back or run in the cloud)', () => {
    spy.mockImplementation(() => ({ fake: 'cloud-only model' }) as never);
    try {
      expect(() => judgeJsonModel(AI_SENTINEL, 'text', SCHEMA, cloud())).not.toThrow();
      expect(() => explainModel(AI_SENTINEL, cloud())).not.toThrow();
      expect(() => adversaryAModel(AI_SENTINEL, 'S', advCloud())).not.toThrow();
      expect(() => adversaryBModel(AI_SENTINEL, 'S', advCloud(), ADV_B_SCHEMA)).not.toThrow();
    } finally {
      spy.mockReset();
      spy.mockImplementation(() => ({ fake: 'model', chromeAdapter: { mode: 'only_on_device' } }) as never);
    }
  });
  it('initializeDeviceModelFor rejects (never reports a download) and never calls the SDK initializer', async () => {
    const init = vi.fn(() => Promise.resolve());
    noAdapter({ initializeDeviceModel: init });
    await expect(initializeDeviceModelFor(AI_SENTINEL, 'text')(() => {})).rejects.toBeInstanceOf(NoDeviceModelError);
    expect(init).not.toHaveBeenCalled();
  });
  it('a synchronous throw while building becomes a rejection', async () => {
    spy.mockImplementationOnce(() => { throw new Error('boom'); });
    await expect(initializeDeviceModelFor(AI_SENTINEL, 'image')(() => {})).rejects.toThrow('boom');
  });
  it('the error text never names the browser global (check-boundaries R4)', () => {
    expect(new NoDeviceModelError().message).not.toMatch(/LanguageModel/);
  });
});

describe('judgeJsonModel (S4)', () => {
  it('PREFER_ON_DEVICE; the same schema on both sides; model, generationConfig and thinking under inCloudParams', () => {
    judgeJsonModel(AI_SENTINEL, 'text', SCHEMA, cloud({ model: 'gemini-3.1-flash-lite', thinkingLevel: 'MINIMAL', timeoutMs: 30_000 }));
    const { p, req } = lastCall();
    expect(p.mode).toBe(InferenceMode.PREFER_ON_DEVICE);
    expect(p.onDeviceParams?.createOptions).toBe(NANO_TEXT_IO);
    expect(p.onDeviceParams?.promptOptions?.responseConstraint).toEqual(SCHEMA);
    expect(p.inCloudParams).toEqual({
      model: 'gemini-3.1-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json', responseJsonSchema: SCHEMA, maxOutputTokens: MAX_OUTPUT_TOKENS.judge,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });
    const gc = p.inCloudParams?.generationConfig ?? {};
    expect(gc.responseJsonSchema).not.toBe(p.onDeviceParams?.promptOptions?.responseConstraint);   // separate plain copies
    expect(isPlainDeep(gc.responseJsonSchema)).toBe(true);
    expect('responseSchema' in gc).toBe(false);   // exactly one of responseSchema / responseJsonSchema (API-NOTES §1.7)
    expect(req).toEqual({ timeout: 30_000 });
  });
  it('the image pre-screen uses the image createOptions', () => {
    judgeJsonModel(AI_SENTINEL, 'image', NANO_PRE_SCHEMA, cloud({ timeoutMs: 60_000 }));
    const { p, req } = lastCall();
    expect(p.onDeviceParams?.createOptions).toBe(NANO_IMAGE_IO);
    expect(req).toEqual({ timeout: 60_000 });
  });
});

describe('explainModel (S2; S4 explain)', () => {
  it('PREFER_ON_DEVICE by default; text io only (no schema, no initialPrompts); thinking and cap in the cloud', () => {
    explainModel(AI_SENTINEL, cloud({ thinkingLevel: 'LOW', timeoutMs: 20_000 }));
    const { p, req } = lastCall();
    expect(p).toEqual({
      mode: InferenceMode.PREFER_ON_DEVICE,
      onDeviceParams: { createOptions: NANO_TEXT_IO },
      inCloudParams: {
        model: 'gemini-3.5-flash-lite',
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS.explain, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      },
    });
    expect(allKeys(p)).not.toContain('initialPrompts');
    expect(allKeys(p)).not.toContain('systemInstruction');   // D-04: instructions in the user turn for both sides
    expect(allKeys(p)).not.toContain('tools');
    expect(req).toEqual({ timeout: 20_000 });
  });
  it('ONLY_IN_CLOUD when the user turned Nano off (AC-277); never a device-only or cloud-first mode', () => {
    explainModel(AI_SENTINEL, cloud(), InferenceMode.ONLY_IN_CLOUD);
    expect(lastCall().p.mode).toBe(InferenceMode.ONLY_IN_CLOUD);
    for (const m of [InferenceMode.ONLY_ON_DEVICE, InferenceMode.PREFER_IN_CLOUD, 'bogus']) {
      expect(() => explainModel(AI_SENTINEL, cloud(), m as never)).toThrow(RangeError);
    }
  });
});

describe('adversaryAModel / adversaryBModel (S3)', () => {
  it('pass A: ONLY_IN_CLOUD, no device params, system + googleSearch + thinking under inCloudParams', () => {
    adversaryAModel(AI_SENTINEL, 'ADV A SYSTEM', advCloud({ thinkingLevel: 'MEDIUM', timeoutMs: 90_000 }));
    const { p, req } = lastCall();
    expect(p).toEqual({
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: 'gemini-4-hydrogen', systemInstruction: 'ADV A SYSTEM', tools: [{ googleSearch: {} }],
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS.adversaryA, thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM } },
      },
    });
    expect(req).toEqual({ timeout: 90_000 });
  });
  it('pass B: ONLY_IN_CLOUD, no tools, JSON with a plain copy of the schema', () => {
    adversaryBModel(AI_SENTINEL, 'ADV B SYSTEM', advCloud({ thinkingLevel: 'HIGH', timeoutMs: 60_000 }), ADV_B_SCHEMA);
    const { p, req } = lastCall();
    expect(p).toEqual({
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: 'gemini-4-hydrogen', systemInstruction: 'ADV B SYSTEM',
        generationConfig: {
          responseMimeType: 'application/json', responseJsonSchema: ADV_B_SCHEMA, maxOutputTokens: MAX_OUTPUT_TOKENS.adversaryB,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        },
      },
    });
    expect(p.inCloudParams?.generationConfig?.responseJsonSchema).not.toBe(ADV_B_SCHEMA);
    expect(req).toEqual({ timeout: 60_000 });
  });
  it('tools appear only on the ONLY_IN_CLOUD pass A model (never on a PREFER model, API-NOTES §1.4)', () => {
    const makers = [
      () => deviceJsonModel(AI_SENTINEL, 'text', SCHEMA), () => deviceTextModel(AI_SENTINEL),
      () => judgeJsonModel(AI_SENTINEL, 'text', SCHEMA, cloud()), () => explainModel(AI_SENTINEL, cloud()),
      () => adversaryBModel(AI_SENTINEL, 'S', advCloud(), ADV_B_SCHEMA),
    ];
    for (const make of makers) {
      spy.mockClear();
      make();
      expect(allKeys(lastCall().p)).not.toContain('tools');
    }
  });
  it('MINIMAL thinking is refused for the adversary (HTTP 400 on 3.8-flash / gemini-4-*)', () => {
    expect(() => adversaryAModel(AI_SENTINEL, 'S', advCloud({ thinkingLevel: 'MINIMAL' }))).toThrow(RangeError);
    expect(() => adversaryBModel(AI_SENTINEL, 'S', advCloud({ thinkingLevel: 'MINIMAL' }), ADV_B_SCHEMA)).toThrow(RangeError);
    expect(spy).not.toHaveBeenCalled();
  });
  it('adversary_seed: absent unless non-zero, then cast into generationConfig (U-11)', () => {
    adversaryBModel(AI_SENTINEL, 'S', advCloud(), ADV_B_SCHEMA);
    expect(allKeys(lastCall().p)).not.toContain('seed');
    spy.mockClear();
    adversaryBModel(AI_SENTINEL, 'S', advCloud({ seed: 0 }), ADV_B_SCHEMA);   // 0 = not sent (ARCH §13.2)
    expect(allKeys(lastCall().p)).not.toContain('seed');
    spy.mockClear();
    adversaryBModel(AI_SENTINEL, 'S', advCloud({ seed: 42 }), ADV_B_SCHEMA);
    expect(lastCall().p.inCloudParams?.generationConfig?.seed).toBe(42);
    spy.mockClear();
    adversaryAModel(AI_SENTINEL, 'S', advCloud({ seed: 42 }));
    expect(lastCall().p.inCloudParams?.generationConfig?.seed).toBe(42);
  });
});

describe('cloud parameter checks (fail before any model is built)', () => {
  it('model ids are exact: no -latest alias, no spaces or capitals, not empty', () => {
    for (const ok of ['gemini-3.8-flash', 'gemini-4-hydrogen', 'gemini-3.5-flash-lite']) expect(isExactModelId(ok), ok).toBe(true);
    for (const bad of ['', 'gemini-flash-latest', 'gemini-3.8-flash-latest', 'Gemini-3', 'gemini 3', ' gemini-3', 'x'.repeat(65), 42, null]) {
      expect(isExactModelId(bad), String(bad)).toBe(false);
    }
    expect(() => explainModel(AI_SENTINEL, cloud({ model: 'gemini-flash-latest' }))).toThrow(RangeError);
    expect(() => adversaryAModel(AI_SENTINEL, 'S', advCloud({ model: '' }))).toThrow(RangeError);
  });
  it('timeouts are integers from 1 s to 10 min; seeds are integers', () => {
    for (const t of [0, -1, 999, 600_001, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => judgeJsonModel(AI_SENTINEL, 'text', SCHEMA, cloud({ timeoutMs: t })), String(t)).toThrow(RangeError);
    }
    expect(() => adversaryBModel(AI_SENTINEL, 'S', advCloud({ seed: 0.5 }), ADV_B_SCHEMA)).toThrow(RangeError);
    expect(spy).not.toHaveBeenCalled();
  });
  it('an unknown thinking level is refused everywhere', () => {
    expect(() => explainModel(AI_SENTINEL, cloud({ thinkingLevel: 'ULTRA' as ExplainThinking }))).toThrow(RangeError);
    expect(() => judgeJsonModel(AI_SENTINEL, 'text', SCHEMA, cloud({ thinkingLevel: 'low' as ExplainThinking }))).toThrow(RangeError);
  });
});

describe('ModelConfig from Remote Config (ARCH §13.2; repo-root remoteconfig.template.json)', () => {
  const v = (k: keyof typeof template.parameters) => template.parameters[k].defaultValue.value;
  const fromTemplate: ModelConfig = {
    adversaryModel: v('adversary_model'),
    adversaryThinking: v('adversary_thinking_level') as AdversaryThinking,
    explainCloudModel: v('explain_cloud_model'),
    explainThinking: v('explain_thinking_level') as ExplainThinking,
    timeoutsMs: JSON.parse(v('timeouts_ms')) as ModelConfig['timeoutsMs'],
    adversarySeed: Number(v('adversary_seed')),
  };
  it('the template defaults are valid factory inputs', () => {
    expect(isExactModelId(fromTemplate.adversaryModel)).toBe(true);
    expect(isExactModelId(fromTemplate.explainCloudModel)).toBe(true);
    expect(ADVERSARY_THINKING_LEVELS).toContain(fromTemplate.adversaryThinking);
    expect(EXPLAIN_THINKING_LEVELS).toContain(fromTemplate.explainThinking);
    expect(Object.keys(fromTemplate.timeoutsMs).sort()).toEqual(['advA', 'advB', 'deviceImage', 'deviceText', 'explain']);
    expect(fromTemplate.adversarySeed).toBe(0);
    expect(() => {
      adversaryAModel(AI_SENTINEL, 'S', cloudParamsFor(fromTemplate, 'adversaryA'));
      adversaryBModel(AI_SENTINEL, 'S', cloudParamsFor(fromTemplate, 'adversaryB'), ADV_B_SCHEMA);
      explainModel(AI_SENTINEL, cloudParamsFor(fromTemplate, 'explain'));
      judgeJsonModel(AI_SENTINEL, 'image', NANO_PRE_SCHEMA, cloudParamsFor(fromTemplate, 'preScreen'));
      judgeJsonModel(AI_SENTINEL, 'text', SCHEMA, cloudParamsFor(fromTemplate, 'referee'));
    }).not.toThrow();
  });
  it('ARCH §9.2: adversary jobs use adversary_model, the rest explain_cloud_model, each with its own timeout key', () => {
    const cfg: ModelConfig = {
      adversaryModel: 'adv-model', adversaryThinking: 'HIGH', explainCloudModel: 'explain-model', explainThinking: 'MINIMAL',
      timeoutsMs: { advA: 1001, advB: 1002, explain: 1003, deviceImage: 1004, deviceText: 1005 }, adversarySeed: 0,
    };
    const expected: Record<JobName, CloudParams> = {
      adversaryA: { model: 'adv-model', thinkingLevel: 'HIGH', timeoutMs: 1001 },
      adversaryB: { model: 'adv-model', thinkingLevel: 'HIGH', timeoutMs: 1002 },
      explain: { model: 'explain-model', thinkingLevel: 'MINIMAL', timeoutMs: 1003 },
      preScreen: { model: 'explain-model', thinkingLevel: 'MINIMAL', timeoutMs: 1004 },
      vaultTextMatch: { model: 'explain-model', thinkingLevel: 'MINIMAL', timeoutMs: 1005 },
      referee: { model: 'explain-model', thinkingLevel: 'MINIMAL', timeoutMs: 1005 },
      fixPlan: { model: 'explain-model', thinkingLevel: 'MINIMAL', timeoutMs: 1005 },
    };
    for (const [job, want] of Object.entries(expected)) expect(cloudParamsFor(cfg, job as JobName), job).toEqual(want);
    expect(cloudParamsFor({ ...cfg, adversarySeed: 9 }, 'adversaryB').seed).toBe(9);
    expect(cloudParamsFor({ ...cfg, adversarySeed: 9 }, 'explain').seed).toBeUndefined();   // the seed is an adversary experiment only
    expect(() => cloudParamsFor(cfg, 'bogus' as JobName)).toThrow(RangeError);
  });
});

describe('parts (API-NOTES §1.8)', () => {
  it('textPart always sets type', () => {
    expect(textPart('hello')).toEqual({ type: 'text', text: 'hello' });
  });
  it('jpegPart sets type and image/jpeg, and takes bare base64 only', () => {
    expect(jpegPart('/9j/4AAQ')).toEqual({ type: 'inlineData', inlineData: { data: '/9j/4AAQ', mimeType: 'image/jpeg' } });
    for (const bad of ['', 'data:image/jpeg;base64,/9j/4AAQ', '/9j/4AA', '/9j 4AAQ', '/9j/4AAQ\n']) {
      expect(() => jpegPart(bad), JSON.stringify(bad)).toThrow(TypeError);
    }
  });
});
