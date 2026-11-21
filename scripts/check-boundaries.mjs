#!/usr/bin/env node
// scripts/check-boundaries.mjs: enforces the import and call-site rules of ARCH §4.2 over web/src and ios/.
// This is how CLAUDE.md invariant 4 ("every Firebase AI Logic call goes through the Egress Gate") is enforced in CI.
//
//   node scripts/check-boundaries.mjs              self-test on planted violations, then check the repo
//   node scripts/check-boundaries.mjs --no-self-test
//   node scripts/check-boundaries.mjs --root <dir> check another tree
//
// Exit code 1 on any violation, or if the self-test fails. Comments are ignored; string contents are NOT
// (so `m['generateContent']` is still caught). Hardened after the T-023 review (boundary-evasion-1..6, boundary-fp-1..3).
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));

const WEB_EXT = /\.(c|m)?(ts|js)x?$/; // .ts .tsx .js .jsx .mts .cts .mjs .cjs
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dev-dist', '.git', 'build', 'DerivedData', '.spm', 'vendor']);
export const DEV_MARKER = '__SE_DEV_ONLY__';

function walk(dir, ext, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, ext, out);
    else if (ext.test(name)) out.push(p);
  }
  return out;
}

const REGEX_PREFIX_PUNCT = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const REGEX_PREFIX_WORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);
const isIdent = (c) => /[\w$]/.test(c);

/**
 * Remove // and /* *\/ comments while keeping line numbers, string literals and regex literals intact.
 * Regex literals are recognised by the previous significant token, so `/\/*$/` does not open a comment.
 * Errors are biased toward KEEPING text (more matches), never toward dropping code.
 */
export function stripComments(src) {
  let out = '';
  let i = 0;
  let mode = 'code'; // code | line | block | sq | dq | tpl
  let lastSig = ''; // last significant character emitted in code mode
  let word = ''; // identifier being read, or the last one if lastSig is an identifier char
  const emitCode = (c) => {
    out += c;
    if (/\s/.test(c)) return;
    if (isIdent(c)) word = isIdent(lastSig) ? word + c : c;
    lastSig = c;
  };
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && n === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && n === '*') { mode = 'block'; i += 2; continue; }
      if (c === '/') {
        const regexAllowed = lastSig === '' || REGEX_PREFIX_PUNCT.has(lastSig) || (isIdent(lastSig) && REGEX_PREFIX_WORDS.has(word));
        if (regexAllowed) {
          out += c; i++;
          let inClass = false;
          while (i < src.length) {
            const r = src[i];
            if (r === '\n') break; // not a regex after all; keep going as code
            out += r;
            if (r === '\\') { out += src[i + 1] ?? ''; i += 2; continue; }
            if (r === '[') inClass = true;
            else if (r === ']') inClass = false;
            else if (r === '/' && !inClass) { i++; break; }
            i++;
          }
          lastSig = 'a'; word = '';
          continue;
        }
        emitCode(c); i++; continue;
      }
      if (c === "'") mode = 'sq';
      else if (c === '"') mode = 'dq';
      else if (c === '`') mode = 'tpl';
      if (mode !== 'code') { out += c; lastSig = c; i++; continue; }
      emitCode(c); i++; continue;
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; out += c; }
      i++; continue;
    }
    if (mode === 'block') {
      if (c === '*' && n === '/') { mode = 'code'; i += 2; continue; }
      if (c === '\n') out += c;
      i++; continue;
    }
    // inside a string literal: keep everything
    out += c;
    if (c === '\\') { out += n ?? ''; i += 2; continue; }
    if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"') || (mode === 'tpl' && c === '`')) { mode = 'code'; lastSig = c; }
    else if ((mode === 'sq' || mode === 'dq') && c === '\n') mode = 'code'; // unterminated: recover
    i++;
  }
  return out;
}

const norm = (p) => p.split(sep).join('/');
const isTest = (rel) => /\.test\.(c|m)?(ts|js)x?$/.test(rel);
const isDev = (rel) => rel.startsWith('web/src/dev/');
// Only the Day-1 spikes may call the SDK directly (ARCH §4.2); dev/bench, dev/slice and dev/selftest go through the gate.
const isSpike = (rel) => rel.startsWith('web/src/dev/spikes/');
const inDir = (target, dir) => target === dir || target.startsWith(dir + '/');

/**
 * Line rules. `only`: files allowed to match (repo-relative). `exempt(rel)`: files the rule ignores.
 * `scope(rel)`: the only files the rule applies to. Tests may mock globals, so they are exempt from global-access rules.
 */
const WEB_RULES = [
  { id: 'R1-ai-call', re: /\b(generateContent|generateContentStream|startChat|sendMessage|sendMessageStream|countTokens)\b/,
    only: ['web/src/ai/egressGate.ts'], exempt: (r) => isSpike(r) || isTest(r),
    why: 'Every Firebase AI Logic call (generateContent*, chat, countTokens) goes through the Egress Gate (CLAUDE.md invariant 4).' },
  { id: 'R2-model-factory', re: /\bget(Generative|LiveGenerative|TemplateGenerative|TemplateImagen|Imagen)Model\b/,
    only: ['web/src/ai/models.ts'], exempt: (r) => isSpike(r) || isTest(r),
    why: 'Model factories live in ai/models.ts only.' },
  { id: 'R3-firebase-init', re: /\b(initializeApp|initializeAppCheck|getAuth|getAI)\s*\(/, only: ['web/src/firebase/init.ts'], exempt: (r) => isSpike(r) || isTest(r),
    why: 'Firebase init order is fixed in firebase/init.ts (ARCH §15.1).' },
  { id: 'R4-LanguageModel', re: /\bLanguageModel\b/, only: ['web/src/ai/capabilities.ts'], exempt: (r) => isSpike(r) || isTest(r),
    why: 'Only ai/capabilities.ts reads the Chrome LanguageModel global (fail-closed availability, D-03).' },
  { id: 'R5-fetch-override', re: /\b(globalThis|window|self)\.fetch\s*=(?!=)/, only: ['web/src/ai/tripwire.ts'], exempt: isTest,
    why: 'Only the tripwire may wrap fetch.' },
  { id: 'R6-firestore', re: /['"`]firebase\/firestore(\/[\w-]+)?['"`]/, only: ['web/src/firebase/atlas.ts'], exempt: isTest,
    why: "'firebase/firestore' is loaded only by firebase/atlas.ts." },
  { id: 'R7-localStorage', re: /\blocalStorage\b/, only: ['web/src/core/localPrefs.ts'], exempt: isTest,
    why: 'localStorage is used only through core/localPrefs.ts, never for vault data.' },
  { id: 'R8-url-input', re: /type\s*=\s*["']url["']|\bnew URL\s*\(/, only: [], scope: (r) => r === 'web/src/ui/components/ImportDropzone.tsx',
    why: 'Photos come from local files only; no URL input (CLAUDE.md invariant 9).' },
  // R9: NO `console` identifier at all where vault data, pin coordinates or the original photo's GPS flow. The bare
  // word (T-053 fix round 3; it was `console.<method>(` only) also catches console['log'](…), console?.log(…), a
  // `console` split from `.log(` across lines (the rules run line by line), an alias (`const c = console`),
  // destructuring (`const { log } = console`), globalThis.console, and every method (timeLog, assert, group… print
  // their arguments too). Comments are stripped, strings are not: the word in a string literal is flagged as well.
  { id: 'R9-console-in-sensitive', re: /\bconsole\b/, only: [],
    scope: (r) => !isTest(r) && (r.startsWith('web/src/vault/') || [
      'web/src/ai/vaultScan.ts', 'web/src/core/referee.ts', 'web/src/tier0/fuzzy.ts',
      // T-053: vault pins + the EXIF point (S0), and the original photo's GPS (readExifFacts, sniff.webpExifPayload)
      'web/src/tier0/gpsWarning.ts', 'web/src/tier0/importPhoto.ts', 'web/src/tier0/sniff.ts',
      // T-053 fix rounds 2-3: the active vault's pins (getPins / pinsWhenReady / importAndSettle) and the GPS warning
      'web/src/ui/components/ImportDropzone.tsx', 'web/src/ui/screens/Check.tsx', 'web/src/ui/importTransfer.ts',
      'web/src/ui/checkState.ts',
      // T-055: the vault UI holds labels, aliases and the user's own pin coordinates
      'web/src/ui/screens/Vault.tsx', 'web/src/ui/components/VaultItemForm.tsx', 'web/src/ui/components/PinButton.tsx',
      'web/src/ui/components/BurnVaultDialog.tsx',
    ].includes(r)),
    why: "No console where vault data, pins or the original photo's GPS flow (SR-15): no console.x(…), console[…], console?.…, alias or destructuring." },
  { id: 'R10-AdversaryNotes', re: /\bAdversaryNotes\b/,
    only: ['web/src/ai/jobs.ts', 'web/src/ai/parse.ts', 'web/src/core/session.ts', 'web/src/ui/components/NotesView.tsx', 'web/src/core/types.ts'],
    exempt: isTest, why: 'Grounded pass-A notes are display-only; code never parses or stores them (CLAUDE.md invariant 8). The UI component is NotesView.' },
  // R21: idb-keyval's createStore, the 'idb' package's openDB (installed with firebase) and a bare indexedDB.open()
  // keep the connection open forever, so Burn vault's deleteDatabase('se-…') blocks until a reload (ARCH §16.4). Only
  // vault/idb.ts (closableStore, closes on versionchange) opens a database. Flagged anywhere else:
  //   - every `createStore` identifier (reserved, whatever package it comes from), IDBFactory, openDB, and any
  //     'idb' / 'idb/…' module specifier (so `import * as idb from 'idb'` too);
  //   - every `indexedDB` EXCEPT (a) a call of .deleteDatabase( / .databases( on the same line; (b) a typeof feature
  //     test: `typeof [globalThis|window|self][. or ?.]indexedDB[.deleteDatabase|.databases]` followed on the same line
  //     by == != === !== ; , ) ] } : && || ?? or a ternary ?, never by a call, another member or a line end;
  //     (c) the string in `'indexedDB' in X`.
  // So aliases (`const f = indexedDB`), destructuring, ?.open, ['open'], window['indexedDB'], `typeof indexedDB.open(…)`
  // and a typeof split from `.open(` across lines are all caught (T-053 fix round 3). Tests are exempt
  // (vaultStore.test.ts opens a deliberately blocking connection), and so is the one named test helper idb.testutil.ts
  // (dumpIdb opens each fake-indexeddb database and closes it in a finally). DEV-only files are NOT exempt.
  { id: 'R21-idb-open',
    re: new RegExp([
      // The 'idb' package by bare specifier or by a path into node_modules, in any case (macOS's file system ignores
      // case) and with a ?query or #hash suffix (round-5 verifier). (?i:…) = an inline case-insensitive group.
      /\bcreateStore\b|\bIDBFactory\b|\bopenDB\b|['"`](?i:idb)(?:[/?#][^'"`]*)?['"`]|['"`][^'"`\n]*\b(?i:node_modules\/(?:[^'"`\n]*\/)?idb)(?:[./?#][^'"`\n]*)?['"`]/,
      /\bindexedDB\b(?!\s*(?:\?\.|\.)\s*(?:deleteDatabase|databases)\s*\()/, // (a)
      /(?!(?<=\btypeof\s+(?:(?:globalThis|window|self)\s*(?:\?\.|\.)\s*)?indexedDB)(?:\s*(?:\?\.|\.)\s*(?:deleteDatabase|databases))?\s*(?:[!=]=|[;,)\]}:]|&&|\|\||\?\?|\?(?!\.)))/, // (b)
      /(?!(?<=['"`]indexedDB)['"`]\s+in\b)/, // (c)
    ].map((x, k) => (k === 0 ? `${x.source}|` : x.source)).join('')),
    only: ['web/src/vault/idb.ts', 'web/src/vault/idb.testutil.ts'], exempt: isTest,
    why: "Only vault/idb.ts opens IndexedDB (closableStore closes on versionchange, so Burn vault never blocks; ARCH §16.4): no createStore, openDB or 'idb' import, no indexedDB.open; elsewhere only indexedDB.deleteDatabase( / .databases(, a typeof feature test, or 'indexedDB' in X. Any string literal that is exactly 'idb' (any case) or starts with 'idb/', 'idb?' or 'idb#' is reserved too, specifier or not (fail closed)." },
  { id: 'R17-raw-egress', re: /\bsendBeacon\b|\bXMLHttpRequest\b|\bnew\s+WebSocket\b|\bEventSource\b|googleapis\.com/,
    only: ['web/src/ai/tripwire.ts'], exempt: isTest,
    why: 'No network channel around the tripwire: no sendBeacon/XHR/WebSocket/EventSource, no hard-coded googleapis.com URLs.' },
  // R23 (T-061 review, SPEC AC-007): the cached UI snapshot (uiCapabilities / peekUiCapabilities, up to 30 s old) is
  // for the header chip, the SCR-02 panel and the HUD Policy tab only. Outside web/src/ui/** and the module that
  // defines it, the identifiers may not appear at all (imports, re-exports, `ns.x`, `ns['x']`), so the Egress Gate
  // can only decide with availabilityNow / deviceReadyNow (fresh on every call). Tests are exempt.
  { id: 'R23-ui-snapshot', re: /\b(?:uiCapabilities|peekUiCapabilities)\b/, only: [],
    scope: (r) => !r.startsWith('web/src/ui/') && r !== 'web/src/ai/capabilities.ts', exempt: isTest,
    why: 'The cached capability snapshot (uiCapabilities, peekUiCapabilities) is UI-only (web/src/ui/**): the gate must check availabilityNow / deviceReadyNow fresh before every S0/S1 call (AC-007, D-03).' },
];

// Static imports (also multi-line, also `import type`), dynamic import() and re-exports, with ' " or ` specifiers.
const IMPORT_RE = /(?:^|[^.\w$])import\s*(type\s+)?(?:[\w$*{}\s,]+?\s+from\s+)?(['"`])([^'"`$]+)\2|(?:^|[^.\w$])import\s*\(\s*(['"`])([^'"`$]+)\4\s*\)|(?:^|[^.\w$])export\s+(type\s+)?[\w$*{}\s,]+?\s+from\s+(['"`])([^'"`$]+)\7/gm;
const DYNAMIC_ANY_RE = /(?:^|[^.\w$])import\s*\(/gm;
const GLOB_RE = /\bimport\.meta\.glob\s*(?:<[^>]*>)?\s*\(\s*(\[[^\]]*\]|['"`][^'"`]*['"`])/gm;

const lineOf = (code, idx) => code.slice(0, idx).split('\n').length;

function importsOf(code) {
  const out = [];
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(code))) {
    const dynamic = m[5] !== undefined;
    const spec = m[3] ?? m[5] ?? m[8];
    if (!spec) continue;
    const kwIdx = code.indexOf(m[8] !== undefined ? 'export' : 'import', m.index);
    const q = m[2] ?? m[4] ?? m[7];
    const specPos = m.index + m[0].lastIndexOf(q + spec + q); // the specifier's opening quote
    out.push({ spec, line: lineOf(code, kwIdx), pos: kwIdx, specPos, dynamic, typeOnly: Boolean(m[1] || m[6]) });
  }
  return out;
}

/** Resolve a relative import to a repo-relative path stem (no extension). */
function resolveImport(fromRel, spec) {
  if (!spec.startsWith('.')) return spec;
  const parts = fromRel.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/').replace(/\.(c|m)?(ts|js)x?$/, '').replace(/\/index$/, '');
}

/** Positions of `import(` calls that sit inside an accepted DEV guard (never a negated one). */
function devGuardedImportPositions(code) {
  const ok = new Set();
  const forms = [
    /(?<![!\w.$])import\.meta\.env\.DEV\s*\?\s*(?:lazy\(\s*)?(?:\(\s*\)\s*=>\s*)?(import\s*\()/g,
    /(?<![!\w.$])import\.meta\.env\.DEV\s*&&\s*(?:lazy\(\s*)?(?:\(\s*\)\s*=>\s*)?(import\s*\()/g,
    /if\s*\(\s*import\.meta\.env\.DEV\s*\)\s*\{[^{}]*?(import\s*\()/g,
  ];
  for (const re of forms) {
    let m;
    while ((m = re.exec(code))) ok.add(m.index + m[0].length - m[1].length);
  }
  return ok;
}

// R22: idb-keyval's default-store calls (get/set/del/update/keys/values/entries/clear/getMany/setMany/delMany with no
// store argument) open idb-keyval's own 'keyval-store' database: tesseract.js's OCR cache (ARCH §16.3), which Burn
// vault never deletes and whose connection is never closed. R21 cannot see that (no createStore, no indexedDB.open),
// so VALUE imports of 'idb-keyval' are allowed only in the files below, each of which passes its own closable store to
// every call (reviewed): vault/idb.ts (closableStore), vault/crypto.ts (the key store) and vault/vaultStore.ts (the
// data store), and dev/selftest/vaultStorageCheck.ts (the DEV storage check, on its own closable stores).
// `import type` / `export type` from 'idb-keyval' is erased and allowed anywhere; `import { type X }` is not type-only
// here (write `import type`). Every OTHER 'idb-keyval' or 'idb-keyval/…' string is flagged too, so a value import, a
// re-export, import('idb-keyval'), require('idb-keyval') and a computed specifier are all caught. Tests are exempt.
const IDB_KEYVAL_VALUE_IMPORTERS = [
  'web/src/vault/idb.ts', 'web/src/vault/crypto.ts', 'web/src/vault/vaultStore.ts', 'web/src/dev/selftest/vaultStorageCheck.ts',
];
// idb-keyval as any path segment, so a relative path into node_modules or a Vite deps path is caught too (final review).
// Any case (macOS's file system ignores it) and a ?query or #hash suffix too (round-5 verifier).
const IDB_KEYVAL_SPEC_RE = /(?:^|\/)idb-keyval(?:[./?#]|$)/i;
const IDB_KEYVAL_STRING_RE = /(['"`])(?:[^'"`\n]*\/)?idb-keyval(?:[./?#][^'"`\n]*)?\1/gi;
const R22_WHY = "Value imports of 'idb-keyval' only in vault/idb.ts, vault/crypto.ts, vault/vaultStore.ts and dev/selftest/vaultStorageCheck.ts, which pass a closable store to every call: get/set/del… without a store use the default 'keyval-store' (the Tesseract cache; Burn vault never deletes it, its connection never closes). `import type` is fine anywhere.";

export function check(root) {
  const violations = [];
  const add = (rule, rel, line, msg) => violations.push({ rule, file: rel, line, msg });

  const webFiles = walk(join(root, 'web', 'src'), WEB_EXT);
  for (const abs of webFiles) {
    const rel = norm(relative(root, abs));
    const raw = readFileSync(abs, 'utf8');
    const code = stripComments(raw);
    const lines = code.split('\n');

    for (const rule of WEB_RULES) {
      if (rule.exempt && rule.exempt(rel)) continue;
      if (rule.scope && !rule.scope(rel)) continue;
      if (rule.only.includes(rel)) continue;
      lines.forEach((l, i) => { if (rule.re.test(l)) add(rule.id, rel, i + 1, rule.why); });
    }

    const imps = importsOf(code);

    // R11: firestore must be a dynamic import inside atlas.ts (type-only imports are erased and allowed)
    if (rel === 'web/src/firebase/atlas.ts') {
      for (const im of imps) {
        if (/^firebase\/firestore(\/|$)/.test(im.spec) && !im.dynamic && !im.typeOnly) {
          add('R11-firestore-dynamic', rel, im.line, "'firebase/firestore' must be loaded with a dynamic import() (import type is fine).");
        }
        const target = resolveImport(rel, im.spec);
        if (inDir(target, 'web/src/vault')) add('R12-atlas-imports', rel, im.line, 'firebase/atlas.ts must never import vault/* (AC-282).');
        else if (inDir(target, 'web/src/core') && !['web/src/core/types', 'web/src/core/atlasClues'].includes(target)) {
          add('R12-atlas-imports', rel, im.line, 'firebase/atlas.ts may import only core/types and core/atlasClues (AC-282).');
        } else if (inDir(target, 'web/src') && !inDir(target, 'web/src/core') && target !== 'web/src/firebase/init') {
          add('R12-atlas-imports', rel, im.line, 'firebase/atlas.ts may import only core/types, core/atlasClues and firebase/init.');
        }
      }
    }

    // R13: vault/* is never imported by firebase/* or tier0/* (directory barrels included)
    if (rel.startsWith('web/src/firebase/') || rel.startsWith('web/src/tier0/')) {
      for (const im of imps) {
        if (inDir(resolveImport(rel, im.spec), 'web/src/vault')) {
          add('R13-vault-imports', rel, im.line, 'firebase/* and tier0/* must not import vault/* (Tier-0 receives terms as plain arguments).');
        }
      }
    }

    // R22: 'idb-keyval' appears outside an `import type` / `export type` only in the four closable-store files
    if (!isTest(rel) && !IDB_KEYVAL_VALUE_IMPORTERS.includes(rel)) {
      const typeOnlyAt = new Set(imps.filter((im) => im.typeOnly && IDB_KEYVAL_SPEC_RE.test(im.spec)).map((im) => im.specPos));
      IDB_KEYVAL_STRING_RE.lastIndex = 0;
      let k;
      while ((k = IDB_KEYVAL_STRING_RE.exec(code))) {
        if (!typeOnlyAt.has(k.index)) add('R22-idb-keyval-default', rel, lineOf(code, k.index), R22_WHY);
      }
    }

    if (!isDev(rel) && !isTest(rel)) {
      // R14: src/dev/** is reachable only from App.tsx, through a DEV-guarded dynamic import
      const guarded = devGuardedImportPositions(code);
      for (const im of imps) {
        if (!inDir(resolveImport(rel, im.spec), 'web/src/dev')) continue;
        if (rel !== 'web/src/App.tsx') add('R14-dev-only', rel, im.line, 'src/dev/** may be imported only from App.tsx (ARCH §4.2).');
        else if (!im.dynamic || !guarded.has(im.pos)) {
          add('R14-dev-only', rel, im.line, 'src/dev/** may only be imported as `import.meta.env.DEV ? lazy(() => import(...))` or inside `if (import.meta.env.DEV) {…}` (AC-065).');
        }
      }
      // R18: every dynamic import() must use a literal specifier the checker can see
      const literalPos = new Set(imps.filter((x) => x.dynamic).map((x) => x.pos));
      DYNAMIC_ANY_RE.lastIndex = 0;
      let d;
      while ((d = DYNAMIC_ANY_RE.exec(code))) {
        const pos = code.indexOf('import', d.index);
        if (!literalPos.has(pos)) add('R18-dynamic-literal', rel, lineOf(code, pos), 'Dynamic import() needs a plain string literal so the boundary rules can see it.');
      }
      // R19: import.meta.glob must not reach dev/ or vault/
      GLOB_RE.lastIndex = 0;
      let g;
      while ((g = GLOB_RE.exec(code))) {
        if (/(^|['"`/.])(dev|vault)\//.test(g[1]) || /\*\*/.test(g[1]) && !/@prompts|@strings|@vectors/.test(g[1])) {
          add('R19-glob', rel, lineOf(code, g.index), 'import.meta.glob may not pull in dev/ or vault/ (or broad ** patterns outside the shared aliases).');
        }
      }
    }

    if (!isTest(rel)) {
      // R19 (round-6 verifier), in EVERY non-test file, DEV-only ones included: a glob stays inside web/src or a shared
      // alias. It may not name node_modules (any case), start at the project root ('/…'), climb out of web/src before
      // its first wildcard ('../../*/idb-key*/…' reaches node_modules), or pass `exhaustive` (which lifts Vite's
      // node_modules exclusion).
      GLOB_RE.lastIndex = 0;
      let g;
      while ((g = GLOB_RE.exec(code))) {
        const call = code.slice(g.index, code.indexOf(')', g.index + g[0].length) + 1 || g.index + 400);
        const escapes = [...g[1].matchAll(/['"`]!?([^'"`]*)['"`]/g)].some(([, pat]) => {
          if (/^@(prompts|strings|vectors)(\/|$)/.test(pat)) return false;
          if (/node_modules/i.test(pat) || pat.startsWith('/')) return true;
          const prefix = pat.slice(0, pat.search(/[*?{[]|$/));
          return !inDir(resolveImport(rel, prefix.startsWith('.') ? prefix : `./${prefix}`).replace(/\/$/, ''), 'web/src');
        });
        if (escapes || /\bexhaustive\b/.test(call)) {
          add('R19-glob', rel, lineOf(code, g.index), 'import.meta.glob must stay inside web/src or @prompts/@strings/@vectors: no node_modules, no root-absolute or climbing pattern, no `exhaustive` (any file, DEV-only too).');
        }
      }
      // R18 (round-6 verifier): a module specifier with a backslash escape ('idb-keyv\x61l') resolves to the real
      // package but hides it from every name-based rule.
      for (const im of imps) {
        if (im.spec.includes('\\')) add('R18-dynamic-literal', rel, im.line, 'A module specifier may not contain a backslash escape: the boundary rules match specifiers by name.');
      }
    }

    // R20: every DEV-only module carries the marker, so a production build can be scanned for leaks (scripts/check-dist.mjs)
    if (isDev(rel) && !isTest(rel) && !raw.includes(DEV_MARKER)) {
      add('R20-dev-marker', rel, 1, `DEV-only files must contain the string '${DEV_MARKER}' (checked in web/dist after every build).`);
    }
  }

  // R15: the first import of main.tsx must be the tripwire installer
  const mainAbs = join(root, 'web', 'src', 'main.tsx');
  if (existsSync(mainAbs)) {
    const first = importsOf(stripComments(readFileSync(mainAbs, 'utf8')))[0];
    if (!first || first.spec !== './ai/tripwire-install') {
      add('R15-tripwire-first', 'web/src/main.tsx', first ? first.line : 1, "The first import of main.tsx must be './ai/tripwire-install' (ARCH §8.5).");
    }
  }

  // R16: iOS, the only AI call site is EgressGate.swift. Dev/ spikes are allowed if wrapped in #if DEBUG.
  const iosOnly = 'ios/StrangersEyes/AI/EgressGate.swift';
  for (const abs of walk(join(root, 'ios'), /\.swift$/)) {
    const rel = norm(relative(root, abs));
    if (rel === iosOnly || /(^|\/)[\w-]*Tests?\//.test(rel)) continue;
    const code = stripComments(readFileSync(abs, 'utf8'));
    if (rel.startsWith('ios/StrangersEyes/Dev/')) {
      const firstLine = code.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
      if (firstLine !== '#if DEBUG') add('R16-ios-gate', rel, 1, 'iOS Dev/ spikes must start with `#if DEBUG` so they never ship.');
      continue;
    }
    // Join lines so a call split across lines (`.respond(\n to:`) is still seen; report the first line of the match.
    const re = /\.\s*(respond|streamResponse|startChat|sendMessage|sendMessageStream|countTokens)\s*\(|\bgenerateContent(Stream)?\b|\bHybridModel\s*\(/g;
    let m;
    while ((m = re.exec(code))) add('R16-ios-gate', rel, lineOf(code, m.index), 'iOS AI calls go through AI/EgressGate.swift only.');
  }

  return violations;
}

/** Planted-violation fixture: every rule must fire on its bad file and stay silent on the clean tree. */
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'se-boundaries-'));
  const w = (rel, body) => { const p = join(dir, rel); mkdirSync(resolve(p, '..'), { recursive: true }); writeFileSync(p, body); };
  try {
    // A clean tree that uses every guarded symbol only where allowed, plus known false-positive traps.
    w('web/src/main.tsx', "import './ai/tripwire-install';\nimport App from './App';\n");
    w('web/src/ai/tripwire-install.ts', "import { installTripwire } from './tripwire';\ninstallTripwire();\n");
    w('web/src/ai/tripwire.ts', "export const AI_HOST = 'firebasevertexai.googleapis.com';\nexport function installTripwire() { const o = globalThis.fetch; globalThis.fetch = o; }\n");
    w('web/src/ai/egressGate.ts', 'export async function invoke(m: any) { return m.generateContent([]); }\n');
    w('web/src/ai/models.ts', "import { getGenerativeModel } from 'firebase/ai';\nexport const f = (ai: any) => getGenerativeModel(ai, {} as any);\n");
    w('web/src/ai/capabilities.ts', 'export const lm = (globalThis as any).LanguageModel;\nexport const uiCapabilities = async () => lm;\nexport const peekUiCapabilities = () => null;\n');
    // R23: the cached UI snapshot is fine anywhere under web/src/ui, and in tests.
    w('web/src/ui/hooks/useCaps.ts', "import { peekUiCapabilities, uiCapabilities } from '../../ai/capabilities';\nexport const u = () => uiCapabilities(peekUiCapabilities() === null);\n");
    w('web/src/ai/gate.test.ts', "import { uiCapabilities } from './capabilities';\nexport const t = uiCapabilities;\n");
    w('web/src/ai/prompts.ts', "export const all = import.meta.glob('@prompts/*', { query: '?raw' });\n");
    w('web/src/firebase/init.ts', "import { initializeApp } from 'firebase/app';\nexport const app = initializeApp({});\n");
    w('web/src/firebase/atlas.ts', "import type { Firestore } from 'firebase/firestore';\nimport type { ClueType } from '../core/types';\nlet db: Firestore | null = null;\nexport const load = () => import('firebase/firestore');\n");
    w('web/src/core/localPrefs.ts', 'export const get = (k: string) => localStorage.getItem(k);\n');
    w('web/src/core/text.ts', "export const trim = (s: string) => s.replace(/\\/*$/, '');\nexport const half = (a: number, b: number) => a / b / 2;\n");
    w('web/src/ui/screens/Check.tsx', "import NotesView from '../components/NotesView';\nexport const C = () => <NotesView />;\n");
    w('web/src/ui/components/NotesView.tsx', "import type { AdversaryNotes } from '../../core/types';\nexport default function NotesView(p: { n?: AdversaryNotes }) { return null; }\n");
    w('web/src/App.tsx', "// generateContent( in a comment is fine\nconst s = 'x';\nexport const Dev = import.meta.env.DEV\n  ? lazy(() => import('./dev/spikes/x'))\n  : null;\nif (import.meta.env.DEV) {\n  void import('./dev/y');\n}\n");
    w('web/src/dev/spikes/x.ts', `// ${DEV_MARKER}\nexport const direct = (m: any) => m.generateContent([]);\n`);
    w('web/src/dev/y.ts', `export const marker = '${DEV_MARKER}';\n`);
    w('web/src/vault/store.ts', "// console.log(n) in a comment is fine\nexport const n = 1;\n");
    // R9 applies only to the sensitive files: console is fine elsewhere.
    w('web/src/core/log.ts', "export const log = (m: string) => console['log'](m);\n");
    // R21: only vault/idb.ts opens IndexedDB; deletes, listing and typeof are fine anywhere; tests and idb.testutil.ts are exempt.
    w('web/src/vault/idb.ts', "import type { UseStore } from 'idb-keyval';\nexport const open = (n: string) => indexedDB.open(n);\n");
    w('web/src/vault/idb.testutil.ts', "export const raw = (n: string) => indexedDB.open(n);\n");
    // R21 feature tests that open nothing (fix round 3): typeof on a global's member, on .databases, and `in`.
    w('web/src/core/caps.ts', [
      "export const a = typeof globalThis.indexedDB !== 'undefined';",
      "export const b = typeof window.indexedDB === 'object' && typeof self.indexedDB === 'object';",
      "export const c = typeof self?.indexedDB !== 'undefined' ? 1 : 0;",
      "export const d = 'indexedDB' in globalThis;",
      "export const e = typeof indexedDB.databases !== 'function';",
      "export const f = (typeof indexedDB);",
      '',
    ].join('\n'));
    w('web/src/vault/burn.test.ts', "const r = indexedDB.open('se-ledger');\nimport { createStore } from 'idb-keyval';\nimport { set } from 'idb-keyval';\nawait set('k', 1);\n");
    // R22: idb-keyval values only in the closable-store files; `import type` / `export type` anywhere.
    w('web/src/vault/vaultStore.ts', "import { get, set, type UseStore } from 'idb-keyval';\nexport const put = (s: UseStore) => set('k', 1, s);\n");
    w('web/src/vault/crypto.ts', "import { del, get, promisifyRequest, type UseStore } from 'idb-keyval';\nexport const drop = (n: string) => indexedDB.deleteDatabase(n);\nexport const all = () => window.indexedDB.databases();\nexport const has = typeof indexedDB !== 'undefined';\n");
    w('web/src/dev/selftest/vaultStorageCheck.ts', `// ${DEV_MARKER}\nimport { get, set } from 'idb-keyval';\nexport const f = (s: any) => get('k', s);\n`);
    // round-6 verifier: globs inside web/src or a shared alias stay allowed, in DEV-only files too
    w('web/src/core/globOk.ts', "export const icons = import.meta.glob('./icons/*.svg', { eager: true });\nexport const p = import.meta.glob('@prompts/*', { query: '?raw', import: 'default', eager: true });\n");
    w('web/src/dev/selftest/globOkDev.ts', `// ${DEV_MARKER}\nexport const f = import.meta.glob('../fixtures/*.ts');\n`);
    // round-5 verifier: a type-only import by a path into node_modules stays allowed (erased at build)
    w('web/src/core/kvTypesPath.ts', "import type { UseStore } from '../../node_modules/idb-keyval/dist/index.js';\nexport type S = UseStore;\n");
    w('web/src/core/kvTypes.ts', "import type { UseStore } from 'idb-keyval';\nimport type {\n  UseStore as U2,\n} from \"idb-keyval\";\nexport type { UseStore as U3 } from 'idb-keyval';\nexport type S = UseStore | U2;\n");
    w('web/src/ui/components/ImportDropzone.tsx', 'export const I = (p: { status: unknown }) => <button>{String(p.status)}</button>;\n');
    w('ios/StrangersEyes/AI/EgressGate.swift', 'let r = try await session.respond(to: "x")\n');
    w('ios/StrangersEyes/Dev/Spike.swift', '// spike\n#if DEBUG\nlet r = try await session.respond(to: "x")\nlet h = HybridModel(primary: a, secondary: b)\n#endif\n');
    w('ios/StrangersEyesTests/GateTests.swift', 'let r = try await session.respond(to: "x")\n');
    const clean = check(dir);
    if (clean.length) throw new Error(`clean fixture produced violations: ${JSON.stringify(clean, null, 1)}`);

    // Planted violations: [rule, file, body]. Includes every evasion the T-023 review found.
    const planted = [
      ['R1-ai-call', 'web/src/ui/bad1.ts', 'export const x = (m: any) => m.generateContentStream([]);\n'],
      ['R1-ai-call', 'web/src/ui/bad1b.ts', "export const x = (m: any) => m['generateContent'](r);\n"],
      ['R1-ai-call', 'web/src/ui/bad1c.ts', 'export const x = (m: any) => m.generateContent?.(r);\n'],
      ['R1-ai-call', 'web/src/ai/errors.ts', 'export const x = (m: any) => withRetry(m.generateContent.bind(m, r));\n'],
      ['R1-ai-call', 'web/src/core/pipeline.ts', 'export const x = (m: any) => m.startChat().sendMessage(p);\n'],
      ['R1-ai-call', 'web/src/ui/Consent.tsx', 'export const x = (m: any) => m.countTokens([p]);\n'],
      ['R1-ai-call', 'web/src/ai/jobs.mts', 'export const x = (m: any) => m.generateContent(r);\n'],
      ['R1-ai-call', 'web/src/core/after-regex.ts', "export const t = (s: string) => s.replace(/\\/*$/, '');\nexport const x = (m: any) => m.generateContent(r);\n"],
      ['R2-model-factory', 'web/src/ui/bad2.ts', "import { getGenerativeModel } from 'firebase/ai';\ngetGenerativeModel({} as any, {} as any);\n"],
      ['R2-model-factory', 'web/src/ai/jobs.ts', "import { getLiveGenerativeModel } from 'firebase/ai';\n"],
      ['R3-firebase-init', 'web/src/ui/bad3.ts', "import { getAI } from 'firebase/ai';\ngetAI();\n"],
      ['R4-LanguageModel', 'web/src/ui/bad4.ts', 'const a = (globalThis as any).LanguageModel;\n'],
      ['R5-fetch-override', 'web/src/ui/bad5.ts', 'window.fetch = async () => new Response();\n'],
      ['R6-firestore', 'web/src/core/bad6.ts', "export const f = () => import('firebase/firestore');\n"],
      ['R6-firestore', 'web/src/core/offlineQueue.ts', 'export const f = () => import(`firebase/firestore`);\n'],
      ['R7-localStorage', 'web/src/ui/bad7.ts', "localStorage.setItem('a', 'b');\n"],
      ['R8-url-input', 'web/src/ui/components/ImportDropzone.tsx', 'export const I = () => <input type="url" />;\n'],
      ['R9-console-in-sensitive', 'web/src/vault/bad9.ts', "console.log('vault');\n"],
      ['R9-console-in-sensitive', 'web/src/ui/components/VaultItemForm.tsx', "export const f = (label: string) => console.log(label);\n"],
      ['R9-console-in-sensitive', 'web/src/ui/components/PinButton.tsx', "export const f = (lat: number) => console.debug(lat);\n"],
      ['R9-console-in-sensitive', 'web/src/vault/bad9b.ts', "console.error('vault');\n"],
      ['R9-console-in-sensitive', 'web/src/tier0/gpsWarning.ts', 'export const f = (point: unknown, pins: unknown) => console.log(point, pins);\n'],
      ['R9-console-in-sensitive', 'web/src/tier0/importPhoto.ts', 'export const f = (exif: unknown) => console.debug(exif);\n'],
      ['R9-console-in-sensitive', 'web/src/ui/components/ImportDropzone.tsx', 'export const f = async (getPins: () => Promise<unknown>) => console.log(await getPins());\n'],
      ['R9-console-in-sensitive', 'web/src/ui/screens/Check.tsx', "export const f = (pins: unknown) => console.info('pins', pins);\n"],
      // fix round 3: bracket, optional chaining, a line split, an alias, destructuring, a global, other methods, new scope
      ['R9-console-in-sensitive', 'web/src/ui/screens/Check.tsx', "export const f = (pins: unknown) => console['log'](pins);\n"],
      ['R9-console-in-sensitive', 'web/src/ui/components/ImportDropzone.tsx', 'export const f = (pins: unknown) => console?.log(pins);\n'],
      ['R9-console-in-sensitive', 'web/src/tier0/gpsWarning.ts', 'export const f = (pins: unknown) => console\n  .log(pins);\n'],
      ['R9-console-in-sensitive', 'web/src/vault/bad9c.ts', 'const c = console;\nexport const f = (v: unknown) => c.log(v);\n'],
      ['R9-console-in-sensitive', 'web/src/vault/bad9d.ts', 'const { log } = console;\nexport const f = (v: unknown) => log(v);\n'],
      ['R9-console-in-sensitive', 'web/src/ui/importTransfer.ts', 'export const f = (pins: unknown) => globalThis.console.warn(pins);\n'],
      ['R9-console-in-sensitive', 'web/src/tier0/importPhoto.ts', "export const f = (gps: unknown) => console.timeLog('exif', gps);\n"],
      ['R9-console-in-sensitive', 'web/src/ui/checkState.ts', 'export const f = (s: unknown) => console.assert(false, s);\n'],
      ['R9-console-in-sensitive', 'web/src/tier0/sniff.ts', 'export const f = (tiff: unknown) => console.dir(tiff);\n'],
      ['R10-AdversaryNotes', 'web/src/core/bad10.ts', "import type { AdversaryNotes } from './types';\n"],
      ['R11-firestore-dynamic', 'web/src/firebase/atlas.ts', "import { getFirestore } from 'firebase/firestore';\n"],
      ['R12-atlas-imports', 'web/src/firebase/atlas.ts', "import { pinBand } from '../core/geo';\nexport const load = () => import('firebase/firestore');\n"],
      ['R12-atlas-imports', 'web/src/firebase/atlas.ts', 'export const v = () => import(`../vault/vaultStore`);\n'],
      ['R13-vault-imports', 'web/src/tier0/bad13.ts', "import { loadVault } from '../vault/vaultStore';\n"],
      ['R13-vault-imports', 'web/src/firebase/bad13b.ts', "import {\n  loadVault,\n  addItem,\n} from '../vault/vaultStore';\n"],
      ['R13-vault-imports', 'web/src/tier0/bad13c.ts', "import { loadVault } from '../vault';\n"],
      ['R13-vault-imports', 'web/src/tier0/bad13d.ts', 'export const v = () => import(`../vault/vaultStore`);\n'],
      ['R14-dev-only', 'web/src/ui/bad14.ts', "import { direct } from '../dev/x';\n"],
      ['R14-dev-only', 'web/src/ui/bad14b.ts', "export const f = () => import('../dev/x');\n"],
      ['R14-dev-only', 'web/src/App.tsx', "const A = import.meta.env.DEV ? lazy(() => import('./dev/x')) : null;\nconst B = lazy(() => import('./dev/y'));\n"],
      ['R14-dev-only', 'web/src/App.tsx', "const A = !import.meta.env.DEV ? lazy(() => import('./dev/x')) : null;\n"],
      ['R14-dev-only', 'web/src/App.tsx', "import { direct } from './dev';\n"],
      ['R15-tripwire-first', 'web/src/main.tsx', "import App from './App';\nimport './ai/tripwire-install';\n"],
      ['R16-ios-gate', 'ios/StrangersEyes/UI/Bad.swift', 'let r = try await session.respond(to: "x")\n'],
      ['R16-ios-gate', 'ios/StrangersEyes/AI/CloudAdversary.swift', 'let r = try await session\n  .respond(\n to: "x")\n'],
      ['R16-ios-gate', 'ios/StrangersEyes/AI/Chat.swift', 'let c = model.startChat()\nlet r = try await c.sendMessage("x")\n'],
      ['R16-ios-gate', 'ios/StrangersEyes/Dev/Spike2.swift', 'let r = try await session.respond(to: "x")\n'],
      ['R17-raw-egress', 'web/src/ui/bad17.ts', "navigator.sendBeacon('https://example.com', 'x');\n"],
      ['R17-raw-egress', 'web/src/core/bad17b.ts', "fetch('https://firebasevertexai.googleapis.com/v1beta/x', { method: 'POST' });\n"],
      ['R18-dynamic-literal', 'web/src/core/bad18.ts', 'const m = "../vault/vaultStore";\nexport const f = () => import(m);\n'],
      ['R19-glob', 'web/src/core/bad19.ts', "export const all = import.meta.glob('../vault/*.ts');\n"],
      ['R19-glob', 'web/src/App.tsx', "export const all = import.meta.glob('./dev/**/*.tsx');\n"],
      ['R20-dev-marker', 'web/src/dev/z.ts', 'export const nothing = 1;\n'],
      ['R21-idb-open', 'web/src/vault/vaultStore.ts', "import { createStore } from 'idb-keyval';\nconst s = createStore('se-vault-data', 'items');\n"],
      ['R21-idb-open', 'web/src/core/ledger.ts', "export const r = indexedDB.open('se-ledger');\n"],
      ['R21-idb-open', 'web/src/core/sessions.ts', "export const r = window.indexedDB\n  .open('se-sessions', 2);\n"],
      ['R21-idb-open', 'web/src/core/idbOpt.ts', "export const r = globalThis.indexedDB?.open('se-ledger');\n"],
      ['R21-idb-open', 'web/src/core/idbBracket.ts', "export const r = indexedDB['open']('se-ledger');\n"],
      ['R21-idb-open', 'web/src/core/idbAlias.ts', "const f = indexedDB;\nexport const r = f.open('se-ledger');\n"],
      ['R21-idb-open', 'web/src/core/idbDestructure.ts', "const { open } = indexedDB;\n"],
      ['R21-idb-open', 'web/src/core/idbProto.ts', "export const r = IDBFactory.prototype.open.call(x, 'se-ledger');\n"],
      ['R21-idb-open', 'web/src/core/kvAlias.ts', "import { createStore as cs } from 'idb-keyval';\nexport const s = cs('se-ledger', 'entries');\n"],
      ['R21-idb-open', 'web/src/core/kvNs.ts', "import * as kv from 'idb-keyval';\nexport const s = kv.createStore('se-ledger', 'entries');\n"],
      ['R21-idb-open', 'web/src/dev/selftest/badIdb.ts', `// ${DEV_MARKER}\nexport const r = indexedDB.open('se-selftest-x');\n`],
      ['R21-idb-open', 'web/src/vault/other.testutil.ts', "export const r = indexedDB.open('se-vault-data');\n"],
      // fix round 3: the 'idb' package, typeof hiding a call, and indexedDB after an allowed `in` test
      ['R21-idb-open', 'web/src/core/idbOpenDB.ts', "export const db = (lib: any) => lib.openDB('se-ledger', 1);\n"],
      ['R21-idb-open', 'web/src/core/idbPkg.ts', "import * as idb from 'idb';\n"],
      ['R21-idb-open', 'web/src/core/idbPkgSub.ts', "export const w = () => import('idb/with-async-ittr');\n"],
      ['R21-idb-open', 'web/src/core/idbTypeofCall.ts', "export const t = typeof indexedDB.open('se-ledger');\n"],
      ['R21-idb-open', 'web/src/core/idbTypeofOpt.ts', "export const t = typeof globalThis.indexedDB?.open('se-ledger');\n"],
      ['R21-idb-open', 'web/src/core/idbTypeofBracket.ts', "export const t = typeof window.indexedDB['open']('se-ledger');\n"],
      ['R21-idb-open', 'web/src/core/idbTypeofSplit.ts', "export const t = typeof indexedDB\n  .open('se-ledger');\n"],
      ['R21-idb-open', 'web/src/core/idbTypeofMember.ts', "export const t = typeof indexedDB.databases\n  ('x');\n"],
      ['R21-idb-open', 'web/src/core/idbInThenOpen.ts', "export const r = 'indexedDB' in globalThis && globalThis['indexedDB'].open('se-ledger');\n"],
      ['R21-idb-open', 'web/src/core/zustand.ts', "import { createStore } from 'zustand/vanilla';\n"],
      // R22 (fix round 4): idb-keyval's default store, reached from anywhere but the four closable-store files
      ['R22-idb-keyval-default', 'web/src/core/kvDefault.ts', "import { get, set } from 'idb-keyval';\nexport const s = () => set('k', 1);\n"],
      ['R22-idb-keyval-default', 'web/src/ui/kvNs.ts', "import * as kv from 'idb-keyval';\nexport const g = () => kv.get('k');\n"],
      ['R22-idb-keyval-default', 'web/src/core/kvMixed.ts', "import { type UseStore, keys } from 'idb-keyval';\nexport const k = (s?: UseStore) => keys(s);\n"],
      ['R22-idb-keyval-default', 'web/src/core/kvMultiline.ts', "import {\n  get,\n  type UseStore,\n} from \"idb-keyval\";\n"],
      ['R22-idb-keyval-default', 'web/src/core/kvDynamic.ts', "export const g = async () => (await import('idb-keyval')).get('k');\n"],
      ['R22-idb-keyval-default', 'web/src/core/kvReexport.ts', "export { get as kvGet } from 'idb-keyval';\n"],
      ['R22-idb-keyval-default', 'web/src/core/kvStar.ts', 'export * from `idb-keyval`;\n'],
      ['R22-idb-keyval-default', 'web/src/core/kvSubpath.ts', "import { set } from 'idb-keyval/dist/index.js';\n"],
      ['R22-idb-keyval-default', 'web/src/core/kvRequire.cjs', "const { del } = require('idb-keyval');\n"],
      ['R22-idb-keyval-default', 'web/src/dev/selftest/kvDev.ts', `// ${DEV_MARKER}\nconst m = 'idb-keyval';\nexport const g = async () => (await import(m)).get('k');\n`],
      ['R22-idb-keyval-default', 'web/src/vault/burn.ts', "import type { UseStore } from 'idb-keyval';\nimport { clear } from 'idb-keyval';\nexport const c = (s?: UseStore) => clear(s);\n"],
      ['R22-idb-keyval-default', 'web/src/vault/idb.testutil.ts', "import { entries } from 'idb-keyval';\n"],
      // final review: a relative path into node_modules, or a Vite deps path, reaches the same default store
      ['R22-idb-keyval-default', 'web/src/core/kvPath.ts', "import { get } from '../../node_modules/idb-keyval/dist/index.js';\nexport const g = () => get('k');\n"],
      ['R22-idb-keyval-default', 'web/src/core/kvViteDeps.ts', "import { get } from '/node_modules/.vite/deps/idb-keyval.js';\n"],
      // round-5 verifier: a Vite deps path to 'idb', any case, a ?query, and a glob into node_modules
      ['R21-idb-open', 'web/src/core/idbVite.ts', "import * as raw from '/node_modules/.vite/deps/idb.js';\nexport const r = raw;\n"],
      ['R21-idb-open', 'web/src/core/idbCase.ts', "import * as raw from '../../NODE_MODULES/IDB/build/index.js';\nexport const r = raw;\n"],
      ['R21-idb-open', 'web/src/core/idbQuery.ts', "import * as raw from 'idb?v=1';\nexport const r = raw;\n"],
      ['R22-idb-keyval-default', 'web/src/core/kvCase.ts', "import { get } from '../../node_modules/IDB-KEYVAL/dist/index.js';\n"],
      ['R22-idb-keyval-default', 'web/src/core/kvQuery.ts', "import { get } from 'idb-keyval?v=1';\n"],
      ['R19-glob', 'web/src/core/kvGlob.ts', "export const m = import.meta.glob('../../node_modules/idb-key*/dist/index.js');\n"],
      // round-6 verifier: a DEV-only file, a pattern climbing out of web/src, `exhaustive`, a root-absolute pattern,
      // and an escaped specifier
      ['R19-glob', 'web/src/dev/selftest/globDev.ts', `// ${DEV_MARKER}\nexport const m = import.meta.glob('../../../node_modules/id?/build/index.js');\n`],
      ['R19-glob', 'web/src/core/globClimb.ts', "export const m = import.meta.glob('../../*/idb-key*/dist/index.js');\n"],
      ['R19-glob', 'web/src/core/globExhaustive.ts', "export const m = import.meta.glob('./*.ts', { exhaustive: true });\n"],
      ['R19-glob', 'web/src/core/globRoot.ts', "export const m = import.meta.glob('/*.json');\n"],
      ['R18-dynamic-literal', 'web/src/core/escSpec.ts', "import { get } from 'idb-keyv\\x61l';\nexport const g = () => get('k');\n"],
      ['R21-idb-open', 'web/src/core/idbPath.ts', "import * as raw from '../../node_modules/idb/build/index.js';\nexport const r = raw;\n"],
      ['R1-ai-call', 'web/src/dev/selftest/bad.ts', `// ${DEV_MARKER}\nexport const x = (m: any) => m.generateContent(r);\n`],
      ['R7-localStorage', 'web/src/dev/bench/bad.ts', `// ${DEV_MARKER}\nlocalStorage.setItem('a', 'b');\n`],
      // R23: the cached UI snapshot outside web/src/ui (T-061 review): a gate import, a namespace member, a bracket
      // string, a re-export under another name, and a DEV page.
      ['R23-ui-snapshot', 'web/src/ai/egressGate.ts', "import { uiCapabilities } from './capabilities';\nexport const ready = async () => (await uiCapabilities()).text === 'available';\n"],
      ['R23-ui-snapshot', 'web/src/core/routing.ts', "import * as caps from '../ai/capabilities';\nexport const s = () => caps.peekUiCapabilities();\n"],
      ['R23-ui-snapshot', 'web/src/ai/jobs.ts', "export const s = (c: any) => c['uiCapabilities'](true);\n"],
      ['R23-ui-snapshot', 'web/src/ai/index.ts', "export { uiCapabilities as snapshot } from './capabilities';\n"],
      ['R23-ui-snapshot', 'web/src/dev/selftest/caps.ts', `// ${DEV_MARKER}\nimport { peekUiCapabilities } from '../../ai/capabilities';\n`],
    ];
    const failures = [];
    for (const [rule, rel, body] of planted) {
      const p = join(dir, rel);
      const had = existsSync(p) ? readFileSync(p, 'utf8') : null;
      w(rel, body);
      const v = check(dir);
      if (!v.some((x) => x.rule === rule)) failures.push(`${rule} did not fire on ${rel}: ${JSON.stringify(body)}`);
      if (had === null) rmSync(p); else writeFileSync(p, had);
    }
    if (failures.length) throw new Error(failures.join('\n'));
    return planted.length;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf('--root');
  const root = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : REPO;
  try {
    if (!args.includes('--no-self-test')) {
      const n = selfTest();
      console.log(`check-boundaries: self-test ok (${n} planted violations caught, clean fixture passes)`);
    }
  } catch (e) {
    console.error(`check-boundaries: SELF-TEST FAILED\n${e.message}`);
    process.exit(1);
  }
  const v = check(root);
  if (v.length) {
    for (const x of v) console.error(`${x.file}:${x.line}  [${x.rule}]  ${x.msg}`);
    console.error(`check-boundaries: ${v.length} violation(s)`);
    process.exit(1);
  }
  console.log('check-boundaries: ok');
}
