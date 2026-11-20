// web/src/ai/vaultScan.ts: the ACTIVE vault's term index and every text scan built on the one matcher (tier0/fuzzy.ts,
// D-38; ARCH §8.4 as fixed by R-15, R-14, D-65). The active vault is the real vault outside Judge Mode, or JUDGE_VAULT in
// Judge Mode; then the real vault is never loaded (D-37, AC-241). Every switch re-registers the tripwire scanner.
// Vault strings and pins live here in memory only: never logged (R9), never persisted, never sent.
import { loadVault } from '../vault/vaultStore';
import { setVaultScanner, type VaultScanner } from './tripwire';
import { CLOUD_TEXT_PROMPTS, fileText, MANIFEST, nonContentStrings, staticSegments } from './prompts';
import {
  clampFuzzyThreshold, DEFAULT_FUZZY_THRESHOLD, findAllInText, firstMatchInText, GENERIC_PIN_LABELS, makeTerm, matchWords,
  normalize, alnum, type MatchMode, type Term, type WordHit, type WordLike,
} from '../tier0/fuzzy';
import { haversineMeters } from '../core/geo';
import { PIN_KINDS, type VaultItem, type VaultKind } from '../core/types';

/** Tripwire hit id: the static text of a device-only prompt (nano*, fmPre) was found in a cloud body (D-65, T-058). */
export const TEMPLATE_CANARY = 'template-canary';
/** Tripwire hit id while the active index is being (re)built or could not be built: fail closed. */
export const VAULT_UNAVAILABLE = 'vault-unavailable';
/** ARCH §8.4: coordinates within 1 km of a pin are PIN_IN_PROMPT. */
export const PIN_RADIUS_M = 1000;

// ---------- the index ----------
export interface PinRef { vaultId: string; kind: VaultKind; lat: number; lng: number }

const isPinKind = (k: VaultKind) => PIN_KINDS.includes(k);
/** D-36 / AC-088: a pin labelled "Home", "Work", "" … contributes no text terms at all (its aliases included). */
export const isGenericPinLabel = (label: string): boolean => {
  const n = normalize(label);
  return n === '' || GENERIC_PIN_LABELS.has(n);
};

/**
 * Every non-pin item's label and aliases; plate / house_number / phone become digit terms. A pin contributes its
 * label and aliases only when the label is neither empty nor generic. Empty strings are dropped; duplicates merged.
 */
export function termsOf(vault: readonly VaultItem[]): Term[] {
  const out: Term[] = [];
  const seen = new Set<string>();
  for (const item of vault) {
    if (isPinKind(item.kind) && isGenericPinLabel(item.label)) continue;
    for (const s of [item.label, ...item.aliases]) {
      if (!normalize(s) && !alnum(s)) continue;
      const key = `${item.id}\u0000${s}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(makeTerm(item.id, item.kind, s));
    }
  }
  return out;
}

/** Pin coordinates, used ONLY by coordinatesNearPins (PIN_IN_PROMPT). Generic labels do not matter here. */
export function pinsOf(vault: readonly VaultItem[]): PinRef[] {
  return vault.flatMap((v) => (isPinKind(v.kind) && v.pin && Number.isFinite(v.pin.lat) && Number.isFinite(v.pin.lng)
    ? [{ vaultId: v.id, kind: v.kind, lat: v.pin.lat, lng: v.pin.lng }] : []));
}

// ---------- scans (pure) ----------
/**
 * A vault string found in a text. LOCAL ONLY, never in the Ledger (AC-045): `text` is the vault label or alias that
 * matched; `matched` is the scanned text's own words (the toast's TEXT: "Blocked: '{TEXT}' would have left this device").
 */
export interface TextHit { vaultId: string; kind: VaultKind; text: string; matched: string }
export interface PinHit { vaultId: string; kind: VaultKind; pin: true }

/** Prompt / echo scan (`termInWords(…, {image:false})`): the first vault term in `text`. Digit terms < 3 chars are skipped. */
export function scanText(text: string, terms: readonly Term[], theta = DEFAULT_FUZZY_THRESHOLD): TextHit | null {
  const m = firstMatchInText(text, terms, theta);
  return m ? { vaultId: m.term.vaultId, kind: m.term.kind, text: m.term.text, matched: m.matched } : null;
}

const COORD_RE = /-?\d{1,3}\.\d{3,}/g;
/**
 * ARCH §8.4: decimal numbers with ≥3 decimals; adjacent pairs are tried as (lat, lng) and as (lng, lat). Fires if
 * either is within `radiusM` of a pin.
 */
export function coordinatesNearPins(text: string, pins: readonly PinRef[], radiusM = PIN_RADIUS_M): PinHit | null {
  if (!pins.length) return null;
  const nums = [...text.matchAll(COORD_RE)].map((m) => Number(m[0]));
  const near = (lat: number, lng: number) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? pins.find((p) => haversineMeters(lat, lng, p.lat, p.lng) <= radiusM) : undefined;
  for (let i = 0; i + 1 < nums.length; i++) {
    const p = near(nums[i], nums[i + 1]) ?? near(nums[i + 1], nums[i]);
    if (p) return { vaultId: p.vaultId, kind: p.kind, pin: true };
  }
  return null;
}

/**
 * Split `text` at every occurrence of the static template segments (longest first) and keep the non-blank pieces.
 * Pieces are scanned separately, so stripping never glues two dynamic values into a new token.
 */
export function stripStatic(text: string, statics: readonly string[] = staticSegments()): string[] {
  let pieces = [text];
  for (const s of statics) if (s) pieces = pieces.flatMap((p) => (p.includes(s) ? p.split(s) : [p]));
  return pieces.filter((p) => p.trim() !== '');
}

/** Lines shorter than this are too generic to be a canary ("VAULT:", "- type"). */
const CANARY_MIN_CHARS = 32;
let canaryCache: readonly string[] | null = null;
/**
 * Canary lines: every line (≥32 chars) of the static text of the prompts that must never reach the cloud (nano*,
 * fmPre), minus any line that also occurs in the cloud prompts' static text. Derived from the manifest, so a new
 * device prompt is covered automatically.
 */
export function canaryLines(): readonly string[] {
  if (canaryCache) return canaryCache;
  const cloud = staticSegments();
  const out = new Set<string>();
  for (const [id, spec] of Object.entries(MANIFEST.prompts)) {
    if (CLOUD_TEXT_PROMPTS.includes(id)) continue;
    for (const f of Array.isArray(spec.user) ? spec.user : [spec.user]) {
      for (const part of fileText(f).split(/\{\{[A-Z0-9_]+\}\}/)) {
        for (const line of part.split('\n')) {
          const l = line.trim();
          if (l.length >= CANARY_MIN_CHARS && !cloud.some((c) => c.includes(l))) out.add(l);
        }
      }
    }
  }
  canaryCache = [...out];
  return canaryCache;
}

/**
 * The tripwire's scanner (ARCH §8.4, D-65). For every string value of the request body, in order:
 * 1. skip it if it EXACTLY equals a prompts.nonContentStrings() entry (schema strings, SDK protocol values); never by
 *    substring, so a vault label "Medium" or "Landmark" cannot trip on the pass-B schema;
 * 2. canary: the static text of a device-only prompt anywhere in it is a hit (TEMPLATE_CANARY);
 * 3. strip prompts.staticSegments() (advA, advB, explain template text);
 * 4. scan what remains for vault terms, and for coordinates near a pin (defence in depth for PIN_IN_PROMPT).
 */
export function tripwireScanner(terms: readonly Term[], pins: readonly PinRef[], theta = DEFAULT_FUZZY_THRESHOLD): VaultScanner {
  const skip = nonContentStrings();
  const statics = staticSegments();
  const canaries = canaryLines();
  return (texts) => {
    for (const raw of texts) {
      if (skip.has(raw)) continue;
      if (canaries.some((c) => raw.includes(c))) return { vaultId: TEMPLATE_CANARY };
      for (const piece of stripStatic(raw, statics)) {
        const hit = scanText(piece, terms, theta) ?? coordinatesNearPins(piece, pins);
        if (hit) return { vaultId: hit.vaultId };
      }
    }
    return null;
  };
}

/** The pass-B free-text fields, in the shape of ParsedAdvB / AdversaryResult. */
export interface AdvBFreeText {
  sceneSummary?: string;
  declineReason?: string;
  clues: readonly { evidence: string }[];
  hypotheses: readonly { label: string }[];
  inferences: readonly { value: string }[];
}
/** D-65: the echo scan reads free-text fields only (scene_summary, decline_reason, evidence, label, value), never enums or ids. */
export function echoFreeText(r: AdvBFreeText): string[] {
  return [r.sceneSummary ?? '', r.declineReason ?? '', ...r.clues.map((c) => c.evidence), ...r.hypotheses.map((h) => h.label),
    ...r.inferences.map((i) => i.value)].filter((s) => s.trim() !== '');
}
/** Response-side scan of pass B: the ids of active-vault items whose strings the adversary echoed (unique, first-seen order). */
export function echoScan(r: AdvBFreeText, terms: readonly Term[], theta = DEFAULT_FUZZY_THRESHOLD): string[] {
  const ids: string[] = [];
  for (const text of echoFreeText(r)) for (const t of findAllInText(text, terms, theta)) if (!ids.includes(t.vaultId)) ids.push(t.vaultId);
  return ids;
}

// ---------- the active index ----------
export type VaultScanMode = 'unset' | 'real' | 'judge';
export interface VaultScanDeps {
  /** Unseal and read the real vault (vaultStore.loadVault). Never called in Judge Mode. */
  loadReal: () => Promise<readonly VaultItem[]>;
  /** Register the tripwire scanner (tripwire.setVaultScanner). */
  register: (fn: VaultScanner) => void;
}

const BLOCK_ALL: VaultScanner = () => ({ vaultId: VAULT_UNAVAILABLE });
const noop = () => {};

export function createVaultScan(deps: VaultScanDeps) {
  let mode: VaultScanMode = 'unset';
  let terms: readonly Term[] = [];
  let pins: readonly PinRef[] = [];
  let judgeVault: readonly VaultItem[] | null = null;
  let theta = DEFAULT_FUZZY_THRESHOLD;
  let blocked = false;   // a BLOCK_ALL scanner is registered (index loading or unavailable)
  let gen = 0;           // bumped by every switch; a load that finishes after a newer switch is discarded

  let bootResolve: () => void = noop;
  let bootReject: (e: unknown) => void = noop;
  const boot = new Promise<void>((res, rej) => { bootResolve = res; bootReject = rej; });
  boot.catch(noop);
  let ready: Promise<void> = boot;
  const track = (p: Promise<void>): Promise<void> => {
    ready = p;
    p.then(bootResolve, bootReject);
    p.catch(noop);   // the caller (or the gate, via `ready`) sees the rejection; never an unhandled one
    return p;
  };

  const install = (next: VaultScanMode, items: readonly VaultItem[]) => {
    terms = termsOf(items);
    pins = pinsOf(items);
    mode = next;
    blocked = false;
    deps.register(tripwireScanner(terms, pins, theta));
  };
  const block = (next: VaultScanMode) => {
    terms = [];
    pins = [];
    mode = next;
    blocked = true;
    deps.register(BLOCK_ALL);
  };

  /** Load the real vault and make it active. Fails closed: until it is built, and if it cannot be, every scanned cloud call trips. */
  const loadReal = async (my: number): Promise<void> => {
    block('real');
    let items: readonly VaultItem[];
    try {
      items = await deps.loadReal();
    } catch (e) {
      if (my !== gen) return;   // superseded: the newer switch decides
      throw e;                  // stays blocked; `ready` rejects, so the gate fails closed too
    }
    if (my === gen) install('real', items);
  };

  return {
    /** Resolves once the active index is built (the gate awaits it before every call). Rejects if the real vault could not be read. */
    get ready(): Promise<void> { return ready; },
    mode: (): VaultScanMode => mode,
    activeTerms: (): readonly Term[] => terms,
    activePins: (): readonly PinRef[] => pins,
    /** The JUDGE_VAULT object while Judge Mode is active (the gate's S4 check compares identity, ARCH §8.2). */
    judgeVault: (): readonly VaultItem[] | null => judgeVault,
    threshold: (): number => theta,

    /**
     * Boot (ARCH §15.1 step 4). Judge-Mode boot (`#/judge`, `?judge=1`) never unseals the real vault (D-37): it
     * registers an empty index until useJudge() installs JUDGE_VAULT's. Otherwise the real vault is loaded.
     */
    init(opts: { judge: boolean }): Promise<void> {
      const my = ++gen;
      if (opts.judge) {
        judgeVault = null;
        install('judge', []);
        return track(Promise.resolve());
      }
      return track(loadReal(my));
    },

    /**
     * Enter Judge Mode: JUDGE_VAULT becomes the active vault and the real vault's terms and pins are dropped from
     * memory. TODO(Judge Mode task): pass vault/judgeVault.ts's JUDGE_VAULT here once that module exists.
     */
    useJudge(vault: readonly VaultItem[]): Promise<void> {
      ++gen;
      judgeVault = vault;
      install('judge', vault);
      return track(Promise.resolve());
    },

    /** Leave Judge Mode: unseal the real vault again and rebuild its index. */
    useReal(): Promise<void> {
      const my = ++gen;
      judgeVault = null;
      return track(loadReal(my));
    },

    /**
     * After a vault edit: rebuild the real index. Only while the real vault is active: in Judge Mode the real vault is
     * never loaded (useReal() reads the latest on exit), and before init() boot has not chosen yet.
     */
    refresh(): Promise<void> {
      if (mode !== 'real') return ready;
      const my = ++gen;
      return track(loadReal(my));
    },

    /** After Burn: the real index is emptied at once (only while the real vault is active). */
    clearReal(): void {
      if (mode !== 'real') return;
      ++gen;
      install('real', []);
      track(Promise.resolve());
    },

    /** RC `fuzzy_threshold` (clamped 0.6–0.98). Re-registers the scanner unless the index is blocked. */
    setFuzzyThreshold(x: unknown): void {
      theta = clampFuzzyThreshold(x);
      if (!blocked && mode !== 'unset') deps.register(tripwireScanner(terms, pins, theta));
    },

    // Bound to the active index:
    scanText: (text: string): TextHit | null => scanText(text, terms, theta),
    coordinatesNearPins: (text: string): PinHit | null => coordinatesNearPins(text, pins),
    matchWords: (words: readonly WordLike[], mode: MatchMode = 'image'): WordHit[] => matchWords(words, terms, theta, mode),
    echoScan: (r: AdvBFreeText): string[] => echoScan(r, terms, theta),
  };
}
export type VaultScan = ReturnType<typeof createVaultScan>;

/** The app's one instance: the real vault from vaultStore, scanner registered with the tripwire. */
export const vaultScan: VaultScan = createVaultScan({ loadReal: loadVault, register: setVaultScanner });
