// web/src/ai/preflight.ts: the consent dry run (SPEC SCR-07, ARCH §8.3, D-30; T-069). It runs when the Send step
// opens: the gate's step-2 image checks on the EXACT bytes that would be sent, so the sheet never approves an image the
// gate will refuse for a reason the user did not choose. It never sends, never writes the Ledger, never toasts.
//   round 0..2: build the cloud JPEG from the masks → strict structure (jpegStrict, D-130) + the metadata check →
//   decode at its own size → faces at RC face_min_confidence → OCR → the ACTIVE vault's terms (image mode).
//   A hit that overlaps an item the user deliberately un-ticked is the user's choice: never re-masked, it is reported
//   (`userHits`, copy.consent.unmasked) and Send stays enabled; the gate then blocks the send (AC-041, AC-135).
//   Any other hit is masked automatically (padded like every detected box) and the image rebuilt, at most 2 rounds
//   (AC-134). Hits still there after round 2, a metadata failure, or a check that could not run → `failed`: Send off.
// Pure orchestration over injected readers (Check binds them to frames.buildFrameJpeg, tier0/faces, tier0/ocr and the
// vault index), so it is unit-tested in Node. LOCAL ONLY: OCR text and vault matches never leave this module's result.
import type { ImageFrame, OcrWord, PxRect } from '../core/types';
import { area, frameToMaster, intersect, iou, padRect, union } from '../core/boxes';
import { validateOutgoingJpeg } from './jpegStrict';

/** ARCH §8.3: a hit overlapping a user-unmasked item with IoU ≥ this is the user's choice. */
export const USER_HIT_IOU = 0.3;
/** …or when at least this share of the hit lies inside it (a word box inside a larger clue box). */
export const USER_HIT_COVER = 0.5;
/** Auto-mask rounds before the dry run gives up (SPEC SCR-07). */
export const PREFLIGHT_ROUNDS = 2;

export type PreflightFailure = 'metadata' | 'faces' | 'vault' | 'check';

/** The outgoing image, in the gate's OutgoingImage shape (jpeg Blob, base64 of the same bytes, their sha256). */
export interface PreflightImage { jpeg: Blob; base64: string; sha256: string; frame: ImageFrame; mime: 'image/jpeg' }

export interface PreflightDeps {
  /** frames.buildFrameJpeg('cloud', master, { masks }). */
  build(masks: readonly PxRect[]): Promise<{ jpeg: Blob; frame: ImageFrame }>;
  /** tier0/exif.checkCleanJpeg (the gate's lenient check, run after the strict structure check). */
  checkClean(jpeg: Blob): Promise<{ clean: boolean }>;
  /** The JPEG decoded at its own size (never rescaled: AC-134). */
  decode(bytes: Uint8Array<ArrayBuffer>): Promise<object>;
  /** Face boxes in the decoded image's pixels. */
  faces(bitmap: object, minConfidence: number): Promise<readonly PxRect[]>;
  /** OCR words in the decoded image's pixels. */
  ocr(bitmap: object): Promise<readonly OcrWord[]>;
  /** The active vault's word matches (image mode), or null when the index is not ready (fails closed). */
  matchVault(words: readonly OcrWord[]): Promise<readonly { spans: readonly (readonly [number, number])[] }[] | null>;
  release?(bitmap: object): void;
  sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string>;
}

export interface PreflightInput {
  /** candidate.masks: exactly what renderFrame paints (master px). */
  masks: readonly PxRect[];
  width: number;
  height: number;
  /** Boxes (master px) of private items the user deliberately un-ticked (faces, vault hits). */
  userUnmasked: readonly PxRect[];
  faceMinConfidence: number;
  padRatio: number;
}

export interface DryRun {
  /** The last image built; Send consents to exactly these bytes. */
  image: PreflightImage;
  bytes: number;
  /** The masks the image was built from: the candidate's plus every auto mask. */
  masks: PxRect[];
  autoMasked: number;
  /** Hits on items the user un-ticked (copy.consent.unmasked). */
  userHits: number;
  /** What still fails: Send stays disabled while non-empty. */
  failed: PreflightFailure[];
  /** For the checklist: faces and vault matches still visible in the final image (user hits included). */
  facesVisible: number;
  vaultVisible: number;
}

function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** True when `hit` (master px) is the user's own un-ticked item. */
export function isUserHit(hit: PxRect, userUnmasked: readonly PxRect[]): boolean {
  const a = area(hit);
  return userUnmasked.some((u) => iou(hit, u) >= USER_HIT_IOU || (a > 0 && area(intersect(hit, u)) / a >= USER_HIT_COVER));
}

/** The consent dry run. Never throws for a reader failure: that is `failed: ['check']` (fail closed). */
export async function runPreflight(input: PreflightInput, deps: PreflightDeps): Promise<DryRun> {
  const masks: PxRect[] = input.masks.map((m) => ({ ...m }));
  let autoMasked = 0;
  for (let round = 0; ; round++) {
    const built = await deps.build(masks);
    const bytes = new Uint8Array(await built.jpeg.arrayBuffer());
    const sha256 = await deps.sha256Hex(bytes);
    const image: PreflightImage = { jpeg: built.jpeg, base64: toBase64(bytes), sha256, frame: built.frame, mime: 'image/jpeg' };
    const out = (failed: PreflightFailure[], userHits: number, faces: number, vault: number): DryRun => ({
      image, bytes: bytes.length, masks: masks.map((m) => ({ ...m })), autoMasked, userHits, failed, facesVisible: faces, vaultVisible: vault,
    });

    let clean = false;
    try { clean = validateOutgoingJpeg(bytes).ok && (await deps.checkClean(built.jpeg)).clean; } catch { clean = false; }
    if (!clean) return out(['metadata'], 0, 0, 0); // an encoder bug: never auto-fixable

    let faceHits: PxRect[];
    let vaultHits: PxRect[];
    let bmp: object | null = null;
    try {
      bmp = await deps.decode(bytes);
      faceHits = (await deps.faces(bmp, input.faceMinConfidence)).map((r) => frameToMaster(r, built.frame)).filter((r) => area(r) > 0);
      const words = await deps.ocr(bmp);
      const hits = await deps.matchVault(words);
      if (hits === null) return out(['check'], 0, 0, 0);
      vaultHits = hits.flatMap((h) => h.spans.map(([a, b]) => union(words.slice(a, b + 1).map((w) => w.box))))
        .filter((r): r is PxRect => r !== null && area(r) > 0)
        .map((r) => frameToMaster(r, built.frame))
        .filter((r) => area(r) > 0);
    } catch {
      return out(['check'], 0, 0, 0);
    } finally {
      if (bmp) { try { deps.release?.(bmp); } catch { /* ignore */ } }
    }

    const all = [...faceHits.map((r) => ({ r, kind: 'faces' as const })), ...vaultHits.map((r) => ({ r, kind: 'vault' as const }))];
    const user = all.filter((h) => isUserHit(h.r, input.userUnmasked));
    const fresh = all.filter((h) => !user.includes(h));
    if (fresh.length === 0) return out([], user.length, faceHits.length, vaultHits.length);
    if (round >= PREFLIGHT_ROUNDS) {
      return out([...new Set(fresh.map((h) => h.kind))], user.length, faceHits.length, vaultHits.length);
    }
    for (const h of fresh) masks.push(padRect(h.r, input.width, input.height, input.padRatio));
    autoMasked += fresh.length;
  }
}
