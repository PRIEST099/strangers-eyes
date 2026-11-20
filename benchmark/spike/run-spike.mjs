#!/usr/bin/env node
// benchmark/spike/run-spike.mjs: unattended runner for the Day-1 adversary spike (T-031, RUNBOOK §5.1).
// Drives headless Chrome over CDP against a dev server started with VITE_SPIKE=1. That dev server serves PRIV/spike via
// /@fs/, has HMR and its websocket off, and carries the App Check debug token from web/.env.development.local
// (never read or printed here).
//
//   VITE_SPIKE=1 npm --prefix web run dev -- --port 5174 --strictPort      (separate terminal / background)
//   node benchmark/spike/run-spike.mjs --mode dry  [--photos 01,02] [--models flash,hydrogen]
//   node benchmark/spike/run-spike.mjs --mode live [--photos …] [--probe u12]
//
// Output goes to PRIV/raw only (it holds model coordinates and place names), under a timestamped stem that never
// overwrites: <stem>.partial.json while running (rewritten on every new call), <stem>.json at the end, and contact
// sheets of the exact JPEGs sent. stdout shows the page log, which has counts only.
// Safety (T-031 review): this runner only ever talks to the Chrome it spawned (port 0 + DevToolsActivePort); if a live
// page navigates a second time it kills Chrome at once and keeps the partial; any exit kills Chrome.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const PRIV_RAW = '/Users/mac/StrangersEyes-private/raw';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ALL = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];

const { values: a } = parseArgs({
  strict: true,
  options: {
    mode: { type: 'string' }, photos: { type: 'string' }, models: { type: 'string' }, probe: { type: 'string' }, variants: { type: 'string' }, primary: { type: 'string', default: 'flash' }, adaptive: { type: 'boolean', default: false },
    port: { type: 'string', default: '5174' }, 'max-minutes': { type: 'string', default: '150' },
  },
});
const fail = (msg) => { console.error(`[runner] ${msg}`); process.exit(2); };
if (a.mode !== 'dry' && a.mode !== 'live' && a.mode !== 'schema') fail('usage: --mode dry|live|schema [--photos 01,02] [--models flash,hydrogen] [--probe u12] [--port 5174]');
const mode = a.mode;
const list = (v, name) => {
  if (v === undefined) return undefined;
  const xs = [...new Set(v.split(',').map((s) => s.trim()).filter(Boolean))];
  if (!xs.length) fail(`--${name} is empty`);
  return xs;
};
const photos = list(a.photos, 'photos')?.map((p) => p.padStart(2, '0'));
if (photos?.some((p) => !ALL.includes(p))) fail(`--photos must be among ${ALL.join(',')}`);
const models = list(a.models, 'models');
if (models?.some((m) => m !== 'flash' && m !== 'hydrogen')) fail('--models must be flash and/or hydrogen');
if (a.probe !== undefined && a.probe !== 'u12') fail('--probe only supports u12');
if (a.primary !== 'flash' && a.primary !== 'hydrogen') fail('--primary must be flash or hydrogen');
if (models && !models.includes(a.primary)) fail('--models must include the --primary model');
const port = Number(a.port);
const maxMinutes = Number(a['max-minutes']);

const q = new URLSearchParams({ autorun: mode });
if (photos) q.set('photos', photos.join(','));
if (models) q.set('models', models.join(','));
if (a.probe) q.set('probe', a.probe);
if (a.variants) q.set('variants', a.variants);
if (a.primary !== 'flash') q.set('primary', a.primary);
if (a.adaptive) q.set('adaptive', '1');
const url = `http://localhost:${port}/?${q}#/dev/adversary`;
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const stem = `${PRIV_RAW}/spike-${ts}-${mode}${photos ? '-p' + photos.join('_') : ''}`;
if (existsSync(`${stem}.json`) || existsSync(`${stem}.partial.json`)) fail(`${stem}.* already exists`);
const planned = (photos ?? ALL).length * (models ?? ['flash', 'hydrogen']).reduce((n, m) => n + (m === a.primary ? 3 : 1), 0) + (a.probe ? 1 : 0);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const head = await fetch(`http://localhost:${port}/`).catch(() => null);
if (!head?.ok) fail(`dev server not reachable on :${port} (start it with VITE_SPIKE=1)`);

// ---------------------------------------------------------------- our own Chrome (never attach to another one)
mkdirSync(PRIV_RAW, { recursive: true });
const profile = join(PRIV_RAW, `.chrome-${ts}`); // inside PRIV: its HTTP cache may hold copies of the photos
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--disk-cache-size=1',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
let chromeDead = false;
chrome.on('exit', () => { chromeDead = true; });
const killChrome = (sig = 'SIGTERM') => { if (!chromeDead) { try { chrome.kill(sig); } catch { /* gone */ } } };
process.on('exit', () => { killChrome('SIGKILL'); try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } });
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(sig, () => process.exit(code));

let cdpPort = null;
for (let i = 0; i < 80 && !cdpPort; i++) {
  await sleep(250);
  try { cdpPort = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch { /* not yet */ }
}
if (!cdpPort) { console.error('[runner] headless Chrome did not start'); process.exit(1); }
const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json());
const page = targets.find((t) => t.type === 'page');
if (!page || page.url !== 'about:blank') { console.error('[runner] unexpected Chrome target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
let id = 0;
const pending = new Map();
const consoleErrors = [];
let navigations = 0;
let aborted = null;
let fatal = null;
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push('EXC ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 300));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push('ERR ' + m.params.args.map((x) => x.value ?? x.description).join(' ').slice(0, 300));
  if (m.method === 'Inspector.targetCrashed') fatal = 'renderer crashed';
  if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId && m.params.frame.url.startsWith(`http://localhost:${port}/`)) {
    navigations++;
    if (mode !== 'dry' && navigations > 1 && !aborted) {
      aborted = `the page navigated again (reload?): Chrome killed at once so no cloud call can repeat`;
      killChrome('SIGKILL');
    }
  }
});
ws.addEventListener('close', () => { for (const p of pending.values()) p.reject(new Error('CDP connection closed')); pending.clear(); });
const send = (method, params = {}) => new Promise((resolve, reject) => {
  if (ws.readyState !== WebSocket.OPEN) { reject(new Error('CDP connection closed')); return; }
  const i = ++id;
  const t = setTimeout(() => { pending.delete(i); reject(new Error(`CDP ${method} timed out`)); }, 30_000);
  pending.set(i, { resolve: (m) => { clearTimeout(t); resolve(m); }, reject: (e) => { clearTimeout(t); reject(e); } });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evalJson = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: `JSON.stringify(${expr})`, returnByValue: true });
  const v = r.result?.result?.value;
  return v === undefined ? undefined : JSON.parse(v);
};

// ---------------------------------------------------------------- run
let state = 'idle';
let final = null;
try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Inspector.enable').catch(() => {});
  console.log(`[runner] ${mode}: primary ${a.primary}; photos ${(photos ?? ALL).join(',')} × models ${(models ?? ['flash', 'hydrogen']).join(',')}${a.probe ? ' + probe ' + a.probe : ''}`);
  if (mode === 'schema') console.log('[runner] SCHEMA probe: text-only calls, at most 3 per model, no image');
  if (mode === 'live') console.log(`[runner] LIVE: about ${planned} cloud calls planned, plus G1b reruns (≤ 1 per located photo) and at most 1 resend per call on 429/5xx/network`);
  const nav = await send('Page.navigate', { url });
  if (nav.result?.errorText) throw new Error(`navigate failed: ${nav.result.errorText}`);

  const t0 = Date.now();
  let shown = 0;
  let lastProgress = '';
  while (Date.now() - t0 < maxMinutes * 60_000 && !aborted && !fatal) {
    await sleep(3000);
    if (aborted || fatal) break;
    const s = await evalJson(`globalThis.__advSpike ? { state: __advSpike.state, log: __advSpike.log.slice(${shown}),
      progress: __advSpike.result ? [__advSpike.result.photos.length, __advSpike.result.callsSent,
        __advSpike.result.photos.reduce((n, p) => n + p.runs.length, 0), __advSpike.result.probes.length].join('/') : '' } : null`);
    if (!s) continue;
    for (const line of s.log) console.log(line);
    shown += s.log.length;
    state = s.state;
    if (s.progress && s.progress !== lastProgress) {
      lastProgress = s.progress;
      const partial = await evalJson('__advSpike.result');
      if (partial != null) writeFileSync(`${stem}.partial.json`, JSON.stringify(partial, null, 1));
    }
    if (state === 'done' || state === 'error') break;
  }
  if (!aborted && !fatal) final = await evalJson('globalThis.__advSpike ?? null');
} catch (e) {
  fatal = fatal ?? String(e?.message ?? e);
}

let code = 0;
if (aborted || fatal) {
  console.error(`[runner] ${aborted ? 'ABORTED' : 'FATAL'}: ${aborted ?? fatal}`);
  if (existsSync(`${stem}.partial.json`)) console.error(`[runner] the partial record is kept: ${stem}.partial.json`);
  code = 1;
} else if (state !== 'done') {
  console.error(`[runner] state=${state}`);
  code = 1;
}
if (final?.result) {
  writeFileSync(`${stem}.json`, JSON.stringify({ ...final.result, runnerState: state, pageError: final.error ?? null, log: final.log, consoleErrors: consoleErrors.slice(0, 50) }, null, 1), { flag: 'wx' });
  console.log(`[runner] raw → ${stem}.json`);
  rmSync(`${stem}.partial.json`, { force: true });
}
if (final?.contactSent) { writeFileSync(`${stem}-sent.jpg`, Buffer.from(final.contactSent, 'base64'), { flag: 'wx' }); console.log(`[runner] contact sheet (sent) → ${stem}-sent.jpg`); }
if (final?.contactFix) { writeFileSync(`${stem}-fix.jpg`, Buffer.from(final.contactFix, 'base64'), { flag: 'wx' }); console.log(`[runner] contact sheet (fixed) → ${stem}-fix.jpg`); }
if (final?.error) console.error(`[runner] page error: ${String(final.error).split('\n')[0]}`);
if (consoleErrors.length) console.log(`[runner] ${consoleErrors.length} console errors (first: ${consoleErrors[0].slice(0, 160)})`);
try { ws.close(); } catch { /* ignore */ }
killChrome();
for (let i = 0; i < 20 && !chromeDead; i++) await sleep(250);
process.exit(code);
