#!/usr/bin/env node
// scripts/shoot-reel.mjs: deterministic frames of the StoryReel ("The Coffee Post", D-162) for review stills and the
// Devpost / demo-video clip. No dependencies: headless Chrome over CDP, like scripts/shoot-ui.mjs. Runs against the DEV
// server, whose StoryReel honours `?reelScene=N` (DEV builds only): the stepper is off and scene N plays once. For each
// frame the script pauses every animation inside the reel and sets its currentTime, so frame k of scene N is exactly
// the same picture on every run. The reel makes no AI call; ?fakeAdv=ok&fakeNano=ok is added anyway, as in shoot-ui.
//
//   npm --prefix web run dev
//   node scripts/shoot-reel.mjs --out <dir> [--scheme dark|light] [--scenes 1,2,3,4,5,6] [--fps 30] [--at 1200,2600]
//                               [--scale 2] [--width 1440] [--port 5173]
//
// --at <ms list> writes only those moments of each scene (review stills); otherwise every frame at --fps for each
// scene's length. Frames are <out>/reel.<scheme>.s<N>.<frame 4 digits>.png (or .t<ms>.png with --at). Join a clip with:
//   ffmpeg -framerate 30 -pattern_type glob -i '<out>/reel.dark.s*.png' -pix_fmt yuv420p reel.dark.mp4
// Clip output belongs in PRIV/video (outside the repo), never in the repo.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { values: a } = parseArgs({ options: {
  out: { type: 'string' }, scheme: { type: 'string', default: 'dark' }, scenes: { type: 'string', default: '1,2,3,4,5,6' },
  fps: { type: 'string', default: '30' }, at: { type: 'string' }, scale: { type: 'string', default: '2' }, width: { type: 'string', default: '1440' }, port: { type: 'string', default: '5173' },
} });
if (!a.out || !['dark', 'light'].includes(a.scheme)) {
  console.error('usage: --out <dir> [--scheme dark|light] [--scenes 1,2] [--fps 30] [--at 1200,2600] [--scale 2] [--port 5173]');
  process.exit(2);
}
/** Scene lengths in ms: keep in step with SCENE_MS in web/src/ui/components/StoryReel.tsx. */
const SCENE_MS = { 1: 2600, 2: 3400, 3: 3400, 4: 2800, 5: 3600, 6: 3000 };
const ORIGIN = `http://localhost:${Number(a.port)}`;
const scenes = a.scenes.split(',').map(Number).filter((n) => SCENE_MS[n]);
const fps = Number(a.fps);
const scale = Number(a.scale);
mkdirSync(a.out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!(await fetch(`${ORIGIN}/`).catch(() => null))?.ok) { console.error(`dev server not reachable on ${ORIGIN}`); process.exit(1); }

const profile = mkdtempSync(join(tmpdir(), 'se-reel-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch { /* gone */ } try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } });
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.on(sig, () => process.exit(code));

let cdpPort = null;
for (let i = 0; i < 80 && !cdpPort; i++) {
  await sleep(250);
  try { cdpPort = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch { /* not yet */ }
}
if (!cdpPort) { console.error('headless Chrome did not start'); process.exit(1); }
const page = (await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json())).find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  const t = setTimeout(() => { pending.delete(i); reject(new Error(`CDP ${method} timed out`)); }, 60_000);
  pending.set(i, (m) => { clearTimeout(t); m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result); });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: a.scheme }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
const width = Number(a.width);
await send('Emulation.setDeviceMetricsOverride', { width, height: width < 768 ? 844 : 900, deviceScaleFactor: scale, mobile: width < 768 });

async function open(url) {
  await send('Page.navigate', { url });
  for (let i = 0; i < 60; i++) { await sleep(250); if ((await evaluate('document.readyState')) === 'complete') break; }
  await sleep(800);
}

await open(`${ORIGIN}/?fakeAdv=ok&fakeNano=ok#/about`);
await evaluate(`localStorage.clear(); localStorage.setItem('se.ack18.v1','1'); true`);

let written = 0;
for (const n of scenes) {
  await open(`${ORIGIN}/?fakeAdv=ok&fakeNano=ok&reelScene=${n}#/`);
  await evaluate('location.reload(), true');
  await sleep(2000);
  const rect = await evaluate(`(() => { const f = document.querySelector('figure[data-reel]'); if (!f) return null;
    f.scrollIntoView({ block: 'center' }); const r = f.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; })()`);
  if (!rect) { console.error(`scene ${n}: no reel on the page (is this a DEV server?)`); process.exit(1); }
  const times = a.at ? a.at.split(',').map(Number) : Array.from({ length: Math.ceil((SCENE_MS[n] / 1000) * fps) }, (_, k) => Math.round((k * 1000) / fps));
  for (const [k, ms] of times.entries()) {
    await evaluate(`(() => { const f = document.querySelector('figure[data-reel]');
      f.getAnimations({ subtree: true }).forEach((x) => { x.pause(); x.currentTime = ${ms}; }); return true; })()`);
    await sleep(60);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 } });
    const name = a.at ? `reel.${a.scheme}.s${n}.t${ms}.png` : `reel.${a.scheme}.s${n}.${String(k).padStart(4, '0')}.png`;
    writeFileSync(join(a.out, name), Buffer.from(shot.data, 'base64'));
    written++;
  }
  console.log(`scene ${n}: ${times.length} frame(s)`);
}
console.log(`wrote ${written} frame(s) to ${a.out}`);
ws.close();
process.exit(0);
