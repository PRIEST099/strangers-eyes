// English captions for the upload: one cue per sentence, timed by each scene's narration length (sentences share a
// scene's time in proportion to their length). Writes out/subtitles.en.srt.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const PAD = 0.6;
const narration = JSON.parse(readFileSync('scripts/narration.json', 'utf8'));
const timings = JSON.parse(readFileSync('public/timings.json', 'utf8'));
const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
let t = 0, n = 0;
const cues = [];
for (const s of narration.scenes) {
  const len = timings[s.id];
  const sentences = s.text.match(/[^.?!]+[.?!]+/g)?.map((x) => x.trim()) ?? [s.text];
  const total = sentences.reduce((a, x) => a + x.length, 0);
  let at = t;
  for (const x of sentences) { const d = len * (x.length / total); cues.push(`${++n}\n${ts(at)} --> ${ts(at + d)}\n${x}\n`); at += d; }
  t += Math.ceil((len + PAD) * 30) / 30;
}
mkdirSync('out', { recursive: true });
writeFileSync('out/subtitles.en.srt', cues.join('\n'));
console.log(`out/subtitles.en.srt: ${n} cues, ${t.toFixed(1)} s`);
