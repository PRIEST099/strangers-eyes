#!/usr/bin/env node
// scripts/measure-fix-loop.mjs: the pre-registered "Fix-loop experiment" (PRIV bench/PROTOCOL.md, last section).
// Through the REAL app's normal Check flow (DEV server, Gemini Nano on, not Judge Mode), per photo: vault set-up, import,
// pre-screen, consent, live attack, verdict, then the app's own fix loop: "Fix it on this device" / "Fix again" ->
// Apply fix -> "Re-attack the fixed photo" -> consent -> live re-attack -> comparison, while the app offers another
// round (the app caps it at 3 fix rounds, so at most 4 cloud attacks per photo).
// Results: a raw log in PRIV (/Users/mac/StrangersEyes-private/raw/fixloop-<timestamp>.json, no coordinates) and
// docs/fix-loop-measurement.md (written by hand from it, aggregates only).
//
//   SE_NANO=<dir holding an OptGuideOnDeviceModel folder> node scripts/measure-fix-loop.mjs [--photos bench-02,...] [--dry]
//
// Adapted from scripts/measure-egress.mjs (same Chrome launch, CDP driving and vault set-up); it does not inspect
// request bodies, it only counts the AI-host requests. One headless Chrome at a time, each photo in a FRESH temporary
// profile (never the user's own), removed afterwards.
//
// Privacy rules (CLAUDE.md): the vault pins are computed from PRIV truth.csv at run time and exist only in memory and
// inside the browser; they are never printed, logged or written. UI text is stored with every 3+-decimal number removed.
// Each photo is sent live at most once per run: no rerun, no retry after a timeout or error, never a re-attack after a
// decline or block (invariant 7; the app also refuses).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SE_ORIGIN ?? 'http://localhost:5173';
const NANO = process.env.SE_NANO ?? '';
const PRIV = '/Users/mac/StrangersEyes-private';
const TRUTH = join(PRIV, 'bench', 'truth.csv');
const RAW_DIR = join(PRIV, 'raw');
const NANO_FLAGS = '--enable-features=OptimizationGuideOnDeviceModel:BypassPerfRequirement/true,PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultimodalInput,AIPromptAPIMultimodalInput';
const AI_HOST = /(^|\.)(firebasevertexai\.googleapis\.com|generativelanguage\.googleapis\.com|[a-z0-9-]*aiplatform\.googleapis\.com)$/;
// The made-up vault (protocol): Home about 0.8 km north of the true camera position, Work about 3 km west, a child's
// name that is not in these photos. No labels (the app then names the pins "Home" and "Work").
const CHILD_NAME = 'LUCAS';
const HOME_DLAT = 0.0072; // ~0.80 km
const WORK_KM = 3;
const MAX_FIX_ROUNDS = 3; // the app's own cap (RC maxFixRounds, default 3); this script never goes past it either

const PROTOCOL_PHOTOS = ['bench-02', 'bench-07', 'bench-10', 'bench-21', 'bench-31', 'bench-32', 'bench-33', 'bench-40'];
const argPhotos = (() => { const i = process.argv.indexOf('--photos'); return i > 0 ? process.argv[i + 1].split(',') : null; })();
const PHOTOS = argPhotos ?? PROTOCOL_PHOTOS;
/** --dry: stop at the first consent sheet, before Send (no AI request at all): checks the driving. */
const DRY = process.argv.includes('--dry');
/** --selftest-cards: read every card of the DEV verdict gallery (#/dev/verdicts) with readCard, no Check flow, no AI. */
const SELFTEST = process.argv.includes('--selftest-cards');
if (PHOTOS.some((p) => !PROTOCOL_PHOTOS.includes(p))) { console.error('--photos takes ids from the protocol list'); process.exit(1); }
if (!NANO || !existsSync(join(NANO, 'OptGuideOnDeviceModel'))) { console.error('SE_NANO must name a folder holding OptGuideOnDeviceModel'); process.exit(1); }
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(ORIGIN)) { console.error('SE_ORIGIN must be a local DEV server'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
/** Any number with 3+ decimals is dropped from UI text before it is stored (belt and braces: no coordinates in raw). */
const scrubNumbers = (s) => String(s ?? '').replace(/-?\d+\.\d{3,}/g, '<num>');

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

async function runPhoto(photoId) {
  const photoPath = join(PRIV, 'bench', `${photoId}.jpg`);
  const truth = truthFor(photoId);
  const home = { lat: truth.lat + HOME_DLAT, lng: truth.lng };
  const work = { lat: truth.lat, lng: truth.lng - WORK_KM / (111.32 * Math.cos((truth.lat * Math.PI) / 180)) };
  const typed = (p) => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;

  const profile = mkdtempSync(join(tmpdir(), 'se-fixloop-'));
  symlinkSync(join(NANO, 'OptGuideOnDeviceModel'), join(profile, 'OptGuideOnDeviceModel'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio', NANO_FLAGS, 'about:blank'], { stdio: 'ignore' });

  const t0 = Date.now();
  const rel = () => Math.round((Date.now() - t0) / 100) / 10;
  let phase = 'setup';
  const flow = [];
  const mark = (p, note) => { phase = p; flow.push({ t: rel(), phase: p, ...(note ? { note } : {}) }); log(`${photoId}: ${p}${note ? ` (${note})` : ''}`); };
  const requests = new Map();
  let ws = null;
  const out = { photo: photoId, startedAt: new Date(t0).toISOString(), dry: DRY, flow, rounds: [], outcome: 'incomplete', liveAttacksSent: 0 };

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
    const onEvent = (m) => {
      const sid = m.sessionId;
      const p = m.params;
      if (m.method === 'Target.attachedToTarget') {
        const s = p.sessionId;
        void (async () => {
          try { await send('Network.enable', {}, s); } catch { /* not a network target */ }
          try { await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, s); } catch { /* none */ }
          try { await send('Runtime.runIfWaitingForDebugger', {}, s); } catch { /* not paused */ }
        })();
        return;
      }
      if (m.method === 'Network.requestWillBeSent') {
        let u; try { u = new URL(p.request.url); } catch { return; }
        if (!AI_HOST.test(u.hostname)) return;
        // A worker's request can be reported by the page AND the worker session: count it once.
        if ([...requests.values()].some((x) => x.requestId === p.requestId && x.session !== sid)) return;
        let key = `${sid}:${p.requestId}`;
        while (requests.has(key)) key += '+';
        requests.set(key, { requestId: p.requestId, session: sid, t: rel(), phase, method: p.request.method, host: u.host, path: u.pathname.replace(/^.*\/models\//, '…/models/') });
        return;
      }
      const find = () => { for (const rec of [...requests.values()].reverse()) if (rec.requestId === p.requestId) return rec; return null; };
      if (m.method === 'Network.responseReceived') { const rec = find(); if (rec) rec.status = p.response.status; }
      if (m.method === 'Network.loadingFailed') { const rec = find(); if (rec) rec.failed = p.errorText; }
    };
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
      if (m.method) onEvent(m);
    });

    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true, filter: [{ type: 'service_worker' }, { type: 'shared_worker' }] });
    const { sessionId: main } = await send('Target.attachToTarget', { targetId: pageTarget.id, flatten: true });
    await send('Network.enable', {}, main);
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
    const exists = (sel) => `!!document.querySelector(${JSON.stringify(sel)})`;
    const click = async (sel) => {
      const ok = await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`);
      if (!ok) throw new Error(`cannot click ${sel}`);
    };
    const clickText = async (label, scope = 'document') => {
      const ok = await evaluate(`(() => { const b = [...${scope}.querySelectorAll('button,a,[role=button]')].find((e) => (e.innerText || '').trim().replace(/\\s+/g, ' ') === ${JSON.stringify(label)});
        if (!b || b.disabled) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`);
      if (!ok) throw new Error(`no control "${label}"`);
    };
    const setField = async (sel, value, event = 'input') => {
      const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false;
        const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })); return true; })()`);
      if (!ok) throw new Error(`no field ${sel}`);
    };
    // The Router HUD's call log is in the DOM even when collapsed: one line per Ledger entry (job, route, latency).
    let hudSeen = 0;
    const newHudLines = async () => {
      const all = (await evaluate(`[...document.querySelectorAll('[data-hud=dock] [data-hud-line]')].map((li) => ({ route: li.getAttribute('data-hud-line'), text: li.innerText.replace(/\\s+/g, ' ').trim() }))`)) ?? [];
      const fresh = all.slice(hudSeen).map((l) => ({ route: l.route, text: scrubNumbers(l.text).replace(/^\d\d:\d\d:\d\d /, '') }));
      hudSeen = all.length;
      return fresh;
    };
    let aiSeen = 0;
    const newAiRequests = () => {
      const all = [...requests.values()];
      const fresh = all.slice(aiSeen).map((r) => ({ t: r.t, phase: r.phase, method: r.method, path: r.path, status: r.status ?? null, failed: r.failed ?? null }));
      aiSeen = all.length;
      return fresh;
    };
    // The verdict card on screen (first verdict, or the comparison after a re-attack): level, headline, Home band.
    const readCard = async (scopeSel) => {
      const raw = await evaluate(`(() => {
        const scope = ${scopeSel ? `document.querySelector(${JSON.stringify(scopeSel)})` : 'document'};
        const card = scope && scope.querySelector('section[data-level]');
        if (!card) return null;
        const cmp = card.querySelector('[data-compare]');
        const lines = [...card.querySelectorAll('[data-line-id]')].map((li) => ({ kind: (li.getAttribute('data-line-id') || '').split(':')[0], severity: li.getAttribute('data-severity'),
          band: (li.querySelector('[data-band]') || { getAttribute: () => null }).getAttribute('data-band'), text: li.innerText.replace(/\\s+/g, ' ').trim() }));
        const h = card.querySelector('h3, h2');
        const rows = scope.querySelector('[data-testid=compare-rows]');
        return { level: card.getAttribute('data-level'), compare: cmp ? cmp.getAttribute('data-compare') : null, compareText: cmp ? cmp.innerText.replace(/\\s+/g, ' ').trim() : null,
          heading: h ? h.innerText.replace(/\\s+/g, ' ').trim() : null, lines,
          compareRows: rows ? [...rows.querySelectorAll('li')].map((li) => li.innerText.replace(/\\s+/g, ' ').trim()) : [],
          text: card.innerText.replace(/\\s+/g, ' ').trim(),
          fixOffered: !!document.querySelector('[data-action=fix]'), fixLabel: (document.querySelector('[data-action=fix]') || {}).innerText || null };
      })()`);
      if (!raw) return null;
      const homeLines = raw.lines.filter((l) => /\bhome\b/i.test(l.text)); // the kind name is drawn in capitals
      const banded = homeLines.find((l) => l.band);
      const notLinked = (raw.text.match(/Not linked: ([^.]*?)(?= Attacker's best guess| The cloud never|$)/) ?? [null, ''])[1];
      const homeBand = banded ? banded.band : homeLines.length ? `linked-no-band (${homeLines.map((l) => l.kind).join(',')})` : /\bhome\b/i.test(notLinked) ? 'not linked' : 'no Home line';
      const headlineText = raw.compareText ?? raw.heading;
      return {
        level: raw.level, homeBand, homeLines: homeLines.map((l) => ({ kind: l.kind, severity: l.severity, band: l.band, text: scrubNumbers(l.text) })),
        allLines: raw.lines.map((l) => ({ kind: l.kind, severity: l.severity, band: l.band, text: scrubNumbers(l.text) })),
        compare: raw.compare, headline: scrubNumbers(headlineText), compareRows: raw.compareRows.map(scrubNumbers),
        bestGuess: scrubNumbers((raw.text.match(/Attacker's best guess: [^·]*· attacker confidence \w+/) ?? [null])[0]),
        notLinked: scrubNumbers(notLinked), fixOffered: raw.fixOffered, fixLabel: raw.fixLabel,
        blockedCopy: ["That's 3 rounds for this photo", 'The attacker declined, so this photo', "Fixing needs the attacker's clues"].filter((x) => raw.text.includes(x)),
      };
    };

    // 18+ acknowledgement, Technical details on (display only: payload classes in the HUD).
    await go(`${ORIGIN}/#/about`);
    await evaluate(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('se.ack18.v1','1'); localStorage.setItem('se.settings.v1', JSON.stringify({ techDetails: true })); true`);
    let av = '';
    for (let i = 0; i < 60 && av !== 'available'; i++) { av = await evaluate(`(async () => { try { return await LanguageModel.availability(); } catch (e) { return 'err ' + e.message; } })()`); if (av !== 'available') await sleep(2000); }
    out.nanoAvailability = av;
    if (av !== 'available') throw new Error(`Gemini Nano not available (${av})`);
    mark('nano-ready');
    if (SELFTEST) {
      await go(`${ORIGIN}/#/dev/verdicts`);
      await send('Page.reload', {}, main);
      await waitFor('the gallery', `document.querySelectorAll('section[data-level]').length > 3`, 30000);
      const titles = await evaluate(`[...document.querySelectorAll('main section[aria-label]')].map((s) => s.getAttribute('aria-label'))`);
      out.selftest = [];
      for (const title of titles) out.selftest.push({ title, card: await readCard(`main section[aria-label=${JSON.stringify(title)}]`) });
      out.outcome = 'selftest'; return out;
    }

    // ---- the vault: Home and Work by typed coordinates (no labels), a child's name ----
    mark('vault');
    await go(`${ORIGIN}/#/vault`);
    await send('Page.reload', {}, main);
    await sleep(1000);
    for (let i = 0; i < 80; i++) { await sleep(250); if ((await evaluate('document.readyState').catch(() => '')) === 'complete') break; }
    await waitFor('the vault screen', `document.body.innerText.includes('Add place')`, 30000);
    const addPlace = async (kind, coords) => {
      await clickText('Add place');
      await waitFor('the place form', `!!document.querySelector('form input[type=radio][value=${kind}]')`, 15000);
      await evaluate(`document.querySelector('form input[type=radio][value=${kind}]').click(), true`);
      await clickText('Enter coordinates I know', `document.querySelector('form')`);
      await waitFor('the coordinates field', `!!document.querySelector('form input[inputmode=decimal]')`, 10000);
      await setField('form input[inputmode=decimal]', coords);
      await clickText('Use these coordinates', `document.querySelector('form')`);
      await waitFor('"Coordinates set."', `document.querySelector('form') && document.querySelector('form').innerText.includes('Coordinates set.')`, 10000);
      await click('form button[type=submit]');
      await waitFor('the saved place', `!document.querySelector('form input[inputmode=decimal]')`, 20000);
    };
    await addPlace('home_pin', typed(home));
    await addPlace('work_pin', typed(work));
    await clickText('Add detail');
    await waitFor('the detail form', `!!document.querySelector('form select')`, 15000);
    await setField('form select', 'child_name', 'change');
    await setField('form input[type=text]', CHILD_NAME);
    await click('form button[type=submit]');
    await waitFor('the saved detail', `!document.querySelector('form select')`, 20000);
    const vt = await bodyText();
    out.vault = { childName: vt.includes(CHILD_NAME), manualPins: (vt.match(/Coordinates entered by hand/g) ?? []).length, counter: (vt.match(/\b\d+ \/ 20\b/) ?? [null])[0] };
    if (!out.vault.childName || out.vault.manualPins !== 2) throw new Error(`vault not set up as planned (${JSON.stringify(out.vault)})`);

    // ---- import ----
    mark('import');
    await go(`${ORIGIN}/#/check`);
    await waitFor('the file input', `!!document.querySelector('input[type=file]')`, 30000);
    const { root } = await send('DOM.getDocument', { depth: 1 }, main);
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' }, main);
    await send('DOM.setFileInputFiles', { files: [photoPath], nodeId }, main);
    await waitFor('the import', `document.body.innerText.includes('Photo ready') || !!document.querySelector('[role=alert]:not(:empty)')`, 120000);
    if (!(await bodyText()).includes('Photo ready')) { out.outcome = 'import-failed'; return out; }

    // ---- pre-screen (Tier-0 + Gemini Nano on this device) ----
    mark('prescreen');
    await click('[data-action=continue]');
    await waitFor('the pre-screen', `${enabled('[data-action=cloud]')} || document.body.innerText.includes("can't go any further")`, 420000);
    const pt = await bodyText();
    out.prescreen = {
      nano: pt.includes('Gemini Nano looked for clues') ? 'ran' : pt.includes('On-device AI did not give a usable answer') ? 'failed' : pt.includes("On-device AI wasn't available") ? 'unavailable' : 'unknown',
      faces: Number((pt.match(/Finding faces \((\d+)\)/) ?? [0, NaN])[1]),
      vaultMatches: Number((pt.match(/Checking against your vault \((\d+) matches\)/) ?? [0, NaN])[1]),
      hud: await newHudLines(),
    };
    if (!(await evaluate(enabled('[data-action=cloud]')))) { out.outcome = 'prescreen-blocked'; return out; }

    const consent = async (label) => {
      mark(`consent-${label}`);
      await waitFor('the consent sheet', `${enabled('[data-action=send]')} || document.body.innerText.includes('Send is off')`, 120000);
      const ct = await bodyText();
      const meta = ct.match(/(\d+) × (\d+) px · ([\d.]+) KB/);
      const c = { width: meta ? Number(meta[1]) : null, height: meta ? Number(meta[2]) : null, kb: meta ? Number(meta[3]) : null, sendOff: ct.includes('Send is off'),
        diff: scrubNumbers((await evaluate(`(document.querySelector('[data-testid=consent-diff]') || {}).innerText || null`)) ?? '') || null };
      if (c.sendOff || !(await evaluate(enabled('[data-action=send]')))) return { ...c, sent: false };
      if (DRY) return { ...c, sent: false, dry: true };
      await click('[data-action=send]');
      out.liveAttacksSent++;
      return { ...c, sent: true };
    };
    // An attack that did not give a result: the AttackPanel's alert with Retry / "Show the on-device findings" (never clicked).
    const attackFailed = `(!!document.querySelector('[data-action=retry]') || !!document.querySelector('[data-action=to-verdict]') || document.body.innerText.includes('The attacker declined'))`;
    const failureText = async () => scrubNumbers((await evaluate(`[...document.querySelectorAll('[role=alert]')].map((e) => e.innerText.trim()).filter(Boolean).join(' | ')`)) ?? '').slice(0, 300);

    // ---- round 0: first attack ----
    await click('[data-action=cloud]');
    const c0 = await consent('attack0');
    const r0 = { round: 0, consent: c0 };
    out.rounds.push(r0);
    if (!c0.sent) { out.outcome = c0.dry ? 'dry-run (stopped before Send)' : 'consent-blocked'; return out; }
    mark('attack0');
    await waitFor('the first verdict', `!!document.querySelector('section[data-level]') || ${attackFailed}`, 480000);
    if (await evaluate(attackFailed)) {
      await sleep(1500);
      r0.failure = await failureText();
      r0.hud = await newHudLines(); r0.aiRequests = newAiRequests();
      out.outcome = `attack0 gave no result (${r0.failure})`; return out;
    }
    mark('verdict0');
    await sleep(4000); // the referee's Ledger entry and any trailing render
    r0.card = await readCard(null);
    r0.hud = await newHudLines(); r0.aiRequests = newAiRequests();
    log(`${photoId}: round 0 ${r0.card?.level} · Home ${r0.card?.homeBand} · fix offered ${r0.card?.fixOffered}`);

    // ---- fix rounds ----
    for (let k = 1; k <= MAX_FIX_ROUNDS; k++) {
      if (!(await evaluate(exists('[data-action=fix]')))) {
        out.outcome = k === 1 ? 'no fix offered after the first verdict' : `no further fix offered after round ${k - 1}`;
        out.stopCopy = (out.rounds.at(-1).card?.blockedCopy ?? []).join(' | ');
        return out;
      }
      const rk = { round: k };
      out.rounds.push(rk);
      mark(`fix${k}`);
      rk.fixButton = await evaluate(`document.querySelector('[data-action=fix]').innerText.trim()`);
      await click('[data-action=fix]');
      await waitFor('the fix plan', `!!document.querySelector('[data-action=apply-fix]') || document.body.innerText.includes('None of the clues the attacker used can be masked') || document.body.innerText.includes("Fixing needs the attacker's clues") || document.body.innerText.includes("That's 3 rounds")`, 240000);
      await sleep(1000);
      const ft = await bodyText();
      rk.fix = {
        applyEnabled: !!(await evaluate(enabled('[data-action=apply-fix]'))),
        nothingToMask: ft.includes('None of the clues the attacker used can be masked'),
        rulesOnly: ft.includes('Rules-only fix') || ft.includes('Planned by plain code'), // copy.fix.rules before / after D-179
        unremovable: ft.includes("can't be masked. Cropping or not posting"),
        cropTooMuch: ft.includes('Cropping would remove too much'),
        roundChip: (ft.match(/Round \d of \d/i) ?? [null])[0],
        line: scrubNumbers((ft.match(/Masking \d+ details[^\n]*/) ?? [''])[0]).slice(0, 200),
        expected: scrubNumbers((ft.match(/Expected after fix: [^\n]*/) ?? [''])[0]),
        items: (ft.match(/^(Mask [^\n]*|Crop from the [^\n]*)$/gm) ?? []).map(scrubNumbers).slice(0, 12),
      };
      rk.hudPlan = await newHudLines();
      if (!rk.fix.applyEnabled) { out.outcome = `round ${k}: nothing to mask (no fix to apply)`; return out; }
      await click('[data-action=apply-fix]');
      await waitFor('the re-attack button', `${enabled('[data-action=reattack]')} || document.body.innerText.includes("That's 3 rounds")`, 60000);
      rk.fix.applied = scrubNumbers(((await bodyText()).match(/Fix applied on this device[^\n]*/) ?? [''])[0]);
      if (!(await evaluate(enabled('[data-action=reattack]')))) { out.outcome = `round ${k}: no re-attack offered after Apply`; return out; }
      await click('[data-action=reattack]');
      rk.consent = await consent(`attack${k}`);
      if (!rk.consent.sent) { out.outcome = `round ${k}: re-attack consent blocked`; return out; }
      mark(`attack${k}`);
      await waitFor(`the round ${k} comparison`, `(() => { const c = document.querySelector('[data-testid=compare]'); return !!c && c.textContent.includes('Round ${k} of') && !!c.querySelector('section[data-level]'); })() || ${attackFailed}`, 480000);
      if (await evaluate(attackFailed)) {
        await sleep(1500);
        rk.failure = await failureText();
        rk.hud = await newHudLines(); rk.aiRequests = newAiRequests();
        out.outcome = `round ${k}: re-attack gave no result (${rk.failure})`; return out;
      }
      mark(`verdict${k}`);
      await sleep(4000);
      rk.card = await readCard('[data-testid=compare]');
      rk.receipt = scrubNumbers((await evaluate(`(document.querySelector('[data-testid=receipt]') || {}).innerText || ''`)) ?? '');
      rk.hud = await newHudLines(); rk.aiRequests = newAiRequests();
      log(`${photoId}: round ${k} ${rk.card?.level} · Home ${rk.card?.homeBand} · ${rk.card?.headline} · fix offered ${rk.card?.fixOffered}`);
    }
    out.outcome = 'fix rounds used up (3)';
    out.stopCopy = (out.rounds.at(-1).card?.blockedCopy ?? []).join(' | ');
    return out;
  } catch (e) {
    out.outcome = `error: ${String(e.message).slice(0, 200)}`;
    out.harnessError = true;
    log(`${photoId}: ${out.outcome}`);
    return out;
  } finally {
    out.aiRequestsTotal = [...requests.values()].map((r) => ({ t: r.t, phase: r.phase, method: r.method, path: r.path, status: r.status ?? null, failed: r.failed ?? null }));
    out.aiPosts = out.aiRequestsTotal.filter((r) => r.method === 'POST').length;
    out.endedAt = new Date().toISOString();
    try { ws?.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch { /* gone */ }
    for (let i = 0; i < 40 && chrome.exitCode === null && chrome.signalCode === null; i++) await sleep(250);
    try { ws?.close(); } catch { /* closed */ }
    try { chrome.kill('SIGKILL'); } catch { /* gone */ }
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } // removes the symlink, never the model
  }
}

// ---------- main ----------
if (!(await fetch(`${ORIGIN}/`).catch(() => null))?.ok) { console.error(`${ORIGIN} not reachable (npm --prefix web run dev)`); process.exit(1); }
mkdirSync(RAW_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const file = join(RAW_DIR, `fixloop-${stamp}${DRY ? '-dry' : ''}.json`);
const results = [];
for (const photo of PHOTOS) {
  const r = await runPhoto(photo);
  results.push(r);
  writeFileSync(file, JSON.stringify({ protocol: 'PRIV bench/PROTOCOL.md "Fix-loop experiment"', origin: ORIGIN, results }, null, 1) + '\n');
  log(`${photo}: ${r.outcome} · live attacks ${r.liveAttacksSent} · AI POSTs ${r.aiPosts} · raw ${file}`);
}
console.log('\n| photo | rounds | levels | Home band per round | final headline | outcome | live attacks | AI POSTs |');
for (const r of results) {
  const done = r.rounds.filter((x) => x.card);
  console.log(`| ${r.photo} | ${Math.max(0, done.length - 1)} | ${done.map((x) => x.card.level).join(' → ')} | ${done.map((x) => x.card.homeBand).join(' → ')} | ${done.at(-1)?.card?.headline ?? '-'} | ${r.outcome} | ${r.liveAttacksSent} | ${r.aiPosts} |`);
}
