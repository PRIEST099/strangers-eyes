#!/usr/bin/env node
// scripts/check-images.mjs: repo hygiene scan over every file git would commit (T-090; AC-244 EXIF part, AC-351,
// AC-364 pre-check; ARCH §3; D-106, D-119). One script for image metadata AND coordinates (there is no check-coords.mjs).
//
//   node scripts/check-images.mjs              self-test on planted violations, then scan the repo
//   node scripts/check-images.mjs --no-self-test
//   node scripts/check-images.mjs --root <dir> scan another git work tree
//
// Files scanned: `git ls-files -s --cached --others --exclude-standard`, i.e. tracked files plus untracked files that are
// not ignored (everything a `git add` could commit), in BOTH forms a commit can take: the work-tree file AND the staged
// blob (the listing's index entries + `git cat-file --batch`; `git commit` takes the blob, so a file staged with EXIF and stripped
// on disk afterwards, or staged and then deleted from disk, is still caught). The path rules (P1, S1) run on the path
// before anything is opened, and a path that S1 flags is never read in either form. Ignored files are never listed.
// Exit 1 on any violation, if git fails, or if the self-test fails.
//
// Rules:
//   I1  JPEG: only APP0 (JFIF/JFXX), APP2 (ICC_PROFILE) and APP14 (Adobe) segments; any other APPn (APP1 EXIF/XMP,
//       APP11 JUMBF/C2PA, APP13 IPTC, APP2 MPF, APP12 Ducky, ...) or a COM segment fails; no Exif/XMP/Photoshop
//       signature anywhere in the file; nothing but zero padding after EOI (Motion Photo trailers).
//   I2  PNG: only the chunks in PNG_OK (IHDR/PLTE/IDAT/IEND, colour and pixel-size chunks, APNG frames); any other
//       chunk (eXIf, exIf, tEXt, iTXt, zTXt, caBX, vendor chunks) fails; nothing but zero padding after IEND.
//   I3  WebP: only VP8/VP8L/VP8X/ALPH/ANIM/ANMF/ICCP chunks (EXIF, XMP, C2PA and unknown chunks fail).
//   I4  Any other image or video container (HEIC/HEIF/AVIF/MP4/MOV, TIFF/DNG/raw, GIF, BMP, ICO, JPEG XL, AVI,
//       Matroska/WebM, XMP sidecars), by magic bytes or by extension: its metadata is not verified, so it fails closed.
//   I5  A malformed JPEG/PNG/WebP, or a .jpg/.jpeg/.png/.webp file whose bytes are another format or none.
//   I6  A binary file (a NUL anywhere, not UTF-16 text with a BOM) that is not a parsed image and whose extension is not
//       in BINARY_OK_EXT: its contents cannot be checked for metadata, coordinates or secrets (fail closed).
//   I7  Hidden images: in a binary, an Exif/XMP/Photoshop signature, or an embedded JPEG/PNG (at any offset) carrying
//       metadata; in text, a data:image/...;base64 URI or a base64 run starting /9j/, iVBORw0KGgo or UklGR whose
//       decoded image carries metadata (or is another container).
//   C1  Text files (UTF-8, or UTF-16 with a BOM): no coordinate-like value outside web/public/samples/*.json,
//       shared/testvectors/*.json and the repo's real lock files, except the exact values reviewed in
//       scripts/check-images.allow.json (D-106). Forms: a decimal (COORD_RE, a zero-padded longitude too), a decimal
//       comma (52,5200), DMS with seconds or decimal minutes, and XMP's "DDD,MM.mmk" form. SVG d/points/viewBox/transform
//       attribute values are skipped.
//   B1  benchmark/**: no image or other binary file at all, no data:image URI and no long base64 run (AC-351).
//   P1  Private-data paths: no truth*.csv anywhere, nothing under benchmark/private/, no StrangersEyes-private path.
//   S1  Secret paths: no .env* file except web/.env.example and web/.env.e2e, no .envrc, *.local, *debug*token* file,
//       Secrets.xcconfig, secrets.json or *.secret* file, no private-key or keystore file, no service-account JSON.
//   S2  The committed .gitignore still ignores the secret paths (git check-ignore -v: the files are never opened, and
//       the matching rule must come from a committed .gitignore, not .git/info/exclude, and must not be a negation).
//   S3  Secret contents: a PEM or PGP private key, a service-account JSON, an OAuth client secret, refresh or access
//       token, an App Check debug-token value (a UUID within ~100 characters after a "debug token" name, or any UUID
//       in a .env file), a GitHub/AWS/Slack/Stripe/Anthropic/OpenAI/npm token, a Slack webhook, a JWT, an .npmrc auth
//       token, or an `AIza…` key other than the committed Firebase client keys (CLAUDE.md inv. 10; values never printed).
//   L1  A symlink that points outside the work tree (symlinks are never followed).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const ALLOW_FILE = 'scripts/check-images.allow.json';
const WHY_MIN = 20;

// ---------------------------------------------------------------------------------------------------------------
// C1: coordinates
// A decimal with 4+ fraction digits (about 11 m) whose integer part is 0-180 (|lat| <= 90, |lng| <= 180; one leading
// zero allowed, as in a zero-padded longitude 013.4050), standing as its own token: not the tail of a longer number, a
// version string (157.0.8103.79), an arXiv ID (2503.20226) or an identifier. A hemisphere letter (N, S, E, W) may
// prefix it. Trailing zeros are not significant (1.5000), a run of six 0s or 9s ends the significant digits (binary
// float noise such as 15.000000000000002 is not a location); fewer than 4 significant digits is not flagged. A DOI
// prefix ("10." + registrant digits + "/") is not a coordinate.
const INT = '(?:0?(?:180|1[0-7]\\d)|0?\\d{1,2})';
export const COORD_RE = new RegExp(`(?:(?<![\\w.])|(?<=(?:^|[^\\w.])[NSEWnsew]))-?${INT}\\.(\\d{4,})(?!\\d|\\.\\d)`, 'g');
// The same with a decimal comma (52,5200): not inside a number list (1,2345,6789) or after a dot.
const COMMA_RE = new RegExp(`(?<![\\w.,])-?${INT},(\\d{4,})(?![\\d,]|\\.\\d)`, 'g');
// Degrees, minutes, seconds: flagged with seconds or decimal minutes (precision under ~200 m); 52°31'N alone is not.
const DMS_RE = /(?<![\w.])(\d{1,3})\s*[°º]\s*(\d{1,2})([.,]\d+)?\s*['′’]\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:["″”]|''))?\s*(?:[NSEWnsew](?!\w))?/g;
// XMP's GPSLatitude form "DDD,MM.mmk" or "DDD,MM,SSk".
const XMP_GPS_RE = /(?<![\w.,])(\d{1,3}),(\d{1,2})(?:([.,])(\d+))?[NSEW](?!\w)/g;
const significant = (frac) => { const f = frac.replace(/0+$/, ''); const k = f.search(/0{6}|9{6}/); return k < 0 ? f.length : k; };
export function coordinateHits(text) {
  const out = [];
  for (const m of text.matchAll(COORD_RE)) {
    if (significant(m[1]) < 4) continue;
    if (/^10\.\d+$/.test(m[0]) && text[m.index + m[0].length] === '/') continue; // DOI prefix
    out.push({ value: m[0], index: m.index });
  }
  for (const m of text.matchAll(COMMA_RE)) if (significant(m[1]) >= 4) out.push({ value: m[0], index: m.index });
  for (const m of text.matchAll(DMS_RE)) {
    if (Number(m[1]) > 180 || Number(m[2]) >= 60) continue;
    if (m[4] === undefined && !(m[3] && significant(m[3].slice(1)) >= 1)) continue;
    out.push({ value: m[0].trim(), index: m.index });
  }
  for (const m of text.matchAll(XMP_GPS_RE)) {
    if (Number(m[1]) > 180 || Number(m[2]) >= 60 || m[4] === undefined) continue;
    out.push({ value: m[0], index: m.index });
  }
  return out.sort((a, b) => a.index - b.index);
}
// SVG geometry (path data, polygon points, viewBox, transform) is full of 4-decimal numbers that are not coordinates:
// those attribute values are blanked (same length, so offsets and line numbers hold) before the scan.
const SVG_ATTR_RE = /(\s(?:d|points|viewBox|transform)=)("[^"]*"|'[^']*')/g;
const blankSvgAttrs = (t) => t.replace(SVG_ATTR_RE, (_, a, v) => a + v.replace(/[^\n]/g, ' '));
// AC-351 / AC-364: the only paths where coordinates may live (samples after the D-26 acceptance; synthetic vectors;
// the repo's real lock files, by exact path).
const COORD_PATH_OK = [
  /^web\/public\/samples\/[^/]+\.json$/,
  /^shared\/testvectors\/[^/]+\.json$/,
  /^(web\/)?package-lock\.json$/,
  /^ios\/StrangersEyes\.xcodeproj\/project\.xcworkspace\/xcshareddata\/swiftpm\/Package\.resolved$/,
  /^research\/day1-artifacts\/ios-ref\/spm1[23]\/Package\.resolved$/,
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
      && typeof e.why === 'string' && e.why.trim().length >= WHY_MIN;
    if (!ok) {
      add('C1-coordinate', ALLOW_FILE, 1, `entries[${k}] needs "file" (one exact repo path, no glob or ..), "values" (a non-empty list of exact coordinate-like values as written, sign included) and "why" (at least ${WHY_MIN} characters)`);
      return;
    }
    if (map.has(e.file)) { add('C1-coordinate', ALLOW_FILE, 1, `entries[${k}] repeats ${e.file}: one entry per file`); return; }
    map.set(e.file, new Set(e.values));
  });
  return map;
}

// ---------------------------------------------------------------------------------------------------------------
// I1-I7: images
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JXL_SIG = Buffer.from([0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]);
const JPEG_SOI = Buffer.from([0xff, 0xd8, 0xff]);
const EXPECT = { jpg: 'jpeg', jpeg: 'jpeg', jpe: 'jpeg', jfif: 'jpeg', png: 'png', webp: 'webp' };
const OTHER_MEDIA_EXT = new Set(['heic', 'heif', 'hif', 'avif', 'tif', 'tiff', 'dng', 'cr2', 'cr3', 'nef', 'arw', 'orf',
  'rw2', 'raf', 'srw', 'gif', 'bmp', 'ico', 'jxl', 'jp2', 'psd', 'mov', 'mp4', 'm4v', '3gp', 'avi', 'mkv', 'webm', 'xmp']);
// Binary types the repo actually tracks besides the parsed images (MediaPipe face models), plus the web-runtime
// binaries a build may need. Anything else binary fails closed (I6).
const BINARY_OK_EXT = new Set(['tflite', 'wasm', 'woff', 'woff2']);
const PNG_OK = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'cICP', 'mDCV',
  'mDCv', 'cLLI', 'cLLi', 'bKGD', 'hIST', 'pHYs', 'sPLT', 'acTL', 'fcTL', 'fdAT']);
const WEBP_OK = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);
const JPEG_OK_APP = { 0xe0: ['JFIF\0', 'JFXX\0'], 0xe2: ['ICC_PROFILE\0'], 0xee: ['Adobe'] };
const JPEG_SEG_NAME = { 0xe1: 'APP1 (EXIF/XMP)', 0xeb: 'APP11 (JUMBF/C2PA, which can copy EXIF GPS)', 0xed: 'APP13 (Photoshop/IPTC)', 0xfe: 'COM (comment)' };
const META_SIGS = ['Exif\0\0', 'http://ns.adobe.com/xap/1.0/', '<x:xmpmeta', 'Photoshop 3.0\0'].map((s) => Buffer.from(s, 'latin1'));

/** The container format by magic bytes, or null. Weak magics (ICO, BMP, bare JPEG XL) only for binary files. */
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

/**
 * [rule, message] pairs for a JPEG: every marker segment is walked, scan data included (APPn may follow a scan).
 * `embedded`: the JPEG sits inside another file, so only metadata findings count (no malformed or trailer findings).
 */
export function jpegIssues(buf, { embedded = false } = {}) {
  const out = [];
  const bad = (m) => (embedded ? out : [...out, ['I5-malformed-image', `malformed JPEG: ${m}`]]);
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
      if (!embedded && trailingJunk(buf, i)) out.push(['I1-jpeg-metadata', `${buf.length - i} byte(s) after EOI (a trailer such as a Motion Photo can carry metadata)`]);
      break;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue; // standalone markers
    if (m === 0x00 || m === 0xd8) return bad(`unexpected marker 0xFF${m.toString(16).padStart(2, '0')} at byte ${j}`);
    if (i + 2 > buf.length) return bad('truncated segment header');
    const len = buf.readUInt16BE(i);
    if (len < 2 || i + len > buf.length) return bad(`truncated segment 0xFF${m.toString(16)} at byte ${j}`);
    if ((m >= 0xe0 && m <= 0xef) || m === 0xfe) {
      const ok = (JPEG_OK_APP[m] ?? []).some((s) => len - 2 >= s.length && buf.toString('latin1', i + 2, i + 2 + s.length) === s);
      if (!ok) out.push(['I1-jpeg-metadata', `${JPEG_SEG_NAME[m] ?? `APP${m - 0xe0}`} segment at byte ${j}: only APP0 JFIF/JFXX, APP2 ICC_PROFILE and APP14 Adobe are allowed`]);
    }
    inScan = m === 0xda;
    i += len;
  }
  if (!embedded && !out.some(([r]) => r === 'I1-jpeg-metadata')) {
    for (const s of META_SIGS) {
      const k = buf.indexOf(s);
      if (k >= 0) out.push(['I1-jpeg-metadata', `metadata signature ${JSON.stringify(s.toString('latin1'))} at byte ${k} outside an APP segment`]);
    }
  }
  return out;
}

export function pngIssues(buf, { embedded = false } = {}) {
  const out = [];
  const bad = (m) => (embedded ? out : [...out, ['I5-malformed-image', `malformed PNG: ${m}`]]);
  let i = 8;
  for (;;) {
    if (i + 12 > buf.length) return bad('no IEND chunk (truncated)');
    const len = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) return bad(`bad chunk type at byte ${i}`);
    if (i + 12 + len > buf.length) return bad(`truncated ${type} chunk`);
    if (!PNG_OK.has(type)) out.push(['I2-png-metadata', `${type} chunk at byte ${i}: not on the PNG chunk allowlist (text, EXIF, C2PA and vendor chunks can carry metadata)`]);
    i += 12 + len;
    if (type === 'IEND') break;
  }
  if (!embedded && trailingJunk(buf, i)) out.push(['I2-png-metadata', `${buf.length - i} byte(s) after IEND`]);
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
    if (!WEBP_OK.has(type)) out.push(['I3-webp-metadata', `${JSON.stringify(type)} chunk at byte ${i}: not on the WebP chunk allowlist (EXIF, XMP, C2PA and unknown chunks)`]);
    i += 8 + len + (len & 1);
  }
  return out;
}

/** I7 findings for a binary: metadata signatures anywhere, and embedded JPEG/PNG (offset >= 1) carrying metadata. */
function hiddenInBinary(buf, { sigs }) {
  const out = [];
  if (sigs) {
    for (const s of META_SIGS) {
      const k = buf.indexOf(s);
      if (k >= 0) out.push(`metadata signature ${JSON.stringify(s.toString('latin1'))} at byte ${k}`);
    }
  }
  for (const [sig, parse, what] of [[JPEG_SOI, jpegIssues, 'JPEG'], [PNG_SIG, pngIssues, 'PNG']]) {
    let k = 0;
    for (let n = 0; n < 1000 && (k = buf.indexOf(sig, k + 1)) > 0; n++) {
      for (const [, m] of parse(buf.subarray(k), { embedded: true })) out.push(`embedded ${what} at byte ${k}: ${m}`);
    }
  }
  return out;
}

/** I7 findings for a decoded base64 image found in text (data URI or a bare run). */
function hiddenDecoded(b) {
  const kind = sniff(b, true);
  const found = kind === 'jpeg' ? jpegIssues(b, { embedded: true }).map(([, m]) => m)
    : kind === 'png' ? pngIssues(b, { embedded: true }).map(([, m]) => m)
      : kind === 'webp' ? webpIssues(b).filter(([r]) => r !== 'I5-malformed-image').map(([, m]) => m)
        : kind ? [`${kind}: metadata is not verified for this format`] : [];
  return [...found, ...hiddenInBinary(b, { sigs: true })];
}
const DATA_URI_RE = /data:image\/[\w.+-]+;base64,([A-Za-z0-9+/]+={0,2})/gi;
const B64_IMAGE_RE = /(?<![A-Za-z0-9+/])(?:\/9j\/|iVBORw0KGgo|UklGR)[A-Za-z0-9+/]{8,}={0,2}/g;

/** Text, or null for a binary: UTF-16 with a BOM is decoded; otherwise a NUL anywhere means binary. */
function decodeText(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2, 2 + ((buf.length - 2) & ~1)).toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return Buffer.from(buf.subarray(2, 2 + ((buf.length - 2) & ~1))).swap16().toString('utf16le');
  if (buf.includes(0)) return null;
  const s = buf.toString('utf8');
  return s.charCodeAt(0) === 0xfeff ? ` ${s.slice(1)}` : s;
}

// ---------------------------------------------------------------------------------------------------------------
// P1, S1-S3: private data and secrets
const ENV_OK = new Set(['web/.env.example', 'web/.env.e2e']);
const isEnvFile = (rel) => /(^|\/)\.env([._-][^/]*)?$/i.test(rel);
function secretPath(rel) {
  const base = rel.split('/').pop();
  if (isEnvFile(rel) && !ENV_OK.has(rel)) return 'a .env file (only web/.env.example and web/.env.e2e are committed, AC-364)';
  if (/^\.envrc$/i.test(base)) return 'an .envrc file (direnv secrets)';
  if (/\.local$/i.test(base)) return 'a *.local file (web/.env.development.local holds the App Check debug token)';
  if (/debug[-_.]?token/i.test(base)) return 'a debug-token file (ios/.appcheck-debug-token holds the App Check debug token)';
  if (/^secrets\.xcconfig$/i.test(base)) return 'Secrets.xcconfig';
  if (/^secrets?\.(json|ya?ml|toml|plist)$/i.test(base)) return 'a secrets file';
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
  [/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/, 'a PEM or PGP private key'],
  [/"type"\s*:\s*"service_account"/, 'a service-account key file'],
  [/"private_key(?:_id)?"\s*:\s*"[^"\s]{8,}/, 'a service-account private key'],
  [/"client_secret"\s*:\s*"[^"\s]{8,}"|\bGOCSPX-[\w-]{20,}/, 'an OAuth client secret'],
  [/"refresh_token"\s*:\s*"[^"\s]{8,}"|(?<![\w/])1\/\/0[\w-]{30,}/, 'an OAuth refresh token'],
  [/\bya29\.[\w-]{20,}/, 'a Google OAuth access token'],
  // A UUID assigned to any *debug*token* name: VITE_APPCHECK_DEBUG_TOKEN=…, self.FIREBASE_APPCHECK_DEBUG_TOKEN = '…',
  // "AppCheckDebugToken": "…", or an Xcode scheme's key = "AppCheckDebugToken" ⏎ value = "…" (\s spans lines).
  [new RegExp(`debug[\\w.-]*token[\\w.-]*["'\`\\]]?\\s*(?:[:=]|\\bvalue\\s*=)\\s*["'\`]?\\s*${UUID}`, 'i'), 'an App Check debug-token value'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_\w{40,}/, 'a GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/https:\/\/hooks\.slack\.com\/services\/T\w+\/B\w+\/\w+/, 'a Slack webhook URL'],
  [/\b[rs]k_live_[A-Za-z0-9]{16,}/, 'a Stripe live key'],
  [/\bsk-ant-[\w-]{20,}/, 'an Anthropic API key'],
  [/\bsk-proj-[\w-]{20,}/, 'an OpenAI API key'],
  [/\bnpm_[A-Za-z0-9]{36}\b/, 'an npm token'],
  [/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/, 'a JWT'],
];
// A UUID within ~100 characters after a "debug token" name (Info.plist <key>…DebugToken</key><string>UUID, Swift
// `?? "UUID"`, a markdown table). A simulator UDID in an `xcrun simctl …` command line is not a token.
const DEBUG_NAME_RE = /debug.?token/gi;
const UUID_RE = new RegExp(UUID);
function debugTokenNear(text) {
  for (const m of text.matchAll(DEBUG_NAME_RE)) {
    const from = m.index + m[0].length;
    const window = text.slice(from, from + 136);
    const u = UUID_RE.exec(window);
    if (u && u.index <= 100 && !/simctl|-destination|udid/i.test(window.slice(0, u.index))) return from + u.index;
  }
  return -1;
}
// The committed Firebase client config files: their apiKey / API_KEY value is the only `AIza…` key allowed anywhere.
const FIREBASE_CONFIGS = [
  ['web/src/firebase/config.ts', /\bapiKey\s*:\s*['"`](AIza[\w-]{35})['"`]/g],
  ['ios/StrangersEyes/Resources/GoogleService-Info.plist', /<key>API_KEY<\/key>\s*<string>(AIza[\w-]{35})<\/string>/g],
];
const AIZA_RE = /AIza[\w-]{35}/g;
// S2: paths the committed .gitignore must keep ignoring. Checked by name with `git check-ignore -v --no-index`; the
// user's global excludes file is switched off, and a match from .git/info/exclude (local only) does not count.
export const MUST_IGNORE = ['.env', 'web/.env', 'web/.env.local', 'web/.env.development.local', 'web/.env.production.local',
  'ios/.appcheck-debug-token', 'ios/Config/Secrets.xcconfig', 'benchmark/private/raw.json'];

// ---------------------------------------------------------------------------------------------------------------
const git = (root, args, env, input) => spawnSync('git', ['-C', root, ...args], { env: env ?? process.env, input, maxBuffer: 1024 * 1024 * 1024 });
const lineAt = (text, idx) => text.slice(0, idx).split('\n').length;

/** oid → Buffer for every blob, via one `git cat-file --batch`. */
function readBlobs(root, env, oids) {
  const res = new Map();
  if (!oids.length) return res;
  const r = git(root, ['cat-file', '--batch'], env, oids.map((o) => `${o}\n`).join(''));
  if (r.status !== 0) throw new Error(`git cat-file failed in ${root}: ${String(r.stderr).trim()}`);
  const out = r.stdout;
  let p = 0;
  for (const oid of oids) {
    const nl = out.indexOf(0x0a, p);
    const [o, type, size] = out.toString('latin1', p, nl).split(' ');
    if (o !== oid || size === undefined) throw new Error(`git cat-file: staged object ${oid} is ${type ?? 'unreadable'}`);
    res.set(oid, out.subarray(nl + 1, nl + 1 + Number(size)));
    p = nl + 1 + Number(size) + 1;
  }
  return res;
}

/** Every content rule on one form (work-tree file or staged blob) of one path. */
function scanContent(rel, buf, add, ctx) {
  const text = decodeText(buf);
  const binary = text === null;
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
  if (binary && !media && !BINARY_OK_EXT.has(ext)) {
    add('I6-unknown-binary', rel, 1, `binary ${ext ? `.${ext}` : 'extension-less'} file: its contents cannot be checked for metadata, coordinates or secrets (allowed binary types: parsed JPEG/PNG/WebP and .${[...BINARY_OK_EXT].join(', .')})`);
  }
  if (binary || media) {
    for (const m of hiddenInBinary(buf, { sigs: kind !== 'jpeg' })) add('I7-hidden-image', rel, 1, m);
    if (rel.startsWith('benchmark/')) add('B1-benchmark-pixels', rel, 1, 'no image or other binary file under benchmark/: only text aggregates are committed (AC-351)');
    return;
  }

  for (const [re, what] of SECRET_RES) {
    const m = re.exec(text);
    if (m) add('S3-secret-content', rel, lineAt(text, m.index), `${what} (AC-364)`);
  }
  const near = debugTokenNear(text);
  if (near >= 0) add('S3-secret-content', rel, lineAt(text, near), 'a UUID near a "debug token" name (an App Check debug-token value, AC-364)');
  if (isEnvFile(rel)) {
    const m = UUID_RE.exec(text);
    if (m) add('S3-secret-content', rel, lineAt(text, m.index), 'a UUID in a committed .env file (App Check debug tokens are UUIDs; keep the value empty)');
  }
  if (rel.split('/').pop() === '.npmrc') {
    const m = /_auth(?:Token)?\s*=|_password\s*=/.exec(text);
    if (m) add('S3-secret-content', rel, lineAt(text, m.index), 'an auth token or password in .npmrc (AC-364)');
  }
  for (const m of text.matchAll(AIZA_RE)) {
    if (!ctx.firebaseKeys.has(m[0])) add('S3-secret-content', rel, lineAt(text, m.index), 'an AIza… API key that is not the committed Firebase client key (a Gemini or Maps key is a secret; the value is not printed)');
  }
  for (const re of [DATA_URI_RE, B64_IMAGE_RE]) {
    for (const m of text.matchAll(re)) {
      const b64 = m[1] ?? m[0];
      for (const f of hiddenDecoded(Buffer.from(b64, 'base64'))) add('I7-hidden-image', rel, lineAt(text, m.index), `base64 image in text: ${f}`);
    }
  }
  if (rel.startsWith('benchmark/')) {
    const m = /data:image\/|[A-Za-z0-9+/]{200,}={0,2}/.exec(text);
    if (m) add('B1-benchmark-pixels', rel, lineAt(text, m.index), 'a data:image URI or a long base64 run under benchmark/ (photo pixels, AC-351)');
  }
  if (COORD_PATH_OK.some((re) => re.test(rel))) return;
  const ok = rel === ALLOW_FILE ? ctx.allowedInAllowFile : ctx.allow.get(rel);
  for (const h of coordinateHits(blankSvgAttrs(text))) {
    if (ok?.has(h.value)) { ctx.seen.add(`${rel}\0${h.value}`); continue; }
    add('C1-coordinate', rel, lineAt(text, h.index), `coordinate-like value ${h.value}: true coordinates live in PRIV only. If it is synthetic, a public reference point or not a coordinate, add the exact value to ${ALLOW_FILE} with a reason (D-106)`);
  }
}

export function check(root, { env, mustIgnore = MUST_IGNORE } = {}) {
  const violations = [];
  const warnings = [];
  const keys = new Set();
  const add = (rule, file, line, msg) => {
    const k = `${rule}\0${file}\0${line}\0${msg}`;
    if (!keys.has(k)) { keys.add(k); violations.push({ rule, file, line, msg }); }
  };

  // One listing: tracked files with their index entry (mode, oid: what `git commit` will take) and untracked files
  // that are not ignored (plain paths). Gitlinks (submodules, 160000) have no blob here.
  const ls = git(root, ['ls-files', '-z', '-s', '--cached', '--others', '--exclude-standard'], env);
  if (ls.status !== 0) throw new Error(`git ls-files failed in ${root}: ${String(ls.stderr).trim()}`);
  const listed = new Set();
  const staged = new Map();
  for (const rec of ls.stdout.toString('utf8').split('\0').filter(Boolean)) {
    const m = /^(\d{6}) ([0-9a-f]{40,64}) \d\t/.exec(rec);
    const rel = m ? rec.slice(m[0].length) : rec;
    listed.add(rel);
    if (!m || m[1] === '160000') continue;
    if (!staged.has(rel)) staged.set(rel, []);
    staged.get(rel).push({ mode: m[1], oid: m[2] });
  }
  const files = [...listed].sort();

  // Path rules first: a secret path is reported and never read, in the work tree or the index.
  const scan = [];
  for (const rel of files) {
    const priv = privatePath(rel);
    if (priv) add('P1-private-path', rel, 1, priv);
    const secret = secretPath(rel);
    if (secret) { add('S1-secret-path', rel, 1, `${secret} must never be committed (it was not read)`); continue; }
    scan.push(rel);
  }
  // Work-tree forms first (symlinks are never followed). A staged blob is read only when its oid is not the work-tree
  // form's own blob hash, i.e. when the commit would take something other than what is on disk.
  const work = new Map();
  const links = new Map();
  for (const rel of scan) {
    const abs = join(root, ...rel.split('/'));
    let st = null;
    try { st = lstatSync(abs); } catch { /* deleted in the work tree: the staged blob, if any, is still scanned */ }
    if (st?.isSymbolicLink()) links.set(rel, Buffer.from(readlinkSync(abs)));
    else if (st?.isFile()) work.set(rel, readFileSync(abs));
  }
  const blobOid = (buf, oid) => createHash(oid.length === 40 ? 'sha1' : 'sha256').update(`blob ${buf.length}\0`).update(buf).digest('hex');
  const pending = [];
  for (const rel of scan) {
    for (const e of staged.get(rel) ?? []) {
      const disk = e.mode === '120000' ? links.get(rel) : work.get(rel);
      e.same = disk !== undefined && blobOid(disk, e.oid) === e.oid;
      if (!e.same) pending.push(e.oid);
    }
  }
  const blobs = readBlobs(root, env, [...new Set(pending)]);

  const firebaseKeys = new Set();
  for (const [rel, re] of FIREBASE_CONFIGS) {
    const p = join(root, ...rel.split('/'));
    try { if (!lstatSync(p).isFile()) continue; } catch { continue; }
    for (const m of readFileSync(p, 'utf8').matchAll(re)) firebaseKeys.add(m[1]);
  }
  const allow = loadAllow(root, add);
  const ctx = { allow, allowedInAllowFile: new Set([...allow.values()].flatMap((s) => [...s])), seen: new Set(), firebaseKeys };
  const linkIssue = (rel, target) => {
    const r = relative(resolve(root), resolve(root, dirname(rel), target));
    if (isAbsolute(target) || r === '..' || r.startsWith('../') || isAbsolute(r)) add('L1-symlink', rel, 1, 'symlink pointing outside the work tree (it could publish PRIV paths or private files)');
  };

  for (const rel of scan) {
    if (links.has(rel)) linkIssue(rel, links.get(rel).toString('utf8'));
    if (work.has(rel)) scanContent(rel, work.get(rel), add, ctx);
    for (const e of staged.get(rel) ?? []) {
      if (e.same) continue;
      const blob = blobs.get(e.oid);
      if (e.mode === '120000') { linkIssue(rel, blob.toString('utf8')); continue; }
      const tagged = (rule, file, line, msg) => add(rule, file, line, `${msg} [in the staged copy, which differs from the work tree]`);
      scanContent(rel, blob, tagged, ctx);
    }
  }

  // S2: the secret paths stay ignored by a committed .gitignore rule (checked by name; nothing is read)
  const ci = git(root, ['-c', 'core.excludesFile=/dev/null', 'check-ignore', '-v', '--no-index', '--stdin', '-z'], env, mustIgnore.map((p) => `${p}\0`).join(''));
  if (ci.status !== 0 && ci.status !== 1) add('S2-secret-not-ignored', '.gitignore', 1, `git check-ignore failed: ${String(ci.stderr).trim()}`);
  const f = ci.stdout.toString('utf8').split('\0');
  const ignored = new Map();
  for (let k = 0; k + 3 < f.length; k += 4) ignored.set(f[k + 3], { source: f[k], pattern: f[k + 2] });
  for (const p of mustIgnore) {
    const m = ignored.get(p);
    if (!m || m.pattern.startsWith('!')) add('S2-secret-not-ignored', '.gitignore', 1, `${p} is not git-ignored (ARCH §3.2): a secret written there could be committed`);
    else if (!/^(?:[^/]+\/)*\.gitignore$/.test(m.source) || m.source.startsWith('.git/')) add('S2-secret-not-ignored', '.gitignore', 1, `${p} is ignored only by ${m.source}, which is not committed: a clean clone would not ignore it`);
  }

  for (const [file, values] of allow) {
    for (const v of values) if (!ctx.seen.has(`${file}\0${v}`)) warnings.push(`${ALLOW_FILE}: ${file} no longer contains ${v}; remove the stale value`);
  }
  return { violations, warnings };
}

// ---------------------------------------------------------------------------------------------------------------
// Self-test: a throwaway git work tree with a clean fixture (every rule silent, including its false-positive traps),
// then one planted violation at a time. Secret-like, coordinate-like and base64-image literals are assembled at run
// time so this file never trips its own rules.
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
const APP14 = seg(0xee, L('Adobe\0\x64\0\0\0\0\x01'));
const DQT = seg(0xdb, Buffer.alloc(65));
const SOF = seg(0xc0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0]));
const SOS = seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0]));
const SCAN = Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78]); // stuffed 0xFF00 and a restart marker
const jpeg = (...extra) => Buffer.concat([SOI, APP0, APP2, APP14, DQT, SOF, ...extra, SOS, SCAN, EOI]);
const chunk = (type, data = Buffer.alloc(0)) => {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
};
const png = (...extra) => Buffer.concat([PNG_SIG, chunk('IHDR', Buffer.alloc(13)), chunk('pHYs', Buffer.alloc(9)), chunk('sRGB', Buffer.alloc(1)), ...extra, chunk('IDAT', Buffer.from([1, 2, 3])), chunk('IEND')]);
const wchunk = (type, data) => {
  const h = Buffer.alloc(8); h.write(type, 0, 'latin1'); h.writeUInt32LE(data.length, 4);
  return Buffer.concat([h, data, Buffer.alloc(data.length & 1)]);
};
const webp = (...chunks) => {
  const body = Buffer.concat([L('WEBP'), ...chunks]);
  const h = Buffer.alloc(8); h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(body.length, 4);
  return Buffer.concat([h, body]);
};
const utf16 = (s) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, 'utf16le')]);
const FIXTURE_GITIGNORE = 'node_modules/\n.env\n.env.*\n!.env.example\n!web/.env.e2e\n*.local\nios/.appcheck-debug-token\nios/Config/Secrets.xcconfig\n*.secret*\nbenchmark/private/\n';

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'se-images-'));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_CEILING_DIRECTORIES: tmpdir() };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR']) delete env[k];
  const g = (...args) => {
    const r = git(dir, args, env);
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${String(r.stderr).trim()}`);
  };
  const w = (rel, body) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); };
  const failures = [];
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
    w('web/public/img/logo.webp', webp(wchunk('VP8L', Buffer.alloc(5)), wchunk('ICCP', Buffer.alloc(4))));
    w('web/public/models/face.tflite', Buffer.concat([Buffer.from([0x1c, 0, 0, 0]), L('TFL3'), Buffer.alloc(32), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x40])]));
    w('web/public/fonts/ui.woff2', Buffer.concat([L('wOF2'), Buffer.alloc(16)]));
    // C1: the allowlisted paths, allowlisted exact values, and non-coordinate traps
    w('web/public/samples/judge-01.json', `{ "pin": { "lat": ${c(52, '520008')}, "lng": ${c(13, '404954')} } }\n`);
    w('shared/testvectors/bands.json', `[{ "a": [${c(52, '52')}, ${c(13, '405')}], "b": [${c(48, '8566')}, ${c(2, '3522')}] }]\n`);
    w('web/package-lock.json', `{ "x": "${c(1, '23456789')}" }\n`);
    w('web/src/core/geo.test.ts', `const near = [${c(52, '5201')}, 13.405];\n`);
    w('docs/signed.md', `Unsigned on purpose: ${c(33, '8688')}.\n`);
    w(ALLOW_FILE, JSON.stringify({ entries: [
      { file: 'web/src/core/geo.test.ts', values: [c(52, '5201')], why: 'public Berlin reference point (fixture)' },
      { file: 'docs/signed.md', values: [c(33, '8688')], why: 'an unsigned value only (sign fixture)' },
    ] }, null, 2));
    w('docs/notes.md', [
      'Chrome 157.0.8103.79 with v3Nano 2025.06.30.1229; see arXiv 2503.20226 and https://doi.org/10.1145/3706598.3714074.',
      `Float noise: ${c(15, '000000000000002')} and ${c(96, '99999999999997')}; ${c(440, '123456')} px; R = ${c(6371, '0088')} km.`,
      `Three decimals is fine: ${c(52, '520')}, ${c(13, '405')}. A phone +44 (20) ${c(7946, '0958')}. Trailing zeros: ${c(13, '4000')}, ${c(1, '50000')}.`,
      `Coarse DMS is fine: 52°31'N 13°24'E. A list 1,234,567 and [0,1000].`,
      "Run git grep -nIE 'BEGIN [A-Z ]*PRIVATE KEY|client_secret|refresh_token' before tagging.",
      `SIMCTL_CHILD_AppCheckDebugToken="$(cat .appcheck-debug-token)" xcrun simctl launch ${uuid().toUpperCase()} <BUNDLE_ID>`,
      `A tiny test image: ${'data:'}image/jpeg;base64,${'/9j/'}4AAQ and ${'data:'}image/jpeg;base64,QUJD.`,
      `Clean base64 images: ${'data:'}image/png;base64,${png().toString('base64')} ${jpeg().toString('base64')} ${webp(wchunk('VP8L', Buffer.alloc(5))).toString('base64')}`,
      '',
    ].join('\n'));
    w('web/src/ui/icon.svg', `<svg viewBox="0 0 24.0000 24.0000"><path d="M10.5858 13.4142L4.2929 7.1213C3.9024 6.7308 3.9024 6.0976 4.2929 5.7071z"/><polygon points="1.2345,6.7891 2.3456,7.8912"/></svg>\n`);
    w('web/src/firebase/config.ts', `export const firebaseConfig = { apiKey: '${'AIza'}Sy${'x'.repeat(33)}', projectId: 'demo' };\n`);
    w('ios/StrangersEyes/Resources/GoogleService-Info.plist', `<plist><dict><key>API_KEY</key><string>${'AIza'}Sy${'y'.repeat(33)}</string></dict></plist>\n`);
    w('docs/firebase.md', `The web key is ${'AIza'}Sy${'x'.repeat(33)} (public).\n`);
    w('docs/utf16.txt', utf16('plain UTF-16 text, nothing to see\n'));
    w('benchmark/README.md', 'Only aggregates are committed.\n');
    w('benchmark/aggregate.mjs', `const R = ${c(6371, '0088')};\nexport const edge = (km) => km <= 0.25;\n`);
    symlinkSync('notes.md', join(dir, 'docs/link.md'));
    symlinkSync('../ios/.appcheck-debug-token', join(dir, 'docs/token-link')); // inside the tree, never followed
    g('add', '-A');
    const trackedAtStart = new Set(git(dir, ['ls-files', '-z'], env).stdout.toString('utf8').split('\0').filter(Boolean));
    const clean = check(dir, { env });
    if (clean.violations.length) throw new Error(`clean fixture produced violations: ${JSON.stringify(clean.violations, null, 1)}`);
    if (clean.warnings.length) throw new Error(`clean fixture produced warnings: ${clean.warnings.join('; ')}`);

    const pem = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
    const pgp = ['-----BEGIN PGP', 'PRIVATE KEY BLOCK-----'].join(' ');
    const XMP = 'http://ns.adobe.com/xap/1.0/\0';
    const exifJpeg = jpeg(seg(0xe1, L('Exif\0\0MM\0*\0\0\0\x08')));
    const mpfJpeg = jpeg(seg(0xe1, L('MPF\0\x01\x02'))); // APP1 without any signature: only a parse finds it
    const dataUri = (b) => `${'data:'}image/jpeg;base64,${b.toString('base64')}`;
    const tflite = (...x) => Buffer.concat([Buffer.from([0x1c, 0, 0, 0]), L('TFL3'), Buffer.alloc(8), ...x, Buffer.alloc(8)]);
    const allowWith = (entries) => JSON.stringify({ entries });
    const geoOk = { file: 'web/src/core/geo.test.ts', values: [c(52, '5201')], why: 'public Berlin reference point (fixture)' };
    const signOk = { file: 'docs/signed.md', values: [c(33, '8688')], why: 'an unsigned value only (sign fixture)' };
    // [rule, file, body, how, msgIncludes]. how: 'force' (git add -f: a tracked file that .gitignore would hide) |
    // 'link' | 'exclude' (body = .gitignore, plus a .git/info/exclude) | 'stage' (body = [staged, then work tree or
    // null = deleted]) | 'force-stage' (the same with git add -f) | 'stage-link'. Other cases stay untracked (or, for a
    // fixture file, differ from its staged blob), which the scan covers too.
    const planted = [
      ['I1-jpeg-metadata', 'web/public/samples/judge-02.jpg', exifJpeg],
      ['I1-jpeg-metadata', 'web/public/samples/xmp.jpg', jpeg(seg(0xe1, L(XMP)))],
      ['I1-jpeg-metadata', 'web/public/samples/iptc.jpg', jpeg(seg(0xed, L('Photoshop 3.0\0')))],
      ['I1-jpeg-metadata', 'web/public/samples/app1-plain.jpg', mpfJpeg, undefined, 'APP1'],
      ['I1-jpeg-metadata', 'web/public/samples/app13-plain.jpg', jpeg(seg(0xed, L('Adobe_CM\0\x01'))), undefined, 'APP13'],
      ['I1-jpeg-metadata', 'web/public/samples/c2pa.jpg', jpeg(seg(0xeb, L('JP\0\0\0\0\0\x01jumb'))), undefined, 'APP11'],
      ['I1-jpeg-metadata', 'web/public/samples/app4.jpg', jpeg(seg(0xe4, L(`${c(52, '520008')} ${c(13, '404954')}`)))],
      ['I1-jpeg-metadata', 'web/public/samples/app12.jpg', jpeg(seg(0xec, L('Ducky\0\x01\0\0')))],
      ['I1-jpeg-metadata', 'web/public/samples/app2-mpf.jpg', jpeg(seg(0xe2, L('MPF\0II*\0')))],
      ['I1-jpeg-metadata', 'web/public/samples/app0-other.jpg', jpeg(seg(0xe0, L('AVI1\0\0\0\0')))],
      ['I1-jpeg-metadata', 'web/public/samples/app14-other.jpg', jpeg(seg(0xee, L('Other\0\0')))],
      ['I1-jpeg-metadata', 'web/public/samples/between-scans.jpg', Buffer.concat([SOI, APP0, DQT, SOF, SOS, SCAN, seg(0xe1, L(XMP)), SOS, SCAN, EOI])],
      ['I1-jpeg-metadata', 'web/public/samples/com.jpg', jpeg(seg(0xfe, L('GPS fix near the harbour'))), undefined, 'COM'],
      ['I1-jpeg-metadata', 'web/public/samples/sig.jpg', Buffer.concat([jpeg().subarray(0, -2), L('Exif\0\0'), EOI]), undefined, 'signature'],
      ['I1-jpeg-metadata', 'web/public/samples/motion.jpg', Buffer.concat([jpeg(), L('\0\0\0\x18ftypmp42')])],
      ['I1-jpeg-metadata', 'web/src/dev/fixtures/photo.bin', jpeg(seg(0xe1, L('Exif\0\0II*\0')))],
      ['I5-malformed-image', 'web/public/samples/trunc.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a])],
      ['I5-malformed-image', 'web/public/samples/noeoi.jpg', Buffer.concat([SOI, APP0, SOS, SCAN])],
      ['I5-malformed-image', 'web/public/samples/fake.jpg', 'not a jpeg\n'],
      ['I5-malformed-image', 'web/public/icons/fake.png', jpeg()],
      ['I5-malformed-image', 'web/public/icons/trunc.png', png().subarray(0, 40)],
      ['I5-malformed-image', 'web/public/img/trunc.webp', webp(wchunk('VP8L', Buffer.alloc(5))).subarray(0, 22)],
      ['I2-png-metadata', 'web/public/icons/text.png', png(chunk('tEXt', L('Comment\0hello')))],
      ['I2-png-metadata', 'web/public/icons/itxt.png', png(chunk('iTXt', L('XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta/>')))],
      ['I2-png-metadata', 'web/public/icons/ztxt.png', png(chunk('zTXt', L('Raw profile type exif\0\0x')))],
      ['I2-png-metadata', 'web/public/icons/exif.png', png(chunk('eXIf', L('MM\0*\0\0\0\x08')))],
      ['I2-png-metadata', 'web/public/icons/exif-lower.png', png(chunk('exIf', L('MM\0*\0\0\0\x08')))],
      ['I2-png-metadata', 'web/public/icons/c2pa.png', png(chunk('caBX', L('jumb')))],
      ['I2-png-metadata', 'web/public/icons/vendor.png', png(chunk('vpAg', Buffer.alloc(9)))],
      ['I2-png-metadata', 'web/public/icons/trailer.png', Buffer.concat([png(), L('Exif\0\0')]), undefined, 'after IEND'],
      ['I3-webp-metadata', 'web/public/img/exif.webp', webp(wchunk('VP8L', Buffer.alloc(5)), wchunk('EXIF', L('MM\0*')))],
      ['I3-webp-metadata', 'web/public/img/xmp.webp', webp(wchunk('VP8L', Buffer.alloc(5)), wchunk('XMP ', L('<x:xmpmeta/>')))],
      ['I3-webp-metadata', 'web/public/img/c2pa.webp', webp(wchunk('VP8L', Buffer.alloc(5)), wchunk('C2PA', L('jumb')))],
      ['I3-webp-metadata', 'web/public/img/unknown.webp', webp(wchunk('VP8L', Buffer.alloc(5)), wchunk('ABCD', L('zz')))],
      ['I4-image-format', 'docs/img/photo.heic', Buffer.concat([L('\0\0\0\x18ftypheic'), Buffer.alloc(16)])],
      ['I4-image-format', 'docs/img/clip.bin', Buffer.concat([L('\0\0\0\x14ftypqt  '), Buffer.alloc(16)])],
      ['I4-image-format', 'docs/img/anim.gif', Buffer.concat([L('GIF89a'), Buffer.alloc(16)])],
      ['I4-image-format', 'docs/img/scan.tiff', Buffer.concat([L('II*\0'), Buffer.alloc(16)])],
      ['I4-image-format', 'docs/img/be.bin', Buffer.concat([L('MM\0*'), Buffer.alloc(16)])],
      ['I4-image-format', 'docs/img/a.bin', Buffer.concat([JXL_SIG, Buffer.alloc(8)]), undefined, 'JPEG XL'],
      ['I4-image-format', 'docs/img/b.bin', Buffer.from([0xff, 0x0a, 0, 0, 0, 0]), undefined, 'JPEG XL'],
      ['I4-image-format', 'docs/img/c.bin', Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(12)]), undefined, 'Matroska'],
      ['I4-image-format', 'docs/img/d.bin', Buffer.concat([L('RIFF\0\0\0\0AVI '), Buffer.alloc(8)]), undefined, 'AVI'],
      ['I4-image-format', 'docs/img/e.bin', Buffer.concat([L('BM'), Buffer.alloc(16)]), undefined, 'BMP'],
      ['I4-image-format', 'docs/img/raw.dng', 'renamed text\n'],
      ['I4-image-format', 'docs/img/x.heic', 'renamed text\n'],
      ['I4-image-format', 'docs/img/x.avif', 'renamed text\n'],
      ['I4-image-format', 'docs/img/x.mov', 'renamed text\n'],
      ['I4-image-format', 'docs/img/x.mp4', 'renamed text\n'],
      ['I4-image-format', 'docs/a.xmp', '<x:xmpmeta/>\n'],
      ['I4-image-format', 'web/public/favicon.ico', Buffer.concat([Buffer.from([0, 0, 1, 0, 1, 0]), Buffer.alloc(16)])],
      // I6/I7: binaries the scanner cannot read, and images hidden inside other files
      ['I6-unknown-binary', 'docs/deck.pdf', Buffer.concat([L('%PDF-1.4\n'), Buffer.alloc(4), L('\n%%EOF\n')])],
      ['I6-unknown-binary', 'docs/pins.json.gz', Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3, 1, 2])],
      ['I6-unknown-binary', 'docs/log.txt', `\0header\nlat ${c(52, '520008')}\n`],
      ['I6-unknown-binary', 'web/src/core/late-nul.ts', `${'// x\n'.repeat(2500)}\0\n`],
      ['I7-hidden-image', 'web/src/dev/fixtures/p.bin', Buffer.concat([Buffer.from([0]), mpfJpeg]), undefined, 'embedded JPEG'],
      ['I7-hidden-image', 'web/public/models/hidden.tflite', tflite(mpfJpeg), undefined, 'embedded JPEG'],
      ['I7-hidden-image', 'web/public/models/hidden2.tflite', tflite(png(chunk('tEXt', L('a\0b')))), undefined, 'embedded PNG'],
      ['I7-hidden-image', 'web/public/models/sig.tflite', tflite(L('Exif\0\0MM\0*')), undefined, 'signature'],
      ['I7-hidden-image', 'web/public/models/xmp.wasm', Buffer.concat([L('\0asm'), Buffer.alloc(4), L('<x:xmpmeta/>')]), undefined, 'signature'],
      ['I7-hidden-image', 'web/public/icons/inside.png', png(chunk('IDAT', Buffer.concat([Buffer.from([1, 0, 0, 0xff, 0xff]), mpfJpeg]))), undefined, 'embedded JPEG'],
      ['I7-hidden-image', 'web/src/tier0/fixture.ts', `export const img = '${dataUri(mpfJpeg)}';\n`],
      ['I7-hidden-image', 'docs/sample.md', `![s](${dataUri(exifJpeg)})\n`],
      ['I7-hidden-image', 'web/src/tier0/fx.json', `{ "b64": "${mpfJpeg.toString('base64')}" }\n`],
      ['I7-hidden-image', 'web/src/tier0/fx2.json', `{ "b64": "${png(chunk('tEXt', L('a\0b'))).toString('base64')}" }\n`],
      ['I7-hidden-image', 'web/src/tier0/fx3.json', `{ "b64": "${webp(wchunk('VP8L', Buffer.alloc(5)), wchunk('EXIF', L('MM\0*'))).toString('base64')}" }\n`],
      ['I7-hidden-image', 'web/src/tier0/fx4.md', `${'data:'}image/heic;base64,${Buffer.concat([L('\0\0\0\x18ftypheic'), Buffer.alloc(8)]).toString('base64')}\n`],
      ['B1-benchmark-pixels', 'benchmark/results/chart.png', png()],
      ['B1-benchmark-pixels', 'benchmark/model.tflite', tflite()],
      ['B1-benchmark-pixels', 'benchmark/raw.sqlite', Buffer.concat([L('SQLite format 3\0'), Buffer.alloc(16)])],
      ['B1-benchmark-pixels', 'benchmark/summary.md', `![x](${'data:'}image/png;base64,${'iVBORw0KGgo'}=)\n`],
      ['B1-benchmark-pixels', 'benchmark/raw.txt', `${'QUJD'.repeat(60)}\n`],
      ['C1-coordinate', 'web/src/core/pins.ts', `export const home = { lat: ${c(52, '123456')}, lng: ${c(13, '456789')} };\n`],
      ['C1-coordinate', 'docs/trip.md', `Taken at ${c(-33, '8688')}, ${c(151, '2093')}.\n`],
      ['C1-coordinate', 'docs/lng.md', `lng ${c(151, '2093')}\n`, undefined, c(151, '2093')], // a longitude 100-180 alone
      ['C1-coordinate', 'docs/signed.md', `Signed: ${c(-33, '8688')}.\n`], // the allowlist has the unsigned value only
      ['C1-coordinate', 'docs/geo.md', `N${c(48, '85837')} E${c(2, '294481')}\n`],
      ['C1-coordinate', 'docs/doi.md', `lat ${c(10, '1145')}, not a DOI\n`],
      ['C1-coordinate', 'docs/pad.md', `lng 0${c(13, '404954')}\n`],
      ['C1-coordinate', 'docs/comma.md', `Lat ${c(52, '520008').replace('.', ',')} / Lng ${c(13, '404954').replace('.', ',')}\n`],
      ['C1-coordinate', 'docs/dms.md', `${52}°31'12.03"N ${13}°24'17.83"E\n`],
      ['C1-coordinate', 'docs/dmm.md', `${52}° 31.205' N\n`],
      ['C1-coordinate', 'docs/xmp.md', `<rdf:Description exif:GPSLatitude="${52},31.2N"/>\n`],
      ['C1-coordinate', 'docs/zeros.md', `lat ${c(52, '520800')}\n`],
      ['C1-coordinate', 'research/points.csv', `id,lat,lng\n1,${c(40, '7128')},${c(-74, '0060')}\n`],
      ['C1-coordinate', 'research/pins16.csv', utf16(`id,lat,lng\n1,${c(52, '520008')},${c(13, '404954')}\n`)],
      ['C1-coordinate', 'research/pins16be.csv', Buffer.from(utf16(`lat ${c(52, '520008')}\n`)).swap16()],
      ['C1-coordinate', 'research/noise.json', `{ "lat": ${c(52, '123400000000001')} }\n`],
      ['C1-coordinate', 'shared/strings/en.json', `{ "copy.x": "near ${c(51, '5007')}" }\n`],
      ['C1-coordinate', 'web/public/samples/sub/scene.json', `{ "lat": ${c(41, '9028')} }\n`],
      ['C1-coordinate', 'shared/testvectors/sub/x.json', `{ "lat": ${c(41, '9028')} }\n`],
      ['C1-coordinate', 'docs/package-lock.json', `{ "lat": ${c(41, '9028')} }\n`],
      ['C1-coordinate', 'benchmark/yarn.lock', `lat ${c(41, '9028')}\n`],
      ['C1-coordinate', 'web/src/ui/pin.svg', `<svg><text x="1">${c(41, '9028')}</text><path d="M1 1"/></svg>\n`],
      ['C1-coordinate', 'benchmark/spike/score.mjs', `export const truth = [${c(35, '6762')}, ${c(139, '6503')}];\n`],
      ['C1-coordinate', 'web/src/core/other.test.ts', `const p = [${c(52, '5201')}, 13.405];\n`], // allowlisted, but for another file
      ['C1-coordinate', 'web/src/core/geo.test.ts', `const near = [${c(52, '5201')}, ${c(13, '4049')}];\n`], // a new value in an allowlisted file
      ['C1-coordinate', ALLOW_FILE, allowWith([{ ...geoOk, file: 'web/src/*.ts' }, signOk]), undefined, 'entries[0]'],
      ['C1-coordinate', ALLOW_FILE, allowWith([{ ...geoOk, file: 'web/../web/src/core/geo.test.ts' }, signOk]), undefined, 'entries[0]'],
      ['C1-coordinate', ALLOW_FILE, allowWith([{ ...geoOk, why: 'short reason' }, signOk]), undefined, 'entries[0]'],
      ['C1-coordinate', ALLOW_FILE, allowWith([{ ...geoOk, values: [] }, signOk]), undefined, 'entries[0]'],
      ['C1-coordinate', ALLOW_FILE, allowWith([geoOk, signOk, { ...geoOk, why: 'the same file a second time, on purpose' }]), undefined, 'entries[2] repeats'],
      ['C1-coordinate', ALLOW_FILE, allowWith([{ ...geoOk, why: `home is at ${c(52, '1111')}` }, signOk])],
      ['C1-coordinate', ALLOW_FILE, '{ "entries": [ '],
      ['P1-private-path', 'benchmark/private/raw.json', '{}\n', 'force'],
      ['P1-private-path', 'bench/truth.csv', 'id,band\n1,street\n'],
      ['P1-private-path', 'data/Truth-2026-11.CSV', 'id\n'],
      ['P1-private-path', 'notes/StrangersEyes-private/spike/a.txt', 'x\n'],
      ['S1-secret-path', 'web/.env.development.local', `VITE_APPCHECK_DEBUG_TOKEN=${uuid()}\n`, 'force'],
      ['S1-secret-path', '.env', 'X=1\n', 'force'],
      ['S1-secret-path', 'web/.env.production', 'X=1\n', 'force'],
      ['S1-secret-path', 'docs/.env.sample', 'X=1\n', 'force'],
      ['S1-secret-path', 'web/.env-local', `TOKEN=${uuid()}\n`],
      ['S1-secret-path', '.envrc', `export KEY=${uuid()}\n`],
      ['S1-secret-path', 'ios/.appcheck-debug-token', `${uuid()}\n`, 'force'],
      ['S1-secret-path', 'ios/appcheck-debug-token.txt', `${uuid()}\n`],
      ['S1-secret-path', 'ios/Config/Secrets.xcconfig', 'X = 1\n', 'force'],
      ['S1-secret-path', 'config/app.secret.json', '{}\n', 'force'],
      ['S1-secret-path', 'config/secrets.json', `{ "token": "${uuid()}" }\n`],
      ['S1-secret-path', 'keys/service-account.json', '{}\n'],
      ['S1-secret-path', 'keys/demo-firebase-adminsdk-x1.json', '{}\n'],
      ['S1-secret-path', 'certs/dev.pem', 'x\n'],
      ['S1-secret-path', 'certs/AuthKey_ABC.p8', 'x\n'],
      ['S1-secret-path', 'certs/dist.p12', Buffer.from([0x30, 0x82, 0, 0])],
      ['S2-secret-not-ignored', '.gitignore', FIXTURE_GITIGNORE.replace('.env.*\n', '').replace('*.local\n', '')],
      ['S2-secret-not-ignored', '.gitignore', FIXTURE_GITIGNORE.replace('benchmark/private/\n', ''), undefined, 'benchmark/private/raw.json'],
      ['S2-secret-not-ignored', '.gitignore', FIXTURE_GITIGNORE.replace('ios/.appcheck-debug-token\n', ''), undefined, 'ios/.appcheck-debug-token'],
      ['S2-secret-not-ignored', '.gitignore', FIXTURE_GITIGNORE.replace('ios/Config/Secrets.xcconfig\n', ''), undefined, 'ios/Config/Secrets.xcconfig'],
      ['S2-secret-not-ignored', '.gitignore', `${FIXTURE_GITIGNORE}!web/.env.production.local\n`, undefined, 'web/.env.production.local'],
      ['S2-secret-not-ignored', '.gitignore', FIXTURE_GITIGNORE.replace('.env.*\n', '').replace('*.local\n', ''), 'exclude', 'which is not committed'],
      ['S3-secret-content', 'web/src/core/key.ts', `export const k = \`${pem}\nMIIE\`;\n`],
      ['S3-secret-content', 'docs/k.asc', `${pgp}\nlQOYBF\n`],
      ['S3-secret-content', 'config/gcp.json', `{ "type": "${'service'}_account", "project_id": "demo" }\n`],
      ['S3-secret-content', 'config/k.json', `{ "private${'_'}key": "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC" }\n`],
      ['S3-secret-content', 'config/oauth.json', `{ "web": { "client_id": "x", "secret": "${'GOCSPX'}-${'a'.repeat(28)}" } }\n`],
      ['S3-secret-content', 'config/token.json', `{ "refresh${'_'}token": "${'1//0'}${'b'.repeat(40)}" }\n`],
      ['S3-secret-content', 'docs/t.md', `Authorization: Bearer ${'ya29'}.${'a0AfH6SM'}${'x'.repeat(30)}\n`],
      ['S3-secret-content', 'web/src/firebase/debug.ts', `self.FIREBASE_APPCHECK_DEBUG_TOKEN = '${uuid()}';\n`],
      ['S3-secret-content', 'ios/StrangersEyes.xcodeproj/xcshareddata/xcschemes/S.xcscheme', `<EnvironmentVariable\n   key = "AppCheckDebugToken"\n   value = "${uuid().toUpperCase()}"\n   isEnabled = "YES">\n`],
      ['S3-secret-content', 'ios/StrangersEyes/Info.plist', `<dict><key>FIRAAppCheck${'DebugToken'}</key><string>${uuid()}</string></dict>\n`, undefined, 'near'],
      ['S3-secret-content', 'docs/t3.md', `| App Check ${'debug token'} | ${uuid()} |\n`, undefined, 'near'],
      ['S3-secret-content', 'ios/StrangersEyes/App.swift', `let t = env["FIRAAppCheck${'DebugToken'}"] ?? "${uuid()}"\n`, undefined, 'near'],
      ['S3-secret-content', 'web/.env.example', `VITE_APPCHECK_DEBUG_TOKEN=${uuid()}\nVITE_FAKE_AI=0\n`],
      ['S3-secret-content', 'web/.env.e2e', `VITE_FAKE_AI=1\nVITE_OTHER=${uuid()}\n`, undefined, 'a UUID in a committed .env file'],
      ['S3-secret-content', 'docs/ci.md', `token: ${'ghp'}_${'c'.repeat(36)}\n`],
      ['S3-secret-content', 'docs/ci2.md', `token: ${'github'}_pat_${'c'.repeat(40)}\n`, undefined, 'GitHub'],
      ['S3-secret-content', 'web/src/core/aws.ts', `export const k = '${'AKIA'}ABCDEFGHIJKLMNOP';\n`],
      ['S3-secret-content', 'docs/slack.md', `${'xoxb'}-${'1'.repeat(12)}\n`, undefined, 'Slack token'],
      ['S3-secret-content', 'docs/hook.md', `${'https://hooks.slack.com'}/services/T0000/B0000/${'X'.repeat(24)}\n`, undefined, 'webhook'],
      ['S3-secret-content', 'docs/stripe.md', `${'sk'}_live_${'s'.repeat(24)}\n`, undefined, 'Stripe'],
      ['S3-secret-content', 'scripts/x.mjs', `const k = '${'sk-ant'}-${'d'.repeat(24)}';\n`],
      ['S3-secret-content', 'docs/t2.md', `OPENAI_API_KEY=${'sk-proj'}-${'z'.repeat(40)}\n`, undefined, 'OpenAI'],
      ['S3-secret-content', 'docs/npm.md', `${'npm'}_${'Y'.repeat(36)}\n`, undefined, 'npm token'],
      ['S3-secret-content', '.npmrc', `//registry.npmjs.org/:${'_authToken'}=\${NPM_TOKEN}\n`, undefined, '.npmrc'],
      ['S3-secret-content', 'docs/t5.md', `token: ${'eyJ'}hbGciOiJSUzI1NiJ9.${'e'.repeat(40)}.${'s'.repeat(40)}\n`, undefined, 'JWT'],
      ['S3-secret-content', 'docs/gemini.md', `GEMINI_API_KEY=${'AIza'}Sy${'z'.repeat(33)}\n`, undefined, 'AIza'],
      ['S3-secret-content', 'web/src/firebase/config.ts', `export const firebaseConfig = { apiKey: '${'AIza'}Sy${'x'.repeat(33)}', projectId: 'demo' };\nexport const gemini = '${'AIza'}Sy${'w'.repeat(33)}';\n`, undefined, 'AIza'],
      ['L1-symlink', 'docs/out.md', '/etc/hosts', 'link'],
      ['L1-symlink', 'docs/out2.md', '../../outside.txt', 'link'],
      // the index, not the work tree, is what `git commit` takes
      ['I1-jpeg-metadata', 'web/public/samples/staged.jpg', [exifJpeg, jpeg()], 'stage', 'staged copy'],
      ['C1-coordinate', 'web/src/core/staged.ts', [`export const p = [${c(52, '520008')}];\n`, 'export const p = [0.5];\n'], 'stage', 'staged copy'],
      ['I1-jpeg-metadata', 'web/public/samples/staged-gone.jpg', [exifJpeg, null], 'stage'],
      ['S1-secret-path', 'ios/.appcheck-debug-token', [`${uuid()}\n`, null], 'force-stage'],
      ['L1-symlink', 'docs/staged-link.md', ['../../outside.txt', null], 'stage-link'],
    ];
    for (const [rule, rel, body, how, msgIncludes] of planted) {
      const p = join(dir, rel);
      const had = existsSync(p) ? readFileSync(p) : null;
      const staging = how && how !== 'link';
      const exclude = join(dir, '.git/info/exclude');
      const hadExclude = existsSync(exclude) ? readFileSync(exclude) : null;
      if (how === 'link') symlinkSync(body, p);
      else if (how === 'stage' || how === 'force-stage') {
        w(rel, body[0]); g('add', ...(how === 'force-stage' ? ['-f'] : []), '--', rel);
        if (body[1] === null) unlinkSync(p); else w(rel, body[1]);
      } else if (how === 'stage-link') {
        mkdirSync(dirname(p), { recursive: true }); symlinkSync(body[0], p); g('add', '--', rel); unlinkSync(p);
      } else {
        w(rel, body);
        if (how === 'exclude') writeFileSync(exclude, '.env.*\n*.local\n');
        if (how === 'force') g('add', '-f', '--', rel);
      }
      const v = check(dir, { env }).violations;
      const hit = v.filter((x) => x.rule === rule && x.file === rel && (!msgIncludes || x.msg.includes(msgIncludes)));
      if (!hit.length) failures.push(`${rule} did not fire on ${rel}${msgIncludes ? ` with "${msgIncludes}"` : ''}: ${JSON.stringify(String(body).slice(0, 120))} → ${JSON.stringify(v.filter((x) => x.file === rel))}`);
      // a secret path is reported without being read: no content rule may fire on it
      if (rule === 'S1-secret-path' && v.some((x) => x.file === rel && x.rule !== 'S1-secret-path')) failures.push(`${rel} was read: ${JSON.stringify(v.filter((x) => x.file === rel))}`);
      // restore: the file, its index entry and .git/info/exclude
      if (existsSync(p) || how === 'link') rmSync(p, { force: true });
      if (had !== null) writeFileSync(p, had);
      if (staging && trackedAtStart.has(rel)) g('add', '-f', '--', rel);
      else if (staging) g('rm', '-q', '--cached', '-f', '--ignore-unmatch', '--', rel);
      if (hadExclude === null) rmSync(exclude, { force: true }); else writeFileSync(exclude, hadExclude);
    }
    // the symlinked secret inside the tree is never read (its token would trip S3)
    if (check(dir, { env }).violations.some((x) => x.file === 'docs/token-link')) failures.push('docs/token-link was followed');
    // a failing git fails the scan
    const nogit = mkdtempSync(join(tmpdir(), 'se-images-nogit-'));
    try {
      let threw = false;
      try { check(nogit, { env }); } catch { threw = true; }
      if (!threw) failures.push('check() did not throw outside a git work tree');
    } finally { rmSync(nogit, { recursive: true, force: true }); }
    const bad = check(dir, { env, mustIgnore: ['../outside'] }).violations;
    if (!bad.some((x) => x.rule === 'S2-secret-not-ignored' && x.msg.includes('git check-ignore failed'))) failures.push('a failing git check-ignore was not reported');
    const after = check(dir, { env });
    if (after.violations.length) failures.push(`fixture not restored: ${JSON.stringify(after.violations)}`);
    if (failures.length) throw new Error(failures.join('\n'));
    return planted.length + 3;
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
  console.log('check-images: ok (no image metadata, hidden images, unknown binaries, coordinates, private paths or secrets)');
}
