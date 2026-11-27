import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CLOUD_TEXT_PROMPTS, explainFallbacks, fileText, hasSystem, MANIFEST, nonContentStrings, placeholders, PROMPT_IDS,
  PromptError, rawFile, render, segmentsText, staticSegments, systemText, verifyFiles, verifyManifest, type PromptId,
} from './prompts';
import { CLUE_TYPES, PRESCREEN_CLUE_TYPES } from '../core/types';

const DIR = fileURLToPath(new URL('../../../shared/prompts/', import.meta.url));
const listFiles = (d: string, out: string[] = []): string[] => {
  for (const n of readdirSync(d)) {
    if (n.startsWith('.')) continue; // same rule as check-prompts.mjs and the Vite glob (.DS_Store etc.)
    const p = join(d, n);
    if (statSync(p).isDirectory()) listFiles(p, out);
    else out.push(relative(DIR, p).split('\\').join('/'));
  }
  return out;
};
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/** The variables each prompt takes (ARCH §10.8–10.12). A change here means a new prompt version. */
const VARS: Record<PromptId, string[]> = {
  'advA.v1': [], 'advB.v1': [], 'nanoPre.v1': [],
  'nanoVaultText.v1': ['TEXTS_JSON', 'VAULT_JSON'],
  'nanoRef.v1': ['CLAIMS_JSON', 'VAULT_JSON'],
  'nanoFix.v1': ['CLUES_JSON', 'MATCHES_JSON', 'DISTANCE_JSON'],
  'explain.v1': ['CLUE_TYPE', 'REGION', 'EVIDENCE', 'REVEALS'],
  'fmPre.v1': ['LINES_JSON', 'LABELS_JSON'],
  'textProbe.dev1': [],
};
const sample = (id: PromptId) => Object.fromEntries(VARS[id].map((v) => [v, v.endsWith('_JSON') ? [{ id: 'x1', text: `<${v}>` }] : `<${v}>`]));

describe('manifest', () => {
  it('lists exactly the prompt IDs in PROMPT_IDS', () => {
    expect(Object.keys(MANIFEST.prompts).sort()).toEqual([...PROMPT_IDS].sort());
  });

  it('hashes every file on disk (except manifest.json and README.md), and every hash matches', () => {
    const onDisk = listFiles(DIR).filter((f) => f !== 'manifest.json' && f !== 'README.md').sort();
    expect(Object.keys(MANIFEST.files).sort()).toEqual(onDisk);
    for (const f of onDisk) expect(sha(readFileSync(join(DIR, f))), f).toBe(MANIFEST.files[f]);
  });

  it('every file a prompt references exists and is hashed', () => {
    for (const s of Object.values(MANIFEST.prompts)) {
      for (const key of ['system', 'user', 'schema', 'fallback'] as const) {
        const v = s[key];
        for (const f of v === undefined ? [] : Array.isArray(v) ? v : [v]) expect(MANIFEST.files[f], f).toBeDefined();
      }
    }
  });

  it('every prompt has a boolean released flag (drafts until their first recorded run, D-62)', () => {
    for (const [id, sp] of Object.entries(MANIFEST.prompts)) expect(typeof sp.released, id).toBe('boolean');
  });

  it('verifyFiles reports a tampered file, a missing file and an unlisted extra file', async () => {
    const real = new Map(Object.keys(MANIFEST.files).filter((f) => !f.includes('/')).map((f) => [f, rawFile(f)]));
    expect(await verifyFiles(real, MANIFEST)).toEqual([]);
    const tampered = new Map(real); tampered.set('advB.v1.user.md', rawFile('advB.v1.user.md') + 'x');
    expect(await verifyFiles(tampered, MANIFEST)).toEqual(['advB.v1.user.md: sha256 mismatch']);
    const missing = new Map(real); missing.delete('nanoRef.v1.user.md');
    expect(await verifyFiles(missing, MANIFEST)).toEqual(['nanoRef.v1.user.md: not bundled']);
    const extra = new Map(real); extra.set('rogue.v1.user.md', 'hello');
    expect(await verifyFiles(extra, MANIFEST)).toEqual(['rogue.v1.user.md: not in manifest']);
  });

  it('the bundled (Vite ?raw) texts are byte-identical to the files: verifyManifest() finds nothing', async () => {
    expect(await verifyManifest()).toEqual([]);
    for (const f of Object.keys(MANIFEST.files).filter((x) => !x.includes('/'))) expect(sha(rawFile(f))).toBe(MANIFEST.files[f]);
  });

  it('every text file ends with exactly one newline and uses LF', () => {
    for (const f of listFiles(DIR)) {
      const t = readFileSync(join(DIR, f), 'utf8');
      expect(t.endsWith('\n') && !t.endsWith('\n\n'), f).toBe(true);
      expect(t.includes('\r'), f).toBe(false);
    }
  });
});

describe('render', () => {
  it('every prompt loads and renders with exactly its documented variables', () => {
    for (const id of PROMPT_IDS) {
      expect(placeholders(id), id).toEqual(VARS[id]);
      const segs = render(id, sample(id));
      expect(segs.length, id).toBeGreaterThan(0);
      expect(segmentsText(segs)).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
    }
  });

  it('marks template text static and values dynamic; _JSON values are JSON.stringify-ed', () => {
    // A unique marker: the template's own examples legitimately mention "City General Hospital".
    const segs = render('nanoRef.v1', { CLAIMS_JSON: [{ id: 'i1', kind: 'workplace', value: 'A hospital' }], VAULT_JSON: [{ id: 'v1', kind: 'work', label: 'ZZ_MARKER_LABEL' }] });
    const dyn = segs.filter((s) => s.dynamic).map((s) => s.text);
    expect(dyn).toEqual(['[{"id":"i1","kind":"workplace","value":"A hospital"}]', '[{"id":"v1","kind":"work","label":"ZZ_MARKER_LABEL"}]']);
    expect(segs.filter((s) => !s.dynamic).map((s) => s.text).join('')).not.toContain('ZZ_MARKER');
    expect(segs[0].dynamic).toBe(false);
    expect(segmentsText(segs)).toBe(fileText('nanoRef.v1.user.md')
      .replace('{{CLAIMS_JSON}}', dyn[0]).replace('{{VAULT_JSON}}', dyn[1]));
  });

  it('accepts empty strings ("unknown") and joins explain.v1 rules + user with a newline', () => {
    const segs = render('explain.v1', { CLUE_TYPE: 'transit_sign', REGION: 'top_right', EVIDENCE: '', REVEALS: '' });
    const text = segmentsText(segs);
    expect(text.startsWith(fileText('explain.v1.rules.md') + '\n' + 'Clue type: transit_sign')).toBe(true);
    expect(text).toContain('What was noticed: \n');
  });

  it('throws on a missing variable, an unused variable, or a non-string plain variable', () => {
    expect(() => render('nanoRef.v1', { CLAIMS_JSON: [] })).toThrow(PromptError);
    expect(() => render('nanoRef.v1', { CLAIMS_JSON: [], VAULT_JSON: [], EXTRA: 'x' })).toThrow(/unused/);
    expect(() => render('advB.v1', { X: '1' })).toThrow(/unused/);
    expect(() => render('explain.v1', { CLUE_TYPE: 1, REGION: '', EVIDENCE: '', REVEALS: '' })).toThrow(/must be a string/);
    expect(() => render('nanoFix.v1', { CLUES_JSON: undefined, MATCHES_JSON: [], DISTANCE_JSON: [] })).toThrow(/JSON-serialisable/);
  });

  it('a value that looks like a placeholder is inserted literally, never re-expanded', () => {
    const segs = render('explain.v1', { CLUE_TYPE: '{{REGION}}', REGION: 'x', EVIDENCE: '', REVEALS: '' });
    expect(segmentsText(segs)).toContain('Clue type: {{REGION}}');
  });
});

describe('system parts', () => {
  it('S3 prompts get audit rules + pass rules; device prompts have no system part (D-04)', () => {
    expect(systemText('advA.v1')).toBe(fileText('audit-rules.v1.md') + '\n' + fileText('advA.v1.system.md'));
    expect(systemText('advB.v1')).toBe(fileText('audit-rules.v1.md') + '\n' + fileText('advB.v1.system.md'));
    for (const id of ['nanoPre.v1', 'nanoVaultText.v1', 'nanoRef.v1', 'nanoFix.v1', 'explain.v1', 'fmPre.v1'] as const) {
      expect(hasSystem(id)).toBe(false);
      expect(() => systemText(id)).toThrow(PromptError);
    }
  });

  it('pass-B system rules number on from the audit rules (1-5, then 6-10)', () => {
    expect(fileText('audit-rules.v1.md')).toMatch(/\n5\. /);
    expect(fileText('advB.v1.system.md').startsWith('6. ')).toBe(true);
    expect(fileText('advA.v1.system.md').startsWith('6. ')).toBe(true);
  });
});

describe('tripwire helpers', () => {
  it('staticSegments holds only cloud-scanned prompt text (advA, advB, explain), longest first', () => {
    const st = staticSegments();
    expect([...CLOUD_TEXT_PROMPTS]).toEqual(['advA.v1', 'advB.v1', 'explain.v1']);
    // Derived from the manifest: every version of the cloud-scanned families is included (a v2 cannot be missed)
    for (const id of Object.keys(MANIFEST.prompts)) {
      if (/^(advA|advB|explain)\./.test(id)) expect(CLOUD_TEXT_PROMPTS, id).toContain(id);
    }
    expect(st).toContain(systemText('advA.v1'));
    expect(st).toContain(systemText('advB.v1'));
    expect(st).toContain(fileText('advB.v1.user.md'));
    expect(st.some((x) => x.startsWith(fileText('explain.v1.rules.md')))).toBe(true);
    for (const piece of fileText('explain.v1.user.md').split(/\{\{[A-Z0-9_]+\}\}/).filter((x) => x.trim())) {
      expect(st.some((x) => x.includes(piece)), piece).toBe(true);
    }
    // S0/S1 template text is never stripped (it must never appear in a scanned cloud body)
    expect(st.join('|')).not.toContain('You compare an outside investigator');
    expect(st.join('|')).not.toContain('You check a photo before it is posted');
    for (let i = 1; i < st.length; i++) expect(st[i - 1].length).toBeGreaterThanOrEqual(st[i].length);
    expect(st.join('|')).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });

  it('nonContentStrings holds the pass-B schema strings and SDK protocol values, for exact-match skipping', () => {
    const nc = nonContentStrings();
    for (const v of ['landmark', 'medium', 'no_location_signal', 'venue_or_organisation', 'object', 'application/json', 'user', 'MEDIUM', 'image/jpeg']) {
      expect(nc.has(v), v).toBe(true);
    }
    expect(nc.has('Lucas')).toBe(false);
    expect(nc.has('Landmark')).toBe(false); // exact, case-sensitive: a vault label "Landmark" is still scanned in user text
  });
});

describe('prompt texts stay consistent with the enums', () => {
  it('nanoPre and fmPre list exactly the 13 pre-screen clue types', () => {
    const list = PRESCREEN_CLUE_TYPES.join(', ');
    expect(fileText('nanoPre.v1.user.md')).toContain(`List visible items of these types: ${list}.`);
    expect(fileText('fmPre.v1.user.md')).toContain(`List items of these types: ${list}.`);
  });

  it('explain fallbacks cover all 18 clue types: at most 2 sentences / 45 words, never "safe"', () => {
    const fb = explainFallbacks();
    expect(Object.keys(fb)).toEqual([...CLUE_TYPES]);
    for (const [k, v] of Object.entries(fb)) {
      expect(v.split(/\s+/).length, k).toBeLessThanOrEqual(45);
      expect((v.match(/[.!?](\s|$)/g) ?? []).length, k).toBeLessThanOrEqual(2);
      expect(v.toLowerCase(), k).not.toMatch(/\bsafe/);
    }
  });
});
