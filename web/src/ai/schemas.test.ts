import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import enums from '@prompts/enums.v1.json';
import {
  ADV_B_SCHEMA, assertSchemaShape, EmptyEnumError, fixSchema, NANO_PRE_SCHEMA, refereeSchema, vaultTextSchema,
} from './schemas';
import { validateJson } from './schemas.testutil';
import {
  CLUE_TYPES, CONF, DIGIT_KINDS, DISTANCE_BANDS, INFERENCE_KINDS, LEVELS, PIN_KINDS, PRESCREEN_CLUE_TYPES, REGIONS,
  STRENGTHS, VAULT_KINDS,
} from '../core/types';

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const fixture = (name: string): unknown => JSON.parse(readFileSync(root(`shared/prompts/fixtures/${name}`), 'utf8'));
type S = Record<string, unknown>;
const prop = (s: unknown, ...path: string[]): S => path.reduce((acc: S, k) => ((acc.properties as S)?.[k] ?? (acc as S)[k]) as S, s as S);

// The shared fixture scenario (shared/prompts/README.md).
const TEXT_IDS = ['w1', 'p1'];
const VAULT_IDS = ['v1', 'v2', 'v3'];
const CLAIM_IDS = ['c1', 'c2', 'c3', 'c4']; // per-call claim aliases (D-145)
const REMOVABLE = ['c1', 'c2', 'c3'];

describe('schema shape (hand-written structural check)', () => {
  it('static schemas and every builder output pass', () => {
    for (const s of [ADV_B_SCHEMA, NANO_PRE_SCHEMA, vaultTextSchema(TEXT_IDS, VAULT_IDS), refereeSchema(CLAIM_IDS, VAULT_IDS), fixSchema(REMOVABLE)]) {
      expect(() => assertSchemaShape(s)).not.toThrow();
    }
  });

  it('rejects typos, empty enums, required outside properties and arrays without items', () => {
    expect(() => assertSchemaShape({ type: 'object', properties: {}, require: [] })).toThrow(/unsupported keyword "require"/);
    expect(() => assertSchemaShape({ type: 'string', enum: [] })).toThrow(/non-empty/);
    expect(() => assertSchemaShape({ type: 'object', properties: { a: { type: 'string' } }, required: ['b'] })).toThrow(/not a property/);
    expect(() => assertSchemaShape({ type: 'array' })).toThrow(/without items/);
    expect(() => assertSchemaShape({ type: 'string', minimum: 1 })).toThrow(/non-number/);
    expect(() => assertSchemaShape({ type: 'object', properties: {}, additionalProperties: true })).toThrow(/only be false/);
  });

  it('builders refuse empty ID lists (the empty-enum rule) and de-duplicate IDs', () => {
    expect(() => vaultTextSchema([], VAULT_IDS)).toThrow(EmptyEnumError);
    expect(() => refereeSchema(CLAIM_IDS, [])).toThrow(EmptyEnumError);
    expect(() => fixSchema([])).toThrow(EmptyEnumError);
    expect(() => fixSchema(['c1', ''])).toThrow(TypeError);
    expect(prop(fixSchema(['c1', 'c1', 'c2']), 'mask').items).toEqual({ type: 'string', enum: ['c1', 'c2'] });
  });

  it('builders match ARCH §10.8–10.10 (field names, limits, all fields required)', () => {
    const vt = vaultTextSchema(TEXT_IDS, VAULT_IDS);
    expect(prop(vt, 'hits').maxItems).toBe(12);
    expect((prop(vt, 'hits').items as S).required).toEqual(['text_id', 'vault_id', 'strength']);
    const ref = refereeSchema(CLAIM_IDS, VAULT_IDS);
    expect(prop(ref, 'matches').maxItems).toBe(12);
    expect((prop(ref, 'matches').items as S).required).toEqual(['claim_id', 'vault_id', 'strength', 'reason']);
    expect(vt.required).toEqual(['hits']);
    expect(ref.required).toEqual(['matches']);
    for (const sc of [vt, ref, fixSchema(REMOVABLE), NANO_PRE_SCHEMA, ADV_B_SCHEMA]) expect(sc.additionalProperties).toBe(false);
    expect((prop(vt, 'hits').items as S).additionalProperties).toBe(false);
    expect((prop(ref, 'matches').items as S).additionalProperties).toBe(false);
    expect((prop(NANO_PRE_SCHEMA, 'clues').items as S).additionalProperties).toBe(false);
    const fix = fixSchema(REMOVABLE);
    expect(prop(fix, 'mask').maxItems).toBe(8);
    expect(fix.required).toEqual(['mask', 'crop', 'explanation', 'expected_residual']);
    expect(prop(fix, 'crop').enum).toEqual(['none', 'top', 'bottom', 'left', 'right']);
    expect(prop(fix, 'expected_residual').enum).toEqual(['country', 'region', 'city', 'district', 'neighbourhood', 'street']);
  });
});

describe('schemas agree with the enums', () => {
  it('pass B uses all 18 clue types, the 6 levels, the 7 inference kinds and the confidences', () => {
    const clue = prop(ADV_B_SCHEMA, 'clues').items as S;
    expect(prop(clue, 'type').enum).toEqual([...CLUE_TYPES]);
    expect(prop(clue, 'reveals').enum).toEqual([...LEVELS, 'venue_or_organisation']);
    expect(prop(clue, 'severity').enum).toEqual([...CONF]);
    const hyp = prop(ADV_B_SCHEMA, 'hypotheses').items as S;
    expect(prop(hyp, 'level').enum).toEqual([...LEVELS]);
    expect(prop(hyp, 'confidence').enum).toEqual([...CONF]);
    // Bounds live in descriptions to keep Gemini's grammar small (U-45); the parser clamps and floors (ARCH §10.6).
    expect(prop(hyp, 'radius_km')).toMatchObject({ type: 'number', description: expect.stringContaining('0.1') });
    expect(prop(prop(ADV_B_SCHEMA, 'inferences').items, 'kind').enum).toEqual([...INFERENCE_KINDS]);
    expect(prop(clue, 'box_2d')).toMatchObject({ minItems: 4, maxItems: 4, items: { type: 'integer' } });
    expect(String(prop(clue, 'box_2d').description)).toContain('0-1000');
  });

  it('pass B generates clues before the hypotheses and inferences that cite them (schema key order)', () => {
    expect(Object.keys(ADV_B_SCHEMA.properties)).toEqual(['audit_status', 'decline_reason', 'scene_summary', 'clues', 'hypotheses', 'inferences']);
  });

  it('the Nano pre-screen uses exactly the 13 pre-screen types and the 9 regions', () => {
    const item = prop(NANO_PRE_SCHEMA, 'clues').items as S;
    expect(prop(item, 'type').enum).toEqual([...PRESCREEN_CLUE_TYPES]);
    expect(prop(item, 'region').enum).toEqual([...REGIONS]);
    expect(prop(NANO_PRE_SCHEMA, 'clues').maxItems).toBe(8);
  });
});

describe('enums.v1.json', () => {
  it('equals the constants in core/types.ts', () => {
    expect(enums.CLUE_TYPES).toEqual([...CLUE_TYPES]);
    expect(enums.PRESCREEN_CLUE_COUNT).toBe(PRESCREEN_CLUE_TYPES.length);
    expect(enums.INFERENCE_KINDS).toEqual([...INFERENCE_KINDS]);
    expect(enums.CONF).toEqual([...CONF]);
    expect(enums.LEVELS).toEqual([...LEVELS]);
    expect(enums.REGIONS).toEqual([...REGIONS]);
    expect(enums.DISTANCE_BANDS).toEqual([...DISTANCE_BANDS]);
    expect(enums.STRENGTHS).toEqual([...STRENGTHS]);
    expect(enums.VAULT_KINDS).toEqual([...VAULT_KINDS]);
    expect(enums.PIN_KINDS).toEqual([...PIN_KINDS]);
    expect(enums.DIGIT_KINDS).toEqual([...DIGIT_KINDS]);
  });

  it('kind maps cover every vault kind; KIND_COMPAT covers every claim kind', () => {
    for (const m of [enums.PROMPT_KIND_OF, enums.KIND_DISPLAY, enums.KIND_PHRASE]) expect(Object.keys(m).sort()).toEqual([...VAULT_KINDS].sort());
    expect(Object.keys(enums.KIND_COMPAT).sort()).toEqual([...INFERENCE_KINDS, 'area'].sort());
    for (const list of Object.values(enums.KIND_COMPAT)) for (const k of list) expect(VAULT_KINDS as readonly string[]).toContain(k);
    expect(enums.KIND_COMPAT.other).toEqual(VAULT_KINDS.filter((k) => !PIN_KINDS.includes(k)));
  });

  it('matches SPEC §17.3 display names and §17.5 word lists, and SCR-06 word folds', () => {
    const spec = readFileSync(root('docs/SPEC.md'), 'utf8');
    const s175 = spec.slice(spec.indexOf('### 17.5'), spec.indexOf('### 17.6'));
    const list = (label: RegExp) => (s175.match(label)?.[1] ?? '').replace(/\.$/, '').split(',').map((w) => w.trim()).filter(Boolean);
    expect([...enums.GENERIC_WORDS].sort()).toEqual(list(/\*\*Generic words\*\* \(never distinctive\): (.+)\n/).sort());
    expect([...enums.ARTEFACT_TERMS].sort()).toEqual(list(/\*\*Artefact terms:\*\* (.+)\n/).sort());
    const classes = [...s175.matchAll(/- \w+ ~ \{([^}]+)\}/g)].map((m) => m[1].split(',').map((w) => w.trim()));
    expect(enums.SYNONYM_CLASSES).toEqual(classes);
    const folds = spec.match(/fold synonyms: (.+)\./)?.[1] ?? '';
    const pairs = Object.fromEntries(folds.split(',').map((p) => p.trim().split('↔')));
    expect(enums.WORD_FOLDS).toEqual(pairs);
    const s173 = spec.slice(spec.indexOf('### 17.3'), spec.indexOf('### 17.4'));
    for (const [kind, disp] of Object.entries(enums.KIND_DISPLAY)) {
      if (kind === 'place_pin') continue; // displays the user's label, or PLACE
      const row = s173.split('\n').find((l) => new RegExp(`\\b${kind}\\b`).test(l));
      expect(row, kind).toBeDefined();
      expect(row, kind).toContain(`| ${disp} |`);
    }
  });

  it('the Firestore Leak Atlas whitelist equals CLUE_TYPES (AC-283; current rules in research until T-104)', () => {
    const rules = readFileSync(root('research/day1-artifacts/firestore-tests/firestore.rules'), 'utf8');
    for (const t of CLUE_TYPES) expect(rules, t).toContain(`'${t}'`);
    const quoted = [...rules.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((w) => w.includes('_') || (CLUE_TYPES as readonly string[]).includes(w));
    for (const w of quoted) if ((CLUE_TYPES as readonly string[]).includes(w) === false && /_(text|sign|number|or|view)/.test(w)) throw new Error(`unknown clue type in rules: ${w}`);
  });
});

describe('fixtures decode and match their schemas', () => {
  it('advB ok / declined / no_signal are schema-valid; bad_ids is schema-valid but semantically broken', () => {
    for (const f of ['advB.v1.ok.json', 'advB.v1.declined.json', 'advB.v1.no_signal.json', 'advB.v1.bad_ids.json']) {
      expect(validateJson(ADV_B_SCHEMA, fixture(f)), f).toEqual([]);
    }
    const bad = fixture('advB.v1.bad_ids.json') as { clues: { id: string }[]; hypotheses: { clue_ids: string[] }[] };
    const ids = bad.clues.map((c) => c.id);
    expect(new Set(ids).size).toBeLessThan(ids.length);
    expect(bad.hypotheses.flatMap((h) => h.clue_ids).some((c) => !ids.includes(c))).toBe(true);
  });

  it('swapped_boxes is schema-valid but carries what the parser must fix: reversed, out-of-range, zero-area boxes and radius < 0.1', () => {
    const f = fixture('advB.v1.swapped_boxes.json') as { clues: { box_2d: number[] }[]; hypotheses: { radius_km: number }[] };
    expect(validateJson(ADV_B_SCHEMA, f)).toEqual([]);
    const boxes = f.clues.map((c) => c.box_2d);
    expect(boxes.some(([y0, x0, y1, x1]) => y0 > y1 && x0 > x1)).toBe(true);
    expect(boxes.some((b) => b.some((v) => v < 0 || v > 1000))).toBe(true);
    expect(boxes.some(([y0, , y1]) => y0 === y1)).toBe(true);
    expect(f.hypotheses[0].radius_km).toBeLessThan(0.1);
  });

  it('truncated is a wrapper whose raw text is not valid JSON', () => {
    const t = fixture('advB.v1.truncated.json') as { finishReason: string; raw: string };
    expect(t.finishReason).toBe('MAX_TOKENS');
    expect(() => JSON.parse(t.raw)).toThrow();
  });

  it('device fixtures validate against the static or runtime schemas', () => {
    expect(validateJson(NANO_PRE_SCHEMA, fixture('nanoPre.v1.ok.json'))).toEqual([]);
    expect(validateJson(vaultTextSchema(TEXT_IDS, VAULT_IDS), fixture('nanoVaultText.v1.ok.json'))).toEqual([]);
    expect(validateJson(refereeSchema(CLAIM_IDS, VAULT_IDS), fixture('nanoRef.v1.ok.json'))).toEqual([]);
    expect(validateJson(fixSchema(REMOVABLE), fixture('nanoFix.v1.ok.json'))).toEqual([]);
  });

  it('invented IDs and non-removable masks fail the runtime enums', () => {
    expect(validateJson(refereeSchema(CLAIM_IDS, VAULT_IDS), fixture('nanoRef.v1.unknown_ids.json')).length).toBe(2);
    expect(validateJson(fixSchema(REMOVABLE), fixture('nanoFix.v1.non_removable.json'))).toEqual(['$.mask[0]: "c4" not in enum']);
  });

  it('the fix fixture is honest: its expected_residual follows D-51 for the advB.v1.ok scenario', () => {
    const ok = fixture('advB.v1.ok.json') as { clues: { id: string; reveals: string }[] };
    const fix = fixture('nanoFix.v1.ok.json') as { mask: string[]; expected_residual: string };
    const order = ['street', 'neighbourhood', 'district', 'city', 'region', 'country'];
    const level = (r: string) => (r === 'venue_or_organisation' ? 'street' : r);
    const left = ok.clues.filter((c) => !fix.mask.includes(c.id)).map((c) => level(c.reveals));
    const finest = left.length ? left.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] : 'country';
    expect(fix.expected_residual).toBe(finest);
  });

  it('the advB fixture scenario matches the README: c4 is the only non-removable clue', () => {
    const ok = fixture('advB.v1.ok.json') as { clues: { id: string; removable: boolean }[] };
    expect(ok.clues.filter((c) => c.removable).map((c) => c.id)).toEqual(REMOVABLE);
  });
});
