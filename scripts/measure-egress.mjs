#!/usr/bin/env node
// scripts/measure-egress.mjs: measures exactly what leaves the device during ONE full normal-flow check (not Judge Mode):
// vault set-up, import, pre-screen, consent, the cloud attack, the verdict, "Fix it on this device" and the re-attack,
// with Gemini Nano running the private steps. Results: docs/egress-measurement.md (written by hand from this script's
// summary) and a raw log in PRIV (/Users/mac/StrangersEyes-private/raw/egress-<timestamp>.json).
//
//   SE_NANO=<dir holding an OptGuideOnDeviceModel folder> node scripts/measure-egress.mjs [--photos bench-07,bench-31,bench-40]
//
// Needs the DEV server on SE_ORIGIN (default http://localhost:5173; it carries the App Check debug token). One headless
// Chrome with a FRESH temporary profile (never the user's own), the Nano model symlinked in, the Prompt API flags.
//
// How it measures (three layers, so one blind spot cannot hide a leak):
//   1. CDP Network on the page AND every worker / service worker / iframe the page starts (Target.setAutoAttach,
//      flatten): every request with its exact body bytes (postDataEntries / Network.getRequestPostData).
//      For AI hosts: each inline image is decoded (mime, bytes, pixel size from the JPEG SOF, APPn segments, any
//      EXIF/XMP/Photoshop/GPS marker, sha256) and the text parts are matched to shared/prompts files.
//      EVERY request body (AI or not), URL and header value is scanned in memory for the vault strings, the pins'
//      coordinates (3 to 6 decimals, rounded and truncated) and the photo's own location, and for the original
//      file's bytes. Only booleans are kept. Non-AI bodies are never stored or printed (App Check's exchange carries
//      the debug token).
//   2. Chrome's NetLog (Default capture mode: no cookies, no credentials, no bodies) for the hosts the whole browser
//      contacted, including Chrome's own background traffic the page cannot see. Parsed, then deleted.
//   3. The app's own Cloud Ledger and AI-calls HUD, read from the UI at the end, to compare with the network.
//
// Privacy rules for this script (CLAUDE.md): the vault coordinates are computed from PRIV truth.csv at run time and
// exist only in memory and inside the browser; they are never printed, logged or written (the raw log keeps booleans).
// Response bodies (the attacker's guesses) are never read. Each photo is sent live at most once per run: do not rerun a
// photo to fish for a different answer, never retry after a timeout, and never re-attack after a decline.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SE_ORIGIN ?? 'http://localhost:5173';
const NANO = process.env.SE_NANO ?? '';
const PRIV = '/Users/mac/StrangersEyes-private';
const TRUTH = join(PRIV, 'bench', 'truth.csv');
const RAW_DIR = join(PRIV, 'raw');
const NANO_FLAGS = '--enable-features=OptimizationGuideOnDeviceModel:BypassPerfRequirement/true,PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultimodalInput,AIPromptAPIMultimodalInput';
const AI_HOST = /(^|\.)(firebasevertexai\.googleapis\.com|generativelanguage\.googleapis\.com|[a-z0-9-]*aiplatform\.googleapis\.com)$/;
// The made-up vault (Task brief): Home and Work near the photo's true place, the hospital's name and a child's name.
const WORK_NAME = 'City General Hospital';
const CHILD_NAME = 'LUCAS';
const HOME_DLAT = 0.008;
const WORK_DLNG = -0.006;

const argPhotos = (() => { const i = process.argv.indexOf('--photos'); return i > 0 ? process.argv[i + 1].split(',') : null; })();
const PHOTOS = argPhotos ?? ['bench-07', 'bench-31', 'bench-40'];
/** --dry: stop at the first consent sheet, before Send (no AI request at all): checks the driving on a new set-up. */
const DRY = process.argv.includes('--dry');
if (PHOTOS.some((p) => !/^bench-\d\d$/.test(p))) { console.error('--photos takes bench-NN ids'); process.exit(1); }
if (!NANO || !existsSync(join(NANO, 'OptGuideOnDeviceModel'))) { console.error('SE_NANO must name a folder holding OptGuideOnDeviceModel'); process.exit(1); }
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(ORIGIN)) { console.error('SE_ORIGIN must be a local DEV server'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
/** Any number with 3+ decimals is dropped from UI text before it is stored (belt and braces: no coordinates in raw). */
const scrubNumbers = (s) => String(s ?? '').replace(/-?\d+\.\d{3,}/g, '<num>');

// ---------- truth (in memory only) ----------
function truthFor(id) {
  for (const line of readFileSync(TRUTH, 'utf8').split(/\r?\n/).slice(1)) {
    const c = line.split(',');
    if (c[0] === id) {
      const lat = Number(c[1]); const lng = Number(c[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(`truth row for ${id} is unreadable`);
      return { lat, lng };
    }
  }
  throw new Error(`no truth row for ${id}`);
}

/** Regexes for a coordinate value written with 3..6 decimals (rounded or truncated, with or without its sign). */
function coordNeedles(values) {
  const out = new Set();
  for (const v of values) {
    for (let d = 3; d <= 6; d++) {
      const f = 10 ** d;
      for (const s of [v.toFixed(d), (Math.trunc(v * f) / f).toFixed(d)]) { out.add(s); out.add(s.replace(/^-/, '')); }
    }
  }
  return [...out].map((s) => new RegExp(`(?<![\\d])${s.replace(/[.\-]/g, (c) => `\\${c}`)}`));
}

// ---------- image parsing ----------
function jpegInfo(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const segments = []; let width = null; let height = null; let app1 = null;
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break;
    const m = buf[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd9) { segments.push('EOI'); break; }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (m === 0xda) { segments.push('SOS'); break; }
    if (m >= 0xe0 && m <= 0xef) {
      const id = buf.subarray(i + 4, i + 4 + Math.min(len - 2, 20)).toString('latin1').split('\0')[0].replace(/[^\x20-\x7e]/g, '');
      segments.push(`APP${m - 0xe0}${id ? `(${id})` : ''}`);
      if (m === 0xe1) app1 = buf.subarray(i + 4, i + 2 + len);
    } else if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
      segments.push(`SOF${m - 0xc0}`); height = buf.readUInt16BE(i + 5); width = buf.readUInt16BE(i + 7);
    } else segments.push({ 0xdb: 'DQT', 0xc4: 'DHT', 0xdd: 'DRI', 0xfe: 'COM' }[m] ?? `0x${m.toString(16)}`);
    i += 2 + len;
  }
  const has = (s) => buf.includes(Buffer.from(s, 'latin1'));
  const exif = has('Exif\0\0'); const xmp = has('http://ns.adobe.com/xap/1.0/'); const photoshop = has('Photoshop 3.0');
  const gps = has('exif:GPS') || (app1 !== null && (app1.includes(Buffer.from([0x88, 0x25])) || app1.includes(Buffer.from([0x25, 0x88]))));
  const app1Or13 = segments.some((s) => typeof s === 'string' && /^APP(1|13)\b/.test(s));
  const tail = (() => { const eoi = buf.lastIndexOf(Buffer.from([0xff, 0xd9])); return eoi < 0 ? null : buf.length - (eoi + 2); })();
  return { format: 'jpeg', width, height, segments: [...new Set(segments.filter((s) => s !== 'DQT' && s !== 'DHT'))], exif, xmp, photoshop, gps, app1Or13, bytesAfterEOI: tail };
}
function imageInfo(buf) {
  const j = jpegInfo(buf);
  if (j) return j;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    const chunks = []; let i = 8;
    while (i + 8 <= buf.length) { const len = buf.readUInt32BE(i); chunks.push(buf.subarray(i + 4, i + 8).toString('latin1')); i += 12 + len; }
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), segments: [...new Set(chunks)], exif: chunks.includes('eXIf'), xmp: buf.includes(Buffer.from('http://ns.adobe.com/xap/1.0/')), photoshop: false, gps: false, app1Or13: false };
  }
  return { format: 'unknown', width: null, height: null, segments: [], exif: buf.includes(Buffer.from('Exif\0\0')), xmp: buf.includes(Buffer.from('http://ns.adobe.com/xap/1.0/')), photoshop: false, gps: false, app1Or13: false };
}

// ---------- prompts (to name the text parts of an AI request) ----------
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const PROMPTS = readdirSync(join(REPO, 'shared', 'prompts')).filter((f) => /\.(md|json)$/.test(f) && f !== 'README.md')
  .map((f) => ({ f, text: norm(readFileSync(join(REPO, 'shared', 'prompts', f), 'utf8')) }));
function promptOf(text) {
  const n = norm(text);
  if (!n) return 'empty';
  for (const p of PROMPTS) if (p.text === n) return `${p.f} (exact)`;
  // A text part can be several prompt files joined (audit rules + a system prompt): name every file it contains whole,
  // then say how many characters are not accounted for by them.
  const whole = PROMPTS.filter((p) => p.text.length >= 40 && n.includes(p.text));
  if (whole.length) return `${whole.map((p) => p.f).join(' + ')} (+${Math.max(0, n.length - whole.reduce((a, p) => a + p.text.length + 1, -1))} other chars)`;
  for (const p of PROMPTS) if (n.length >= 80 && p.text.includes(n)) return `${p.f} (part)`;
  return 'unrecognised';
}

// ---------- one run ----------
async function runPhoto(photoId) {
  const photoPath = join(PRIV, 'bench', `${photoId}.jpg`);
  const orig = readFileSync(photoPath);
  const origSha = sha256(orig);
  const origInfo = imageInfo(orig);
  // Three 512-byte chunks from inside the original's compressed data: if any shows up in a body, the original left.
  const origChunks = [0.3, 0.55, 0.8].map((f) => orig.subarray(Math.floor(orig.length * f), Math.floor(orig.length * f) + 512));
  const origB64 = origChunks.flatMap((c) => [0, 1, 2].map((o) => c.subarray(o).toString('base64').slice(4, -4)));

  const truth = truthFor(photoId);
  const home = { lat: truth.lat + HOME_DLAT, lng: truth.lng };
  const work = { lat: truth.lat, lng: truth.lng + WORK_DLNG };
  const typed = (p) => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
  const vaultCoordRe = coordNeedles([home.lat, home.lng, work.lat, work.lng]);
  const truthCoordRe = coordNeedles([truth.lat, truth.lng]);
  const scan = (text) => ({
    childName: /lucas/i.test(text),
    workName: /city general hospital/i.test(text),
    vaultCoords: vaultCoordRe.some((r) => r.test(text)),
    photoTrueCoords: truthCoordRe.some((r) => r.test(text)),
  });
  const origIn = (buf, text) => origChunks.some((c) => buf.includes(c)) || origB64.some((b) => text.includes(b));
  // Positive controls: each detector must fire on what it looks for, or a clean result would mean nothing.
  const ctl = scan(`{"t":"${typed(home)} lucas City General Hospital ${truth.lat.toFixed(4)}"}`);
  if (!ctl.childName || !ctl.workName || !ctl.vaultCoords || !ctl.photoTrueCoords || !scan(typed(work)).vaultCoords || scan('nothing here 0.150').vaultCoords
    || !origIn(orig, '') || !origIn(Buffer.alloc(0), orig.toString('base64')) || origIn(Buffer.alloc(4096), '')) throw new Error('detector self-check failed');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const profile = mkdtempSync(join(tmpdir(), 'se-egress-'));
  const netlog = join(profile, '..', `se-egress-netlog-${stamp}.json`);
  symlinkSync(join(NANO, 'OptGuideOnDeviceModel'), join(profile, 'OptGuideOnDeviceModel'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio', `--log-net-log=${netlog}`, '--net-log-capture-mode=Default',
    NANO_FLAGS, 'about:blank'], { stdio: 'ignore' });
  let chromeExited = false;
  chrome.on('exit', () => { chromeExited = true; });

  const t0 = Date.now();
  const rel = () => Math.round((Date.now() - t0) / 100) / 10;
  let phase = 'setup';
  const flow = [];
  const mark = (p, note) => { phase = p; flow.push({ t: rel(), phase: p, ...(note ? { note } : {}) }); log(`${photoId}: ${p}${note ? ` (${note})` : ''}`); };
  const requests = new Map(); // key → record
  const wsFrames = [];
  const targets = [];
  let ws = null;
  const out = { photo: photoId, startedAt: new Date(t0).toISOString(), flow, outcome: 'incomplete' };

  try {
    let port = null;
    for (let i = 0; i < 80 && !port; i++) { await sleep(250); try { port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch { /* not yet */ } }
    if (!port) throw new Error('headless Chrome did not start');
    const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
    out.browser = version.Browser;
    const pageTarget = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())).find((t) => t.type === 'page');
    ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
    let id = 0;
    const pending = new Map();
    const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
      const i = ++id;
      const timer = setTimeout(() => { pending.delete(i); rej(new Error(`CDP ${method} timed out`)); }, 60_000);
      pending.set(i, (m) => { clearTimeout(timer); m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result); });
      ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const sessionType = new Map();

    const fetchBody = async (rec, sid) => {
      try {
        const r = await send('Network.getRequestPostData', { requestId: rec.requestId }, sid);
        rec.body = Buffer.from(r.postData ?? '', r.base64Encoded ? 'base64' : 'utf8');
      } catch (e) { rec.bodyError = e.message.slice(0, 120); }
    };
    const onEvent = (m) => {
      const sid = m.sessionId;
      const p = m.params;
      if (m.method === 'Target.attachedToTarget') {
        const s = p.sessionId; sessionType.set(s, p.targetInfo.type);
        targets.push({ t: rel(), type: p.targetInfo.type, url: (() => { try { const u = new URL(p.targetInfo.url); return `${u.protocol}//${u.host}${u.pathname}`; } catch { return p.targetInfo.url.slice(0, 60); } })() });
        void (async () => {
          try { await send('Network.enable', { maxTotalBufferSize: 200e6, maxResourceBufferSize: 60e6, maxPostDataSize: 60e6 }, s); } catch { /* not a network target */ }
          try { await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, s); } catch { /* none */ }
          try { await send('Runtime.runIfWaitingForDebugger', {}, s); } catch { /* not paused */ }
        })();
        return;
      }
      if (m.method === 'Network.requestWillBeSent') {
        const r = p.request;
        // A worker's request can be reported by the page AND the worker session: count it once.
        const same = [...requests.values()].find((x) => x.requestId === p.requestId && x.url === r.url && x.session !== sid);
        if (same) { same.seenIn.push(sessionType.get(sid) ?? 'page'); return; }
        let key = `${sid}:${p.requestId}`;
        while (requests.has(key)) key += '+'; // a redirect reuses the request id
        const rec = { requestId: p.requestId, key, t: rel(), phase, session: sid, seenIn: [sessionType.get(sid) ?? 'page'], url: r.url, method: r.method, type: p.type ?? null, headers: r.headers ?? {} };
        if (r.postDataEntries?.length) rec.body = Buffer.concat(r.postDataEntries.map((e) => Buffer.from(e.bytes ?? '', 'base64')));
        else if (r.postData !== undefined) rec.body = Buffer.from(r.postData, 'utf8');
        requests.set(key, rec);
        if (r.hasPostData && !rec.body) void fetchBody(rec, sid);
        return;
      }
      const find = () => { for (const rec of [...requests.values()].reverse()) if (rec.requestId === p.requestId) return rec; return null; };
      if (m.method === 'Network.responseReceived') { const rec = find(); if (rec) { rec.status = p.response.status; rec.protocol = p.response.protocol; rec.fromCache = !!(p.response.fromDiskCache || p.response.fromServiceWorker || p.response.fromPrefetchCache); } }
      if (m.method === 'Network.loadingFinished') { const rec = find(); if (rec) rec.respBytes = p.encodedDataLength; }
      if (m.method === 'Network.loadingFailed') { const rec = find(); if (rec) rec.failed = p.errorText; }
      if (m.method === 'Network.webSocketFrameSent') wsFrames.push({ t: rel(), phase, len: Buffer.byteLength(p.response.payloadData ?? ''), scan: scan(p.response.payloadData ?? '') });
    };
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
      if (m.method) onEvent(m);
    });

    // Service and shared workers (browser level), then the page, then everything the page starts (workers, iframes).
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true, filter: [{ type: 'service_worker' }, { type: 'shared_worker' }] });
    const { sessionId: main } = await send('Target.attachToTarget', { targetId: pageTarget.id, flatten: true });
    sessionType.set(main, 'page');
    await send('Network.enable', { maxTotalBufferSize: 200e6, maxResourceBufferSize: 60e6, maxPostDataSize: 60e6 }, main);
    await send('Page.enable', {}, main);
    await send('Runtime.enable', {}, main);
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, main);
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, main);

    const evaluate = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, main);
      if (r.exceptionDetails) throw new Error('page script failed'); // never echo the expression (it may hold coordinates)
      return r.result?.value;
    };
    const go = async (url) => { await send('Page.navigate', { url }, main); for (let i = 0; i < 80; i++) { await sleep(250); if ((await evaluate('document.readyState')) === 'complete') break; } await sleep(800); };
    const bodyText = async () => (await evaluate('document.body ? document.body.innerText : ""')) ?? '';
    const waitFor = async (what, expr, timeoutMs) => {
      const until = Date.now() + timeoutMs;
      for (;;) {
        const v = await evaluate(expr).catch(() => null);
        if (v) return v;
        if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
        await sleep(500);
      }
    };
    const enabled = (sel) => `(() => { const b = document.querySelector(${JSON.stringify(sel)}); return !!b && !b.disabled && b.getAttribute('aria-disabled') !== 'true'; })()`;
    const click = async (sel) => {
      const ok = await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`);
      if (!ok) throw new Error(`cannot click ${sel}`);
    };
    const clickText = async (label, scope = 'document') => {
      const ok = await evaluate(`(() => { const b = [...${scope}.querySelectorAll('button,a,[role=button]')].find((e) => (e.innerText || '').trim().replace(/\\s+/g, ' ') === ${JSON.stringify(label)});
        if (!b || b.disabled) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`);
      if (!ok) throw new Error(`no control "${label}"`);
    };
    // React-controlled fields: the native setter, then the event React listens to.
    const setField = async (sel, value, event = 'input') => {
      const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false;
        const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })); return true; })()`);
      if (!ok) throw new Error(`no field ${sel}`);
    };

    // 18+ acknowledgement, Technical details on (display only: payload classes and image hashes in the HUD and Ledger).
    await go(`${ORIGIN}/#/about`);
    await evaluate(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('se.ack18.v1','1'); localStorage.setItem('se.settings.v1', JSON.stringify({ techDetails: true })); true`);
    let av = '';
    for (let i = 0; i < 60 && av !== 'available'; i++) { av = await evaluate(`(async () => { try { return await LanguageModel.availability(); } catch (e) { return 'err ' + e.message; } })()`); if (av !== 'available') await sleep(2000); }
    out.nanoAvailability = av;
    if (av !== 'available') throw new Error(`Gemini Nano not available (${av})`);
    mark('nano-ready');

    // ---- the vault: Home and Work by typed coordinates, the hospital's name, a child's name ----
    mark('vault');
    await go(`${ORIGIN}/#/vault`);
    await send('Page.reload', {}, main); // a hash change does not reload: boot again with the 18+ acknowledgement set
    await sleep(1000);
    for (let i = 0; i < 80; i++) { await sleep(250); if ((await evaluate('document.readyState').catch(() => '')) === 'complete') break; }
    await waitFor('the vault screen', `document.body.innerText.includes('Add place')`, 30000);
    const addPlace = async (kind, label, coords) => {
      await clickText('Add place');
      await waitFor('the place form', `!!document.querySelector('form input[type=radio][value=${kind}]')`, 15000);
      await evaluate(`document.querySelector('form input[type=radio][value=${kind}]').click(), true`);
      if (label) await setField('form input[type=text]', label);
      await clickText('Enter coordinates I know', `document.querySelector('form')`);
      await waitFor('the coordinates field', `!!document.querySelector('form input[inputmode=decimal]')`, 10000);
      await setField('form input[inputmode=decimal]', coords);
      await clickText('Use these coordinates', `document.querySelector('form')`);
      await waitFor('"Coordinates set."', `document.querySelector('form') && document.querySelector('form').innerText.includes('Coordinates set.')`, 10000);
      await click('form button[type=submit]');
      await waitFor('the saved place', `!document.querySelector('form input[inputmode=decimal]')`, 20000);
    };
    await addPlace('home_pin', '', typed(home));
    await addPlace('work_pin', WORK_NAME, typed(work));
    await clickText('Add detail');
    await waitFor('the detail form', `!!document.querySelector('form select')`, 15000);
    await setField('form select', 'child_name', 'change');
    await setField('form input[type=text]', CHILD_NAME);
    await click('form button[type=submit]');
    await waitFor('the saved detail', `!document.querySelector('form select')`, 20000);
    const vt = await bodyText();
    out.vault = { workName: vt.includes(WORK_NAME), childName: vt.includes(CHILD_NAME), manualPins: (vt.match(/Coordinates entered by hand/g) ?? []).length, counter: (vt.match(/\b\d+ \/ 20\b/) ?? [null])[0] };
    if (!out.vault.workName || !out.vault.childName || out.vault.manualPins !== 2) throw new Error(`vault not set up as planned (${JSON.stringify(out.vault)})`);

    // ---- import ----
    mark('import');
    await go(`${ORIGIN}/#/check`);
    await waitFor('the file input', `!!document.querySelector('input[type=file]')`, 30000);
    const { root } = await send('DOM.getDocument', { depth: 1 }, main);
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' }, main);
    await send('DOM.setFileInputFiles', { files: [photoPath], nodeId }, main);
    await waitFor('the import', `document.body.innerText.includes('Photo ready') || !!document.querySelector('[role=alert]:not(:empty)')`, 120000);
    if (!(await bodyText()).includes('Photo ready')) { out.outcome = 'import-failed'; return out; }
    out.importLine = scrubNumbers(((await bodyText()).match(/Photo ready[^\n]*/) ?? [''])[0]);

    // ---- pre-screen (Tier-0 + Gemini Nano on this device) ----
    mark('prescreen');
    await click('[data-action=continue]');
    await waitFor('the pre-screen', `${enabled('[data-action=cloud]')} || document.body.innerText.includes("can't go any further")`, 420000);
    const pt = await bodyText();
    out.prescreen = {
      nano: pt.includes('Gemini Nano looked for clues') ? 'ran' : pt.includes("On-device AI did not give a usable answer") ? 'failed' : pt.includes("On-device AI wasn't available") ? 'unavailable' : 'unknown',
      faces: Number((pt.match(/Finding faces \((\d+)\)/) ?? [0, NaN])[1]),
      vaultMatches: Number((pt.match(/Checking against your vault \((\d+) matches\)/) ?? [0, NaN])[1]),
    };
    if (!(await evaluate(enabled('[data-action=cloud]')))) { out.outcome = 'prescreen-blocked'; return out; }

    const consent = async (label) => {
      mark(`consent-${label}`);
      await waitFor('the consent sheet', `${enabled('[data-action=send]')} || document.body.innerText.includes('Send is off')`, 120000);
      const ct = await bodyText();
      const meta = ct.match(/(\d+) × (\d+) px · ([\d.]+) KB(?: · sha256 ([0-9a-f]+)…)?/);
      const c = { width: meta ? Number(meta[1]) : null, height: meta ? Number(meta[2]) : null, kb: meta ? Number(meta[3]) : null, shaPrefix: meta?.[4] ?? null, sendOff: ct.includes('Send is off') };
      if (c.sendOff || !(await evaluate(enabled('[data-action=send]')))) return { ...c, sent: false };
      if (DRY) return { ...c, sent: false, dry: true };
      await click('[data-action=send]');
      return { ...c, sent: true };
    };
    const FAILURE = ["declined", "didn't answer in time", "couldn't be reached", 'cut off', 'Partial result'];
    const verdictHead = (t) => ['A stranger could find you from this photo', 'This photo narrows things down', 'Low exposure found', 'Partial result'].find((v) => t.includes(v)) ?? null;

    // ---- first attack ----
    await click('[data-action=cloud]');
    out.consent1 = await consent('attack1');
    if (!out.consent1.sent) { out.outcome = out.consent1.dry ? 'dry-run (stopped before Send)' : 'consent-blocked'; return out; }
    mark('attack1');
    await waitFor('the first verdict', `!!document.querySelector('[data-action=fix]') || !!document.querySelector('[data-action=to-verdict]') || ${JSON.stringify(FAILURE)}.some((s) => document.body.innerText.includes(s))`, 480000);
    mark('verdict1');
    await sleep(1500);
    const v1 = await bodyText();
    out.verdict1 = verdictHead(v1);
    if (!(await evaluate(`!!document.querySelector('[data-action=fix]')`))) { out.outcome = `no-fix-offered (${FAILURE.find((s) => v1.includes(s)) ?? out.verdict1})`; return out; }

    // ---- fix (on this device) ----
    mark('fix');
    await click('[data-action=fix]');
    await waitFor('the fix plan', `!!document.querySelector('[data-action=apply-fix]') || document.body.innerText.includes('None of the clues the attacker used can be masked') || document.body.innerText.includes("Fixing needs the attacker's clues")`, 240000);
    if (!(await evaluate(enabled('[data-action=apply-fix]')))) { out.outcome = 'nothing-to-fix'; return out; }
    const ft = await bodyText();
    out.fix = { rulesOnly: ft.includes('Rules-only fix'), line: scrubNumbers((ft.match(/Masking \d+ details[^\n]*/) ?? [''])[0]).slice(0, 200) };
    await click('[data-action=apply-fix]');
    await waitFor('the re-attack button', enabled('[data-action=reattack]'), 60000);
    out.fix.applied = scrubNumbers(((await bodyText()).match(/Fix applied on this device[^\n]*/) ?? [''])[0]);
    await click('[data-action=reattack]');

    // ---- re-attack ----
    out.consent2 = await consent('attack2');
    if (!out.consent2.sent) { out.outcome = 'reattack-consent-blocked'; return out; }
    mark('attack2');
    await waitFor('the re-attack verdict', `!!document.querySelector('[data-testid=receipt]') || document.body.innerText.includes('Risk reduced') || document.body.innerText.includes('Still exposed') || ${JSON.stringify(FAILURE)}.some((s) => document.body.innerText.includes(s))`, 480000);
    mark('verdict2');
    await sleep(6000); // any trailing on-device call (the referee) and its Ledger entry
    const v2 = await bodyText();
    out.verdict2 = v2.includes('Risk reduced') ? 'Risk reduced' : v2.includes('Still exposed') ? 'Still exposed' : (FAILURE.find((s) => v2.includes(s)) ?? 'unknown');
    out.receipt = scrubNumbers((await evaluate(`(document.querySelector('[data-testid=receipt]') || {}).innerText || ''`)) ?? '');
    out.outcome = 'complete';
    return out;
  } catch (e) {
    out.outcome = `error: ${String(e.message).slice(0, 200)}`;
    log(`${photoId}: ${out.outcome}`);
    return out;
  } finally {
    // The Ledger and HUD are read, Chrome closed and the network analysed in finish() (main, below).
    if (!chromeExited) mark('read-ledger');
    out.__finish ={ requests, wsFrames, targets, ws, chrome, profile, netlog, scan, origIn, origSha, origInfo, orig, stamp, rel };
  }
}

// The finish step needs the page session; runPhoto hands it over through out.__finish and finish() does the rest.
async function finish(out, readUi) {
  const f = out.__finish; delete out.__finish;
  try { out.ui = await readUi(); } catch (e) { out.ui = { error: String(e.message).slice(0, 120) }; }
  await sleep(1500);
  // Close Chrome cleanly so the NetLog is finalised.
  try { f.ws.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch { /* gone */ }
  for (let i = 0; i < 40 && f.chrome.exitCode === null && f.chrome.signalCode === null; i++) await sleep(250);
  try { f.ws.close(); } catch { /* closed */ }
  try { f.chrome.kill('SIGKILL'); } catch { /* gone */ }
  try { rmSync(f.profile, { recursive: true, force: true }); } catch { /* ignore */ } // removes the symlink, never the model

  // ---- network analysis ----
  const reqs = [...f.requests.values()];
  const ai = []; const other = new Map(); const local = { count: 0, bytes: 0 };
  const anyHit = { childName: false, workName: false, vaultCoords: false, photoTrueCoords: false, originalBytes: false };
  const hitWhere = [];
  for (const r of reqs) {
    let u; try { u = new URL(r.url); } catch { continue; }
    if (!/^(https?|wss?):$/.test(u.protocol)) continue; // data:, blob:, chrome-extension: never leave
    const body = r.body ?? Buffer.alloc(0);
    const text = body.toString('utf8');
    const headerText = Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`).join('\n');
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
    if (isLocal) { local.count++; local.bytes += body.length; }
    // Inline images first (so the scan of the JSON text can skip their base64).
    const images = []; const textParts = [];
    let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      const inl = o.inlineData ?? o.inline_data;
      if (inl && typeof inl.data === 'string') {
        const buf = Buffer.from(inl.data, 'base64');
        images.push({ mime: inl.mimeType ?? inl.mime_type ?? null, bytes: buf.length, sha256: sha256(buf), ...imageInfo(buf), isOriginal: sha256(buf) === f.origSha || f.origIn(buf, '') });
      }
      if (typeof o.text === 'string') textParts.push({ chars: o.text.length, sha256: sha256(o.text).slice(0, 16), prompt: promptOf(o.text), scan: f.scan(o.text) });
      for (const [k, v] of Object.entries(o)) if (k !== 'inlineData' && k !== 'inline_data') walk(v);
    };
    if (json) walk(json);
    const scanText = `${r.url}\n${headerText}\n${text.replace(/"data"\s*:\s*"[A-Za-z0-9+/=]{200,}"/g, '"data":"<image>"')}`;
    const s = f.scan(scanText);
    const origFound = f.origIn(body, text) || images.some((i) => i.isOriginal);
    // Base64 images outside inlineData (any other host or field): a JPEG/PNG/WebP magic run.
    const strayImages = (text.replace(/"data"\s*:\s*"[A-Za-z0-9+/=]{200,}"/g, '').match(/(\/9j\/|iVBORw0KGgo|UklGR)[A-Za-z0-9+/=]{200,}/g) ?? []).length + (!json && imageInfo(body).format !== 'unknown' ? 1 : 0);
    for (const k of Object.keys(s)) if (s[k]) { anyHit[k] = true; hitWhere.push({ key: r.key, host: u.host, what: k }); }
    if (origFound) { anyHit.originalBytes = true; hitWhere.push({ key: r.key, host: u.host, what: 'originalBytes' }); }
    if (isLocal) continue;
    if (AI_HOST.test(u.hostname)) {
      ai.push({ t: r.t, phase: r.phase, seenIn: [...new Set(r.seenIn)], method: r.method, host: u.host, path: u.pathname.replace(/^.*\/models\//, '…/models/'), status: r.status ?? null, failed: r.failed ?? null,
        requestBytes: body.length, responseBytes: r.respBytes ?? null, images, textParts, vaultScan: s, originalFound: origFound, strayImages, bodyError: r.bodyError ?? null,
        generationConfigKeys: json?.generationConfig ? Object.keys(json.generationConfig) : null, tools: json?.tools ? json.tools.map((x) => Object.keys(x)[0]) : null });
    } else {
      const o = other.get(u.host) ?? { host: u.host, requests: 0, requestBytes: 0, responseBytes: 0, paths: new Set(), phases: new Set(), seenIn: new Set(), strayImages: 0, failed: 0 };
      o.requests++; o.requestBytes += body.length; o.responseBytes += r.respBytes ?? 0; o.paths.add(`${r.method} ${u.pathname.replace(/\/projects\/[^/]+/, '/projects/…').replace(/\/apps\/[^/]+/, '/apps/…').slice(0, 80)}`);
      o.phases.add(r.phase); r.seenIn.forEach((x) => o.seenIn.add(x)); o.strayImages += strayImages; if (r.failed) o.failed++;
      other.set(u.host, o);
    }
  }
  out.network = {
    aiRequests: ai,
    otherHosts: [...other.values()].map((o) => ({ ...o, paths: [...o.paths], phases: [...o.phases], seenIn: [...o.seenIn] })),
    localDevServer: local,
    webSocketFramesSent: { count: f.wsFrames.length, bytes: f.wsFrames.reduce((a, w) => a + w.len, 0), anyVaultHit: f.wsFrames.some((w) => Object.values(w.scan).some(Boolean)) },
    targetsAttached: f.targets,
    anyHit, hitWhere,
  };

  // ---- NetLog: every host the whole browser contacted ----
  try {
    let raw = readFileSync(f.netlog, 'utf8');
    let nl; try { nl = JSON.parse(raw); } catch { raw = raw.replace(/,\s*$/, '').replace(/,?\s*\{[^\n]*$/, ''); nl = JSON.parse(`${raw}]}`); }
    const names = Object.fromEntries(Object.entries(nl.constants.logEventTypes).map(([k, v]) => [v, k]));
    const hosts = new Map();
    for (const ev of nl.events ?? []) {
      if (names[ev.type] !== 'URL_REQUEST_START_JOB' || !ev.params?.url) continue;
      let u; try { u = new URL(ev.params.url); } catch { continue; }
      if (!/^(https?|wss?):$/.test(u.protocol)) continue;
      const h = hosts.get(u.host) ?? { host: u.host, urlRequests: 0, initiators: new Set() };
      h.urlRequests++; if (ev.params.initiator) h.initiators.add(String(ev.params.initiator).replace(/^(https?:\/\/[^/]+).*$/, '$1'));
      hosts.set(u.host, h);
    }
    out.netlog = [...hosts.values()].map((h) => ({ ...h, initiators: [...h.initiators] })).sort((a, b) => b.urlRequests - a.urlRequests);
  } catch (e) { out.netlog = { error: String(e.message).slice(0, 120) }; }
  try { rmSync(f.netlog, { force: true }); } catch { /* ignore */ }
  out.original = { bytes: f.orig.length, width: f.origInfo.width, height: f.origInfo.height, exif: f.origInfo.exif, gps: f.origInfo.gps, segments: f.origInfo.segments };
  return out;
}

// ---------- main ----------
if (!(await fetch(`${ORIGIN}/`).catch(() => null))?.ok) { console.error(`${ORIGIN} not reachable (npm --prefix web run dev)`); process.exit(1); }
mkdirSync(RAW_DIR, { recursive: true });
const results = [];
for (const photo of PHOTOS) {
  const out = await runPhoto(photo);
  // Read the Ledger and the HUD through a fresh connection to the same page session (still open: Chrome is closed in finish()).
  const f = out.__finish;
  const readUi = async () => {
    if (f.chrome.exitCode !== null) return { error: 'browser gone' };
    const port = Number(readFileSync(join(f.profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
    const page = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())).find((t) => t.type === 'page');
    const ws2 = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws2.addEventListener('open', r, { once: true }); ws2.addEventListener('error', j, { once: true }); });
    let n = 0; const waiting = new Map();
    ws2.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
    const ev2 = (expression) => new Promise((res) => { const i = ++n; waiting.set(i, (m) => res(m.result?.result?.value)); ws2.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } })); });
    const ledgerText = (await ev2(`(() => { const el = document.querySelector('[data-counter=traffic]'); if (!el) return '';
      const box = el.parentElement.parentElement; const items = [...box.querySelectorAll('ol > li')].map((li) => '- ' + li.innerText.replace(/\\s+/g, ' ').trim());
      return el.parentElement.innerText + '\\n' + items.join('\\n'); })()`)) ?? '';
    await ev2(`(() => { const b = document.querySelector('[data-hud=dock] button[aria-expanded]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); return true; })()`);
    await sleep(800);
    const hudText = (await ev2(`(() => { return [...document.querySelectorAll('[data-hud=dock] [data-hud-line]')].map((li) => li.innerText.replace(/\\s+/g, ' ').trim()).join('\\n'); })()`)) ?? '';
    ws2.close();
    const num = (re) => { const m = ledgerText.match(re); return m ? m.slice(1) : null; };
    return {
      ledger: {
        facesSent: num(/Faces sent: (\d+) · Vault items sent: (\d+)/)?.[0] ?? null,
        vaultItemsSent: num(/Faces sent: (\d+) · Vault items sent: (\d+)/)?.[1] ?? null,
        traffic: num(/Images: (\d+) · Requests: (\d+) · Bytes: ([^\n]+)/),
        local: num(/On-device AI calls: (\d+) · Local rule checks: (\d+) · Blocked: (\d+)/),
        text: scrubNumbers(ledgerText),
      },
      hud: scrubNumbers(hudText).split('\n').filter(Boolean),
    };
  };
  const done = await finish(out, readUi);
  const file = join(RAW_DIR, `egress-${f.stamp}-${photo}${DRY ? "-dry" : ""}.json`);
  writeFileSync(file, JSON.stringify(done, null, 1) + '\n');
  log(`${photo}: ${done.outcome} · raw log ${file}`);
  results.push(done);
  if (done.outcome === 'complete' || DRY) break;
}

// ---------- summary (no coordinates: booleans and sizes only) ----------
for (const r of results) {
  console.log(`\n## ${r.photo}: ${r.outcome}  (${r.browser ?? '?'}, Nano ${r.nanoAvailability ?? '?'})`);
  console.log(`original: ${r.original?.bytes} B, ${r.original?.width}×${r.original?.height}, EXIF ${r.original?.exif}, GPS ${r.original?.gps}`);
  console.log(`prescreen: ${JSON.stringify(r.prescreen ?? null)} · verdict ${r.verdict1 ?? '-'} → ${r.verdict2 ?? '-'} · fix ${JSON.stringify(r.fix ?? null)}`);
  console.log(`consent1 ${JSON.stringify(r.consent1 ?? null)} · consent2 ${JSON.stringify(r.consent2 ?? null)}`);
  console.log('| # | phase | t (s) | path | status | request bytes | response bytes | images (mime, px, KB, segments, EXIF/XMP/GPS/APP1-13) | text parts | vault strings | coords | original |');
  (r.network?.aiRequests ?? []).forEach((a, i) => console.log(`| ${i + 1} | ${a.phase} | ${a.t} | ${a.path} | ${a.status} | ${a.requestBytes} | ${a.responseBytes} | ${a.images.map((im) => `${im.mime} ${im.width}×${im.height} ${(im.bytes / 1024).toFixed(1)} KB [${im.segments.join(' ')}] meta:${im.exif || im.xmp || im.gps || im.app1Or13 || im.photoshop ? 'YES' : 'none'} sha ${im.sha256.slice(0, 12)}`).join('; ')} | ${a.textParts.map((p) => `${p.prompt} ${p.chars}ch`).join('; ')} | ${a.vaultScan.childName || a.vaultScan.workName ? 'YES' : 'no'} | ${a.vaultScan.vaultCoords || a.vaultScan.photoTrueCoords ? 'YES' : 'no'} | ${a.originalFound ? 'YES' : 'no'} |`));
  for (const o of r.network?.otherHosts ?? []) console.log(`other: ${o.host} ×${o.requests} req ${o.requestBytes} B resp ${o.responseBytes} B · ${o.paths.slice(0, 4).join(', ')} · phases ${o.phases.join(',')} · seenIn ${o.seenIn.join(',')}${o.strayImages ? ` · STRAY IMAGES ${o.strayImages}` : ''}`);
  console.log(`local dev server: ${JSON.stringify(r.network?.localDevServer)} · ws frames ${JSON.stringify(r.network?.webSocketFramesSent)}`);
  console.log(`any hit anywhere: ${JSON.stringify(r.network?.anyHit)} ${r.network?.hitWhere?.length ? JSON.stringify(r.network.hitWhere) : ''}`);
  console.log(`targets: ${JSON.stringify(r.network?.targetsAttached)}`);
  console.log(`netlog hosts: ${JSON.stringify(r.netlog)}`);
  console.log(`ledger: ${JSON.stringify(r.ui?.ledger ? { ...r.ui.ledger, text: undefined } : r.ui)}\n${r.ui?.ledger?.text ?? ""}`);
  console.log(`HUD:\n  ${(r.ui?.hud ?? []).join('\n  ')}`);
}
