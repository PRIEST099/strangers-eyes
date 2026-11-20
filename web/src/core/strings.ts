// web/src/core/strings.ts: every user-facing string comes from shared/strings/en.json (SPEC §11; ARCH §3.1).
// `copy.*` IDs are SPEC §11 verbatim. `ui.*` IDs hold text SPEC gives outside §11 (the §8.2 chips, §8.3 badge
// labels, the §8.2 stepper, SCR-13 counters) plus shell chrome. T-087 completes the §11 set and adds the
// copy.explain.template.* fallbacks from shared/prompts/explain-fallback.v1.json.
import en from '@strings/en.json';

export type StringId = keyof typeof en;
export type StringParams = Readonly<Record<string, string | number>>;
export type StringTable = Readonly<Record<string, string>>;
export type Translate = (id: string, params?: StringParams) => string;

/** `{name}` placeholders (SPEC §11). Names may contain spaces and capitals: `{band words}`, `{KIND}`. */
const PLACEHOLDER = /\{([^{}]+)\}/g;
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

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

const lookup = createT(en, { strict: import.meta.env.MODE === 'test' });

/** The app's string lookup: `t('copy.ledger.counters', { f: 0, v: 0 })`. */
export function t(id: StringId, params?: StringParams): string {
  return lookup(id, params);
}
