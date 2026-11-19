// web/src/tier0/faces.ts: MediaPipe FaceDetector singleton (ARCH §11.2, API-NOTES §5.1).
// Full-range model on the CPU delegate (street photos). Short-range is a fallback only.
// Assets are self-hosted under /vendor (copied by scripts/copy-assets.mjs); never a CDN.
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

export interface FaceBox extends PxRect { score: number }

// Keep detectors as module singletons: React StrictMode runs effects twice in dev.
const cache = new Map<string, Promise<FaceDetector>>();

export function getFaceDetector(model: FaceModel = 'full', minConfidence = DEFAULT_FACE_MIN_CONFIDENCE): Promise<FaceDetector> {
  const k = `${model}:${minConfidence}`;
  let p = cache.get(k);
  if (!p) {
    p = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE);
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL[model], delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: minConfidence,
        minSuppressionThreshold: 0.3,
      });
    })();
    p.catch(() => cache.delete(k)); // allow a retry after a failed load
    cache.set(k, p);
  }
  return p;
}

/** detect() is synchronous in IMAGE mode; boundingBox is in PIXELS of the input image. */
export async function detectFaces(
  img: HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas,
  minConfidence = DEFAULT_FACE_MIN_CONFIDENCE,
  model: FaceModel = 'full',
): Promise<FaceBox[]> {
  const det = await getFaceDetector(model, minConfidence);
  const res = det.detect(img);
  return res.detections
    .filter((d: Detection) => d.boundingBox)
    .map((d: Detection) => ({
      x: d.boundingBox!.originX,
      y: d.boundingBox!.originY,
      w: d.boundingBox!.width,
      h: d.boundingBox!.height,
      score: d.categories[0]?.score ?? 0,
    }));
}
