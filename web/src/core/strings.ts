// web/src/core/strings.ts: every user-facing string comes from shared files, never inline (SPEC §11; ARCH §3.1).
// Two sources, one lookup: shared/strings/en.json (the flat map iOS reads too) and the per-clue-type explain
// fallbacks in shared/prompts/explain-fallback.v1.json, which resolve as copy.explain.template.<type>.
// `copy.*` IDs are SPEC §11 verbatim (copy.judge.coach.* are authored to SPEC's one-line brief). `ui.*` IDs hold
// text SPEC gives outside §11 (the §8.2 chips, §8.3 badge labels, the §8.2 stepper, SCR-13 counters) plus shell chrome.
import en from '@strings/en.json';
import explainFallback from '@prompts/explain-fallback.v1.json';
import type { ClueType } from './types';

/** The copy-ID prefix the explain-fallback templates resolve under (SPEC §11, ARCH §10.11). */
export const EXPLAIN_TEMPLATE_PREFIX = 'copy.explain.template.';

export type ExplainTemplateId = `${typeof EXPLAIN_TEMPLATE_PREFIX}${keyof typeof explainFallback.templates}`;
export type StringId = keyof typeof en | ExplainTemplateId;
export type StringParams = Readonly<Record<string, string | number>>;
export type StringTable = Readonly<Record<string, string>>;
export type Translate = (id: string, params?: StringParams) => string;

/** `{name}` placeholders (SPEC §11). Names may contain spaces and capitals: `{band words}`, `{KIND}`. */
const PLACEHOLDER = /\{([^{}]+)\}/g;
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Merge the strings file with the explain templates into one lookup table. The templates live only in the
 * prompts file (SPEC §11), so an en.json key under the template prefix is a mistake and throws, as does a
 * template type that is not a plain identifier.
 */
export function buildTable(strings: StringTable, templates: StringTable): StringTable {
  const out: Record<string, string> = {};
  for (const [id, text] of Object.entries(strings)) {
    if (id.startsWith(EXPLAIN_TEMPLATE_PREFIX)) throw new Error(`strings: "${id}" belongs in explain-fallback, not en.json`);
    out[id] = text;
  }
  for (const [type, text] of Object.entries(templates)) {
    if (!/^[a-z0-9_]+$/.test(type)) throw new Error(`strings: bad explain template type "${type}"`);
    out[EXPLAIN_TEMPLATE_PREFIX + type] = text;
  }
  return out;
}

/** Every string the app can show: en.json plus copy.explain.template.<type>. */
export const STRINGS: StringTable = buildTable(en, explainFallback.templates);

/**
 * Build a lookup over a table. Strict mode (tests) throws on an unknown ID or a missing parameter, so a typo
 * fails CI. Lenient mode (production) shows the ID itself, and leaves a missing `{name}` in place, rather than
 * crashing the screen.
 */
export function createT(table: StringTable, opts: { strict: boolean }): Translate {
  return (id, params) => {
    if (!has(table, id)) {
      if (opts.strict) throw new Error(`strings: unknown id "${id}"`);
      return id;
    }
    return table[id].replace(PLACEHOLDER, (whole: string, name: string) => {
      if (params && has(params, name)) return String(params[name]);
      if (opts.strict) throw new Error(`strings: "${id}" needs the parameter {${name}}`);
      return whole;
    });
  };
}

const lookup = createT(STRINGS, { strict: import.meta.env.MODE === 'test' });

/** The app's string lookup: `t('copy.ledger.counters', { f: 0, v: 0 })`, `t(explainTemplateId('plate'))`. */
export function t(id: StringId, params?: StringParams): string {
  return lookup(id, params);
}

/** The copy ID of a clue type's static explanation. It type-checks only if every ClueType has a template. */
export const explainTemplateId = (type: ClueType): StringId => `${EXPLAIN_TEMPLATE_PREFIX}${type}`;
