#!/usr/bin/env node
// scripts/measure-ios-parity.mjs: the pre-registered "iOS parity on the fix-loop photos" measurement (PRIV
// bench/PROTOCOL.md, D-184). Runs the DEBUG iOS app in the Simulator with the launch argument -iosBench
// (ios/StrangersEyes/Dev/BenchRunner.swift): the 8 fix-loop photos, each ONCE, in id order, through the app's own flow
// (Tier-0, Apple FM pre-screen, gate, live Gemini attack, referee, one rules fix, live re-attack), with the same made-up
// vault rule as scripts/measure-fix-loop.mjs (Home 0.0072 deg north of the true camera position, Work ~3 km west,
// child's name). The pins are computed from PRIV truth.csv into a temporary manifest that only the Simulator reads; it is
// deleted when the run ends. The app prints bands, levels and routes only.
//
//   node scripts/measure-ios-parity.mjs [--dry]     (--dry: -fakeAdversary, no cloud call, not a measurement)
//
// Needs: the DEBUG app built into ios/build (RUNBOOK §2.8) and, for a live run, the git-ignored ios/.appcheck-debug-token
// (registered in the console, U-25). Never run while Chrome runs Gemini Nano (8 GB RAM, CLAUDE.md invariant 11).
// Output: PRIV raw/iosparity-<timestamp>.json and a summary; docs/ios-parity.md is written by hand.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PRIV = '/Users/mac/StrangersEyes-private';
const UDID = process.env.SE_UDID ?? 'E950C8A0-185D-40BF-8A62-C113655C0557';
const BUNDLE = 'dev.strangerseyes.app';
const APP = join(ROOT, 'ios/build/Build/Products/Debug-iphonesimulator/StrangersEyes.app');
const TOKEN_FILE = join(ROOT, 'ios/.appcheck-debug-token');
const PHOTOS = ['bench-02', 'bench-07', 'bench-10', 'bench-21', 'bench-31', 'bench-32', 'bench-33', 'bench-40'];
const HOME_DLAT = 0.0072; // ~0.80 km, as in measure-fix-loop.mjs
const WORK_KM = 3;
const DRY = process.argv.includes('--dry');
const TIMEOUT_MS = 30 * 60_000;
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

function truthFor(id) {
  for (const line of readFileSync(join(PRIV, 'bench', 'truth.csv'), 'utf8').split(/\r?\n/).slice(1)) {
    const c = line.split(',');
    if (c[0] === id) {
      const lat = Number(c[1]); const lng = Number(c[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(`truth row for ${id} is unreadable`);
      return { lat, lng };
    }
  }
  throw new Error(`no truth row for ${id}`);
}

if (!existsSync(APP)) { console.error('build the DEBUG app first (RUNBOOK §2.8)'); process.exit(1); }
const token = DRY ? '' : (existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : '');
if (!DRY && !token) { console.error('ios/.appcheck-debug-token is missing (U-25)'); process.exit(1); }

const tmp = mkdtempSync(join(tmpdir(), 'se-iosbench-'));
const manifest = join(tmp, 'manifest.json');
// The manifest holds near-true pins: remove it however the script ends (exit, crash, Ctrl-C).
const cleanup = () => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* gone */ } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { cleanup(); spawnSync('xcrun', ['simctl', 'terminate', UDID, BUNDLE], { stdio: 'ignore' }); process.exit(130); });
const results = [];
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = join(PRIV, 'raw', `iosparity-${ts}${DRY ? '-dry' : ''}.json`);
try {
  writeFileSync(manifest, JSON.stringify(PHOTOS.map((id) => {
    const t = truthFor(id);
    return {
      id, path: join(PRIV, 'bench', `${id}.jpg`),
      home: { lat: t.lat + HOME_DLAT, lng: t.lng },
      work: { lat: t.lat, lng: t.lng - WORK_KM / (111.32 * Math.cos((t.lat * Math.PI) / 180)) },
    };
  })));
  spawnSync('xcrun', ['simctl', 'boot', UDID], { stdio: 'ignore' });
  spawnSync('xcrun', ['simctl', 'bootstatus', UDID, '-b'], { stdio: 'ignore' });
  if (spawnSync('xcrun', ['simctl', 'install', UDID, APP], { stdio: 'inherit' }).status !== 0) throw new Error('install failed');
  const env = { ...process.env, SIMCTL_CHILD_IOS_BENCH_MANIFEST: manifest };
  if (token) env.SIMCTL_CHILD_AppCheckDebugToken = token;
  const args = ['simctl', 'launch', '--console-pty', '--terminate-running-process', UDID, BUNDLE, '-iosBench', '-acceptWelcome'];
  if (DRY) args.push('-fakeAdversary');
  log(`launching ${DRY ? '(dry: fake attacker, no cloud call)' : '(live)'}; ${PHOTOS.length} photos, each once`);
  await new Promise((resolve, reject) => {
    const p = spawn('xcrun', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); console.log('harness time limit reached: the remaining photos were not run'); resolve(); }, TIMEOUT_MS);
    p.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line === 'IOSBENCH-DONE') { clearTimeout(timer); p.kill('SIGTERM'); resolve(); return; }
        if (!line.startsWith('IOSBENCH ')) continue;
        const r = JSON.parse(line.slice(9));
        results.push(r);
        writeFileSync(out, JSON.stringify({ protocol: 'iOS parity on the fix-loop photos (PROTOCOL.md, 2026-11-27)', dry: DRY, results }, null, 1) + '\n');
        const f = r.first ?? {}; const s = r.second ?? {};
        log(`${r.id}: ${r.error ? `ERROR ${r.error}` : `pre ${r.prescreen?.route} · attack ${r.attack?.route} ${r.attack?.ms} ms · ${f.refused ? 'REFUSED' : `${f.level} Home ${f.homeBand} (shown ${f.homeLineShown}) · referee ${f.referee?.route}`} · fix ${r.fixOffered ? `${r.fix?.masks} masks, crop ${r.fix?.cropSide}` : 'none'}${r.second ? ` → ${s.refused ? 'REFUSED' : `${s.level} Home ${s.homeBand} · ${r.headline}`}` : ''}`}`);
      }
    });
    p.on('exit', () => { clearTimeout(timer); resolve(); });
    p.on('error', reject);
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
  spawnSync('xcrun', ['simctl', 'terminate', UDID, BUNDLE], { stdio: 'ignore' });
}
const within5 = (b) => ['street', 'neighbourhood', 'district'].includes(b);
const ok = results.filter((r) => !r.error);
console.log(`photos ${results.length}, completed ${ok.length}, refused ${ok.filter((r) => r.first?.refused).length}, first within 5 km of Home ${ok.filter((r) => within5(r.first?.homeBand)).length}`);
console.log(`raw: ${out}`);
