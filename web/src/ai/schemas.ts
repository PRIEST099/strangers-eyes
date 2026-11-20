// web/src/ai/schemas.ts: the JSON Schemas for structured output (ARCH §10.1, §10.6–10.10).
// Plain JSON Schema objects, never Firebase `Schema` helpers. The same object is the device `responseConstraint` and
// the cloud `responseJsonSchema` (D-04). Runtime ID enums stop the model inventing IDs and contain prompt injection
// (SR-12). Chrome's enforcement of enum/maxItems/additionalProperties is unverified (U-04, checked in T-032): code validates
// every result anyway. Device schemas set additionalProperties:false so Nano cannot pad items with extra keys.
import type { GenerationConfig, LanguageModelPromptOptions } from 'firebase/ai';
import advB from '@prompts/advB.v1.schema.json';
import nanoPre from '@prompts/nanoPre.v1.schema.json';
import { STRENGTHS } from '../core/types';

export type JsonSchema = { [key: string]: unknown };

/** Pass B (S3), cloud `responseJsonSchema`. The `satisfies` clause is the tsc half of U-45. */
export const ADV_B_SCHEMA = advB satisfies NonNullable<GenerationConfig['responseJsonSchema']>;
/** Nano pre-screen (S1), device `responseConstraint` (static: the 13 pre-screen clue types). */
export const NANO_PRE_SCHEMA = nanoPre satisfies NonNullable<LanguageModelPromptOptions['responseConstraint']>;

/** An empty `enum` is an invalid schema: callers catch this, skip the device call and run the deterministic path. */
export class EmptyEnumError extends Error {
  readonly field: string;
  constructor(field: string) { super(`empty enum for ${field}: skip the device call`); this.name = 'EmptyEnumError'; this.field = field; }
}

function ids(field: string, list: readonly string[]): string[] {
  const out = [...new Set(list)];
  if (!out.length) throw new EmptyEnumError(field);
  for (const id of out) if (typeof id !== 'string' || !id.trim()) throw new TypeError(`${field}: ids must be non-empty strings`);
  return out;
}

const STRENGTH_ENUM: string[] = [...STRENGTHS];
export const FIX_CROPS = ['none', 'top', 'bottom', 'left', 'right'] as const;
export const FIX_RESIDUALS = ['country', 'region', 'city', 'district', 'neighbourhood', 'street'] as const;

/** nanoVaultText.v1 (S0): which visible texts refer to which vault items (ARCH §10.8). */
export function vaultTextSchema(textIds: readonly string[], vaultIds: readonly string[]): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      hits: {
        type: 'array', maxItems: 12,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text_id: { type: 'string', enum: ids('text_id', textIds) },
            vault_id: { type: 'string', enum: ids('vault_id', vaultIds) },
            strength: { type: 'string', enum: STRENGTH_ENUM },
          },
          required: ['text_id', 'vault_id', 'strength'],
        },
      },
    },
    required: ['hits'],
  };
}

/** nanoRef.v1 (S0): which adversary claims point at which vault items (ARCH §10.9). */
export function refereeSchema(claimIds: readonly string[], vaultIds: readonly string[]): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      matches: {
        type: 'array', maxItems: 12,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            claim_id: { type: 'string', enum: ids('claim_id', claimIds) },
            vault_id: { type: 'string', enum: ids('vault_id', vaultIds) },
            strength: { type: 'string', enum: STRENGTH_ENUM },
            reason: { type: 'string' },
          },
          required: ['claim_id', 'vault_id', 'strength', 'reason'],
        },
      },
    },
    required: ['matches'],
  };
}

/** nanoFix.v1 (S0): the smallest edit; only removable clue IDs may be masked (ARCH §10.10). */
export function fixSchema(removableIds: readonly string[]): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      mask: { type: 'array', maxItems: 8, items: { type: 'string', enum: ids('mask', removableIds) } },
      crop: { type: 'string', enum: [...FIX_CROPS] },
      explanation: { type: 'string' },
      expected_residual: { type: 'string', enum: [...FIX_RESIDUALS] },
    },
    required: ['mask', 'crop', 'explanation', 'expected_residual'],
  };
}

const ALLOWED_KEYS = new Set(['type', 'properties', 'required', 'items', 'enum', 'minItems', 'maxItems', 'minimum', 'maximum',
  'additionalProperties', 'description']);
const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean']);

/**
 * Hand-written structural check of the JSON Schema subset we use. Throws with a JSON path on the first problem:
 * unknown keywords (catches typos), bad types, required ⊄ properties, arrays without items, empty or non-string enums.
 */
export function assertSchemaShape(schema: unknown, path = '$'): void {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error(`${path}: schema must be an object`);
  const s = schema as Record<string, unknown>;
  for (const k of Object.keys(s)) if (!ALLOWED_KEYS.has(k)) throw new Error(`${path}: unsupported keyword "${k}"`);
  if (typeof s.type !== 'string' || !TYPES.has(s.type)) throw new Error(`${path}: bad or missing type`);
  if (s.description !== undefined && typeof s.description !== 'string') throw new Error(`${path}: description must be a string`);
  const numeric = s.type === 'number' || s.type === 'integer';
  if ((s.minimum !== undefined || s.maximum !== undefined) && !numeric) throw new Error(`${path}: minimum/maximum on a non-number`);
  for (const k of ['minimum', 'maximum', 'minItems', 'maxItems'] as const) {
    if (s[k] !== undefined && typeof s[k] !== 'number') throw new Error(`${path}: ${k} must be a number`);
  }
  if (typeof s.minimum === 'number' && typeof s.maximum === 'number' && s.minimum > s.maximum) throw new Error(`${path}: minimum > maximum`);
  if (s.enum !== undefined) {
    if (s.type !== 'string') throw new Error(`${path}: enum is only used on strings`);
    if (!Array.isArray(s.enum) || s.enum.length === 0) throw new Error(`${path}: enum must be a non-empty array`);
    if (s.enum.some((v) => typeof v !== 'string' || !v)) throw new Error(`${path}: enum values must be non-empty strings`);
    if (new Set(s.enum).size !== s.enum.length) throw new Error(`${path}: duplicate enum values`);
  }
  if (s.type === 'object') {
    if (!s.properties || typeof s.properties !== 'object' || Array.isArray(s.properties)) throw new Error(`${path}: object without properties`);
    const props = s.properties as Record<string, unknown>;
    for (const [k, v] of Object.entries(props)) assertSchemaShape(v, `${path}.${k}`);
    if (s.required !== undefined) {
      if (!Array.isArray(s.required)) throw new Error(`${path}: required must be an array`);
      for (const r of s.required) if (typeof r !== 'string' || !(r in props)) throw new Error(`${path}: required "${String(r)}" is not a property`);
      if (new Set(s.required).size !== s.required.length) throw new Error(`${path}: duplicate required entries`);
    }
    if (s.additionalProperties !== undefined && s.additionalProperties !== false) throw new Error(`${path}: additionalProperties may only be false`);
  } else if (s.properties !== undefined || s.required !== undefined || s.additionalProperties !== undefined) {
    throw new Error(`${path}: object keywords on a non-object`);
  }
  if (s.type === 'array') {
    if (s.items === undefined) throw new Error(`${path}: array without items`);
    assertSchemaShape(s.items, `${path}[]`);
    if (typeof s.minItems === 'number' && typeof s.maxItems === 'number' && s.minItems > s.maxItems) throw new Error(`${path}: minItems > maxItems`);
  } else if (s.items !== undefined || s.minItems !== undefined || s.maxItems !== undefined) {
    throw new Error(`${path}: array keywords on a non-array`);
  }
}
