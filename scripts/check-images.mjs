#!/usr/bin/env node
// scripts/check-images.mjs: repo hygiene scan over every file git would commit (T-090; AC-244 EXIF part, AC-351,
// AC-364 pre-check; ARCH §3; D-106). One script for image metadata AND coordinates (there is no check-coords.mjs).
//
//   node scripts/check-images.mjs              self-test on planted violations, then scan the repo
//   node scripts/check-images.mjs --no-self-test
//   node scripts/check-images.mjs --root <dir> scan another git work tree
//
// Files scanned: `git ls-files --cached --others --exclude-standard`, i.e. tracked files plus untracked files that are
// not ignored (everything a `git add` could commit). Ignored files are never listed, and a listed file on a secret
// path (S1) is reported WITHOUT being read. Exit 1 on any violation, if git fails, or if the self-test fails.
//
// Rules:
//   I1  JPEG: no APP1 (EXIF/XMP), APP13 (Photoshop/IPTC) or APP11 (JUMBF/C2PA, which can copy the EXIF GPS) segment,
//       no Exif/XMP/Photoshop signature anywhere in the file, nothing but zero padding after EOI (Motion Photo trailers).
//   I2  PNG: no eXIf, tEXt, iTXt, zTXt or caBX (C2PA) chunk, nothing but zero padding after IEND.
//   I3  WebP: no EXIF, XMP or C2PA chunk.
//   I4  Any other image or video container (HEIC/HEIF/AVIF/MP4/MOV, TIFF/DNG/raw, GIF, BMP, ICO, JPEG XL, AVI,
//       Matroska/WebM), by magic bytes or by extension: its metadata is not verified here, so it fails closed.
//   I5  A malformed JPEG/PNG/WebP, or a .jpg/.jpeg/.png/.webp file whose bytes are another format or none.
//   C1  Text files: no coordinate-like decimal (COORD_RE) outside web/public/samples/*.json, shared/testvectors/*.json
//       and lock files, except the exact values reviewed in scripts/check-images.allow.json (D-106).
//   B1  benchmark/**: no image files at all, no data:image URI and no long base64 run (photo pixels, AC-351).
//   P1  Private-data paths: no truth*.csv anywhere, nothing under benchmark/private/, no StrangersEyes-private path.
//   S1  Secret paths: no .env* file except web/.env.example and web/.env.e2e, no *.local, .appcheck-debug-token,
//       Secrets.xcconfig or *.secret* file, no private-key or keystore file, no service-account JSON.
//   S2  The committed .gitignore still ignores the secret paths (git check-ignore: the files are never opened).
//   S3  Secret contents: a PEM private key, a service-account JSON, an OAuth client secret or refresh token, an App
//       Check debug-token value (a UUID assigned to a *debug*token* name, or any UUID in a .env file), or a
//       GitHub/AWS/Slack/Stripe/Anthropic token. Firebase `AIza…` API keys are expected (not secret, CLAUDE.md inv. 10).
//   L1  A symlink that points outside the work tree.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const ALLOW_FILE = 'scripts/check-images.allow.json';

// ---------------------------------------------------------------------------------------------------------------
// C1: coordinates
// A decimal with 4+ fraction digits (about 11 m) whose integer part is 0-180 (|lat| <= 90, |lng| <= 180), standing as
// its own token: not the tail of a longer number, a version string (157.0.8103.79), an arXiv ID (2503.20226) or an
// identifier. A hemisphere letter (N, S, E, W) may prefix it. A run of six 0s or 9s ends the significant digits
// (binary float noise such as 15.000000000000002 is not a location); fewer than 4 significant digits is not flagged.
// A DOI prefix ("10." + registrant digits + "/") is not a coordinate.
export const COORD_RE = /(?:(?<![\w.])|(?<=(?:^|[^\w.])[NSEWnsew]))-?(?:180|1[0-7]\d|\d{1,2})\.(\d{4,})(?!\d|\.\d)/g;
const significant = (frac) => { const k = frac.search(/0{6}|9{6}/); return k < 0 ? frac.length : k; };
export function coordinateHits(text) {
  const out = [];
  for (const m of text.matchAll(COORD_RE)) {
    if (significant(m[1]) < 4) continue;
    if (/^10\.\d+$/.test(m[0]) && text[m.index + m[0].length] === '/') continue; // DOI prefix
    out.push({ value: m[0], index: m.index });
  }
  return out;
}
// AC-351 / AC-364: the only paths where coordinates may live (samples after the D-26 acceptance; synthetic vectors).
const COORD_PATH_OK = [
  /^web\/public\/samples\/[^/]+\.json$/,
  /^shared\/testvectors\/[^/]+\.json$/,
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|Package\.resolved|Podfile\.lock)$/,
];

/** scripts/check-images.allow.json → Map(file → Set(exact values)). A malformed file or entry is a violation. */
function loadAllow(root, add) {
  const map = new Map();
  const p = join(root, ALLOW_FILE);
  if (!existsSync(p)) return map;
  let j;
  try { j = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { add('C1-coordinate', ALLOW_FILE, 1, `not valid JSON (${e.message})`); return map; }
  if (!j || !Array.isArray(j.entries)) { add('C1-coordinate', ALLOW_FILE, 1, 'needs an "entries" array'); return map; }
  j.entries.forEach((e, k) => {
    const exact = (v) => typeof v === 'string' && coordinateHits(v).length === 1 && coordinateHits(v)[0].value === v;
    const ok = e && typeof e.file === 'string' && /^[\w.@-][\w./@-]*$/.test(e.file) && !e.file.includes('..')
      && Array.isArray(e.values) && e.values.length > 0 && e.values.every(exact)
      && typeof e.why === 'string' && e.why.trim().length >= 10;
    if (!ok) {
      add('C1-coordinate', ALLOW_FILE, 1, `entries[${k}] needs "file" (one exact repo path, no glob), "values" (exact coordinate-like decimals as written, sign included) and "why"`);
      return;
    }
    const s = map.get(e.file) ?? new Set();
    for (const v of e.values) s.add(v);
    map.set(e.file, s);
  });
  return map;
}

// ---------------------------------------------------------------------------------------------------------------
// I1-I5: images
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JXL_SIG = Buffer.from([0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]);
const EXPECT = { jpg: 'jpeg', jpeg: 'jpeg', jpe: 'jpeg', jfif: 'jpeg', png: 'png', webp: 'webp' };
const OTHER_MEDIA_EXT = new Set(['heic', 'heif', 'hif', 'avif', 'tif', 'tiff', 'dng', 'cr2', 'cr3', 'nef', 'arw', 'orf',
  'rw2', 'raf', 'srw', 'gif', 'bmp', 'ico', 'jxl', 'mov', 'mp4', 'm4v', '3gp', 'avi', 'mkv', 'webm']);
const PNG_META = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'caBX']);
const WEBP_META = new Set(['EXIF', 'XMP ', 'C2PA']);
const JPEG_SIGS = ['Exif\0\0', 'http://ns.adobe.com/xap/1.0/', '<x:xmpmeta', 'Photoshop 3.0\0'].map((s) => Buffer.from(s, 'latin1'));

/** The container format by magic bytes, or null. Weak magics (ICO, BMP) only for binary files. */
function sniff(buf, binary) {
  const a = (s, e) => buf.toString('latin1', s, e);
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG)) return 'png';
  if (buf.length >= 12 && a(0, 4) === 'RIFF' && a(8, 12) === 'WEBP') return 'webp';
  if (buf.length >= 12 && a(4, 8) === 'ftyp') return 'ISO-BMFF (HEIC/HEIF/AVIF/MP4/MOV)';
  if (buf.length >= 4 && (a(0, 4) === 'II*\0' || a(0, 4) === 'MM\0*')) return 'TIFF/DNG/raw';
  if (buf.length >= 6 && /^GIF8[79]a$/.test(a(0, 6))) return 'GIF';
  if (buf.length >= 12 && a(0, 4) === 'RIFF' && a(8, 12) === 'AVI ') return 'AVI';
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x1a45dfa3) return 'Matroska/WebM';
  if (buf.length >= 12 && buf.subarray(0, 12).equals(JXL_SIG)) return 'JPEG XL';
  if (binary && buf.length >= 2 && buf[0] === 0xff && buf[1] === 0x0a) return 'JPEG XL';
  if (binary && buf.length >= 4 && buf.readUInt32BE(0) === 0x00000100) return 'ICO';
  if (binary && buf.length >= 2 && a(0, 2) === 'BM') return 'BMP';
  return null;
}
const trailingJunk = (buf, from) => from < buf.length && buf.subarray(from).some((b) => b !== 0);

/** [rule, message] pairs for a JPEG: every marker segment is walked, scan data included (APPn may follow a scan). */
export function jpegIssues(buf) {
  const out = [];
  const bad = (m) => [...out, ['I5-malformed-image', `malformed JPEG: ${m}`]];
  let i = 2;
  let inScan = false;
  for (;;) {
    if (i >= buf.length) return bad('no EOI marker (truncated)');
    if (buf[i] !== 0xff) {
      if (!inScan) return bad(`expected a marker at byte ${i}`);
      i++; continue; // entropy-coded data
    }
    let j = i;
    while (j < buf.length && buf[j] === 0xff) j++; // fill bytes
    if (j >= buf.length) return bad('no EOI marker (truncated)');
    const m = buf[j];
    if (inScan && (m === 0x00 || (m >= 0xd0 && m <= 0xd7))) { i = j + 1; continue; } // stuffed 0xFF00, RSTn
    i = j + 1;
    if (m === 0xd9) {
      if (trailingJunk(buf, i)) out.push(['I1-jpeg-metadata', `${buf.length - i} byte(s) after EOI (a trailer such as a Motion Photo can carry metadata)`]);
      break;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue; // standalone markers
    if (m === 0x00 || m === 0xd8) return bad(`unexpected marker 0xFF${m.toString(16).padStart(2, '0')} at byte ${j}`);
    if (i + 2 > buf.length) return bad('truncated segment header');
    const len = buf.readUInt16BE(i);
    if (len < 2 || i + len > buf.length) return bad(`truncated segment 0xFF${m.toString(16)} at byte ${j}`);
    if (m === 0xe1) out.push(['I1-jpeg-metadata', `APP1 segment at byte ${j} (EXIF/XMP)`]);
    if (m === 0xed) out.push(['I1-jpeg-metadata', `APP13 segment at byte ${j} (Photoshop/IPTC)`]);
    if (m === 0xeb) out.push(['I1-jpeg-metadata', `APP11 segment at byte ${j} (JUMBF/C2PA, which can copy EXIF GPS)`]);
    inScan = m === 0xda;
    i += len;
  }
  if (!out.some(([r]) => r === 'I1-jpeg-metadata')) {
    for (const s of JPEG_SIGS) {
      const k = buf.indexOf(s);
      if (k >= 0) out.push(['I1-jpeg-metadata', `metadata signature ${JSON.stringify(s.toString('latin1'))} at byte ${k} outside an APP1/APP13 segment`]);
    }
  }
  return out;
}

export function pngIssues(buf) {
  const out = [];
  let i = 8;
  for (;;) {
    if (i + 12 > buf.length) return [...out, ['I5-malformed-image', 'malformed PNG: no IEND chunk (truncated)']];
    const len = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) return [...out, ['I5-malformed-image', `malformed PNG: bad chunk type at byte ${i}`]];
    if (i + 12 + len > buf.length) return [...out, ['I5-malformed-image', `malformed PNG: truncated ${type} chunk`]];
    if (PNG_META.has(type)) out.push(['I2-png-metadata', `${type} chunk at byte ${i} (text, EXIF or C2PA metadata)`]);
    i += 12 + len;
    if (type === 'IEND') break;
  }
  if (trailingJunk(buf, i)) out.push(['I2-png-metadata', `${buf.length - i} byte(s) after IEND`]);
  return out;
}

export function webpIssues(buf) {
  const out = [];
  let i = 12;
  while (i < buf.length) {
    if (i + 8 > buf.length) return [...out, ['I5-malformed-image', 'malformed WebP: truncated chunk header']];
    const type = buf.toString('latin1', i, i + 4);
    const len = buf.readUInt32LE(i + 4);
    if (i + 8 + len > buf.length) return [...out, ['I5-malformed-image', `malformed WebP: truncated ${JSON.stringify(type)} chunk`]];
    if (WEBP_META.has(type)) out.push(['I3-webp-metadata', `${type.trim()} chunk at byte ${i}`]);
    i += 8 + len + (len & 1);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// P1, S1-S3: private data and secrets
const ENV_OK = new Set(['web/.env.example', 'web/.env.e2e']);
const isEnvFile = (rel) => /(^|\/)\.env(\.[^/]*)?$/i.test(rel);
function secretPath(rel) {
  const base = rel.split('/').pop();
  if (isEnvFile(rel) && !ENV_OK.has(rel)) return 'a .env file (only web/.env.example and web/.env.e2e are committed, AC-364)';
  if (/\.local$/i.test(base)) return 'a *.local file (web/.env.development.local holds the App Check debug token)';
  if (/^\.appcheck-debug-token/i.test(base)) return 'the App Check debug-token file';
  if (/^secrets\.xcconfig$/i.test(base)) return 'Secrets.xcconfig';
  if (/\.secret/i.test(base)) return 'a *.secret* file';
  if (/\.(pem|key|p8|p12|pfx|jks|keystore|mobileprovision)$/i.test(base)) return 'a private-key, keystore or provisioning file';
  if (/service[-_ ]?account[^/]*\.json$|firebase-adminsdk[^/]*\.json$/i.test(base)) return 'a service-account key file';
  return null;
}
function privatePath(rel) {
  if (/(^|\/)truth[^/]*\.csv$/i.test(rel)) return 'truth*.csv: ground-truth coordinates live in PRIV only (D-29)';
  if (/^benchmark\/private\//i.test(rel)) return 'benchmark/private/: private benchmark data lives in PRIV only (D-29)';
  if (/strangerseyes-private/i.test(rel)) return 'a StrangersEyes-private (PRIV) path: nothing from PRIV is ever copied into the repo (D-29)';
  return null;
}
const UUID = '[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}';
const SECRET_RES = [
  [/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/, 'a PEM private key'],
  [/"type"\s*:\s*"service_account"/, 'a service-account key file'],
  [/"private_key(?:_id)?"\s*:\s*"[^"\s]{8,}/, 'a service-account private key'],
  [/"client_secret"\s*:\s*"[^"\s]{8,}"|\bGOCSPX-[\w-]{20,}/, 'an OAuth client secret'],
  [/"refresh_token"\s*:\s*"[^"\s]{8,}"|(?<![\w/])1\/\/0[\w-]{30,}/, 'an OAuth refresh token'],
  // A UUID assigned to any *debug*token* name: VITE_APPCHECK_DEBUG_TOKEN=…, self.FIREBASE_APPCHECK_DEBUG_TOKEN = '…',
  // "AppCheckDebugToken": "…", or an Xcode scheme's key = "AppCheckDebugToken" ⏎ value = "…" (\s spans lines).
  [new RegExp(`debug[\\w.-]*token[\\w.-]*["'\`\\]]?\\s*(?:[:=]|\\bvalue\\s*=)\\s*["'\`]?\\s*${UUID}`, 'i'), 'an App Check debug-token value'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_\w{40,}/, 'a GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/\b[rs]k_live_[A-Za-z0-9]{16,}/, 'a Stripe live key'],
  [/\bsk-ant-[\w-]{20,}/, 'an Anthropic API key'],
];
// S2: paths the committed .gitignore must keep ignoring. Checked by name with `git check-ignore --no-index`; the user's
// global excludes file is switched off so a clean clone behaves the same.
export const MUST_IGNORE = ['.env', 'web/.env', 'web/.env.local', 'web/.env.development.local', 'web/.env.production.local',
  'ios/.appcheck-debug-token', 'ios/Config/Secrets.xcconfig', 'benchmark/private/raw.json'];

// ---------------------------------------------------------------------------------------------------------------
const git = (root, args, env, input) => spawnSync('git', ['-C', root, ...args], { env: env ?? process.env, input, maxBuffer: 512 * 1024 * 1024 });
const lineAt = (text, idx) => text.slice(0, idx).split('\n').length;

export function check(root, { env } = {}) {
  const violations = [];
  const warnings = [];
  const add = (rule, file, line, msg) => violations.push({ rule, file, line, msg });

  const ls = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], env);
  if (ls.status !== 0) throw new Error(`git ls-files failed in ${root}: ${String(ls.stderr).trim()}`);
  const files = [...new Set(ls.stdout.toString('utf8').split('\0').filter(Boolean))].sort();

  const allow = loadAllow(root, add);
  const allowedInAllowFile = new Set([...allow.values()].flatMap((s) => [...s]));
  const seen = new Set();

  for (const rel of files) {
    const abs = join(root, ...rel.split('/'));
    let st;
    try { st = lstatSync(abs); } catch { continue; } // deleted in the work tree: the commit removes it
    const priv = privatePath(rel);
    if (priv) add('P1-private-path', rel, 1, priv);
    const secret = secretPath(rel);
    if (secret) { add('S1-secret-path', rel, 1, `${secret} must never be committed (it was not read)`); continue; }
    if (st.isSymbolicLink()) {
      const target = readlinkSync(abs);
      const r = relative(resolve(root), resolve(dirname(abs), target));
      if (isAbsolute(target) || r === '..' || r.startsWith('../') || isAbsolute(r)) add('L1-symlink', rel, 1, 'symlink pointing outside the work tree (it could publish PRIV paths or private files)');
      continue;
    }
    if (!st.isFile()) continue;

    const buf = readFileSync(abs);
    const binary = buf.subarray(0, 8000).includes(0);
    const kind = sniff(buf, binary);
    const ext = (/\.([^./]+)$/.exec(rel)?.[1] ?? '').toLowerCase();
    let media = true;
    if (kind === 'jpeg') for (const [r, m] of jpegIssues(buf)) add(r, rel, 1, m);
    else if (kind === 'png') for (const [r, m] of pngIssues(buf)) add(r, rel, 1, m);
    else if (kind === 'webp') for (const [r, m] of webpIssues(buf)) add(r, rel, 1, m);
    else if (kind) add('I4-image-format', rel, 1, `${kind}: metadata is not verified for this format, so it may not be committed (convert to a stripped JPEG/PNG/WebP)`);
    else if (EXPECT[ext]) add('I5-malformed-image', rel, 1, `.${ext} file whose bytes are not a ${EXPECT[ext].toUpperCase()}`);
    else if (OTHER_MEDIA_EXT.has(ext)) add('I4-image-format', rel, 1, `.${ext}: metadata is not verified for this format, so it may not be committed`);
    else media = false;
    if (media && ['jpeg', 'png', 'webp'].includes(kind) && EXPECT[ext] && EXPECT[ext] !== kind) {
      add('I5-malformed-image', rel, 1, `.${ext} file whose bytes are a ${kind.toUpperCase()}`);
    }
    if (media && rel.startsWith('benchmark/')) add('B1-benchmark-pixels', rel, 1, 'no image files under benchmark/: only aggregates are committed (AC-351)');
    if (binary || media) continue;

    const text = buf.toString('utf8');
    for (const [re, what] of SECRET_RES) {
      const m = re.exec(text);
      if (m) add('S3-secret-content', rel, lineAt(text, m.index), `${what} (AC-364)`);
    }
    if (isEnvFile(rel)) {
      const m = new RegExp(UUID).exec(text);
      if (m) add('S3-secret-content', rel, lineAt(text, m.index), 'a UUID in a committed .env file (App Check debug tokens are UUIDs; keep the value empty)');
    }
    if (rel.startsWith('benchmark/')) {
      const m = /data:image\/|[A-Za-z0-9+/]{200,}={0,2}/.exec(text);
      if (m) add('B1-benchmark-pixels', rel, lineAt(text, m.index), 'a data:image URI or a long base64 run under benchmark/ (photo pixels, AC-351)');
    }
    if (COORD_PATH_OK.some((re) => re.test(rel))) continue;
    const ok = rel === ALLOW_FILE ? allowedInAllowFile : allow.get(rel);
    for (const h of coordinateHits(text)) {
      if (ok?.has(h.value)) { seen.add(`${rel}\0${h.value}`); continue; }
      add('C1-coordinate', rel, lineAt(text, h.index), `coordinate-like decimal ${h.value}: true coordinates live in PRIV only. If it is synthetic, a public reference point or not a coordinate, add the exact value to ${ALLOW_FILE} with a reason (D-106)`);
    }
  }

  // S2: the secret paths stay ignored (checked by name; nothing is read)
  const ci = git(root, ['-c', 'core.excludesFile=/dev/null', 'check-ignore', '--no-index', '--stdin', '-z'], env, MUST_IGNORE.map((p) => `${p}\0`).join(''));
  if (ci.status !== 0 && ci.status !== 1) add('S2-secret-not-ignored', '.gitignore', 1, `git check-ignore failed: ${String(ci.stderr).trim()}`);
  const ignored = new Set(ci.stdout.toString('utf8').split('\0').filter(Boolean));
  for (const p of MUST_IGNORE) if (!ignored.has(p)) add('S2-secret-not-ignored', '.gitignore', 1, `${p} is not git-ignored (ARCH §3.2): a secret written there could be committed`);

  for (const [file, values] of allow) {
    for (const v of values) if (!seen.has(`${file}\0${v}`)) warnings.push(`${ALLOW_FILE}: ${file} no longer contains ${v}; remove the stale value`);
  }
  return { violations, warnings };
}

// ---------------------------------------------------------------------------------------------------------------
// Self-test: a throwaway git work tree with a clean fixture (every rule silent, including its false-positive traps),
// then one planted violation at a time. Secret-like and coordinate-like literals are assembled at run time so this
// file never trips its own rules.
const c = (int, frac) => `${int}.${frac}`;
const uuid = () => ['0f1e2d3c', '4b5a', '4978', '8695', 'a4b3c2d1e0f9'].join('-');
const seg = (marker, payload) => {
  const b = Buffer.alloc(4 + payload.length);
  b[0] = 0xff; b[1] = marker; b.writeUInt16BE(payload.length + 2, 2); payload.copy(b, 4);
  return b;
};
const L = (s) => Buffer.from(s, 'latin1');
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);
const APP0 = seg(0xe0, L('JFIF\0\x01\x01\0\0\x01\0\x01\0\0'));
const APP2 = seg(0xe2, L(`ICC_PROFILE\0\x01\x01${'x'.repeat(16)}`));
const DQT = seg(0xdb, Buffer.alloc(65));
const SOF = seg(0xc0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0]));
const SOS = seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0]));
const SCAN = Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78]); // stuffed 0xFF00 and a restart marker
const jpeg = (...extra) => Buffer.concat([SOI, APP0, APP2, DQT, SOF, ...extra, SOS, SCAN, EOI]);
const chunk = (type, data = Buffer.alloc(0)) => {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
};
const png = (...extra) => Buffer.concat([PNG_SIG, chunk('IHDR', Buffer.alloc(13)), chunk('pHYs', Buffer.alloc(9)), ...extra, chunk('IDAT', Buffer.from([1, 2, 3])), chunk('IEND')]);
const wchunk = (type, data) => {
  const h = Buffer.alloc(8); h.write(type, 0, 'latin1'); h.writeUInt32LE(data.length, 4);
  return Buffer.concat([h, data, Buffer.alloc(data.length & 1)]);
};
const webp = (...chunks) => {
  const body = Buffer.concat([L('WEBP'), ...chunks]);
  const h = Buffer.alloc(8); h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(body.length, 4);
  return Buffer.concat([h, body]);
};
const FIXTURE_GITIGNORE = 'node_modules/\n.env\n.env.*\n!.env.example\n!web/.env.e2e\n*.local\nios/.appcheck-debug-token\nios/Config/Secrets.xcconfig\n*.secret*\nbenchmark/private/\n';

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'se-images-'));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR']) delete env[k];
  const g = (...args) => {
    const r = git(dir, args, env);
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${String(r.stderr).trim()}`);
  };
  const w = (rel, body) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); };
  try {
    g('init', '-q');
    w('.gitignore', FIXTURE_GITIGNORE);
    w('web/.env.example', 'VITE_APPCHECK_DEBUG_TOKEN=\nVITE_FAKE_AI=0\n');
    w('web/.env.e2e', 'VITE_FAKE_AI=1\n');
    // Ignored secret files are never listed, so never read (the token here would trip S3 if they were).
    w('web/.env.development.local', `VITE_APPCHECK_DEBUG_TOKEN=${uuid()}\n`);
    w('ios/.appcheck-debug-token', `${uuid()}\n`);
    w('web/public/icons/icon-192.png', png());
    w('web/public/samples/judge-01.jpg', jpeg());
    w('web/public/img/logo.webp', webp(wchunk('VP8L', Buffer.alloc(5))));
    w('web/public/models/face.tflite', Buffer.concat([Buffer.from([0x1c, 0, 0, 0]), L('TFL3'), Buffer.alloc(32)]));
    // C1: the allowlisted paths, an allowlisted exact value, and non-coordinate traps
    w('web/public/samples/judge-01.json', `{ "pin": { "lat": ${c(52, '520008')}, "lng": ${c(13, '404954')} } }\n`);
    w('shared/testvectors/bands.json', `[{ "a": [${c(52, '52')}, ${c(13, '405')}], "b": [${c(48, '8566')}, ${c(2, '3522')}] }]\n`);
    w('web/package-lock.json', `{ "x": "${c(1, '23456789')}" }\n`);
    w('web/src/core/geo.test.ts', `const near = [${c(52, '5201')}, 13.405];\n`);
    w(ALLOW_FILE, JSON.stringify({ entries: [{ file: 'web/src/core/geo.test.ts', values: [c(52, '5201')], why: 'public Berlin reference point (fixture)' }] }, null, 2));
    w('docs/notes.md', [
      'Chrome 157.0.8103.79 with v3Nano 2025.06.30.1229; see arXiv 2503.20226 and https://doi.org/10.1145/3706598.3714074.',
      `Float noise: ${c(15, '000000000000002')} and ${c(96, '99999999999997')}; ${c(440, '123456')} px; R = ${c(6371, '0088')} km.`,
      `Three decimals is fine: ${c(52, '520')}, ${c(13, '405')}. A phone +44 (20) ${c(7946, '0958')}.`,
      "Run git grep -nIE 'BEGIN [A-Z ]*PRIVATE KEY|client_secret|refresh_token' before tagging.",
      `SIMCTL_CHILD_AppCheckDebugToken="$(cat .appcheck-debug-token)" xcrun simctl launch ${uuid().toUpperCase()} <BUNDLE_ID>`,
      '',
    ].join('\n'));
    w('web/src/firebase/config.ts', `export const firebaseConfig = { apiKey: '${'AIza'}Sy${'x'.repeat(33)}', projectId: 'demo' };\n`);
    w('ios/StrangersEyes/Resources/GoogleService-Info.plist', `<plist><dict><key>API_KEY</key><string>${'AIza'}Sy${'y'.repeat(33)}</string></dict></plist>\n`);
    w('benchmark/README.md', 'Only aggregates are committed.\n');
    w('benchmark/aggregate.mjs', `const R = ${c(6371, '0088')};\nexport const edge = (km) => km <= 0.25;\n`);
    symlinkSync('notes.md', join(dir, 'docs/link.md'));
    const clean = check(dir, { env });
    if (clean.violations.length) throw new Error(`clean fixture produced violations: ${JSON.stringify(clean.violations, null, 1)}`);
    if (clean.warnings.length) throw new Error(`clean fixture produced warnings: ${clean.warnings.join('; ')}`);

    const pem = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
    const XMP = 'http://ns.adobe.com/xap/1.0/\0';
    // [rule, file, body, how]: how = 'force' (git add -f: a tracked file that .gitignore would hide) | 'link'
    const planted = [
      ['I1-jpeg-metadata', 'web/public/samples/judge-02.jpg', jpeg(seg(0xe1, L('Exif\0\0MM\0*\0\0\0\x08')))],
      ['I1-jpeg-metadata', 'web/public/samples/xmp.jpg', jpeg(seg(0xe1, L(XMP)))],
      ['I1-jpeg-metadata', 'web/public/samples/iptc.jpg', jpeg(seg(0xed, L('Photoshop 3.0\0')))],
      ['I1-jpeg-metadata', 'web/public/samples/app1-plain.jpg', jpeg(seg(0xe1, L('MPF\0\x01\x02')))], // no signature: the segment rule alone
      ['I1-jpeg-metadata', 'web/public/samples/app13-plain.jpg', jpeg(seg(0xed, L('Adobe_CM\0\x01')))],
      ['I1-jpeg-metadata', 'web/public/samples/c2pa.jpg', jpeg(seg(0xeb, L('JP\0\0\0\0\0\x01jumb')))],
      ['I1-jpeg-metadata', 'web/public/samples/between-scans.jpg', Buffer.concat([SOI, APP0, DQT, SOF, SOS, SCAN, seg(0xe1, L(XMP)), SOS, SCAN, EOI])],
      ['I1-jpeg-metadata', 'web/public/samples/com.jpg', jpeg(seg(0xfe, L('<x:xmpmeta xmlns:x="adobe:ns:meta/">')))],
      ['I1-jpeg-metadata', 'web/public/samples/motion.jpg', Buffer.concat([jpeg(), L('\0\0\0\x18ftypmp42')])],
      ['I1-jpeg-metadata', 'web/src/dev/fixtures/photo.bin', jpeg(seg(0xe1, L('Exif\0\0II*\0')))],
      ['I5-malformed-image', 'web/public/samples/trunc.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a])],
      ['I5-malformed-image', 'web/public/samples/noeoi.jpg', Buffer.concat([SOI, APP0, SOS, SCAN])],
      ['I5-malformed-image', 'web/public/samples/fake.jpg', 'not a jpeg\n'],
      ['I5-malformed-image', 'web/public/icons/fake.png', jpeg()],
      ['I5-malformed-image', 'web/public/icons/trunc.png', png().subarray(0, 40)],
      ['I2-png-metadata', 'web/public/icons/text.png', png(chunk('tEXt', L('Comment\0hello')))],
      ['I2-png-metadata', 'web/public/icons/itxt.png', png(chunk('iTXt', L('XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta/>')))],
      ['I2-png-metadata', 'web/public/icons/ztxt.png', png(chunk('zTXt', L('Raw profile type exif\0\0x')))],
      ['I2-png-metadata', 'web/public/icons/exif.png', png(chunk('eXIf', L('MM\0*\0\0\0\x08')))],
      ['I2-png-metadata', 'web/public/icons/c2pa.png', png(chunk('caBX', L('jumb')))],
      ['I2-png-metadata', 'web/public/icons/trailer.png', Buffer.concat([png(), L('Exif\0\0')])],
      ['I3-webp-metadata', 'web/public/img/exif.webp', webp(wchunk('VP8L', Buffer.alloc(5)), wchunk('EXIF', L('MM\0*')))],
      ['I3-webp-metadata', 'web/public/img/xmp.webp', webp(wchunk('VP8L', Buffer.alloc(5)), wchunk('XMP ', L('<x:xmpmeta/>')))],
      ['I4-image-format', 'docs/img/photo.heic', Buffer.concat([L('\0\0\0\x18ftypheic'), Buffer.alloc(16)])],
      ['I4-image-format', 'docs/img/clip.bin', Buffer.concat([L('\0\0\0\x14ftypqt  '), Buffer.alloc(16)])],
      ['I4-image-format', 'docs/img/anim.gif', Buffer.concat([L('GIF89a'), Buffer.alloc(16)])],
      ['I4-image-format', 'docs/img/scan.tiff', Buffer.concat([L('II*\0'), Buffer.alloc(16)])],
      ['I4-image-format', 'docs/img/raw.dng', 'renamed text\n'],
      ['I4-image-format', 'web/public/favicon.ico', Buffer.concat([Buffer.from([0, 0, 1, 0, 1, 0]), Buffer.alloc(16)])],
      ['B1-benchmark-pixels', 'benchmark/results/chart.png', png()],
      ['B1-benchmark-pixels', 'benchmark/summary.md', '![x](data:image/png;base64,iVBORw0KGgo=)\n'],
      ['B1-benchmark-pixels', 'benchmark/raw.txt', `${'QUJD'.repeat(60)}\n`],
      ['C1-coordinate', 'web/src/core/pins.ts', `export const home = { lat: ${c(52, '123456')}, lng: ${c(13, '456789')} };\n`],
      ['C1-coordinate', 'docs/trip.md', `Taken at ${c(-33, '8688')}, ${c(151, '2093')}.\n`],
      ['C1-coordinate', 'docs/geo.md', `N${c(48, '85837')} E${c(2, '294481')}\n`],
      ['C1-coordinate', 'docs/doi.md', `lat ${c(10, '1145')}, not a DOI\n`],
      ['C1-coordinate', 'research/points.csv', `id,lat,lng\n1,${c(40, '7128')},${c(-74, '0060')}\n`],
      ['C1-coordinate', 'research/noise.json', `{ "lat": ${c(52, '123400000000001')} }\n`],
      ['C1-coordinate', 'shared/strings/en.json', `{ "copy.x": "near ${c(51, '5007')}" }\n`],
      ['C1-coordinate', 'web/public/samples/sub/scene.json', `{ "lat": ${c(41, '9028')} }\n`],
      ['C1-coordinate', 'shared/testvectors/sub/x.json', `{ "lat": ${c(41, '9028')} }\n`],
      ['C1-coordinate', 'benchmark/spike/score.mjs', `export const truth = [${c(35, '6762')}, ${c(139, '6503')}];\n`],
      ['C1-coordinate', 'web/src/core/other.test.ts', `const p = [${c(52, '5201')}, 13.405];\n`], // allowlisted, but for another file
      ['C1-coordinate', 'web/src/core/geo.test.ts', `const near = [${c(52, '5201')}, ${c(13, '4049')}];\n`], // a new value in an allowlisted file
      ['C1-coordinate', ALLOW_FILE, JSON.stringify({ entries: [{ file: 'web/src/*.ts', values: [c(52, '5201')], why: 'a glob is not an exact path' }] })],
      ['C1-coordinate', ALLOW_FILE, JSON.stringify({ entries: [{ file: 'web/src/core/geo.test.ts', values: [c(52, '5201')], why: `home is at ${c(52, '1111')}` }] })],
      ['C1-coordinate', ALLOW_FILE, '{ "entries": [ '],
      ['P1-private-path', 'benchmark/private/raw.json', '{}\n', 'force'],
      ['P1-private-path', 'bench/truth.csv', 'id,band\n1,street\n'],
      ['P1-private-path', 'data/Truth-2026-11.CSV', 'id\n'],
      ['P1-private-path', 'notes/StrangersEyes-private/spike/a.txt', 'x\n'],
      ['S1-secret-path', 'web/.env.development.local', `VITE_APPCHECK_DEBUG_TOKEN=${uuid()}\n`, 'force'],
      ['S1-secret-path', '.env', 'X=1\n', 'force'],
      ['S1-secret-path', 'web/.env.production', 'X=1\n', 'force'],
      ['S1-secret-path', 'docs/.env.sample', 'X=1\n', 'force'],
      ['S1-secret-path', 'ios/.appcheck-debug-token', `${uuid()}\n`, 'force'],
      ['S1-secret-path', 'ios/Config/Secrets.xcconfig', 'X = 1\n', 'force'],
      ['S1-secret-path', 'config/app.secret.json', '{}\n', 'force'],
      ['S1-secret-path', 'keys/service-account.json', '{}\n'],
      ['S1-secret-path', 'keys/demo-firebase-adminsdk-x1.json', '{}\n'],
      ['S1-secret-path', 'certs/dev.pem', 'x\n'],
      ['S2-secret-not-ignored', '.gitignore', FIXTURE_GITIGNORE.replace('.env.*\n', '').replace('*.local\n', '')],
      ['S2-secret-not-ignored', '.gitignore', FIXTURE_GITIGNORE.replace('benchmark/private/\n', '')],
      ['S2-secret-not-ignored', '.gitignore', FIXTURE_GITIGNORE.replace('ios/.appcheck-debug-token\n', '')],
      ['S3-secret-content', 'web/src/core/key.ts', `export const k = \`${pem}\nMIIE\`;\n`],
      ['S3-secret-content', 'config/gcp.json', `{ "type": "${'service'}_account", "project_id": "demo" }\n`],
      ['S3-secret-content', 'config/k.json', `{ "private${'_'}key": "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC" }\n`],
      ['S3-secret-content', 'config/oauth.json', `{ "web": { "client_id": "x", "secret": "${'GOCSPX'}-${'a'.repeat(28)}" } }\n`],
      ['S3-secret-content', 'config/token.json', `{ "refresh${'_'}token": "${'1//0'}${'b'.repeat(40)}" }\n`],
      ['S3-secret-content', 'web/src/firebase/debug.ts', `self.FIREBASE_APPCHECK_DEBUG_TOKEN = '${uuid()}';\n`],
      ['S3-secret-content', 'ios/StrangersEyes.xcodeproj/xcshareddata/xcschemes/S.xcscheme', `<EnvironmentVariable\n   key = "AppCheckDebugToken"\n   value = "${uuid().toUpperCase()}"\n   isEnabled = "YES">\n`],
      ['S3-secret-content', 'web/.env.example', `VITE_APPCHECK_DEBUG_TOKEN=${uuid()}\nVITE_FAKE_AI=0\n`],
      ['S3-secret-content', 'web/.env.e2e', `VITE_FAKE_AI=1\nVITE_OTHER=${uuid()}\n`],
      ['S3-secret-content', 'docs/ci.md', `token: ${'ghp'}_${'c'.repeat(36)}\n`],
      ['S3-secret-content', 'web/src/core/aws.ts', `export const k = '${'AKIA'}ABCDEFGHIJKLMNOP';\n`],
      ['S3-secret-content', 'scripts/x.mjs', `const k = '${'sk-ant'}-${'d'.repeat(24)}';\n`],
      ['L1-symlink', 'docs/out.md', '/etc/hosts', 'link'],
      ['L1-symlink', 'docs/out2.md', '../../outside.txt', 'link'],
    ];
    const failures = [];
    for (const [rule, rel, body, how] of planted) {
      const p = join(dir, rel);
      const had = existsSync(p) ? readFileSync(p) : null;
      if (how === 'link') symlinkSync(body, p); else w(rel, body);
      if (how === 'force') g('add', '-f', '--', rel);
      const v = check(dir, { env }).violations;
      if (!v.some((x) => x.rule === rule && x.file === rel)) failures.push(`${rule} did not fire on ${rel}: ${JSON.stringify(String(body).slice(0, 120))}`);
      if (how === 'force') g('rm', '-q', '--cached', '-f', '--', rel);
      if (had === null) rmSync(p); else writeFileSync(p, had);
    }
    const after = check(dir, { env });
    if (after.violations.length) failures.push(`fixture not restored: ${JSON.stringify(after.violations)}`);
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
      console.log(`check-images: self-test ok (${n} planted violations caught, clean fixture passes)`);
    }
  } catch (e) {
    console.error(`check-images: SELF-TEST FAILED\n${e.message}`);
    process.exit(1);
  }
  let res;
  try { res = check(root); } catch (e) { console.error(`check-images: ${e.message}`); process.exit(1); }
  for (const x of res.warnings) console.warn(`check-images: warning: ${x}`);
  if (res.violations.length) {
    for (const x of res.violations) console.error(`${x.file}:${x.line}  [${x.rule}]  ${x.msg}`);
    console.error(`check-images: ${res.violations.length} violation(s)`);
    process.exit(1);
  }
  console.log('check-images: ok (no image metadata, coordinates, private paths or secrets)');
}
