// web/src/vault/judgeVault.ts: Judge Mode's FAKE vault and its sample manifest (SPEC SCR-17, D-12, D-37; ARCH §5.4,
// AD-09, AD-17; T-105). In memory only: nothing here is ever written to storage, logged or sent. The real vault is
// never read here (this module does not import vaultStore): entering Judge Mode makes JUDGE_VAULT the ACTIVE vault of
// ai/vaultScan (Tier-0, preflight, the gate and the tripwire then scan only it), leaving it calls vaultScan.useReal().
//   - parseJudgeManifest: the bundled /samples/manifest.json, validated strictly (null on any defect). The gate keeps its
//     own frozen copy of the hashes (egressGate.parseSampleManifest, D-131); this is the UI's view of the same file.
//   - makeJudgeVault: home_pin "Home" (generic label: no text term), work_pin "City General Hospital", child_name
//     "Lucas", plate "SE 1234"; pins from the manifest, rounded to 3 decimals (D-26). Frozen: the gate's S4 proof
//     compares this object by identity (AC-023).
//   - claimJudge / activateJudgeVault: the Judge screen's claim on Judge Mode and the switch to the fake vault. The last
//     released claim exits Judge Mode on the next tick, so StrictMode's remount in DEV never unseals the real vault (D-37).
import type { VaultItem } from '../core/types';

export interface JudgePinIn { lat: number; lng: number }
export interface JudgeSample {
  id: string;
  title: string;
  /** A synthetic stand-in until the T-010 photos replace it (D-150). */
  placeholder: boolean;
  image: string;
  imageSha256: string;
  nano768: string;
  nano768Sha256: string;
  /** Recorded pass B on the default-masked sample (the CACHED fallback, AD-09). */
  cachedAdvB: string;
  /** Recorded pass B on the sample after the default fix (the CACHED re-attack, D-150). */
  cachedAdvBFixed: string;
  recordedAt: string;
  model: string;
}
export interface JudgeManifest {
  placeholder: boolean;
  fakeVault: { homePin: JudgePinIn; workPin: JudgePinIn };
  samples: readonly JudgeSample[];
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const SAMPLE_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** A sample file name in /samples/ (no path, no query): only these are ever fetched. */
const SAMPLE_FILE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,63}\.(jpg|json)$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

function pinIn(v: unknown): JudgePinIn | null {
  if (!isObj(v) || typeof v.lat !== 'number' || typeof v.lng !== 'number') return null;
  if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng) || Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180) return null;
  return { lat: v.lat, lng: v.lng };
}

/** The manifest, or null when anything is missing, malformed or duplicated (the Judge screen then shows an error). */
export function parseJudgeManifest(json: unknown): JudgeManifest | null {
  if (!isObj(json) || json.version !== 1 || !isObj(json.fakeVault) || !Array.isArray(json.samples) || json.samples.length === 0) return null;
  const homePin = pinIn(json.fakeVault.homePin);
  const workPin = pinIn(json.fakeVault.workPin);
  if (!homePin || !workPin) return null;
  const samples: JudgeSample[] = [];
  const ids = new Set<string>();
  for (const s of json.samples as unknown[]) {
    if (!isObj(s)) return null;
    const { id, title, image, imageSha256, nano768, nano768Sha256, cachedAdvB, cachedAdvBFixed, recordedAt, model } = s;
    if (!str(id) || !SAMPLE_ID.test(id) || ids.has(id) || !str(title) || !str(recordedAt, 40) || !str(model, 120)) return null;
    if (!str(imageSha256) || !SHA256_HEX.test(imageSha256) || !str(nano768Sha256) || !SHA256_HEX.test(nano768Sha256)) return null;
    for (const f of [image, nano768, cachedAdvB, cachedAdvBFixed]) if (!str(f) || !SAMPLE_FILE.test(f)) return null;
    ids.add(id);
    samples.push(Object.freeze({
      id, title, placeholder: s.placeholder === true, image: image as string, imageSha256, nano768: nano768 as string, nano768Sha256,
      cachedAdvB: cachedAdvB as string, cachedAdvBFixed: cachedAdvBFixed as string, recordedAt, model,
    }));
  }
  return Object.freeze({ placeholder: json.placeholder === true, fakeVault: Object.freeze({ homePin, workPin }), samples: Object.freeze(samples) });
}

/** D-26: sample pins are rounded to 3 decimals (about 100 m). */
export const round3 = (x: number): number => Math.round(x * 1000) / 1000;

export const JUDGE_IDS = Object.freeze({ home: 'judge-home', work: 'judge-work', child: 'judge-child', plate: 'judge-plate' });

/** A new, frozen fake vault (each call a new object: Exit discards it, and the gate checks identity). */
export function makeJudgeVault(m: Pick<JudgeManifest, 'fakeVault'>): readonly VaultItem[] {
  const pin = (p: JudgePinIn) => Object.freeze({ lat: round3(p.lat), lng: round3(p.lng), accuracyM: 0, capturedAt: 0, source: 'synthetic' as const });
  const item = (v: VaultItem): VaultItem => Object.freeze({ ...v, aliases: Object.freeze([...v.aliases]) as string[] });
  return Object.freeze([
    item({ id: JUDGE_IDS.home, kind: 'home_pin', label: 'Home', aliases: [], pin: pin(m.fakeVault.homePin), createdAt: 0 }),
    item({ id: JUDGE_IDS.work, kind: 'work_pin', label: 'City General Hospital', aliases: [], pin: pin(m.fakeVault.workPin), createdAt: 0 }),
    item({ id: JUDGE_IDS.child, kind: 'child_name', label: 'Lucas', aliases: [], createdAt: 0 }),
    item({ id: JUDGE_IDS.plate, kind: 'plate', label: 'SE 1234', aliases: [], createdAt: 0 }),
  ]);
}

/** The URL of a sample file (same origin, /samples/ only). */
export const sampleUrl = (file: string): string => {
  if (!SAMPLE_FILE.test(file)) throw new Error('judgeVault: not a sample file name');
  return `/samples/${file}`;
};

/** Fetch and parse the bundled manifest (null when it cannot be read or is invalid). */
export async function loadJudgeManifest(fetchFn: typeof fetch = fetch): Promise<JudgeManifest | null> {
  try {
    const res = await fetchFn('/samples/manifest.json', { cache: 'no-cache' });
    return res.ok ? parseJudgeManifest(await res.json()) : null;
  } catch {
    return null;
  }
}

/** What holdJudge needs of ai/vaultScan (structural, so tests pass a fake). */
export interface JudgeScan {
  mode(): string;
  judgeVault(): readonly VaultItem[] | null;
  useJudge(vault: readonly VaultItem[]): Promise<void>;
  useReal(): Promise<void>;
}

let holders = 0;
/**
 * The Judge screen's claim on Judge Mode, taken when it mounts. The last release exits Judge Mode (vaultScan.useReal:
 * the real index is rebuilt) on the next tick, unless a new claim arrived meanwhile: React StrictMode's mount → unmount →
 * mount in DEV must not unseal the real vault in between (D-37).
 */
export function claimJudge(scan: Pick<JudgeScan, 'mode' | 'useReal'>, defer: (fn: () => void) => void = (fn) => { setTimeout(fn, 0); }): () => void {
  holders++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders--;
    defer(() => { if (holders === 0 && scan.mode() === 'judge') void scan.useReal(); });
  };
}
/** Make `vault` the ACTIVE vault (once per object; the real vault's terms and pins are dropped from memory). */
export function activateJudgeVault(scan: Pick<JudgeScan, 'judgeVault' | 'useJudge'>, vault: readonly VaultItem[]): void {
  if (scan.judgeVault() !== vault) void scan.useJudge(vault);
}
