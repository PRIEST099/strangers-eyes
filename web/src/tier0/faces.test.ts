// T-056: face detection plumbing. MediaPipe is replaced by a fake detector; real detection runs in the DEV selftest
// (faces_none) and, once a face or mannequin image is in PRIV/test (U-31), in the recall spike (T-037 step 3).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  created: [] as Array<{ model: string; minDetectionConfidence: number }>,
  detections: [] as Array<{ boundingBox?: { originX: number; originY: number; width: number; height: number }; categories: Array<{ score: number }> }>,
  failNextLoad: false,
}));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  FaceDetector: {
    createFromOptions: async (_f: unknown, o: { baseOptions: { modelAssetPath: string }; minDetectionConfidence: number }) => {
      if (fake.failNextLoad) { fake.failNextLoad = false; throw new Error('model 404'); }
      fake.created.push({ model: o.baseOptions.modelAssetPath, minDetectionConfidence: o.minDetectionConfidence });
      return { detect: () => ({ detections: fake.detections }) };
    },
  },
}));

const img = (width: number, height: number) => ({ width, height }) as unknown as HTMLCanvasElement;
const det = (originX: number, originY: number, width: number, height: number, score: number) =>
  ({ boundingBox: { originX, originY, width, height }, categories: [{ score }] });

describe('tier0/faces', () => {
  let faces: typeof import('./faces');
  beforeEach(async () => {
    vi.resetModules();
    fake.created.length = 0;
    fake.detections = [];
    fake.failNextLoad = false;
    faces = await import('./faces');
  });

  it('clampFaceMinConfidence: RC value clamped 0.2–0.6; a non-number is the default 0.3', () => {
    expect(faces.clampFaceMinConfidence(0.3)).toBe(0.3);
    expect(faces.clampFaceMinConfidence(0.05)).toBe(0.2);
    expect(faces.clampFaceMinConfidence(0.9)).toBe(0.6);
    expect(faces.clampFaceMinConfidence(Number.NaN)).toBe(0.3);
    expect(faces.clampFaceMinConfidence('0.5')).toBe(0.3);
    expect(faces.clampFaceMinConfidence(undefined)).toBe(0.3);
  });

  it('the threshold is applied to the scores: ≥ the clamped RC value passes, below it does not', async () => {
    fake.detections = [det(10, 10, 50, 50, 0.25), det(100, 10, 50, 50, 0.3), det(200, 10, 50, 50, 0.9)];
    expect((await faces.detectFaces(img(400, 300))).map((f) => f.score)).toEqual([0.3, 0.9]); // default 0.3, inclusive
    expect((await faces.detectFaces(img(400, 300), 0.5)).map((f) => f.score)).toEqual([0.9]);
    expect((await faces.detectFaces(img(400, 300), 0.01)).map((f) => f.score)).toEqual([0.25, 0.3, 0.9]); // clamped to 0.2
  });

  it('one detector per model, built at the RC floor, whatever thresholds are asked for', async () => {
    await faces.detectFaces(img(10, 10), 0.3);
    await faces.detectFaces(img(10, 10), 0.45);
    await faces.detectFaces(img(10, 10), 0.6, 'short');
    expect(fake.created).toEqual([
      { model: '/models/blaze_face_full_range.tflite', minDetectionConfidence: faces.FACE_MIN_CONFIDENCE_FLOOR },
      { model: '/models/blaze_face_short_range.tflite', minDetectionConfidence: faces.FACE_MIN_CONFIDENCE_FLOOR },
    ]);
  });

  it('boxes are integer pixels of the image, rounded outward and clamped to it; empty or outside boxes are dropped (AC-118)', async () => {
    fake.detections = [
      det(10.6, 20.2, 29.7, 40.1, 0.9),   // far edges 40.3 / 60.3: CEILED to 41 / 61 (rounding would give 40 / 60)
      det(-12.5, -3, 40, 30, 0.9),        // partly outside the top-left: clamped
      det(380, 280, 50, 50, 0.9),         // partly outside the bottom-right: clamped
      det(500, 500, 20, 20, 0.9),         // entirely outside: dropped
      det(50, 50, 0, 10, 0.9),            // empty: dropped
      { categories: [{ score: 0.99 }] },  // no box: dropped
    ];
    expect(await faces.detectFaces(img(400, 300))).toEqual([
      { x: 10, y: 20, w: 31, h: 41, score: 0.9 },
      { x: 0, y: 0, w: 28, h: 27, score: 0.9 },
      { x: 380, y: 280, w: 20, h: 20, score: 0.9 },
    ]);
  });

  it('an <img> is measured by its natural size, not its layout size', async () => {
    fake.detections = [det(900, 700, 100, 100, 0.9)];
    const el = { width: 200, height: 150, naturalWidth: 1000, naturalHeight: 800 } as unknown as HTMLImageElement;
    expect(await faces.detectFaces(el)).toEqual([{ x: 900, y: 700, w: 100, h: 100, score: 0.9 }]);
  });

  it('a failed model load rejects (the caller fails closed) and the next call retries', async () => {
    fake.failNextLoad = true;
    await expect(faces.detectFaces(img(10, 10))).rejects.toThrow('model 404');
    await expect(faces.detectFaces(img(10, 10))).resolves.toEqual([]);
    expect(fake.created).toHaveLength(1);
  });
});
