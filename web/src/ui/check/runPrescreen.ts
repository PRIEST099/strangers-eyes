// web/src/ui/check/runPrescreen.ts: the browser glue of the Tier-0 pre-screen (SPEC SCR-06 W2; T-068). It binds
// tier0/tier0.runTier0 to the real readers and to the RC values in force, and reports progress to Check:
//   - faces: tier0/faces.detectFaces at RC face_min_confidence (the gate's re-check uses the same function and value);
//   - text: tier0/ocr.ocrMaster at RC ocr_max_px, both passes unioned (a miss here fails open, so never single-pass);
//   - vault: the ACTIVE vault's index (ai/vaultScan, Judge Mode's fake vault in Judge Mode), image mode. The index
//     must be built: before boot chose a vault, while it is still unsealing past VAULT_WAIT_MS, or if it cannot be read,
//     the vault step FAILS (fail closed, D-123); it never reports "0 matches" without having looked.
// The heavy readers are loaded with dynamic imports, so MediaPipe and Tesseract stay out of the first bundle; a chunk
// that fails to load fails its step. Nothing here makes a network request beyond the app's own files.
// T-066: after Tier-0, the Nano pre-screen (ai/jobs/prescreen.ts: S1 through the Egress Gate, ONLY_ON_DEVICE, fail
// closed) looks at the ORIGINAL master as a nano768 JPEG; its clues are localised by the OCR words Tier-0 read and join
// `findings` (core/pretick handles `nano_prescreen` clues). The outcome's `nano` line says ON_DEVICE (with its clue
// count and latency) or RULES_ONLY and why. A Nano failure never fails the pre-screen: Tier-0 stands alone (AC-114).
// T-067 seam: the Nano vault-text match will take `words` and the Nano clue texts here.
// LOCAL ONLY: words, matched texts and vault kinds stay in memory on this device; nothing is logged.
import { vaultScan } from '../../ai/vaultScan';
import { DEFAULT_AUTO_MASK_TYPES, type PreTickMode } from '../../core/pretick';
import { DEFAULT_MASK_PAD_RATIO } from '../../core/boxes';
import type { ClueType, OcrWord } from '../../core/types';
import type { OutgoingImage } from '../../ai/egressGate';
import { runTier0, type Tier0StepReport, type VaultWordHit } from '../../tier0/tier0';
import type { PrescreenNanoLine, PrescreenOutcome } from '../checkState';
import type { Tier0Finding } from '../../tier0/tier0';
import { mergeNanoFindings } from '../../ai/jobs/prescreenClues';

/** How long the vault step waits for the active index before it fails closed. */
export const VAULT_WAIT_MS = 5_000;

/** The active vault index as the pre-screen reads it (vaultScan satisfies this structurally). */
export interface VaultIndexLike {
  mode(): string;
  readonly ready: Promise<void>;
  matchWords(words: readonly OcrWord[], mode: 'image'): readonly VaultWordHit[];
}

/**
 * True once the active index is built; false before boot chose a vault (`unset`: `ready` never settles), when it
 * cannot be built, or after `timeoutMs`. A newer switch that replaces `ready` while waiting is awaited (a few times).
 */
export async function vaultIndexReady(src: Pick<VaultIndexLike, 'mode' | 'ready'>, timeoutMs = VAULT_WAIT_MS): Promise<boolean> {
  if (src.mode() === 'unset') return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((res) => { timer = setTimeout(() => res('timeout'), timeoutMs); });
  try {
    for (let k = 0; k < 4; k++) {
      const r = src.ready;
      const got = await Promise.race([r.then(() => 'ready' as const, () => 'failed' as const), timeout]);
      if (got !== 'ready') return false;
      if (r === src.ready && src.mode() !== 'unset') return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** The RC values the pre-screen uses, read once per run (defaults when RC cannot be loaded). */
interface PrescreenConfig { faceMinConfidence: number; ocrMaxPx: number; padRatio: number; autoMaskTypes: readonly ClueType[]; mode: PreTickMode; nanoMaxPx: number }

async function loadConfig(): Promise<PrescreenConfig> {
  let rc: { faceMinConfidence: number; ocrMaxPx: number; maskPadRatio: number; autoMaskTypes: readonly ClueType[]; strictModeDefault: boolean; nanoImageMaxPx: number } | null = null;
  try {
    rc = (await import('../../firebase/remoteConfig')).cfg();
  } catch {
    rc = null;
  }
  let premask: PreTickMode | null = null;
  try {
    premask = (await import('../../core/localPrefs')).localPrefs.settings().premask;
  } catch {
    premask = null;
  }
  return {
    faceMinConfidence: rc?.faceMinConfidence ?? 0.3,
    ocrMaxPx: rc?.ocrMaxPx ?? 1600,
    padRatio: rc?.maskPadRatio ?? DEFAULT_MASK_PAD_RATIO,
    autoMaskTypes: rc?.autoMaskTypes ?? DEFAULT_AUTO_MASK_TYPES,
    mode: premask ?? (rc?.strictModeDefault ? 'strict' : 'standard'),
    nanoMaxPx: rc?.nanoImageMaxPx ?? 768,
  };
}

export interface PrescreenInput { canvas: HTMLCanvasElement; jpeg: Blob }

/** The face model's load (wasm + model) and one detection may each take this long before the step fails closed. */
export const FACE_LOAD_TIMEOUT_MS = 60_000;
export const FACE_DETECT_TIMEOUT_MS = 15_000;

/**
 * `p`, or a rejection after `ms`: a stalled reader fails its step (closed) instead of hanging the pre-screen, and
 * Try again can run it again. The timer is always cleared.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`${what}: timed out after ${ms} ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

export interface PrescreenOptions {
  /** False once Check has moved on (a new photo, a retry): readers not started yet are skipped. */
  isCurrent?: () => boolean;
  index?: VaultIndexLike;
  faceLoadMs?: number;
  faceDetectMs?: number;
  /** The check session (one per photo); the gate's Ledger groups the Nano call under it. */
  sessionId?: string;
  /** The Nano pre-screen step (T-066); injectable for tests. Default: nanoStep (the gate, S1). */
  nano?: (master: HTMLCanvasElement, words: readonly OcrWord[], c: { sessionId: string; maxPx: number }) => Promise<{ findings: Tier0Finding[]; line: PrescreenNanoLine }>;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}
function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * The Nano pre-screen on the ORIGINAL master (S1; it never leaves the device: the gate runs it ONLY_ON_DEVICE or not at
 * all). Never rejects: a failure (including a chunk that does not load) is no Nano clues and a RULES_ONLY line.
 */
export async function nanoStep(master: HTMLCanvasElement, words: readonly OcrWord[], c: { sessionId: string; maxPx: number }): Promise<{ findings: Tier0Finding[]; line: PrescreenNanoLine }> {
  const t0 = performance.now();
  try {
    const { buildFrameJpeg } = await import('../../core/frames');
    const job = await import('../../ai/jobs/prescreen');
    const built = await buildFrameJpeg('nano768', master, { maxPx: c.maxPx });
    const bytes = new Uint8Array(await built.jpeg.arrayBuffer());
    const image: OutgoingImage = { jpeg: built.jpeg, base64: toBase64(bytes), sha256: await sha256Hex(bytes), frame: built.frame, mime: 'image/jpeg' };
    const o = await job.nanoPrescreen({ sessionId: c.sessionId, image });
    const findings = job.localiseNanoClues(o.clues, words, master.width, master.height);
    return { findings, line: { route: o.route, latencyMs: o.latencyMs, count: findings.length, fallback: o.fallback } };
  } catch {
    return { findings: [], line: { route: 'RULES_ONLY', latencyMs: Math.round(performance.now() - t0), count: 0, fallback: 'device_failed' } };
  }
}

/** Run the Tier-0 pre-screen on Check's master. Never rejects: failures are in `outcome.failed`. */
export async function runPrescreen(m: PrescreenInput, onStep: (r: Tier0StepReport) => void, opts: PrescreenOptions = {}): Promise<PrescreenOutcome> {
  const index = opts.index ?? vaultScan;
  const c = await loadConfig();
  let words: readonly OcrWord[] = [];
  const r = await runTier0(m.canvas, m.jpeg, {
    assertClean: async (jpeg) => (await import('../../tier0/exif')).assertCleanJpeg(jpeg),
    detectFaces: async (master) => {
      const faces = await import('../../tier0/faces');
      await withTimeout(faces.getFaceDetector(), opts.faceLoadMs ?? FACE_LOAD_TIMEOUT_MS, 'face model');
      return withTimeout(faces.detectFaces(master, c.faceMinConfidence), opts.faceDetectMs ?? FACE_DETECT_TIMEOUT_MS, 'face detection');
    },
    ocr: async (master) => { words = await (await import('../../tier0/ocr')).ocrMaster(master, { maxPx: c.ocrMaxPx }); return words; },
    matchVault: async (words) => ((await vaultIndexReady(index)) ? index.matchWords(words, 'image') : null),
    now: () => performance.now(),
    isCurrent: opts.isCurrent,
  }, onStep);
  let findings: Tier0Finding[] = r.findings;
  let nano: PrescreenNanoLine | undefined;
  if (opts.isCurrent?.() !== false) {
    const n = await (opts.nano ?? nanoStep)(m.canvas, words, { sessionId: opts.sessionId ?? 'prescreen', maxPx: c.nanoMaxPx });
    findings = mergeNanoFindings(r.findings, n.findings);
    nano = n.line;
  }
  return {
    findings, failed: r.failed, width: m.canvas.width, height: m.canvas.height,
    mode: c.mode, autoMaskTypes: c.autoMaskTypes, padRatio: c.padRatio, ...(nano ? { nano } : {}),
  };
}
