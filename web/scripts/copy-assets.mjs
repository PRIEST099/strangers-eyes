// Copies self-hosted wasm, worker and language assets from node_modules into public/vendor/ (gitignored).
// Runs as predev / prebuild / prebuild:e2e. Folders are versioned so they can be cached as immutable.
// Ported from research/day1-artifacts/web-ref/scripts/copy-assets.mjs [verified]; only the targets changed (ARCH §3.1, R-08).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const nm = (p) => resolve(root, 'node_modules', p);
const pub = (p) => resolve(root, 'public', p);
const version = (pkg) => JSON.parse(readFileSync(nm(`${pkg}/package.json`), 'utf8')).version;

const MP = '1.2.3';
const TS = '7.0.0';
// The loaders hard-code these versioned paths (tier0/faces.ts, tier0/ocr.ts); fail loudly if a pin drifts.
if (version('@mediapipe/tasks-vision') !== MP) throw new Error(`@mediapipe/tasks-vision is ${version('@mediapipe/tasks-vision')}, expected ${MP}`);
if (version('tesseract.js') !== TS) throw new Error(`tesseract.js is ${version('tesseract.js')}, expected ${TS}`);

// Remove stale vendor folders from older versions.
rmSync(pub('vendor'), { recursive: true, force: true });

// 1) MediaPipe tasks-vision wasm (classic loader). basePath has no trailing slash.
const mp = `vendor/mediapipe-${MP}/wasm`;
mkdirSync(pub(mp), { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
  cpSync(nm(`@mediapipe/tasks-vision/wasm/${f}`), pub(`${mp}/${f}`));
}

// 2) Tesseract.js worker + the three LSTM-only cores (v7 picks relaxedsimd in Chrome). corePath is a DIRECTORY.
const ts = `vendor/tesseract-${TS}`;
mkdirSync(pub(`${ts}/core`), { recursive: true });
cpSync(nm('tesseract.js/dist/worker.min.js'), pub(`${ts}/worker.min.js`));
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  cpSync(nm(`tesseract.js-core/${f}`), pub(`${ts}/core/${f}`));
}

// 3) English traineddata (LSTM best_int, gzipped).
mkdirSync(pub(`${ts}/lang`), { recursive: true });
cpSync(nm('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), pub(`${ts}/lang/eng.traineddata.gz`));

// 4) Third-party notices for the self-hosted binaries (served at /vendor/third-party-notices.md; linked from About).
cpSync(resolve(root, '..', 'THIRD_PARTY_NOTICES.md'), pub('vendor/third-party-notices.md'));

// Face models are committed (Apache-2.0); warn if they are missing.
for (const m of ['blaze_face_full_range.tflite', 'blaze_face_short_range.tflite']) {
  if (!existsSync(pub(`models/${m}`))) console.warn(`public/models/${m} is missing (see RUNBOOK §2.3 for the download URL)`);
}
console.log(`copy-assets: ${mp}, ${ts}`);
