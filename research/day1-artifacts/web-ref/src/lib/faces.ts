import { FaceDetector, FilesetResolver, type Detection } from '@mediapipe/tasks-vision';

export type FaceModel = 'short' | 'full';
const MODEL_URL: Record<FaceModel, string> = {
  short: '/models/blaze_face_short_range.tflite',
  full: '/models/blaze_face_full_range.tflite',
};

const cache = new Map<string, Promise<FaceDetector>>();

export function getFaceDetector(model: FaceModel = 'full', delegate: 'CPU' | 'GPU' = 'CPU'): Promise<FaceDetector> {
  const k = `${model}:${delegate}`;
  let p = cache.get(k);
  if (!p) {
    p = (async () => {
      // basePath WITHOUT trailing slash: the lib builds `${basePath}/vision_wasm_internal.{js,wasm}`
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL[model], delegate },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
        minSuppressionThreshold: 0.3,
      });
    })();
    cache.set(k, p);
  }
  return p;
}

export interface PxRect { x: number; y: number; w: number; h: number; score: number }

/** detect() is synchronous in IMAGE mode; boundingBox is in PIXELS of the input image. */
export async function detectFaces(
  img: HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas,
  model: FaceModel = 'full',
): Promise<PxRect[]> {
  const det = await getFaceDetector(model);
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
