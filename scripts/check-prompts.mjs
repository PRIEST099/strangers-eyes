#!/usr/bin/env node
// scripts/check-prompts.mjs: verifies shared/prompts/manifest.json (ARCH §10.1–10.2, T-024, D-62).
//
//   node scripts/check-prompts.mjs           verify (default)
//   node scripts/check-prompts.mjs --write   add hashes for new files and refresh hashes of DRAFT files only.
//                                            Refuses (exit 1, writes nothing) if a LOCKED file changed.
//
// Locked files: every file referenced by a prompt with `released: true`, plus enums.v1.json once any prompt is
// released. A prompt stays a draft (`released: false`) until its first recorded run (D-62). After that its files
// never change: add *.v2.* files instead. Fixtures are test data and are never locked.
// Verify checks:
//   - every file under shared/prompts (except manifest.json, README.md and dotfiles) is listed in manifest.files,
//     its sha256 matches, and every listed file exists;
//   - every prompt has a boolean `released`, and every file it references is hashed;
//   - if remoteconfig.template.json exists at the repo root, every prompt_versions value is a manifest prompt ID.
//   - against git HEAD's manifest (when the repo has one): a prompt released at HEAD stays released, and every file it
//     locks (plus enums.v1.json) keeps HEAD's hash. This closes the "flip released back to false" bypass.
//   node scripts/check-prompts.mjs --root <dir>  verify another tree (no self-test)
// Every verify run first proves itself on planted violations in a temporary tree (T-090), unless --no-self-test.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARGS = process.argv.slice(2);
const ROOT_IDX = ARGS.indexOf('--root');
const REPO = ROOT_IDX >= 0 ? resolve(ARGS[ROOT_IDX + 1]) : resolve(fileURLToPath(new URL('..', import.meta.url)));

// T-090 self-test: the script, run as a child on a tiny fixture tree, passes it clean and fails every planted violation.
function selfTest() {
  const self = fileURLToPath(import.meta.url);
  const hash = (s) => createHash('sha256').update(s).digest('hex');
  const A = 'system text v1\n';
  const B = '{ "type": "object" }\n';
  const base = () => ({
    'shared/prompts/a.v1.txt': A,
    'shared/prompts/b.v1.json': B,
    'shared/prompts/README.md': 'not hashed\n',
    'shared/prompts/manifest.json': JSON.stringify({
      files: { 'a.v1.txt': hash(A), 'b.v1.json': hash(B) },
      prompts: { 'p.v1': { system: 'a.v1.txt', schema: 'b.v1.json', released: false } },
    }),
    'remoteconfig.template.json': JSON.stringify({ parameters: { prompt_versions: { defaultValue: { value: JSON.stringify({ job: 'p.v1' }) } } } }),
  });
  const withManifest = (f) => { const t = base(); const m = JSON.parse(t['shared/prompts/manifest.json']); f(m); t['shared/prompts/manifest.json'] = JSON.stringify(m); return t; };
  // An isolated git: no user/system config, no inherited GIT_DIR (e.g. inside a hook), no discovery above the tree.
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_CEILING_DIRECTORIES: tmpdir() };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR']) delete env[k];
  const write = (dir, tree) => {
    for (const [rel, body] of Object.entries(tree)) {
      if (body === null) { rmSync(join(dir, rel), { force: true }); continue; }
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), body);
    }
  };
  // `head`: a tree committed as git HEAD first (the released-at-HEAD guard), then `tree` is written over it.
  const run = (tree, extra = [], head = null) => {
    const dir = mkdtempSync(join(tmpdir(), 'se-prompts-'));
    try {
      if (head) {
        write(dir, head);
        for (const args of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=selftest', '-c', 'user.email=selftest@example.invalid', 'commit', '-q', '-m', 'head']]) {
          const g = spawnSync('git', ['-C', dir, ...args], { env, encoding: 'utf8' });
          if (g.status !== 0) throw new Error(`git ${args.join(' ')}: ${g.stderr}`);
        }
      }
      write(dir, tree);
      const r = spawnSync(process.execPath, [self, '--root', dir, '--no-self-test', ...extra], { encoding: 'utf8', env });
      return { status: r.status, out: `${r.stdout}${r.stderr}`, manifest: readFileSync(join(dir, 'shared/prompts/manifest.json'), 'utf8') };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const clean = run(base());
  if (clean.status !== 0) throw new Error(`clean fixture failed: ${clean.out}`);
  const released = () => withManifest((m) => { m.prompts['p.v1'].released = true; });
  // [what, tree, the finding it must print, HEAD tree]: exit 1 alone is not enough (a crash also exits 1).
  const planted = [
    ['a draft file whose hash differs', { ...base(), 'shared/prompts/a.v1.txt': 'edited\n' }, 'a.v1.txt: sha256 differs from manifest'],
    ['a file missing from manifest.files', { ...base(), 'shared/prompts/c.v1.txt': 'new\n' }, 'c.v1.txt is not listed in manifest.files'],
    ['a listed file that does not exist', { ...base(), 'shared/prompts/b.v1.json': null }, 'manifest lists b.v1.json, which does not exist'],
    ['a released prompt whose file changed', { ...released(), 'shared/prompts/a.v1.txt': 'edited\n' }, 'a.v1.txt: changed, but it belongs to a released prompt'],
    ['a prompt without a boolean released', withManifest((m) => { delete m.prompts['p.v1'].released; }), 'prompt p.v1 needs a boolean "released"'],
    ['a prompt referencing an unhashed file', withManifest((m) => { m.prompts['p.v1'].user = 'missing.v1.txt'; }), 'prompt p.v1.user references missing.v1.txt, which is not a hashed file'],
    ['an RC prompt_versions id that is not a manifest prompt', { ...base(), 'remoteconfig.template.json': JSON.stringify({ parameters: { prompt_versions: { defaultValue: { value: '{"job":"p.v9"}' } } } }) }, 'prompt_versions.job = p.v9 is not a manifest prompt'],
    // the git-HEAD guard: released at HEAD, flipped back to a draft (and re-hashed) in the work tree
    ['a prompt released at HEAD flipped back to a draft', base(), 'prompt p.v1 was released at HEAD and cannot become a draft again', released()],
    ['a file locked at HEAD edited after a flip back to draft', withManifest((m) => { m.files['a.v1.txt'] = hash('edited\n'); }), 'a.v1.txt is locked at HEAD (released prompt) but its content changed', { ...released() }],
  ];
  // the edited-after-flip case needs the edited file in the work tree too
  planted[8][1]['shared/prompts/a.v1.txt'] = 'edited\n';
  const failures = [];
  for (const [what, tree, expect, head] of planted) {
    const r = run(tree, [], head ?? null);
    if (r.status !== 1 || !r.out.includes(expect)) failures.push(`did not fail on ${what} with "${expect}" (exit ${r.status}): ${r.out.trim().slice(0, 300)}`);
  }
  // a clean tree with a released prompt at HEAD passes (the guard does not fire on its own)
  const headClean = run(released(), [], released());
  if (headClean.status !== 0) failures.push(`a released prompt unchanged since HEAD failed: ${headClean.out.trim().slice(0, 300)}`);
  // --write must refuse a changed released file and leave the manifest untouched
  const locked = { ...withManifest((m) => { m.prompts['p.v1'].released = true; }), 'shared/prompts/a.v1.txt': 'edited\n' };
  const w = run(locked, ['--write']);
  if (w.status !== 1 || w.manifest !== locked['shared/prompts/manifest.json'] || !w.out.includes('REFUSED: a.v1.txt belongs to a released prompt')) failures.push('--write did not refuse a changed released file');
  if (failures.length) throw new Error(failures.join('\n'));
  return planted.length + 2;
}
if (ROOT_IDX < 0 && !ARGS.includes('--no-self-test') && !ARGS.includes('--write')) {
  try {
    console.log(`check-prompts: self-test ok (${selfTest()} planted violations caught, clean fixture passes)`);
  } catch (e) {
    console.error(`check-prompts: SELF-TEST FAILED\n${e.message}`);
    process.exit(1);
  }
}
const DIR = join(REPO, 'shared', 'prompts');
const MANIFEST = join(DIR, 'manifest.json');
const SKIP = new Set(['manifest.json', 'README.md']);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const norm = (p) => p.split(sep).join('/');

function listFiles(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue; // .DS_Store etc. (the Vite glob and the tests skip them too)
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) throw new Error(`symlinks are not allowed in shared/prompts: ${norm(relative(DIR, p))}`);
    if (st.isDirectory()) listFiles(p, out);
    else if (!(dir === DIR && SKIP.has(name))) out.push(norm(relative(DIR, p)));
  }
  return out;
}

function referencedFiles(prompts) {
  const refs = [];
  for (const [id, spec] of Object.entries(prompts)) {
    for (const key of ['system', 'user', 'schema', 'fallback']) {
      const v = spec[key];
      if (v === undefined) continue;
      for (const f of Array.isArray(v) ? v : [v]) refs.push([id, key, f]);
    }
  }
  return refs;
}

function lockedFiles(prompts) {
  const locked = new Set();
  let anyReleased = false;
  for (const [id, , f] of referencedFiles(prompts)) if (prompts[id].released === true) { locked.add(f); anyReleased = true; }
  if (anyReleased) locked.add('enums.v1.json');
  return locked;
}

if (!existsSync(MANIFEST)) {
  console.error('check-prompts: shared/prompts/manifest.json is missing');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const files = listFiles(DIR);
const hashes = Object.fromEntries(files.map((f) => [f, sha256(readFileSync(join(DIR, f)))]));
const locked = lockedFiles(manifest.prompts ?? {});

// The manifest as committed at HEAD (null if git or the file is unavailable, e.g. before the first commit).
function headManifest() {
  try {
    const out = execFileSync('git', ['show', 'HEAD:shared/prompts/manifest.json'], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out.toString('utf8'));
  } catch {
    return null;
  }
}
const head = headManifest();
const headErrors = [];
if (head) {
  const headLocked = lockedFiles(head.prompts ?? {});
  for (const [id, sp] of Object.entries(head.prompts ?? {})) {
    if (sp.released === true && manifest.prompts?.[id]?.released !== true) headErrors.push(`prompt ${id} was released at HEAD and cannot become a draft again`);
  }
  for (const f of headLocked) {
    if (own(head.files ?? {}, f) && hashes[f] !== undefined && hashes[f] !== head.files[f]) headErrors.push(`${f} is locked at HEAD (released prompt) but its content changed`);
    if (own(head.files ?? {}, f) && hashes[f] === undefined) headErrors.push(`${f} is locked at HEAD (released prompt) but was deleted`);
  }
}

if (process.argv.includes('--write')) {
  if (headErrors.length) {
    for (const e of headErrors) console.error(`check-prompts: REFUSED: ${e}`);
    process.exit(1);
  }
  const refused = files.filter((f) => locked.has(f) && own(manifest.files, f) && manifest.files[f] !== hashes[f]);
  const gone = Object.keys(manifest.files).filter((f) => locked.has(f) && !files.includes(f));
  if (refused.length || gone.length) {
    for (const f of refused) console.error(`check-prompts: REFUSED: ${f} belongs to a released prompt and changed. Add a *.v2.* file instead.`);
    for (const f of gone) console.error(`check-prompts: REFUSED: ${f} belongs to a released prompt and was deleted.`);
    process.exit(1);
  }
  const changed = files.filter((f) => own(manifest.files, f) && manifest.files[f] !== hashes[f]);
  const added = files.filter((f) => !own(manifest.files, f));
  manifest.files = hashes;
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`check-prompts: wrote manifest (${added.length} added, ${changed.length} draft files re-hashed${changed.length ? ': ' + changed.join(', ') : ''})`);
}

const errors = [...headErrors];
for (const f of files) {
  if (!own(manifest.files, f)) errors.push(`${f} is not listed in manifest.files`);
  else if (manifest.files[f] !== hashes[f]) {
    errors.push(locked.has(f)
      ? `${f}: changed, but it belongs to a released prompt (immutable; add a *.v2.* file instead)`
      : `${f}: sha256 differs from manifest (draft file: run node scripts/check-prompts.mjs --write)`);
  }
}
for (const f of Object.keys(manifest.files)) if (!files.includes(f)) errors.push(`manifest lists ${f}, which does not exist`);
for (const [id, spec] of Object.entries(manifest.prompts ?? {})) {
  if (typeof spec.released !== 'boolean') errors.push(`prompt ${id} needs a boolean "released"`);
}
for (const [id, key, f] of referencedFiles(manifest.prompts ?? {})) {
  if (!own(manifest.files, f)) errors.push(`prompt ${id}.${key} references ${f}, which is not a hashed file`);
}

const rcPath = join(REPO, 'remoteconfig.template.json');
if (existsSync(rcPath)) {
  const rc = JSON.parse(readFileSync(rcPath, 'utf8'));
  const raw = rc.parameters?.prompt_versions?.defaultValue?.value;
  if (raw) {
    const pv = JSON.parse(raw);
    for (const [job, id] of Object.entries(pv)) {
      if (!own(manifest.prompts, id)) errors.push(`remoteconfig prompt_versions.${job} = ${id} is not a manifest prompt`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(`check-prompts: ${e}`);
  process.exit(1);
}
const released = Object.entries(manifest.prompts).filter(([, s]) => s.released).map(([id]) => id);
console.log(`check-prompts: ok (${files.length} files, ${Object.keys(manifest.prompts).length} prompts, released: ${released.length ? released.join(', ') : 'none (all drafts, D-62)'})`);
