#!/usr/bin/env node
// scripts/shoot-ui.mjs: screenshots of every screen for design review (no dependencies; headless Chrome over CDP, the
// same approach as benchmark/spike/run-spike.mjs). Runs against the DEV server and ALWAYS adds ?fakeAdv=ok&fakeNano=ok
// to app URLs, so no AI request ever reaches the cloud. A fresh Chrome profile per run: no vault, nothing of the user's.
//
//   npm --prefix web run dev                      (port 5173)
//   node scripts/shoot-ui.mjs --out <dir> [--only home,judge-run] [--viewports desktop,mobile] [--scheme dark,light] [--reduced] [--port 5173]
//
// Writes <out>/<shot>.<viewport>.png (full page), or <out>/<shot>.<viewport>.<scheme>.png with --scheme (prefers-color-scheme
// emulated over CDP; a comma list shoots each scheme in turn), and prints one line per file plus any console errors.
// --reduced also emulates prefers-reduced-motion: reduce and adds `.reduced` to every file name (D-162 review).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { values: a } = parseArgs({ options: {
  out: { type: 'string' }, only: { type: 'string' }, viewports: { type: 'string', default: 'desktop,mobile' }, port: { type: 'string', default: '5173' },
  scheme: { type: 'string' }, reduced: { type: 'boolean', default: false },
} });
const USAGE = 'usage: --out <dir> [--only a,b] [--viewports desktop,mobile] [--scheme dark|light|dark,light] [--reduced] [--port 5173]';
if (!a.out) { console.error(USAGE); process.exit(2); }
/** [null] = no emulation (the browser default) and the old file names; otherwise each scheme in turn. */
const schemes = a.scheme ? a.scheme.split(',') : [null];
if (schemes.some((s) => s !== null && s !== 'dark' && s !== 'light')) { console.error(USAGE); process.exit(2); }
const port = Number(a.port);
const ORIGIN = `http://localhost:${port}`;
const VIEWPORTS = { desktop: { width: 1440, height: 900, mobile: false }, mobile: { width: 390, height: 844, mobile: true } };
const SAFE_Q = 'fakeAdv=ok&fakeNano=ok';

/**
 * Shots. steps: {click: 'button text'} | {wait: ms} | {waitText: 'text', timeout?: ms} | {shot: 'suffix'} (an extra
 * capture mid-flow) | {eval: 'js'}. ack:false shows the Welcome gate.
 */
const SHOTS = [
  { name: 'welcome', hash: '#/', ack: false },
  { name: 'home', hash: '#/' },
  { name: 'check-import', hash: '#/check' },
  { name: 'vault', hash: '#/vault' },
  { name: 'settings', hash: '#/settings' },
  { name: 'about', hash: '#/about' },
  { name: 'judge', hash: '#/judge' },
  { name: 'judge-run', hash: '#/judge', steps: [
    { click: 'Level crossing by a street sign, no text of yours' },
    { waitText: 'exact redacted copy', timeout: 60000 }, { wait: 1500 }, { shot: 'send' },
    { waitText: 'A stranger could find you', timeout: 90000 }, { wait: 1500 }, { shot: 'verdict' },
    { waitText: 'Risk reduced', timeout: 120000 }, { wait: 1500 },
  ] },
  { name: 'verdict-gallery', hash: '#/dev/verdicts' },
];

const only = a.only ? new Set(a.only.split(',')) : null;
const shots = SHOTS.filter((s) => !only || only.has(s.name));
const vps = a.viewports.split(',').map((v) => [v, VIEWPORTS[v]]).filter(([, v]) => v);
mkdirSync(a.out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!(await fetch(`${ORIGIN}/`).catch(() => null))?.ok) { console.error(`dev server not reachable on :${port}`); process.exit(1); }

const profile = mkdtempSync(join(tmpdir(), 'se-shoot-'));
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
const errors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails?.exception?.description ?? '').slice(0, 200));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((x) => x.value ?? x.description).join(' ').slice(0, 200));
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  const t = setTimeout(() => { pending.delete(i); reject(new Error(`CDP ${method} timed out`)); }, 60_000);
  pending.set(i, (m) => { clearTimeout(t); m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result); });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
const bodyText = () => evaluate('document.body.innerText');

async function capture(file) {
  // Headless capture beyond the viewport can paint compositor (opacity/transform) animations at their FIRST frame even
  // after they finished, so chips read as faded and the packet as stuck at the gate. Bake each finite animation's end
  // state into inline style and drop the animation, so the shot shows the state a real browser rests in.
  await evaluate(`document.getAnimations().forEach((x) => {
    if (x.effect?.getComputedTiming().iterations === Infinity) return;
    x.finish(); try { x.commitStyles(); } catch { /* not rendered */ } x.cancel();
  }), true`);
  const m = await send('Page.getLayoutMetrics');
  const w = Math.ceil(m.cssContentSize?.width ?? m.contentSize.width);
  const h = Math.min(Math.ceil(m.cssContentSize?.height ?? m.contentSize.height), 12000);
  // Beyond-viewport capture only when the page is taller than the viewport: that path can paint stale compositor layers.
  const beyond = h > (m.cssLayoutViewport?.clientHeight ?? 0);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: beyond, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`wrote ${file} (${w}x${h})`);
}

async function navigate(url) {
  await send('Page.navigate', { url });
  for (let i = 0; i < 60; i++) { await sleep(250); if ((await evaluate('document.readyState')) === 'complete') break; }
  await sleep(1200);
}

await send('Runtime.enable');
await send('Page.enable');
for (const scheme of schemes) {
const features = [...(scheme ? [{ name: 'prefers-color-scheme', value: scheme }] : []), ...(a.reduced ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [])];
if (features.length) await send('Emulation.setEmulatedMedia', { features });
const sfx = `${scheme ? `.${scheme}` : ''}${a.reduced ? '.reduced' : ''}`;
for (const [vpName, vp] of vps) {
  await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile });
  for (const s of shots) {
    const before = errors.length;
    // A clean origin state per shot: clear storage, then set the 18+ acknowledgement unless the shot is the gate.
    await navigate(`${ORIGIN}/?${SAFE_Q}#/about`);
    await evaluate(`localStorage.clear(); ${s.ack === false ? '' : "localStorage.setItem('se.ack18.v1','1');"} true`);
    await navigate(`${ORIGIN}/?${SAFE_Q}&shot=${s.name}${s.hash}`);
    await evaluate('location.reload(), true');
    await sleep(2500);
    try {
      for (const st of s.steps ?? []) {
        if (st.wait) await sleep(st.wait);
        if (st.click) {
          const ok = await evaluate(`(() => { const b = [...document.querySelectorAll('button,a,[role=button]')].find((e) => e.innerText.trim() === ${JSON.stringify(st.click)}); if (!b) return false; b.click(); return true; })()`);
          if (!ok) throw new Error(`no button "${st.click}"`);
        }
        if (st.waitText) {
          const until = Date.now() + (st.timeout ?? 30000);
          while (!(await bodyText()).includes(st.waitText)) { if (Date.now() > until) throw new Error(`timed out waiting for "${st.waitText}"`); await sleep(500); }
        }
        if (st.eval) await evaluate(st.eval);
        if (st.shot) await capture(join(a.out, `${s.name}-${st.shot}.${vpName}${sfx}.png`));
      }
      await capture(join(a.out, `${s.name}.${vpName}${sfx}.png`));
    } catch (e) {
      console.log(`FAILED ${s.name}.${vpName}${sfx}: ${e.message}`);
      await capture(join(a.out, `${s.name}.${vpName}${sfx}.FAILED.png`)).catch(() => undefined);
    }
    for (const e of errors.slice(before)) console.log(`  console error (${s.name}.${vpName}${sfx}): ${e}`);
  }
}
}
ws.close();
process.exit(0);
