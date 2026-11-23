#!/usr/bin/env node
// scripts/shoot-gallery.mjs: the Devpost gallery screenshots, taken from the app's real flow (T-166): the local DEV
// server with the App Check debug token, or the hosted origin. No dependencies: headless Chrome over CDP, as
// scripts/shoot-ui.mjs, with a fresh Chrome profile per run (no vault, nothing of the user's). It adds NO fake seams (?fakeAdv / ?fakeNano): the Judge
// Mode shots run the real flow, so they make real free-tier attacker calls (one per Judge run and one per re-attack).
// Never loop it to fish for different answers. When the live attacker is unavailable (quota, App Check rejecting
// headless Chrome, a timeout) the app replays its labelled CACHED SAMPLE recordings; the run log says which shots show
// CACHED. App Check (reCAPTCHA Enterprise) rejects headless Chrome on the hosted origin (the app then shows "Cloud
// paused"); never try to get past that bot check. The legitimate test path is the local DEV server, whose App Check uses
// the registered debug token from web/.env.development.local (git-ignored; never printed):
//   VITE_SPIKE=1 npm --prefix web run dev -- --port 5175 --strictPort      (VITE_SPIKE=1 turns HMR off)
//   node scripts/shoot-gallery.mjs --origin http://localhost:5175
// A DEV build differs from production only by DEV-only nodes (the Home "Run the Tier-0 selftest (DEV)" link); capture()
// removes links into #/dev/ so the frame shows what production shows, and fails the shot if any "(DEV)" text remains.
//
//   node scripts/shoot-gallery.mjs [--out docs/img/gallery] [--thumb docs/img/thumbnail.png] [--only 01-home,03-verdict-red,...]
//                                  [--origin https://strangers-eyes.web.app]
//                                  [--probe]   (print the page text and controls after every step; no files written)
//
// Every shot is the 1440x960 viewport (3:2, the ratio Devpost's gallery shows) at deviceScaleFactor 1, dark colour
// scheme, with the 18+ acknowledgement set (localStorage se.ack18.v1, as shoot-ui does). Finished animations are baked
// to their end state before each capture (see capture()). Run `node scripts/check-images.mjs` afterwards.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { values: a } = parseArgs({ options: {
  out: { type: 'string', default: 'docs/img/gallery' }, only: { type: 'string' },
  origin: { type: 'string', default: 'https://strangers-eyes.web.app' }, probe: { type: 'boolean', default: false },
  thumb: { type: 'string', default: 'docs/img/thumbnail.png' },
} });
const ORIGIN = a.origin.replace(/\/$/, '');
if (/[?&](fake|shot)/.test(ORIGIN)) { console.error('no seams on the gallery origin'); process.exit(2); }
const VP = { width: 1440, height: 960 };

const BIKE = 'Bike-share path with a work badge';
const CASTLE = 'Castle view with a name-tag lunchbox';
// Any verdict headline (copy.verdict.*): the live attacker may answer differently from the recordings.
const VERDICTS = ['A stranger could find you', 'This photo narrows things down', 'Low exposure found', 'Partial result'];
// Any re-attack outcome (copy.verdict.still / reduced, copy.fix.maxRounds, ui.fix.explainNone, ui.fix.declined).
const REATTACK = ['Still exposed', 'Risk reduced', "That's 3 rounds", 'None of the clues the attacker used can be masked', "The attacker declined, so this photo isn't re-attacked"];

/**
 * Steps:
 *   {click: 'exact text'}            click the button/link/switch whose visible text (or aria-label) is exactly this
 *   {clickHas: 'text'}               ... whose text contains this
 *   {clickIfEnabled: 'text'}         click the button whose text is exactly this when it is enabled; log it either way
 *   {toggle: 'label', on: bool}      set the switch/checkbox labelled by this text (contains) to on/off
 *   {untick: 'text'}                 un-tick every checkbox whose label or row contains this text
 *   {waitText: 'text' | [...], timeout} wait until the page shows the text (any of a list)
 *   {waitShown: 'text', timeout}     wait until an element whose own text is exactly this is laid out (StoryReel's "3 / 6")
 *   {wait: ms}
 *   {scroll: 'text' | [...], block: 'start'|'center'|'end', offset: px}  scroll the smallest element showing the text
 *                                    (the first of a list that is on the page) into view
 *   {log: 'regex'}                   print the page lines matching this regex (facts the lead needs, e.g. vault matches)
 *   {scrollTop: true}                scroll every scroll container to the top
 *   {shot: true}                     capture now (the shot's file)
 *   {thumb: 'text' | [...]}          the thumbnail: the card holding this text (the first of a list on the page; see
 *                                    thumbnail()), 3:2, 1200x800
 */
const SHOTS = [
  { name: '01-home', hash: '#/', steps: [
    { waitText: 'Just a coffee' }, { waitShown: '3 / 6', timeout: 60000 }, { wait: 2200 }, { shot: true },
  ] },
  // 02 -> 03 -> 04 are one Judge run on the bike-share sample (hash null = continue the page as it is). Autoplay is off
  // for the pre-screen shot, then on so the sample sends itself (the Send button needs a verified cloud; autoplay's
  // send also reaches the CACHED fallback), off again once the copy is sent so the run rests on the verdict, and on
  // again so it applies the planned fix and re-attacks.
  { name: '02-judge-run', hash: '#/judge', steps: [
    { toggle: 'Autoplay', on: false }, { wait: 400 }, { click: BIKE },
    { waitText: 'Masks and flags', timeout: 90000 }, { wait: 1500 }, { log: 'vault|match' },
    { scroll: 'Where each step ran', block: 'start', offset: -16 }, { wait: 800 }, { shot: true },
  ] },
  { name: '03-verdict-red', hash: null, steps: [
    { toggle: 'Autoplay', on: true }, { waitText: 'Send (done)', timeout: 90000 }, { toggle: 'Autoplay', on: false },
    { waitText: VERDICTS, timeout: 150000 }, { wait: 2500 }, { log: 'CACHED|IN CLOUD|RULES-ONLY|ON-DEVICE|BLOCKED|stranger|narrows|exposure|Partial|guess' },
    { clickIfEnabled: 'Dismiss' }, { wait: 400 },
    { scroll: ['CACHED SAMPLE', ...VERDICTS], block: 'start', offset: -120 }, { wait: 800 }, { shot: true },
    { thumb: VERDICTS },
  ] },
  { name: '04-reattack', hash: null, steps: [
    { toggle: 'Autoplay', on: true },
    { waitText: REATTACK, timeout: 200000 }, { wait: 2500 }, { log: 'CACHED|Still exposed|Risk reduced|rounds|Before|After|guess|→' },
    { clickIfEnabled: 'Dismiss' }, { wait: 400 },
    { scroll: ['CACHED SAMPLE', 'ROUND 1 OF 3', 'Round 1 of 3'], block: 'start', offset: -16 }, { wait: 800 }, { shot: true },
  ] },
  // 05 needs the Send button, which the app offers only when App Check verified this copy: run it on the local DEV
  // server (debug token), not headless on the hosted origin, where App Check fails and the cloud is paused.
  { name: '05-blocked', hash: '#/judge', steps: [
    { toggle: 'Autoplay', on: false }, { wait: 400 },
    { click: CASTLE },
    { waitText: 'Masks and flags', timeout: 90000 }, { wait: 1500 },
    { untick: "your child's name" }, { wait: 600 },
    { clickHas: 'Check with the cloud attacker' },
    // The consent sheet runs the gate's dry run on the exact bytes first ("Checking the exact image..."); with the
    // name visible it may already refuse there (Send disabled, "The Egress Gate will block this send").
    { waitText: ['Final check of these exact bytes', 'would have left this device'], timeout: 120000 }, { wait: 1000 },
    { log: 'vault matches|faces visible|areas masked|private item|Egress Gate|Blocked|would have left' },
    { clickIfEnabled: 'Send this image' },
    // The gate re-reads the exact bytes (OCR) and refuses; the flow then moves on to the on-device-only verdict, so open
    // the Attack step again to show the block message itself ("Blocked: 'LUCAS' would have left this device.").
    { waitText: ['Partial result', 'A stranger could find you', 'This photo narrows', 'Low exposure'], timeout: 120000 }, { wait: 1500 },
    { clickHas: 'Attack (done)' }, { waitText: 'would have left this device', timeout: 15000 }, { wait: 1000 },
    { log: 'Blocked|BLOCKED|would have left|Egress Gate|CACHED|IN CLOUD|Nothing has left' },
    { scroll: ['would have left this device', 'Final check of these exact bytes'], block: 'center' }, { wait: 800 }, { shot: true },
  ] },
  { name: '06-about-routing', hash: '#/about', steps: [{ wait: 1500 }, { scroll: 'What leaves this device', block: 'start', offset: -24 }, { wait: 800 }, { shot: true }] },
  { name: '07-capabilities', hash: '#/settings', steps: [{ wait: 3000 }, { click: 'Show what runs where' }, { wait: 1500 }, { shot: true }] },
];

const only = a.only ? new Set(a.only.split(',')) : null;
const shots = SHOTS.filter((s) => !only || only.has(s.name));
if (!a.probe) mkdirSync(a.out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!(await fetch(`${ORIGIN}/`).catch(() => null))?.ok) { console.error(`${ORIGIN} not reachable`); process.exit(1); }

const profile = mkdtempSync(join(tmpdir(), 'se-gallery-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', `--window-size=${VP.width},${VP.height}`, 'about:blank'], { stdio: 'ignore' });
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
const netLog = [];
const reqUrl = new Map();
const short = (u) => { try { const x = new URL(u); return `${x.host}/…/${x.pathname.split('/').pop()}`; } catch { return '?'; } };
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails?.exception?.description ?? '').slice(0, 200));
  // Failed cloud requests (host, last path segment, status / error only: never the query or headers), so the run log
  // says why a shot fell back to the CACHED recording.
  if (m.method === 'Network.requestWillBeSent') reqUrl.set(m.params.requestId, m.params.request.url);
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) netLog.push(`${short(m.params.response.url)} -> HTTP ${m.params.response.status}`);
  if (m.method === 'Network.loadingFailed' && !/localhost/.test(reqUrl.get(m.params.requestId) ?? '')) netLog.push(`${short(reqUrl.get(m.params.requestId) ?? '?')} -> ${m.params.errorText}${m.params.canceled ? ' (canceled)' : ''}`);
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) errors.push(m.params.args.map((x) => x.value ?? x.description).join(' ').slice(0, 200));
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
  // Bake every finished (finite) animation's end state into inline style and drop it, so a capture never shows a
  // half-faded first frame (shoot-ui.mjs, D-160 review). Infinite ones (spinners) are left alone.
  await evaluate(`document.getAnimations().forEach((x) => {
    if (x.effect?.getComputedTiming().iterations === Infinity) return;
    x.finish(); try { x.commitStyles(); } catch { /* not rendered */ } x.cancel();
  }), true`);
  // DEV-only nodes (absent from production builds) never appear in a gallery frame.
  const dev = await evaluate(`(() => { document.querySelectorAll('a[href^="#/dev/"]').forEach((e) => e.remove());
    return /\\(DEV\\)|selftest/i.test(document.body.innerText); })()`);
  if (dev) throw new Error('DEV-only text is still on the page');
  await sleep(300);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`wrote ${file}`);
}

/**
 * The Devpost thumbnail: the card around `text` plus the dashed CACHED SAMPLE label just above it when the run replays
 * a recording (so the thumbnail keeps that disclosure), padded to exactly 3:2 inside the main column, and
 * re-rendered (not upscaled) at 1200x800.
 */
async function thumbnail(text, file) {
  const r = await evaluate(`(() => { let el = null; for (const t of ${JSON.stringify([].concat(text))}) { el = __g.smallestWith(t); if (el) break; } if (!el) return null;
    while (el.parentElement && el.getBoundingClientRect().height < 400) el = el.parentElement;
    const b = el.getBoundingClientRect();
    // The dashed box around the CACHED SAMPLE chip (the chip itself is dashed too, so look above it).
    let lab = __g.smallestWith('CACHED SAMPLE')?.parentElement; while (lab && getComputedStyle(lab).borderTopStyle !== 'dashed') lab = lab.parentElement;
    const p = lab?.getBoundingClientRect();
    const top = p && p.height > 0 && p.bottom <= b.top && b.top - p.bottom < 40 ? p.top : b.top;
    const col = (document.querySelector('main') ?? document.body).getBoundingClientRect();
    return { x: b.x, y: top, w: b.width, h: b.bottom - top, right: Math.min(col.right, innerWidth), vh: innerHeight }; })()`);
  if (!r) throw new Error(`no card with "${text}" for the thumbnail`);
  const pad = 12;
  let w = r.w + 2 * pad; let h = r.h + 2 * pad;
  if (w / h > 1.5) h = w / 1.5; else w = h * 1.5;
  if (w > r.right) { w = r.right; h = w / 1.5; }
  if (h > r.vh) { h = r.vh; w = h * 1.5; }
  const x = Math.max(0, Math.min(r.right - w, r.x + r.w / 2 - w / 2));
  const y = Math.max(0, Math.min(r.vh - h, r.y + r.h / 2 - h / 2));
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip: { x, y, width: w, height: h, scale: 1200 / w } });
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`wrote ${file} (card ${Math.round(r.w)}x${Math.round(r.h)}, clip ${Math.round(w)}x${Math.round(h)} at ${Math.round(x)},${Math.round(y)} -> 1200x800)`);
}

async function navigate(url) {
  await send('Page.navigate', { url });
  for (let i = 0; i < 60; i++) { await sleep(250); if ((await evaluate('document.readyState')) === 'complete') break; }
  await sleep(1500);
}

// Page-side helpers: find controls by their visible text.
const HELPERS = `
  window.__g = {
    label(e) { return (e.innerText || e.getAttribute('aria-label') || e.value || '').trim().replace(/\\s+/g, ' '); },
    controls() { return [...document.querySelectorAll('button,a,[role=button],[role=switch],input[type=checkbox],[role=checkbox]')]; },
    rowText(e) { const l = e.closest('label') || e.closest('li') || e.parentElement; const ids = (e.getAttribute('aria-labelledby') || '').split(' ').filter(Boolean);
      return ((l ? l.innerText : '') + ' ' + ids.map((i) => document.getElementById(i)?.innerText || '').join(' ') + ' ' + (e.getAttribute('aria-label') || '')).replace(/\\s+/g, ' '); },
    smallestWith(text) { let best = null; for (const el of document.querySelectorAll('body *')) { if (el.children.length > 40) continue;
      if ((el.innerText || '').includes(text) && el.getClientRects().length) { if (!best || best.contains(el)) best = el; } } return best; },
  }; true`;

async function step(st) {
  if (st.wait) await sleep(st.wait);
  if (st.click || st.clickHas) {
    const want = JSON.stringify(st.click ?? st.clickHas);
    const exact = Boolean(st.click);
    const ok = await evaluate(`(() => { const b = __g.controls().find((e) => { const t = __g.label(e); return ${exact} ? t === ${want} || t.startsWith(${want} + ' ') || t.startsWith(${want} + '\\n') : t.includes(${want}); });
      if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`);
    if (!ok) throw new Error(`no control "${st.click ?? st.clickHas}"`);
  }
  if (st.clickIfEnabled) {
    const r = await evaluate(`(() => { const b = __g.controls().find((e) => __g.label(e) === ${JSON.stringify(st.clickIfEnabled)});
      if (!b) return 'absent'; if (b.disabled || b.getAttribute('aria-disabled') === 'true') return 'disabled'; b.click(); return 'clicked'; })()`);
    console.log(`  button "${st.clickIfEnabled}": ${r}`);
  }
  if (st.toggle) {
    const ok = await evaluate(`(() => { const b = [...document.querySelectorAll('input[type=checkbox],[role=switch]')].find((e) => __g.rowText(e).includes(${JSON.stringify(st.toggle)}));
      if (!b) return false; const on = b.checked ?? b.getAttribute('aria-checked') === 'true'; if (on !== ${Boolean(st.on)}) b.click(); return true; })()`);
    if (!ok) throw new Error(`no toggle "${st.toggle}"`);
  }
  if (st.untick) {
    // A mask row's own label is just "Mask"; its reason ("matches your child's name") sits in the row around it, so the
    // row is the largest ancestor that still holds only this one checkbox.
    const n = await evaluate(`(() => { let n = 0; for (const b of document.querySelectorAll('input[type=checkbox],[role=checkbox]')) {
      if (b.getAttribute('role') === 'switch') continue;
      let row = b; while (row.parentElement && row.parentElement.querySelectorAll('input[type=checkbox],[role=checkbox]').length === 1) row = row.parentElement;
      if (!row.innerText.includes(${JSON.stringify(st.untick)})) continue;
      const on = b.matches('input') ? b.checked : b.getAttribute('aria-checked') === 'true'; if (on) { b.click(); n++; } } return n; })()`);
    if (!n) throw new Error(`nothing ticked matching "${st.untick}"`);
  }
  if (st.waitText) {
    const want = [].concat(st.waitText);
    const until = Date.now() + (st.timeout ?? 30000);
    for (;;) {
      // Case-insensitive: innerText applies CSS text-transform (eyebrows read "FINAL CHECK OF ...").
      const t = (await bodyText()).toLowerCase();
      if (want.some((w) => t.includes(w.toLowerCase()))) break;
      if (Date.now() > until) throw new Error(`timed out waiting for "${want.join('" | "')}"`);
      await sleep(500);
    }
  }
  if (st.waitShown) {
    const until = Date.now() + (st.timeout ?? 30000);
    while (!(await evaluate(`[...document.querySelectorAll('body *')].some((e) => !e.children.length && e.innerText?.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(st.waitShown)} && e.getClientRects().length)`))) {
      if (Date.now() > until) throw new Error(`timed out waiting to show "${st.waitShown}"`);
      await sleep(250);
    }
  }
  if (st.scroll) {
    const ok = await evaluate(`(() => { let el = null; for (const t of ${JSON.stringify([].concat(st.scroll))}) { el = __g.smallestWith(t); if (el) break; } if (!el) return false;
      el.scrollIntoView({ block: ${JSON.stringify(st.block ?? 'start')}, behavior: 'instant' });
      const off = ${Number(st.offset ?? 0)}; if (off) { let p = el.parentElement; while (p && !(p.scrollHeight > p.clientHeight && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
        (p || document.scrollingElement).scrollBy(0, off); } return true; })()`);
    if (!ok) throw new Error(`nothing shows "${st.scroll}" to scroll to`);
  }
  if (st.log) {
    const re = new RegExp(st.log);
    for (const line of (await bodyText()).split('\n').filter((l) => re.test(l))) console.log(`  page: ${line.slice(0, 200)}`);
  }
  if (st.scrollTop) await evaluate(`(() => { for (const e of [document.scrollingElement, ...document.querySelectorAll('main,*')]) if (e.scrollTop) e.scrollTop = 0; return true; })()`);
}

async function probe(label) {
  const info = await evaluate(`(() => ({ text: document.body.innerText.slice(0, 6000),
    controls: __g.controls().filter((e) => e.getClientRects().length).map((e) => (e.tagName + (e.type ? ':' + e.type : '') + (e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : '') + (e.checked !== undefined && e.matches('input') ? (e.checked ? '[x]' : '[ ]') : '') + ' ' + __g.label(e).slice(0, 60) + ' | ' + __g.rowText(e).slice(0, 80))) }))()`);
  console.log(`\n===== ${label} =====\n${info.text}\n----- controls -----\n${info.controls.join('\n')}`);
}

/** Which shots show the CACHED recording (the run log reports it; the image is never altered). */
const cachedShots = [];

await send('Runtime.enable');
await send('Network.enable');
await send('Page.enable');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await send('Emulation.setDeviceMetricsOverride', { width: VP.width, height: VP.height, deviceScaleFactor: 1, mobile: false });
for (const s of shots) {
  const before = errors.length;
  if (s.hash !== null) {
    // A clean origin state per shot (fresh storage), then the 18+ acknowledgement.
    await navigate(`${ORIGIN}/#/about`);
    await evaluate(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('se.ack18.v1','1'); true`);
    await navigate(`${ORIGIN}/${s.hash}`);
    await evaluate('location.reload(), true');
    await sleep(3500);
  }
  await evaluate(HELPERS);
  try {
    for (const st of s.steps) {
      await step(st);
      if (a.probe) await probe(`${s.name} after ${JSON.stringify(st)}`);
      if (st.thumb && !a.probe) await thumbnail(st.thumb, a.thumb);
      if (st.shot && !a.probe) {
        if ((await bodyText()).includes('CACHED')) cachedShots.push(s.name);
        await capture(join(a.out, `${s.name}.png`));
      }
    }
  } catch (e) {
    console.log(`FAILED ${s.name}: ${e.message}`);
    await probe(`${s.name} at failure`);
    if (!a.probe) await capture(join(a.out, `${s.name}.FAILED.png`)).catch(() => undefined);
    // The shots that continue this page (hash null) have nothing to continue from.
    const at = shots.indexOf(s);
    while (shots[at + 1]?.hash === null) console.log(`SKIPPED ${shots.splice(at + 1, 1)[0].name}: ${s.name} failed`);
  }
  for (const n of netLog.splice(0)) console.log(`  network (${s.name}): ${n}`);
  for (const e of errors.slice(before).filter((x) => !/vite|websocket|Vite server|your current setup|localhost:5175/i.test(x))) console.log(`  console (${s.name}): ${e}`);
}
console.log(`CACHED shown in: ${cachedShots.length ? cachedShots.join(', ') : 'none'}`);
ws.close();
process.exit(0);
