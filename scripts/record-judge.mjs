#!/usr/bin/env node
// scripts/record-judge.mjs: record LIVE pass-B answers for the Judge Mode samples (RUNBOOK §6.2b step 5; D-161).
// Headless Chrome over CDP (as scripts/shoot-ui.mjs) against a DEV server started with HMR off, so no hot update can
// restart a live run and repeat cloud calls:
//   VITE_SPIKE=1 npm --prefix web run dev -- --port 5175 --strictPort
//   node scripts/record-judge.mjs [--port 5175] [--only judge-01,judge-03] [--timeout 300000]
// Opens #/judge with ?recordJudge=1 and NO fake seams, picks each sample on a fresh page (autoplay on), and waits until
// the dev server has written the sample's re-attack recording (PRIV/raw/judge-rec/<id>.r2.*.json) or the run ends.
// Every answer is the real attacker's, through the real Egress Gate; web/src/dev/judgeRecord.ts posts only answers
// the strict parser accepted. One run per sample: never loop to fish for a nicer answer.
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const REC_DIR = '/Users/mac/StrangersEyes-private/raw/judge-rec';
const { values: a } = parseArgs({ options: { port: { type: 'string', default: '5175' }, only: { type: 'string' }, timeout: { type: 'string', default: '300000' } } });
const ORIGIN = `http://localhost:${a.port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!(await fetch(`${ORIGIN}/`).catch(() => null))?.ok) { console.error(`dev server not reachable on :${a.port}`); process.exit(1); }
const manifest = await (await fetch(`${ORIGIN}/samples/manifest.json`)).json();
const only = a.only ? new Set(a.only.split(',')) : null;
const samples = manifest.samples.filter((s) => !only || only.has(s.id));
const recs = (id) => { try { return readdirSync(REC_DIR).filter((f) => f.startsWith(`${id}.`)); } catch { return []; } };

const profile = mkdtempSync(join(tmpdir(), 'se-rec-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch { /* gone */ } try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } });
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.on(sig, () => process.exit(code));
let cdpPort = null;
for (let i = 0; i < 80 && !cdpPort; i++) { await sleep(250); try { cdpPort = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch { /* not yet */ } }
if (!cdpPort) { console.error('headless Chrome did not start'); process.exit(1); }
const page = (await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json())).find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') console.log(`  page exception: ${(m.params.exceptionDetails?.exception?.description ?? '').slice(0, 200)}`);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  const t = setTimeout(() => { pending.delete(i); reject(new Error(`CDP ${method} timed out`)); }, 60_000);
  pending.set(i, (m) => { clearTimeout(t); m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result); });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
async function navigate(url) {
  await send('Page.navigate', { url });
  for (let i = 0; i < 60; i++) { await sleep(250); if ((await evaluate('document.readyState')) === 'complete') break; }
  await sleep(1500);
}
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const ENDINGS = ['Risk reduced', 'Still exposed', 'on-device findings only'];
for (const s of samples) {
  const before = new Set(recs(s.id));
  await navigate(`${ORIGIN}/?recordJudge=1#/about`);
  await evaluate("localStorage.clear(); localStorage.setItem('se.ack18.v1','1'); true");
  await navigate(`${ORIGIN}/?recordJudge=1#/judge`);
  await evaluate('location.reload(), true');
  await sleep(3000);
  const clicked = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((e) => e.innerText.includes(${JSON.stringify(s.title)})); if (!b) return false; b.click(); return true; })()`);
  if (!clicked) { console.log(`${s.id}: no sample button "${s.title}"`); continue; }
  const t0 = Date.now();
  let ended = null;
  let settled = null;
  while (Date.now() - t0 < Number(a.timeout)) {
    await sleep(2000);
    const fresh = recs(s.id).filter((f) => !before.has(f));
    const text = (await evaluate('document.body.innerText')) ?? '';
    if (fresh.some((f) => /\.r[2-9]\./.test(f))) { ended = 're-attack recorded'; await sleep(4000); break; }
    // A refusal ends the run; a final verdict without a re-attack recording means the live call failed and the
    // labelled recording replaced it (or the fix sent nothing new): give it 15 s to settle, then stop.
    if (text.includes('on-device findings only')) { ended = 'refused (on-device findings only)'; break; }
    if ((text.includes('Risk reduced') || text.includes('Still exposed'))) {
      settled ??= Date.now();
      if (Date.now() - settled > 15000) { ended = 'final verdict without a re-attack recording'; break; }
    }
  }
  const fresh = recs(s.id).filter((f) => !before.has(f));
  const text = (await evaluate('document.body.innerText')) ?? '';
  const verdicts = ENDINGS.filter((e) => text.includes(e));
  console.log(`${s.id}: ${ended ?? 'timed out'} after ${Math.round((Date.now() - t0) / 1000)} s; new files: ${fresh.join(', ') || 'none'}; page shows: ${verdicts.join(' | ') || '-'}`);
}
ws.close();
process.exit(0);
