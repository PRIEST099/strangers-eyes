import { describe, expect, it } from 'vitest';
import en from '@strings/en.json';
import { createT, t, type StringId } from './strings';

const table = { 'a.plain': 'Hello', 'a.one': 'Faces sent: {f}', 'a.many': '{KIND}: {band words} ({KIND})', 'a.dollar': 'Cost {x}' };

describe('t()', () => {
  it('returns SPEC §11 text verbatim', () => {
    expect(t('copy.app.tagline')).toBe("See your photo the way a stalker's AI would, before you post it.");
  });

  it('substitutes {name} placeholders, including names with spaces and capitals', () => {
    expect(t('copy.ledger.counters', { f: 0, v: 0 })).toBe('Faces sent: 0 · Vault items sent: 0');
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
  });
});

describe('shared/strings/en.json', () => {
  const entries = Object.entries(en as Record<string, string>);

  it('is a flat map of non-empty strings under copy.* or ui.*', () => {
    for (const [id, text] of entries) {
      expect(id).toMatch(/^(copy|ui)\.[A-Za-z0-9_.]+$/);
      expect(typeof text).toBe('string');
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  it('never calls anything "safe" (AC-304; copy.about.notGuarantee is the allowlisted exception)', () => {
    const hits = entries.filter(([id, text]) => /\bsafe\b/i.test(text) && id !== 'copy.about.notGuarantee');
    expect(hits).toEqual([]);
  });
});
