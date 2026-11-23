#!/usr/bin/env node
// scripts/export-reel.mjs: exports ONE loop of the StoryReel ("The Coffee Post", D-162) as a clip for Devpost and the
// demo video: H.264 MP4 per scheme, an optimised GIF (dark) and poster PNGs. No dependencies beyond ffmpeg: headless
// Chrome over CDP like scripts/shoot-ui.mjs / shoot-reel.mjs. Runs against the DEV server, whose StoryReel honours
// `?reelScene=N` (DEV builds only: the stepper is off and scene N plays once). The reel makes no AI call;
// ?fakeAdv=ok&fakeNano=ok is added anyway.
//
// Determinism: every CSS animation is held at t=0 from the first paint (an init script injects
// `animation-play-state: paused`), so none finishes (and drops out of getAnimations()) before capture; each frame then
// pauses every animation in the reel and sets currentTime = frame ms. Captured at deviceScaleFactor 3, then scaled
// DOWN to --width (lanczos), so text stays sharp. The Pause/Play button is hidden in the clip
// (visibility only, layout kept): a video cannot be paused by clicking it. The rest of the page is hidden the same way.
//
//   npm --prefix web run dev
//   node scripts/export-reel.mjs --out <dir> [--schemes dark,light] [--gif dark] [--fps 30] [--width 1280]
//                                [--gif-width 720] [--gif-fps 15] [--port 5173] [--keep-frames]
//
// Output: <out>/story-reel.<scheme>.mp4, story-reel.<scheme>.gif, story-reel.<scheme>.poster.png. Frame PNGs go to
// <out>/frames-<scheme>/ and are deleted unless --keep-frames. Clips belong outside the repo (scratchpad or PRIV/video).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
const { values: a } = parseArgs({ options: {
  out: { type: 'string' }, schemes: { type: 'string', default: 'dark,light' }, gif: { type: 'string', default: 'dark' },
  fps: { type: 'string', default: '30' }, width: { type: 'string', default: '1280' }, 'gif-width': { type: 'string', default: '720' },
  'gif-fps': { type: 'string', default: '15' }, port: { type: 'string', default: '5173' }, 'keep-frames': { type: 'boolean', default: false },
} });
const schemes = a.schemes.split(',');
if (!a.out || schemes.some((s) => s !== 'dark' && s !== 'light')) {
  console.error('usage: --out <dir> [--schemes dark,light] [--gif dark] [--fps 30] [--width 1280] [--gif-width 720] [--gif-fps 15] [--port 5173]');
  process.exit(2);
}
/** Scene lengths in ms: keep in step with SCENE_MS in web/src/ui/components/StoryReel.tsx. */
const SCENE_MS = { 1: 2600, 2: 3400, 3: 3400, 4: 2800, 5: 3600, 6: 3000 };
const POSTER = 6;
/** Page background kept around the reel in the clip (CSS px). */
const PAD = 24;
const ORIGIN = `http://localhost:${Number(a.port)}`;
const fps = Number(a.fps);
const outW = Number(a.width);
const gifSchemes = new Set(a.gif ? a.gif.split(',') : []);
mkdirSync(a.out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!(await fetch(`${ORIGIN}/`).catch(() => null))?.ok) { console.error(`dev server not reachable on ${ORIGIN}`); process.exit(1); }

const profile = mkdtempSync(join(tmpdir(), 'se-reel-export-'));
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
// Only on reel-pinned pages: hold every animation at t=0 from the first paint; hide everything but the reel (the padding
// around it then shows only the page background, never a neighbouring card) and the reel's Pause/Play button.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  if (!/[?&]reelScene=/.test(location.search)) return;
  const css = '*,*::before,*::after{animation-play-state:paused!important}body *{visibility:hidden!important}figure[data-reel],figure[data-reel] *{visibility:visible!important}figure[data-reel] button,figure[data-reel] button *{visibility:hidden!important}';
  const add = () => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
  if (document.documentElement) add(); else new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); add(); } }).observe(document, { childList: true });
})();` });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 3, mobile: false });

async function open(url) {
  await send('Page.navigate', { url });
  for (let i = 0; i < 60; i++) { await sleep(250); if ((await evaluate('document.readyState')) === 'complete') break; }
  await sleep(800);
}
function ff(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) { console.error(`ffmpeg failed: ${args.join(' ')}`); process.exit(1); }
}

await open(`${ORIGIN}/?fakeAdv=ok&fakeNano=ok#/about`);
await evaluate(`localStorage.clear(); localStorage.setItem('se.ack18.v1','1'); true`);

for (const scheme of schemes) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
  const dir = join(a.out, `frames-${scheme}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let k = 0;
  let size = null;
  for (const n of [1, 2, 3, 4, 5, 6]) {
    await open(`${ORIGIN}/?fakeAdv=ok&fakeNano=ok&reelScene=${n}#/`);
    await sleep(1200);
    const info = await evaluate(`(() => { const f = document.querySelector('figure[data-reel]'); if (!f) return null;
      f.scrollIntoView({ block: 'center' }); const r = f.getBoundingClientRect();
      return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height, anims: f.getAnimations({ subtree: true }).length,
        counter: f.querySelector(':scope > div.grid > span.tabular-nums')?.textContent ?? '' }; })()`);
    if (!info) { console.error(`scene ${n}: no reel on the page (is this a DEV server?)`); process.exit(1); }
    if (!info.counter.startsWith(`${n} `)) { console.error(`scene ${n}: counter reads "${info.counter}"`); process.exit(1); }
    // Clip in whole CSS px (same size for every scene), with PAD px of page background around the reel so its text
    // does not touch the edge of the video.
    const rect = { x: Math.floor(info.x) - PAD, y: Math.floor(info.y) - PAD, w: Math.ceil(info.w) + 2 * PAD, h: Math.ceil(info.h) + 2 * PAD };
    if (!size) size = rect;
    else if (rect.w !== size.w || rect.h !== size.h) { console.error(`scene ${n}: reel size ${rect.w}x${rect.h} != ${size.w}x${size.h}`); process.exit(1); }
    const count = Math.round((SCENE_MS[n] / 1000) * fps);
    for (let f = 0; f < count; f++) {
      const ms = (f * 1000) / fps;
      await evaluate(`(() => { document.querySelector('figure[data-reel]').getAnimations({ subtree: true })
        .forEach((x) => { x.pause(); x.currentTime = ${ms}; }); return true; })()`);
      await evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
        clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 } });
      writeFileSync(join(dir, `f${String(k++).padStart(5, '0')}.png`), Buffer.from(shot.data, 'base64'));
    }
    // The poster: scene 6 at its resting end state (the frame the reel holds after its loops).
    if (n === POSTER) {
      await evaluate(`(() => { document.querySelector('figure[data-reel]').getAnimations({ subtree: true })
        .forEach((x) => { x.pause(); x.currentTime = 60000; }); return true; })()`);
      await sleep(100);
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
        clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 } });
      writeFileSync(join(dir, 'poster.png'), Buffer.from(shot.data, 'base64'));
    }
    console.log(`${scheme} scene ${n}: ${count} frames, ${info.anims} animation(s), reel ${rect.w}x${rect.h} css px`);
  }
  const scale = `scale=${outW}:-2:flags=lanczos`;
  ff(['-framerate', String(fps), '-i', join(dir, 'f%05d.png'), '-vf', `${scale},format=yuv420p`, '-c:v', 'libx264',
    '-preset', 'slow', '-crf', '18', '-tune', 'animation', '-movflags', '+faststart', '-r', String(fps), join(a.out, `story-reel.${scheme}.mp4`)]);
  ff(['-i', join(dir, 'poster.png'), '-vf', scale, join(a.out, `story-reel.${scheme}.poster.png`)]);
  if (gifSchemes.has(scheme)) {
    const gif = join(a.out, `story-reel.${scheme}.gif`);
    const gw = Number(a['gif-width']);
    const make = (gfps, colors) => ff(['-framerate', String(fps), '-i', join(dir, 'f%05d.png'), '-filter_complex',
      `fps=${gfps},scale=${gw}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
      '-loop', '0', gif]);
    make(Number(a['gif-fps']), 128);
    if (statSync(gif).size > 8 * 1024 * 1024) make(10, 64);
    console.log(`${scheme} gif: ${(statSync(gif).size / 1048576).toFixed(2)} MB`);
  }
  if (!a['keep-frames']) rmSync(dir, { recursive: true, force: true });
  console.log(`${scheme}: ${k} frames -> story-reel.${scheme}.mp4`);
}
ws.close();
process.exit(0);
