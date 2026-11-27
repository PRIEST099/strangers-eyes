#!/usr/bin/env node
// scripts/measure-nano-stability.mjs: the pre-registered "Nano stability on the Judge Mode samples" (PRIV bench/PROTOCOL.md).
// Each Judge Mode sample is run end to end N times (default 10) in Judge Mode with autoplay, Gemini Nano on and the
// app's own Simulate offline on, so the recorded Nov 23 attacker answers replay (CACHED SAMPLE) and NO cloud call is
// made (every request to a Google AI host is counted; any is a failure of the run). Each run is a fresh headless Chrome
// profile (never the user's own), removed afterwards. Per run it records the first verdict level, the final outcome
// (the comparison headline, or "nothing to mask") and the Cloud Ledger counters (on-device calls, rules-only fallbacks).
//
//   SE_NANO=<dir holding an OptGuideOnDeviceModel folder> node scripts/measure-nano-stability.mjs [--runs 10] [--samples crossing,...]
//
// Output: PRIV raw/nano-stability-<timestamp>.json (UI text only; numbers with 3+ decimals are scrubbed) and a summary
// on stdout; docs/nano-stability.md is written by hand from it. Needs the DEV server (`npm --prefix web run dev`, :5173).
// On 8 GB RAM never run this while the iOS Simulator runs Apple FM (CLAUDE.md invariant 11).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SE_ORIGIN ?? 'http://localhost:5173';
const NANO = process.env.SE_NANO ?? '';
const RAW_DIR = '/Users/mac/StrangersEyes-private/raw';
const NANO_FLAGS = '--enable-features=OptimizationGuideOnDeviceModel:BypassPerfRequirement/true,PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultimodalInput,AIPromptAPIMultimodalInput';
const AI_HOST = /(generativelanguage|firebasevertexai|aiplatform)\.googleapis\.com/;
const SAMPLES = {
  station: 'Station forecourt, no text of yours',
  crossing: 'Level crossing by a street sign, no text of yours',
  castle: 'Castle view with a name-tag lunchbox',
};
const LEVELS = [['A stranger could find you', 'RED'], ['This photo narrows things down', 'AMBER'], ['Low exposure found', 'LOW'], ['Partial result', 'PARTIAL']];
const FINAL = ['Risk reduced', 'Still exposed', 'None of the clues the attacker used can be masked'];

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const RUNS = Number(arg('--runs') ?? 10);
const WANT = (arg('--samples') ?? 'station,crossing,castle').split(',');
if (!NANO || !existsSync(join(NANO, 'OptGuideOnDeviceModel'))) { console.error('SE_NANO must name a folder holding OptGuideOnDeviceModel'); process.exit(1); }
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(ORIGIN)) { console.error('SE_ORIGIN must be a local DEV server'); process.exit(1); }
if (WANT.some((s) => !SAMPLES[s]) || !(RUNS >= 1 && RUNS <= 20)) { console.error('bad --samples or --runs'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scrub = (s) => String(s ?? '').replace(/-?\d+\.\d{3,}/g, '<num>');
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

async function oneRun(sample, n) {
  const profile = mkdtempSync(join(tmpdir(), 'se-stab-'));
  symlinkSync(join(NANO, 'OptGuideOnDeviceModel'), join(profile, 'OptGuideOnDeviceModel'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio', NANO_FLAGS, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  const cloud = [];
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
      if (m.method === 'Network.requestWillBeSent') { try { if (AI_HOST.test(new URL(m.params.request.url).host)) cloud.push(new URL(m.params.request.url).host); } catch { /* data: URL */ } }
    });
    const send = (method, params = {}) => new Promise((res, rej) => {
      const i = ++id; const t = setTimeout(() => { pending.delete(i); rej(new Error(`CDP ${method} timed out`)); }, 60_000);
      pending.set(i, (m) => { clearTimeout(t); m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result); });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
    const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
    const body = async () => (await evaluate('document.body.innerText')) ?? '';
    const go = async (url) => { await send('Page.navigate', { url }); for (let i = 0; i < 80; i++) { await sleep(250); if ((await evaluate('document.readyState')) === 'complete') break; } };
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await go(`${ORIGIN}/#/about`);
    await evaluate("localStorage.clear(); sessionStorage.clear(); localStorage.setItem('se.ack18.v1','1'); localStorage.setItem('se.dev.simulateOffline','1'); true");
    let av = '';
    for (let i = 0; i < 60 && av !== 'available'; i++) { av = await evaluate("(async()=>{ try { return await LanguageModel.availability(); } catch (e) { return 'err ' + e.message; } })()"); if (av !== 'available') await sleep(2000); }
    if (av !== 'available') throw new Error(`Nano not available (${av})`);
    await go(`${ORIGIN}/#/judge`); await evaluate('location.reload(), true'); await sleep(2500);
    // autoplay on, then pick the sample
    for (let i = 0; i < 40 && !(await body()).includes('Run all'); i++) await sleep(500);
    await evaluate(`(() => { const b = [...document.querySelectorAll('input[type=checkbox],[role=switch]')].find((e) => ((e.closest('label')||e.parentElement)?.innerText||'').includes('Autoplay'));
      if (b) { const on = b.checked ?? b.getAttribute('aria-checked') === 'true'; if (!on) b.click(); } return true; })()`);
    const picked = await evaluate(`(() => { const t = ${JSON.stringify(SAMPLES[sample])}; const b = [...document.querySelectorAll('button,a,[role=button]')].find((e) => (e.innerText||e.getAttribute('aria-label')||'').trim().startsWith(t)); if (!b) return false; b.click(); return true; })()`);
    if (!picked) throw new Error('sample button not found');
    const t0 = Date.now();
    let text = '';
    for (;;) { // first verdict
      text = await body();
      const lv = LEVELS.find(([k]) => text.includes(k));
      if (lv) { rec.firstLevel = lv[1]; rec.firstVerdictS = Math.round((Date.now() - t0) / 100) / 10; break; }
      if (Date.now() - t0 > 240_000) throw new Error('no verdict in 240 s');
      await sleep(500);
    }
    for (;;) { // final outcome: a comparison headline, or the fix panel's "nothing to mask"
      text = await body();
      const f = FINAL.find((k) => text.includes(k));
      if (f) {
        await sleep(1500); text = await body();
        rec.outcome = f.startsWith('None of the clues') ? 'nothing to mask' : f;
        const at = text.indexOf(f.startsWith('None') ? f : `${f}`);
        rec.outcomeText = scrub(text.slice(at, at + 220).replace(/\s+/g, ' '));
        rec.finalS = Math.round((Date.now() - t0) / 100) / 10;
        break;
      }
      // autoplay stops at the fix panel for a sample with nothing to mask; it may also wait at "Fix it on this device"
      if (/Fix it on this device/.test(text) && Date.now() - t0 > 20_000) await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((e) => e.innerText.trim().startsWith('Fix it on this device')); if (b && !b.disabled) b.click(); return true; })()`);
      if (Date.now() - t0 > 420_000) throw new Error('no final outcome in 420 s');
      await sleep(700);
    }
    const ledger = /On-device AI calls: (\d+) · Rules-only fallbacks: (\d+) · Blocked: (\d+)/.exec(text);
    if (ledger) { rec.onDeviceCalls = Number(ledger[1]); rec.fallbacks = Number(ledger[2]); rec.blocked = Number(ledger[3]); }
    rec.ok = true;
  } catch (e) {
    rec.error = String(e.message ?? e);
  } finally {
    rec.aiHostRequests = cloud.length;
    try { ws?.close(); } catch { /* closed */ }
    try { chrome.kill('SIGKILL'); } catch { /* gone */ }
    await sleep(800);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  return rec;
}

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = join(RAW_DIR, `nano-stability-${ts}.json`);
const results = [];
for (const s of WANT) {
  for (let n = 1; n <= RUNS; n++) {
    const r = await oneRun(s, n);
    results.push(r);
    writeFileSync(out, JSON.stringify({ protocol: 'Nano stability on the Judge Mode samples (PROTOCOL.md, 2026-11-27)', origin: ORIGIN, runs: RUNS, results }, null, 1) + '\n');
    log(`${s} #${n}: ${r.ok ? `${r.firstLevel} -> ${r.outcome} (on-device ${r.onDeviceCalls}, fallbacks ${r.fallbacks}, ${r.finalS} s)` : `ERROR ${r.error}`}; AI-host requests ${r.aiHostRequests}`);
  }
}
for (const s of WANT) {
  const rs = results.filter((r) => r.sample === s);
  const tally = {};
  for (const r of rs) { const k = r.ok ? `${r.firstLevel} -> ${r.outcome}` : 'error'; tally[k] = (tally[k] ?? 0) + 1; }
  console.log(`${s}: ${JSON.stringify(tally)}; fallbacks ${rs.reduce((a, r) => a + (r.fallbacks ?? 0), 0)}; AI-host requests ${rs.reduce((a, r) => a + r.aiHostRequests, 0)}`);
}
console.log(`raw: ${out}`);
