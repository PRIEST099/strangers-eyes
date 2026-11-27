#!/usr/bin/env node
// scripts/measure-sealed.mjs: the pre-registered "Sealed answer, opened offline" measurement (PRIV bench/PROTOCOL.md, D-182).
// Each Judge Mode sample runs N times (default 5) with Gemini Nano, autoplay on, the "Prove it offline" switch on and the
// app's own Simulate offline on (so the first answer is the recorded Nov 23 one: no live attack). At the sealed card the
// page's network is cut with Chrome's own offline emulation (CDP Network.emulateNetworkConditions offline: the page sees
// navigator.onLine = false and an "offline" event, as with Wi-Fi off), "Open it offline" is clicked, and the script
// records the stamp's counts, the guess check's route and latency (from the Router HUD pill), and every request the page
// attempted while offline (by host). Then the network is restored. A fresh headless Chrome profile per run.
//
//   SE_NANO=<dir holding an OptGuideOnDeviceModel folder> node scripts/measure-sealed.mjs [--runs 5] [--samples castle,...]
//
// Output: PRIV raw/sealed-<timestamp>.json (UI text only) and a summary; docs/sealed-answer.md is written by hand.
// Needs the DEV server (:5173). Never run while the iOS Simulator runs Apple FM (8 GB RAM, CLAUDE.md invariant 11).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SE_ORIGIN ?? 'http://localhost:5173';
const NANO = process.env.SE_NANO ?? '';
const RAW_DIR = '/Users/mac/StrangersEyes-private/raw';
const NANO_FLAGS = '--enable-features=OptimizationGuideOnDeviceModel:BypassPerfRequirement/true,PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultimodalInput,AIPromptAPIMultimodalInput';
const SAMPLES = {
  station: 'Station forecourt, no text of yours',
  crossing: 'Level crossing by a street sign, no text of yours',
  castle: 'Castle view with a name-tag lunchbox',
};
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const RUNS = Number(arg('--runs') ?? 5);
const WANT = (arg('--samples') ?? 'station,crossing,castle').split(',');
if (!NANO || !existsSync(join(NANO, 'OptGuideOnDeviceModel'))) { console.error('SE_NANO must name a folder holding OptGuideOnDeviceModel'); process.exit(1); }
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(ORIGIN)) { console.error('SE_ORIGIN must be a local DEV server'); process.exit(1); }
if (WANT.some((s) => !SAMPLES[s]) || !(RUNS >= 1 && RUNS <= 20)) { console.error('bad --samples or --runs'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scrub = (s) => String(s ?? '').replace(/-?\d+\.\d{3,}/g, '<num>');
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

async function oneRun(sample, n) {
  const profile = mkdtempSync(join(tmpdir(), 'se-seal-'));
  symlinkSync(join(NANO, 'OptGuideOnDeviceModel'), join(profile, 'OptGuideOnDeviceModel'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio', NANO_FLAGS, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  let offline = false;
  const attempted = {}; // host -> count, requests the page attempted while offline
  const rec = { sample, run: n, startedAt: new Date().toISOString(), ok: false };
  try {
    let port = null;
    for (let i = 0; i < 80 && !port; i++) { await sleep(250); try { port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch { /* not yet */ } }
    if (!port) throw new Error('Chrome did not start');
    const target = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())).find((t) => t.type === 'page');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
    let id = 0; const pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      if (offline && m.method === 'Network.requestWillBeSent') {
        try { const h = new URL(m.params.request.url).host || '(data)'; attempted[h] = (attempted[h] ?? 0) + 1; } catch { /* ignore */ }
      }
    });
    const send = (method, params = {}) => new Promise((res, rej) => {
      const i = ++id; const t = setTimeout(() => { pending.delete(i); rej(new Error(`CDP ${method} timed out`)); }, 60_000);
      pending.set(i, (m) => { clearTimeout(t); m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result); });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
    const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
    const body = async () => (await evaluate('document.body.innerText')) ?? '';
    const go = async (url) => { await send('Page.navigate', { url }); for (let i = 0; i < 80; i++) { await sleep(250); if ((await evaluate('document.readyState')) === 'complete') break; } };
    const net = (off) => send('Network.emulateNetworkConditions', { offline: off, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await go(`${ORIGIN}/#/about`);
    await evaluate("localStorage.clear(); sessionStorage.clear(); localStorage.setItem('se.ack18.v1','1'); localStorage.setItem('se.dev.simulateOffline','1'); true");
    let av = '';
    for (let i = 0; i < 60 && av !== 'available'; i++) { av = await evaluate("(async()=>{ try { return await LanguageModel.availability(); } catch (e) { return 'err ' + e.message; } })()"); if (av !== 'available') await sleep(2000); }
    if (av !== 'available') throw new Error(`Nano not available (${av})`);
    await go(`${ORIGIN}/#/judge`); await evaluate('location.reload(), true'); await sleep(2500);
    for (let i = 0; i < 40 && !(await body()).includes('Run all'); i++) await sleep(500);
    // autoplay on, the switch on, then pick the sample
    for (const label of ['Autoplay', 'Prove it offline']) {
      await evaluate(`(() => { const b = [...document.querySelectorAll('input[type=checkbox],[role=switch]')].find((e) => ((e.closest('label')||e.parentElement)?.innerText||'').startsWith(${JSON.stringify(label)}));
        if (b) { const on = b.checked ?? b.getAttribute('aria-checked') === 'true'; if (!on) b.click(); } return true; })()`);
    }
    const picked = await evaluate(`(() => { const t = ${JSON.stringify(SAMPLES[sample])}; const b = [...document.querySelectorAll('button,a,[role=button]')].find((e) => (e.innerText||e.getAttribute('aria-label')||'').trim().startsWith(t)); if (!b) return false; b.click(); return true; })()`);
    if (!picked) throw new Error('sample button not found');
    const t0 = Date.now();
    for (;;) { // the sealed card
      if (await evaluate("!!document.querySelector('[data-testid=sealed-answer]')")) break;
      if (Date.now() - t0 > 240_000) throw new Error('no sealed card in 240 s');
      await sleep(500);
    }
    rec.sealedS = Math.round((Date.now() - t0) / 100) / 10;
    // cut the network; the card must say so and enable "Open it offline"
    offline = true;
    await net(true);
    await sleep(800);
    rec.pageOnline = await evaluate('navigator.onLine');
    rec.cardSaysOff = await evaluate("document.querySelector('[data-connection]')?.getAttribute('data-connection') === 'off'");
    const clicked = await evaluate("(() => { const b = document.querySelector('[data-action=open-offline]'); if (!b || b.disabled) return false; b.click(); return true; })()");
    if (!clicked) throw new Error('"Open it offline" not enabled with the network cut');
    const t1 = Date.now();
    for (;;) { // the stamp over the verdict
      const st = await evaluate("document.querySelector('[data-testid=seal-stamp]')?.innerText ?? null");
      if (st && /A stranger could find you|narrows things down|Low exposure found|Partial result/.test(await body())) { rec.stamp = scrub(st.replace(/\s+/g, ' ')); break; }
      if (Date.now() - t1 > 120_000) throw new Error('no verdict and stamp in 120 s after opening');
      await sleep(400);
    }
    rec.openToVerdictS = Math.round((Date.now() - t1) / 100) / 10;
    const m = /on-device AI calls: (\d+) · simple-rules checks: (\d+) · cloud AI calls: (\d+)/.exec(rec.stamp);
    if (m) { rec.onDevice = Number(m[1]); rec.rules = Number(m[2]); rec.cloud = Number(m[3]); }
    // the guess check's route from the HUD pill ("AI calls Guess check › ON-DEVICE 3.4 s")
    const pill = await evaluate("(document.body.innerText.match(/Guess check\\s*›\\s*[A-Z-]+[^\\n]*/) || [''])[0]");
    rec.guessCheck = scrub(pill);
    rec.attemptedWhileOffline = { ...attempted };
    offline = false;
    await net(false);
    rec.ok = true;
  } catch (e) {
    rec.error = String(e.message ?? e);
    rec.attemptedWhileOffline = { ...attempted };
  } finally {
    try { ws?.close(); } catch { /* closed */ }
    try { chrome.kill('SIGKILL'); } catch { /* gone */ }
    await sleep(800);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  return rec;
}

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = join(RAW_DIR, `sealed-${ts}.json`);
const results = [];
for (const s of WANT) {
  for (let n = 1; n <= RUNS; n++) {
    const r = await oneRun(s, n);
    results.push(r);
    writeFileSync(out, JSON.stringify({ protocol: 'Sealed answer, opened offline (PROTOCOL.md, 2026-11-27)', origin: ORIGIN, runs: RUNS, results }, null, 1) + '\n');
    log(`${s} #${n}: ${r.ok ? `card off ${r.cardSaysOff} · stamp on-device ${r.onDevice} rules ${r.rules} cloud ${r.cloud} · ${r.guessCheck} · open→verdict ${r.openToVerdictS} s · attempted offline ${JSON.stringify(r.attemptedWhileOffline)}` : `ERROR ${r.error}`}`);
  }
}
const ok = results.filter((r) => r.ok);
console.log(`runs ${results.length}, ok ${ok.length}, guess check ON-DEVICE ${ok.filter((r) => /ON-DEVICE/.test(r.guessCheck)).length}, any cloud on stamp ${ok.filter((r) => r.cloud > 0).length}`);
console.log(`raw: ${out}`);
