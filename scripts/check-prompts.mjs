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
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
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
