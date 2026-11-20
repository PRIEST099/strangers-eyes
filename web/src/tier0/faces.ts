// web/src/tier0/faces.ts: MediaPipe FaceDetector singleton (ARCH §11.2 step 2, API-NOTES §5.1; T-056).
// Full-range model on the CPU delegate (street photos). Short-range is a fallback only.
// Assets are self-hosted under /vendor (copied by scripts/copy-assets.mjs); never a CDN.
// The SAME function serves Tier-0 masking and the gate's re-check, at the same RC face_min_confidence (D-30, R-16), so
// the gate never blocks a face that Tier-0 left unmasked.
//
// T-056 (D-83): one detector per model, created at the RC floor (FACE_MIN_CONFIDENCE_FLOOR); the RC threshold is
// applied to the scores in code, so an RC change never builds a second ~1 MB model instance. MediaPipe drops anchors
// below its threshold before non-maximum suppression, and a lower score never suppresses a higher one, so the SET of
// faces with score ≥ t and their scores are the same as a detector built at t would give. The face detector uses
// WEIGHTED NMS, so a box may shift slightly (anchors scoring 0.2–t now join the weighted average). Tier-0 and the gate
// share this function, so they always agree. Boxes are clamped to the image and rounded outward, so a mask always covers the face
// (AC-118: pixel boxes of the image passed in, which is the master for Tier-0 and the decoded outgoing JPEG for the gate).
import { FaceDetector, FilesetResolver, type Detection } from '@mediapipe/tasks-vision';
import type { PxRect } from '../core/types';

export const MEDIAPIPE_WASM_BASE = '/vendor/mediapipe-1.2.3/wasm'; // no trailing slash
export type FaceModel = 'full' | 'short';
const MODEL_URL: Record<FaceModel, string> = {
  full: '/models/blaze_face_full_range.tflite',
  short: '/models/blaze_face_short_range.tflite',
};
/** D-30: Tier-0 and the gate re-check use the same threshold (RC face_min_confidence, default 0.3). */
export const DEFAULT_FACE_MIN_CONFIDENCE = 0.3;
/** RC face_min_confidence is clamped to [FLOOR, CEIL] (ARCH §13 RC table). */
export const FACE_MIN_CONFIDENCE_FLOOR = 0.2;
export const FACE_MIN_CONFIDENCE_CEIL = 0.6;

export interface FaceBox extends PxRect { score: number }

/** RC face_min_confidence, clamped 0.2–0.6; anything that is not a finite number is the default 0.3. */
export function clampFaceMinConfidence(x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return DEFAULT_FACE_MIN_CONFIDENCE;
  return Math.min(FACE_MIN_CONFIDENCE_CEIL, Math.max(FACE_MIN_CONFIDENCE_FLOOR, x));
}

// Keep detectors as module singletons: React StrictMode runs effects twice in dev.
const cache = new Map<FaceModel, Promise<FaceDetector>>();

export function getFaceDetector(model: FaceModel = 'full'): Promise<FaceDetector> {
  let p = cache.get(model);
  if (!p) {
    p = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE);
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL[model], delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: FACE_MIN_CONFIDENCE_FLOOR, // the RC threshold is applied to the scores below
        minSuppressionThreshold: 0.3,
      });
    })();
    const mine = p;
    mine.catch(() => { if (cache.get(model) === mine) cache.delete(model); }); // allow a retry after a failed load
    cache.set(model, mine);
  }
  return p;
}

type FaceInput = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

/** The input's pixel size (an <img> by its natural size, not its layout size). */
function sizeOf(img: FaceInput): { W: number; H: number } {
  const el = img as Partial<HTMLImageElement>;
  return { W: el.naturalWidth || img.width, H: el.naturalHeight || img.height };
}

/**
 * Faces in `img` with score ≥ the clamped `minConfidence`, as integer pixel boxes of `img` (clamped to it, rounded
 * outward; empty boxes dropped). detect() is synchronous in IMAGE mode. Rejects if the model cannot load: the caller
 * fails closed (Tier-0 cannot say "no faces"; the gate blocks).
 */
export async function detectFaces(
  img: FaceInput,
  minConfidence: unknown = DEFAULT_FACE_MIN_CONFIDENCE,
  model: FaceModel = 'full',
): Promise<FaceBox[]> {
  const t = clampFaceMinConfidence(minConfidence);
  const det = await getFaceDetector(model);
  const { W, H } = sizeOf(img);
  const out: FaceBox[] = [];
  for (const d of det.detect(img).detections as Detection[]) {
    const bb = d.boundingBox;
    const score = d.categories[0]?.score ?? 0;
    if (!bb || !(score >= t)) continue;
    const x0 = Math.max(0, Math.floor(bb.originX));
    const y0 = Math.max(0, Math.floor(bb.originY));
    const x1 = Math.min(W, Math.ceil(bb.originX + bb.width));
    const y1 = Math.min(H, Math.ceil(bb.originY + bb.height));
    if (x1 <= x0 || y1 <= y0) continue; // entirely outside, or empty
    out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, score });
  }
  return out;
}
