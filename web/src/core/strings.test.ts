import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '@strings/en.json';
import explainFallback from '@prompts/explain-fallback.v1.json';
import { buildTable, createT, EXPLAIN_TEMPLATE_PREFIX, explainTemplateId, STRINGS, t, type StringId, type StringTable } from './strings';
import { CLUE_TYPES } from './types';
import { explainFallbacks } from '../ai/prompts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const table = { 'a.plain': 'Hello', 'a.one': 'Faces sent: {f}', 'a.many': '{KIND}: {band words} ({KIND})', 'a.dollar': 'Cost {x}' };

describe('t()', () => {
  it('returns SPEC §11 text verbatim', () => {
    expect(t('copy.app.tagline')).toBe("See your photo the way a stalker's AI would, before you post it.");
  });

  it('substitutes {name} placeholders, including names with spaces and capitals', () => {
    expect(t('copy.ledger.counters', { f: 0, v: 0 })).toBe('Faces sent: 0 · Vault items sent: 0');
    expect(t('copy.import.gpsNear', { 'band words': 'within 1 km', KIND: 'HOME' })).toBe('That GPS point is within 1 km of your HOME. It has been removed.');
    const lt = createT(table, { strict: true });
    expect(lt('a.many', { KIND: 'Home', 'band words': 'within 1 km' })).toBe('Home: within 1 km (Home)');
    expect(lt('a.dollar', { x: '$& $1' })).toBe('Cost $& $1'); // no String.replace pattern expansion
  });

  it('throws on an unknown ID in tests (strict)', () => {
    expect(() => t('copy.does.not.exist' as StringId)).toThrow(/unknown id/);
    expect(() => createT(table, { strict: true })('nope')).toThrow(/unknown id "nope"/);
  });

  it('throws on a missing parameter in strict mode', () => {
    expect(() => t('copy.ledger.counters', { f: 0 })).toThrow(/needs the parameter \{v\}/);
  });

  it('falls back to the ID, and keeps a missing {name}, in production (lenient)', () => {
    const lt = createT(table, { strict: false });
    expect(lt('nope')).toBe('nope');
    expect(lt('a.one')).toBe('Faces sent: {f}');
    expect(lt('a.plain', { unused: 1 })).toBe('Hello');
  });

  it('does not resolve inherited object keys', () => {
    expect(() => createT(table, { strict: true })('toString')).toThrow(/unknown id/);
    expect(() => t('toString' as StringId)).toThrow(/unknown id/);
  });

  it('resolves copy.explain.template.<type> from explain-fallback.v1.json (ARCH §3.1, §10.11)', () => {
    expect(t('copy.explain.template.transit_sign')).toBe(explainFallback.templates.transit_sign);
    expect(explainTemplateId('plate')).toBe('copy.explain.template.plate');
    expect(t(explainTemplateId('plate'))).toBe(explainFallback.templates.plate);
  });
});

describe('buildTable()', () => {
  it('merges the strings file with the templates under the template prefix', () => {
    expect(buildTable({ 'copy.a': 'A' }, { plate: 'P' })).toEqual({ 'copy.a': 'A', 'copy.explain.template.plate': 'P' });
  });

  it('rejects an explain template defined in en.json (they live only in explain-fallback, SPEC §11)', () => {
    expect(() => buildTable({ 'copy.explain.template.plate': 'X' }, { plate: 'P' })).toThrow(/belongs in explain-fallback/);
    expect(() => buildTable({ 'copy.explain.template.other': 'X' }, {})).toThrow(/belongs in explain-fallback/);
  });

  it('rejects a template type that is not a plain identifier', () => {
    expect(() => buildTable({}, { 'bad.type': 'X' })).toThrow(/bad explain template type/);
  });
});

/** SPEC §11 rows `| copy.id | text |`, read from the doc itself so en.json can never drift from the catalogue. */
function specCatalogue(): Map<string, string> {
  const lines = readFileSync(join(ROOT, 'docs/SPEC.md'), 'utf8').split('\n');
  const start = lines.findIndex((l) => /^## 11\. /.test(l));
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  const rows = new Map<string, string>();
  if (start < 0 || end < 0) return rows;
  for (const l of lines.slice(start, end)) {
    const m = /^\| (copy\.[A-Za-z0-9_.{}]+) \| (.*) \|$/.exec(l);
    if (m) rows.set(m[1], m[2]);
  }
  return rows;
}

/** SPEC §11 `copy.judge.coach.{step}`: one coach mark per step (pre-screen, consent, attack, referee, verdict, fix, re-attack). */
const COACH_STEPS = ['prescreen', 'consent', 'attack', 'referee', 'verdict', 'fix', 'reattack'];

describe('shared/strings/en.json', () => {
  const entries = Object.entries(en as Record<string, string>);

  it('is a flat map of non-empty strings under copy.* or ui.*', () => {
    for (const [id, text] of entries) {
      expect(id).toMatch(/^(copy|ui)\.[A-Za-z0-9_.]+$/);
      expect(typeof text).toBe('string');
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  it('holds every SPEC §11 copy ID with its exact text, and no copy.* ID that SPEC lacks', () => {
    const spec = specCatalogue();
    expect(spec.size, 'SPEC §11 table not found or changed shape').toBeGreaterThan(100);
    const expected = new Map<string, string>();
    for (const [id, text] of spec) {
      if (id === 'copy.judge.coach.{step}') continue;
      expect(id, 'SPEC §11 template IDs other than copy.judge.coach.{step} need handling here').not.toMatch(/[{}]/);
      expected.set(id, text);
    }
    expect(spec.has('copy.judge.coach.{step}')).toBe(true);
    for (const [id, text] of expected) expect(STRINGS[id], id).toBe(text);
    const coach = COACH_STEPS.map((s) => `copy.judge.coach.${s}`);
    for (const id of coach) expect(STRINGS[id]?.trim().length ?? 0, id).toBeGreaterThan(0);
    const allowed = new Set([...expected.keys(), ...coach]);
    expect(entries.map(([id]) => id).filter((id) => id.startsWith('copy.') && !allowed.has(id))).toEqual([]);
  });

  it('leaves copy.explain.template.* to explain-fallback.v1.json, which covers all 18 clue types', () => {
    expect(entries.filter(([id]) => id.startsWith(EXPLAIN_TEMPLATE_PREFIX))).toEqual([]);
    expect(Object.keys(explainFallback.templates).sort()).toEqual([...CLUE_TYPES].sort());
    for (const type of CLUE_TYPES) expect(t(explainTemplateId(type)), type).toBe(explainFallback.templates[type]);
  });
});

// ---------- every copy ID used in code exists (T-087 Verify 1) ----------

/** Quoted `copy.*` / `ui.*` literals. A literal ending in `.`, `${` (TS) or `\(` (Swift) is a prefix. */
const ID_LITERAL = /(['"`])((?:copy|ui)\.[A-Za-z0-9_.-]*)(\$\{|\\\(|['"`])/g; // '-' included: a typo like copy.x.re-attack is reported, not skipped

function idsInSource(code: string): { exact: string[]; prefixes: string[] } {
  const exact: string[] = [];
  const prefixes: string[] = [];
  for (const m of code.matchAll(ID_LITERAL)) {
    const [, open, id, close] = m;
    if (close === '${' || close === '\\(' || (close === open && id.endsWith('.'))) prefixes.push(id);
    else if (close === open) exact.push(id);
  }
  return { exact, prefixes };
}

const listSources = (dir: string, ext: RegExp, out: string[] = []): string[] => {
  for (const n of readdirSync(dir)) {
    if (n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) listSources(p, ext, out);
    else if (ext.test(n) && !/\.test\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
};

describe('copy IDs used in code', () => {
  it('the explain templates strings.ts uses equal prompts.explainFallbacks() (one source of truth, pinned to v1)', () => {
    const viaPrompts = explainFallbacks();
    for (const type of CLUE_TYPES) expect(t(explainTemplateId(type)), type).toBe(viaPrompts[type]);
  });

  it('reports hyphenated IDs instead of skipping them', () => {
    expect(idsInSource("Strings.t(\"copy.judge.coach.re-attack\")").exact).toEqual(['copy.judge.coach.re-attack']);
  });

  it('finds exact IDs and prefixes in TS and Swift source', () => {
    const code = "t('copy.a.b'); t(\"ui.x\"); `ui.step.${s}`; const P = 'copy.explain.template.'; Strings.t(\"ui.s.\\(k)\"); // `copy.*` and copy.free";
    expect(idsInSource(code)).toEqual({ exact: ['copy.a.b', 'ui.x'], prefixes: ['ui.step.', 'copy.explain.template.', 'ui.s.'] });
  });

  it('exist in en.json or, for copy.explain.template.*, in explain-fallback.v1.json (web/src and ios/StrangersEyes)', () => {
    const files = [
      ...listSources(join(ROOT, 'web/src'), /\.(ts|tsx)$/),
      ...listSources(join(ROOT, 'ios/StrangersEyes'), /\.swift$/),
    ];
    expect(files.length).toBeGreaterThan(10);
    const missing: string[] = [];
    let seen = 0;
    for (const f of files) {
      const { exact, prefixes } = idsInSource(readFileSync(f, 'utf8'));
      const where = relative(ROOT, f);
      // iOS Strings.swift loads en.json only (no explain templates yet), so Swift IDs are checked against en.json alone.
      const table: Record<string, string> = f.endsWith('.swift') ? (en as Record<string, string>) : (STRINGS as Record<string, string>);
      const ids = Object.keys(table);
      seen += exact.length + prefixes.length;
      for (const id of exact) if (!Object.prototype.hasOwnProperty.call(table, id)) missing.push(`${where}: ${id}`);
      for (const p of prefixes) if (!ids.some((id) => id.startsWith(p))) missing.push(`${where}: ${p}*`);
    }
    expect(seen).toBeGreaterThan(20);
    expect(missing).toEqual([]);
  });
});

// ---------- AC-304: no string calls anything "safe" ----------

/** The only string allowed to contain "safe": it says the app can't promise a photo is safe (AC-304, SR-07). */
const SAFE_ALLOWLIST = new Set(['copy.about.notGuarantee']);
const safeClaims = (strings: StringTable): string[] =>
  Object.entries(strings).filter(([id, text]) => /\bsafe\b/i.test(text) && !SAFE_ALLOWLIST.has(id)).map(([id]) => id);

/** Guarantee wording the explainer's output check rejects (ARCH §10.11, AC-239); the fallbacks replace that output. */
const GUARANTEE = /\bguarantee(d)?\b|100%|completely hidden|no one can/i;

describe('AC-304 copy audit', () => {
  it('flags "safe" as a whole word in any case, outside the allowlist', () => {
    expect(safeClaims({ 'copy.x': 'Your photo is SAFE.', 'copy.y': 'Safe-ish', 'copy.z': 'unsafe, safety, safely' })).toEqual(['copy.x', 'copy.y']);
    expect(safeClaims({ 'copy.about.notGuarantee': 'It is safe' })).toEqual([]);
  });

  it('no string in en.json or explain-fallback.v1.json says "safe", except copy.about.notGuarantee', () => {
    expect(Object.keys(STRINGS).length).toBe(Object.keys(en).length + CLUE_TYPES.length);
    expect(STRINGS['copy.about.notGuarantee']).toMatch(/\bsafe\b/); // the allowlist still points at the right string
    expect(safeClaims(STRINGS)).toEqual([]);
  });

  it('explain fallbacks carry no guarantee wording (AC-239 output check)', () => {
    const bad = Object.entries(explainFallback.templates).filter(([, text]) => GUARANTEE.test(text));
    expect(bad).toEqual([]);
  });
});
