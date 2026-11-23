// Strangers' Eyes demo video (T-180; D-164): one narration clip per scene with Kokoro (local TTS, kokoro-js 1.2.1,
// voice af_heart at speed 1.07, the same voice as the Aftermath video), and each clip's length.
//   npm run tts                      all scenes, voice from narration.json
//   npm run tts -- --voice am_michael --only hook,grid
// Writes public/audio/<id>.wav and public/timings.json ({ id: seconds }), which the composition reads.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { KokoroTTS } from "kokoro-js";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const narration = JSON.parse(readFileSync("scripts/narration.json", "utf8"));
const voice = opt("voice") ?? narration.voice;
const speed = Number(opt("speed") ?? narration.speed ?? 1);
const only = opt("only")?.split(",");

mkdirSync("public/audio", { recursive: true });
const timingsPath = "public/timings.json";
let timings = {};
try { timings = JSON.parse(readFileSync(timingsPath, "utf8")); } catch {}

console.log(`loading Kokoro (first run downloads the model, ~90 MB) · voice ${voice} · speed ${speed}`);
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });

let total = 0;
for (const scene of narration.scenes) {
  if (only && !only.includes(scene.id)) { total += timings[scene.id] ?? 0; continue; }
  const audio = await tts.generate(scene.text, { voice, speed });
  await audio.save(`public/audio/${scene.id}.wav`);
  const seconds = audio.audio.length / audio.sampling_rate;
  timings[scene.id] = Math.round(seconds * 100) / 100;
  total += seconds;
  console.log(`${scene.id.padEnd(9)} ${seconds.toFixed(1)} s`);
}
writeFileSync(timingsPath, JSON.stringify(timings, null, 1) + "\n");
console.log(`narration total ${total.toFixed(1)} s (video adds ~0.6 s padding per scene; keep the whole under 180 s)`);
