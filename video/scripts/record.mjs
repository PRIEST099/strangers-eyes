#!/usr/bin/env node
// video/scripts/record.mjs: real app footage for the demo video (T-180; D-164). Headless Chrome over CDP drives the
// DEV server (`npm --prefix web run dev`, port 5173) and grabs frames continuously; ffmpeg turns them into
// public/clips/<clip>.mp4 (1920x1080, 30 fps). Each clip also records "marks" (seconds into the clip when something
// appeared), which the composition uses to cut on the moment. Writes public/clips.json { durations, marks }.
//   node scripts/record.mjs                 every clip
//   node scripts/record.mjs castle gate     some clips
//
// Honesty rules (CLAUDE.md, docs/VIDEO.md §0):
//   - No fake seams (?fakeAdv / ?fakeNano) ever: footage shows the real app.
//   - Judge runs that reach the attacker use the app's own "Simulate offline" (localStorage se.dev.simulateOffline), so
//     Judge Mode replays the shipped live recordings, badged CACHED SAMPLE on screen, and no sample photo is sent to the
//     attacker again (the user's rule: one live run per photo, no reruns).
//   - The gate clip stays online (Send needs a verified cloud) but the gate refuses on the device: nothing is sent.
//   - Headless Chrome has no Gemini Nano, so private steps show RULES-ONLY; the narration never claims Nano on screen.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SE_ORIGIN ?? 'http://localhost:5173';
const VIEW = { width: 1280, height: 720, scale: 1.5 }; // CSS pixels drawn at 1.5x: 1920x1080 frames, larger text

const CASTLE = 'Castle view with a name-tag lunchbox';
const CROSSING = 'Level crossing by a street sign, no text of yours';
const STATION = 'Station forecourt, no text of yours';
const VERDICTS = ['A stranger could find you', 'This photo narrows things down', 'Low exposure found', 'Partial result'];

/**
 * Clips. `offline` sets Simulate offline before the page loads. Steps (in order, while recording):
 *   {wait: ms} · {click / clickHas: text} · {toggle: label, on} · {untick: text} · {waitText: text | [..], timeout}
 *   {scroll: text | [..], block, ms}  smooth scroll of the smallest element showing the text
 *   {mark: name}                        record "now" (seconds into the clip) under this name
 */
const CLIPS = {
  // Judge Mode's landing: the banner (fake vault), the samples note and the three samples.
  'judge-home': { offline: true, hash: '#/judge', steps: [
    { waitText: 'Run all' }, { mark: 'shown' }, { wait: 2500 }, { scroll: 'Run all', block: 'center', ms: 1800 }, { wait: 2000 },
  ] },
  // judge-03 end to end, autoplay on: pre-screen (LUCAS matched and masked on the device) → consent → the recorded
  // attack (CACHED) → the red verdict → the fix panel: nothing a mask can hide.
  castle: { offline: true, hash: '#/judge', steps: [
    { waitText: 'Run all' }, { toggle: 'Autoplay', on: false }, { wait: 300 }, { click: CASTLE }, { mark: 'picked' },
    { waitText: 'Masks and flags', timeout: 90000 }, { mark: 'prescreen' }, { wait: 800 },
    { scroll: ["matches your child's name", 'Masks and flags'], block: 'center', ms: 1400 }, { wait: 3500 },
    { toggle: 'Autoplay', on: true },
    { waitText: ['Use recorded result', 'This, and only this'], timeout: 60000 }, { mark: 'consent' }, { wait: 1200 },
    { waitText: 'CACHED SAMPLE', timeout: 60000 }, { mark: 'attack' }, { wait: 2500 },
    { waitText: VERDICTS, timeout: 90000 }, { mark: 'verdict' }, { wait: 800 },
    { scroll: VERDICTS, block: 'start', ms: 1400 }, { wait: 5000 },
    { scroll: ['Fix it on this device', 'The cloud never learns'], block: 'center', ms: 1400 }, { wait: 1500 },
    { clickHas: 'Fix it on this device' },
    { waitText: 'None of the clues the attacker used can be masked', timeout: 60000 }, { mark: 'nofix' }, { wait: 600 },
    { scroll: ['None of the clues the attacker used can be masked', 'Some clues (like architecture'], block: 'center', ms: 1400 }, { wait: 5000 },
  ] },
  // judge-02, the level crossing, autoplay on: amber (the street, within 5 km) → the fix masks the sign and its number
  // plate → the recorded re-attack can only say "Berlin" → Risk reduced.
  crossing: { offline: true, hash: '#/judge', steps: [
    { waitText: 'Run all' }, { toggle: 'Autoplay', on: true }, { wait: 300 }, { click: CROSSING }, { mark: 'picked' },
    { waitText: VERDICTS, timeout: 120000 }, { mark: 'verdict' }, { wait: 600 },
    { scroll: VERDICTS, block: 'start', ms: 1200 }, { wait: 4500 },
    { waitText: ['Fix (done)', 'Re-attack the fixed photo', 'Apply'], timeout: 60000 }, { mark: 'fix' }, { wait: 3000 },
    { waitText: ['Risk reduced', 'Still exposed'], timeout: 120000 }, { mark: 'after' }, { wait: 600 },
    { scroll: ['Risk reduced', 'Still exposed'], block: 'start', ms: 1200 }, { wait: 4000 },
    { scroll: 'Before → After', block: 'center', ms: 1600 }, { wait: 4500 },
  ] },
  // judge-01, the station: the fix masks the sign, the re-attack names the city from the building: Still exposed.
  station: { offline: true, hash: '#/judge', steps: [
    { waitText: 'Run all' }, { toggle: 'Autoplay', on: true }, { wait: 300 }, { click: STATION }, { mark: 'picked' },
    { waitText: ['Risk reduced', 'Still exposed'], timeout: 180000 }, { mark: 'after' }, { wait: 600 },
    { scroll: ['Risk reduced', 'Still exposed'], block: 'start', ms: 1200 }, { wait: 4500 },
  ] },
  // The gate: judge-03 with the "LUCAS" mask un-ticked; Send; the Egress Gate re-reads the exact bytes on the device
  // and refuses. Online (Send needs a verified cloud), but no pass-B request is made.
  gate: { offline: false, hash: '#/judge', steps: [
    { waitText: 'Run all' }, { toggle: 'Autoplay', on: false }, { wait: 300 }, { click: CASTLE },
    { waitText: 'Masks and flags', timeout: 120000 }, { wait: 600 },
    { scroll: ["matches your child's name", 'Masks and flags'], block: 'center', ms: 1200 }, { mark: 'mask' }, { wait: 1800 },
    { untick: "your child's name" }, { mark: 'unticked' }, { wait: 2200 },
    { clickHas: 'Check with the cloud attacker' },
    { waitText: ['Final check of these exact bytes', 'would have left this device', 'The Egress Gate will block'], timeout: 120000 }, { mark: 'consent' },
    { scroll: ['The Egress Gate will block', 'private item', 'Send this image'], block: 'center', ms: 1200 }, { wait: 3000 },
    { clickHas: 'Send this image', optional: true }, { mark: 'send' },
    { waitText: ['Partial result', ...VERDICTS, 'would have left this device'], timeout: 120000 }, { wait: 1200 },
    { clickHas: 'Attack (done)', optional: true }, { waitText: 'would have left this device', timeout: 20000 }, { mark: 'blocked' },
    { scroll: 'would have left this device', block: 'center', ms: 1200 }, { wait: 4500 },
  ] },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HELPERS = `
  window.__g = {
    label(e) { return (e.innerText || e.getAttribute('aria-label') || e.value || '').trim().replace(/\\s+/g, ' '); },
    controls() { return [...document.querySelectorAll('button,a,[role=button],[role=switch],input[type=checkbox],[role=checkbox]')]; },
    rowText(e) { const l = e.closest('label') || e.closest('li') || e.parentElement; const ids = (e.getAttribute('aria-labelledby') || '').split(' ').filter(Boolean);
      return ((l ? l.innerText : '') + ' ' + ids.map((i) => document.getElementById(i)?.innerText || '').join(' ') + ' ' + (e.getAttribute('aria-label') || '')).replace(/\\s+/g, ' '); },
    smallestWith(text) { let best = null; for (const el of document.querySelectorAll('body *')) { if (el.children.length > 40) continue;
      if ((el.innerText || '').includes(text) && el.getClientRects().length) { if (!best || best.contains(el)) best = el; } } return best; },
    scroller(el) { let p = el.parentElement; while (p && !(p.scrollHeight > p.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement; return p || document.scrollingElement; },
    ease(sc, to, ms) { return new Promise((r) => { const from = sc.scrollTop; const s = performance.now();
      const f = () => { const p = Math.min(1, (performance.now() - s) / ms); const e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        sc.scrollTop = from + (to - from) * e; p < 1 ? requestAnimationFrame(f) : r(); }; f(); }); },
  }; true`;

async function record(name, clip) {
  const profile = mkdtempSync(join(tmpdir(), 'se-video-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  let cdpPort = null;
  for (let i = 0; i < 80 && !cdpPort; i++) { await sleep(250); try { cdpPort = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch { /* not yet */ } }
  if (!cdpPort) throw new Error('headless Chrome did not start');
  const target = (await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json())).find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  let id = 0;
  const pending = new Map();
  const cloud = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    // Every request to a Google AI host (the log proves which clips made none).
    if (m.method === 'Network.requestWillBeSent' && /generativelanguage|firebasevertexai|aiplatform/.test(m.params.request.url)) cloud.push(new URL(m.params.request.url).host);
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    const t = setTimeout(() => { pending.delete(i); rej(new Error(`CDP ${method} timed out`)); }, 60_000);
    pending.set(i, (m) => { clearTimeout(t); m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
  const bodyText = async () => (await evaluate('document.body.innerText')) ?? '';

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: VIEW.width, height: VIEW.height, deviceScaleFactor: VIEW.scale, mobile: false });

  // Clean origin state: the 18+ acknowledgement, and Simulate offline when the clip replays recordings.
  const go = async (url) => { await send('Page.navigate', { url }); for (let i = 0; i < 80; i++) { await sleep(250); if ((await evaluate('document.readyState')) === 'complete') break; } };
  await go(`${ORIGIN}/#/about`);
  await evaluate(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('se.ack18.v1','1'); ${clip.offline ? "localStorage.setItem('se.dev.simulateOffline','1');" : ''} true`);
  await go(`${ORIGIN}/${clip.hash}`);
  await evaluate('location.reload(), true');
  await sleep(2500);
  await evaluate(HELPERS);

  const dir = resolve('out', 'frames', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = [];
  const t0 = performance.now();
  const clock = () => (performance.now() - t0) / 1000;
  let capturing = true;
  const loop = (async () => {
    while (capturing) {
      const t = clock();
      let shot;
      try { shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true }); } catch { continue; }
      if (!capturing) break;
      const file = join(dir, `${String(frames.length).padStart(5, '0')}.jpg`);
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
      frames.push({ file, t });
    }
  })();

  const marks = {};
  try {
    for (const st of clip.steps) {
      await evaluate(HELPERS);
      if (st.wait) await sleep(st.wait);
      if (st.mark) marks[st.mark] = Math.round(clock() * 100) / 100;
      if (st.click || st.clickHas) {
        const want = JSON.stringify(st.click ?? st.clickHas);
        const exact = Boolean(st.click);
        const ok = await evaluate(`(() => { const b = __g.controls().find((e) => { const t = __g.label(e); return ${exact} ? t === ${want} || t.startsWith(${want} + ' ') || t.startsWith(${want} + '\\n') : t.includes(${want}); });
          if (!b || b.disabled) return false; b.scrollIntoView({ block: 'center', behavior: 'smooth' }); b.click(); return true; })()`);
        if (!ok && !st.optional) throw new Error(`no control "${st.click ?? st.clickHas}"`);
        if (!ok) console.log(`  (optional "${st.click ?? st.clickHas}" not there)`);
      }
      if (st.toggle) {
        await evaluate(`(() => { const b = [...document.querySelectorAll('input[type=checkbox],[role=switch]')].find((e) => __g.rowText(e).includes(${JSON.stringify(st.toggle)}));
          if (!b) return false; const on = b.checked ?? b.getAttribute('aria-checked') === 'true'; if (on !== ${Boolean(st.on)}) b.click(); return true; })()`);
      }
      if (st.untick) {
        const n = await evaluate(`(() => { let n = 0; for (const b of document.querySelectorAll('input[type=checkbox],[role=checkbox]')) {
          if (b.getAttribute('role') === 'switch') continue;
          let row = b; while (row.parentElement && row.parentElement.querySelectorAll('input[type=checkbox],[role=checkbox]').length === 1) row = row.parentElement;
          if (!row.innerText.includes(${JSON.stringify(st.untick)})) continue;
          const on = b.matches('input') ? b.checked : b.getAttribute('aria-checked') === 'true'; if (on) { b.click(); n++; } } return n; })()`);
        if (!n) throw new Error(`nothing ticked matching "${st.untick}"`);
      }
      if (st.waitText) {
        const want = [].concat(st.waitText).map((w) => w.toLowerCase());
        const until = Date.now() + (st.timeout ?? 30000);
        for (;;) {
          const t = (await bodyText()).toLowerCase();
          if (want.some((w) => t.includes(w))) break;
          if (Date.now() > until) throw new Error(`timed out waiting for "${[].concat(st.waitText).join('" | "')}"`);
          await sleep(300);
        }
      }
      if (st.scroll) {
        const ok = await evaluate(`(async () => { let el = null; for (const t of ${JSON.stringify([].concat(st.scroll))}) { el = __g.smallestWith(t); if (el) break; } if (!el) return false;
          const sc = __g.scroller(el); const r = el.getBoundingClientRect(); const box = sc === document.scrollingElement ? { top: 0, height: innerHeight } : sc.getBoundingClientRect();
          const block = ${JSON.stringify(st.block ?? 'start')};
          const delta = block === 'center' ? (r.top + r.height / 2) - (box.top + box.height / 2) : r.top - box.top - 72;
          await __g.ease(sc, Math.max(0, sc.scrollTop + delta), ${Number(st.ms ?? 1200)}); return true; })()`);
        if (!ok) console.log(`  (nothing shows "${[].concat(st.scroll)[0]}" to scroll to)`);
      }
    }
  } finally {
    capturing = false;
    await loop;
    ws.close();
    chrome.kill('SIGKILL');
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  // DEV-only text must never be in footage.
  // (Checked on the last page state: a DEV seam would be visible throughout.)

  // Variable frame rate (each frame shown until the next one arrived) → constant 30 fps H.264.
  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.t ?? f.t + 0.5;
    lines.push(`file '${f.file.split('/').pop()}'`, `duration ${Math.max(0.01, next - f.t).toFixed(3)}`);
  });
  lines.push(`file '${frames.at(-1).file.split('/').pop()}'`);
  writeFileSync(join(dir, 'list.ffconcat'), lines.join('\n') + '\n');
  mkdirSync('public/clips', { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.ffconcat'),
    '-vf', 'scale=1920:1080:flags=lanczos', '-r', '30', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '18', resolve(`public/clips/${name}.mp4`)], { stdio: 'inherit' });
  const secs = frames.at(-1).t - frames[0].t;
  console.log(`${name}: ${frames.length} frames in ${secs.toFixed(1)} s (${(frames.length / secs).toFixed(1)} fps) · marks ${JSON.stringify(marks)} · AI-host requests: ${cloud.length}${cloud.length ? ` (${[...new Set(cloud)].join(', ')})` : ''}`);
  return { seconds: Math.round(secs * 100) / 100, marks, aiRequests: cloud.length };
}

if (!(await fetch(`${ORIGIN}/`).catch(() => null))?.ok) { console.error(`${ORIGIN} not reachable (npm --prefix web run dev)`); process.exit(1); }
const only = process.argv.slice(2);
let index = { durations: {}, marks: {}, aiRequests: {} };
try { index = { ...index, ...JSON.parse(readFileSync('public/clips.json', 'utf8')) }; } catch { /* first run */ }
for (const [name, clip] of Object.entries(CLIPS)) {
  if (only.length && !only.includes(name)) continue;
  try {
    const r = await record(name, clip);
    index.durations[name] = r.seconds; index.marks[name] = r.marks; index.aiRequests[name] = r.aiRequests;
    writeFileSync('public/clips.json', JSON.stringify(index, null, 1) + '\n');
  } catch (e) { console.log(`FAILED ${name}: ${e.message}`); }
}
