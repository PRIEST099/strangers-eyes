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
  { id: 'R9-console-in-sensitive', re: /\bconsole\.(log|info|debug|warn|error|trace|dir|table)\s*\(/, only: [],
    scope: (r) => !isTest(r) && (r.startsWith('web/src/vault/') || ['web/src/ai/vaultScan.ts', 'web/src/core/referee.ts', 'web/src/tier0/fuzzy.ts'].includes(r)),
    why: 'No console logging where vault data flows (SR-15).' },
  { id: 'R10-AdversaryNotes', re: /\bAdversaryNotes\b/,
    only: ['web/src/ai/jobs.ts', 'web/src/ai/parse.ts', 'web/src/core/session.ts', 'web/src/ui/components/NotesView.tsx', 'web/src/core/types.ts'],
    exempt: isTest, why: 'Grounded pass-A notes are display-only; code never parses or stores them (CLAUDE.md invariant 8). The UI component is NotesView.' },
  { id: 'R17-raw-egress', re: /\bsendBeacon\b|\bXMLHttpRequest\b|\bnew\s+WebSocket\b|\bEventSource\b|googleapis\.com/,
    only: ['web/src/ai/tripwire.ts'], exempt: isTest,
    why: 'No network channel around the tripwire: no sendBeacon/XHR/WebSocket/EventSource, no hard-coded googleapis.com URLs.' },
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
    out.push({ spec, line: lineOf(code, kwIdx), pos: kwIdx, dynamic, typeOnly: Boolean(m[1] || m[6]) });
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
    w('web/src/ai/capabilities.ts', 'export const lm = (globalThis as any).LanguageModel;\n');
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
    w('web/src/vault/store.ts', "export const n = 1;\n");
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
      ['R9-console-in-sensitive', 'web/src/vault/bad9b.ts', "console.error('vault');\n"],
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
      ['R1-ai-call', 'web/src/dev/selftest/bad.ts', `// ${DEV_MARKER}\nexport const x = (m: any) => m.generateContent(r);\n`],
      ['R7-localStorage', 'web/src/dev/bench/bad.ts', `// ${DEV_MARKER}\nlocalStorage.setItem('a', 'b');\n`],
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
