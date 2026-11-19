// Copies self-hosted wasm/model/lang assets from node_modules into public/.
// Run via "predev"/"prebuild" npm scripts. Models are downloaded once separately.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const nm = (p) => resolve(root, 'node_modules', p);
const pub = (p) => resolve(root, 'public', p);

// 1) MediaPipe tasks-vision wasm (classic, non-module loader)
mkdirSync(pub('mediapipe/wasm'), { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
  cpSync(nm(`@mediapipe/tasks-vision/wasm/${f}`), pub(`mediapipe/wasm/${f}`));
}

// 2) Tesseract.js worker + core (LSTM-only variants: default OEM is LSTM_ONLY)
mkdirSync(pub('tesseract/core'), { recursive: true });
cpSync(nm('tesseract.js/dist/worker.min.js'), pub('tesseract/worker.min.js'));
for (const f of [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
]) {
  cpSync(nm(`tesseract.js-core/${f}`), pub(`tesseract/core/${f}`));
}

// 3) English traineddata (LSTM best_int, gzipped)
mkdirSync(pub('tesseract/lang'), { recursive: true });
cpSync(nm('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), pub('tesseract/lang/eng.traineddata.gz'));

if (!existsSync(pub('models/blaze_face_short_range.tflite'))) {
  console.warn('models/*.tflite missing: run scripts/fetch-models.sh');
}
console.log('assets copied');
