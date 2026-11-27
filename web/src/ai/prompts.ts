// web/src/ai/prompts.ts: loads the versioned prompt files from shared/prompts and renders them (ARCH §10.1–10.2).
// Template text is static; substituted values are dynamic. The Egress Gate scans only dynamic segments for vault
// strings, and the tripwire strips staticSegments() before scanning a whole request.
// The files are canonical; never inline prompt text in code (CLAUDE.md conventions).

export type PromptSegment = { text: string; dynamic: boolean }; // static = verbatim from a manifest-hashed prompt file

/** Every prompt ID in manifest.json (a test keeps this list equal to the manifest). */
export const PROMPT_IDS = ['advA.v1', 'advB.v1', 'nanoPre.v1', 'nanoVaultText.v1', 'nanoRef.v1', 'nanoFix.v1', 'explain.v1', 'fmPre.v1', 'textProbe.dev1'] as const;
// textProbe.dev1 (D-177): DEV-only research probe ("transcribe all visible text") for the text experiment; never used by the app.
export type PromptId = (typeof PROMPT_IDS)[number];

interface PromptSpec {
  /** false = draft (may still change); true = first recorded run done, files immutable (D-62). */
  released: boolean;
  system?: string[];
  user: string | string[];
  schema?: string;
  schemaBuilder?: string;
  fallback?: string;
  generable?: string;
}
export interface Manifest { manifestVersion: number; files: Record<string, string>; prompts: Record<string, PromptSpec> }

// Eager raw import of the top-level files (fixtures/ is a subfolder and is not matched).
const RAW = import.meta.glob('@prompts/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const FILES: ReadonlyMap<string, string> = new Map(Object.entries(RAW).map(([path, text]) => [path.split('/').pop() as string, text]));

export class PromptError extends Error {
  constructor(message: string) { super(message); this.name = 'PromptError'; }
}

/** Raw file text exactly as stored (used for hashing). */
export function rawFile(name: string): string {
  const t = FILES.get(name);
  if (t === undefined) throw new PromptError(`prompt file missing: ${name}`);
  return t;
}

/** File text without its single trailing newline (files end with exactly one LF). */
export function fileText(name: string): string {
  const t = rawFile(name);
  return t.endsWith('\n') ? t.slice(0, -1) : t;
}

export const MANIFEST: Manifest = JSON.parse(rawFile('manifest.json')) as Manifest;

/**
 * Prompt families whose text can reach the cloud AND is text-scanned by the gate and the tripwire: S3 (advA, advB)
 * and S2 (explain). S0/S1 prompts never reach the cloud, and S4 permits are not text-scanned (R-14), so their
 * template text is never stripped. Every manifest version of these families is included (v1, v2, …).
 */
export const CLOUD_TEXT_FAMILIES = ['advA', 'advB', 'explain'] as const;
export const CLOUD_TEXT_PROMPTS: readonly string[] = Object.keys(MANIFEST.prompts)
  .filter((id) => (CLOUD_TEXT_FAMILIES as readonly string[]).includes(id.split('.')[0]))
  .sort();

/** Non-content string values the SDK puts in every request body (roles, MIME types, thinking levels). */
export const PROTOCOL_STRINGS = ['system', 'user', 'model', 'application/json', 'image/jpeg', 'image/png',
  'MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const;

function spec(id: string): PromptSpec {
  const s = Object.prototype.hasOwnProperty.call(MANIFEST.prompts, id) ? MANIFEST.prompts[id] : undefined;
  if (!s) throw new PromptError(`unknown prompt id: ${id}`);
  return s;
}

const asList = (v: string | string[]) => (Array.isArray(v) ? v : [v]);
const PLACEHOLDER = /\{\{([A-Z0-9_]+)\}\}/g;

/** Placeholder names used by a prompt's user turn, in order of first appearance. */
export function placeholders(id: PromptId): string[] {
  const names: string[] = [];
  for (const f of asList(spec(id).user)) {
    for (const m of fileText(f).matchAll(PLACEHOLDER)) if (!names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

export type PromptVars = Record<string, unknown>;

function valueText(name: string, value: unknown): string {
  if (name.endsWith('_JSON')) {
    const s = JSON.stringify(value);
    if (s === undefined) throw new PromptError(`variable ${name} is not JSON-serialisable`);
    return s;
  }
  if (typeof value !== 'string') throw new PromptError(`variable ${name} must be a string (names ending in _JSON take any JSON value)`);
  return value;
}

/**
 * Render a prompt's user turn. Multiple user files are joined with a newline (explain.v1: rules, then user).
 * Throws if a placeholder has no value or a value matches no placeholder. An empty string means "unknown".
 */
export function render(id: PromptId, vars: PromptVars = {}): PromptSegment[] {
  const used = new Set<string>();
  const out: PromptSegment[] = [];
  const pushStatic = (text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && !last.dynamic) last.text += text;
    else out.push({ text, dynamic: false });
  };
  asList(spec(id).user).forEach((f, idx) => {
    if (idx > 0) pushStatic('\n');
    const tpl = fileText(f);
    let at = 0;
    for (const m of tpl.matchAll(PLACEHOLDER)) {
      const name = m[1];
      pushStatic(tpl.slice(at, m.index));
      if (!Object.prototype.hasOwnProperty.call(vars, name)) throw new PromptError(`${id}: missing variable ${name}`);
      out.push({ text: valueText(name, vars[name]), dynamic: true });
      used.add(name);
      at = (m.index ?? 0) + m[0].length;
    }
    pushStatic(tpl.slice(at));
  });
  const unused = Object.keys(vars).filter((k) => !used.has(k));
  if (unused.length) throw new PromptError(`${id}: unused variable(s) ${unused.join(', ')}`);
  return out;
}

/** Concatenate segments into the final text part. */
export const segmentsText = (segs: readonly PromptSegment[]): string => segs.map((s) => s.text).join('');

/** The S3 system instruction (audit rules + pass rules, newline-joined). Device prompts have none. */
export function systemText(id: PromptId | string): string {
  const sys = spec(id).system;
  if (!sys || !sys.length) throw new PromptError(`${id} has no system part (device-capable prompts carry instructions in the user turn)`);
  return sys.map(fileText).join('\n');
}

export function hasSystem(id: PromptId): boolean {
  return Boolean(spec(id).system?.length);
}

export function isReleased(id: PromptId): boolean {
  return spec(id).released === true;
}

let staticCache: string[] | null = null;
/**
 * Static template text of the CLOUD_TEXT_PROMPTS (user files split at placeholders, plus whole system texts),
 * longest first. The tripwire's vault scan strips these substrings from a text part before scanning it (ARCH §8.4).
 */
export function staticSegments(): string[] {
  if (staticCache) return staticCache;
  const set = new Set<string>();
  for (const id of CLOUD_TEXT_PROMPTS) {
    const s = spec(id);
    for (const f of asList(s.user)) for (const part of fileText(f).split(/\{\{[A-Z0-9_]+\}\}/)) if (part.trim()) set.add(part);
    if (s.system?.length) set.add(systemText(id));
  }
  staticCache = [...set].sort((a, b) => b.length - a.length);
  return staticCache;
}

let nonContentCache: ReadonlySet<string> | null = null;
/**
 * Exact string values that are never user content: every string inside the response schemas of the
 * CLOUD_TEXT_PROMPTS (enum values, descriptions, type names), plus PROTOCOL_STRINGS. The tripwire scan skips a
 * string value only when it EXACTLY equals one of these (never by substring), so a vault label such as
 * "Landmark" or "Medium" does not trip on the schema every pass-B request carries (T-024 review code-1).
 */
export function nonContentStrings(): ReadonlySet<string> {
  if (nonContentCache) return nonContentCache;
  const out = new Set<string>(PROTOCOL_STRINGS);
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
  };
  for (const id of CLOUD_TEXT_PROMPTS) {
    const f = spec(id).schema;
    if (f) walk(JSON.parse(rawFile(f)));
  }
  nonContentCache = out;
  return out;
}

/** explain-fallback.v1.json templates, keyed by clue type (resolve as copy.explain.template.<type>). */
export function explainFallbacks(): Readonly<Record<string, string>> {
  const f = spec('explain.v1').fallback;
  if (!f) throw new PromptError('explain.v1 has no fallback file');
  return (JSON.parse(rawFile(f)) as { templates: Record<string, string> }).templates;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Pure check of bundled top-level files against a manifest: hash mismatches, manifest files that are not bundled,
 * and bundled files missing from the manifest. fixtures/ are not bundled; scripts/check-prompts.mjs covers them.
 */
export async function verifyFiles(files: ReadonlyMap<string, string>, manifest: Manifest): Promise<string[]> {
  const bad: string[] = [];
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (name.includes('/')) continue;
    const t = files.get(name);
    if (t === undefined) { bad.push(`${name}: not bundled`); continue; }
    if ((await sha256Hex(t)) !== expected) bad.push(`${name}: sha256 mismatch`);
  }
  for (const name of files.keys()) {
    if (name !== 'manifest.json' && name !== 'README.md' && !Object.prototype.hasOwnProperty.call(manifest.files, name)) bad.push(`${name}: not in manifest`);
  }
  return bad;
}

/** DEV-time check of the files actually bundled into this build (async: WebCrypto). Returns problems. */
export function verifyManifest(): Promise<string[]> {
  return verifyFiles(FILES, MANIFEST);
}
