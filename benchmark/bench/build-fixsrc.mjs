#!/usr/bin/env node
// benchmark/bench/build-fixsrc.mjs: the mask experiment's input (D-174/D-175), derived from a live benchmark raw file.
//
//   node benchmark/bench/build-fixsrc.mjs PRIV/raw/bench-<ts>-live-….json   → PRIV/bench/fixsrc.json (private: box positions only)
//
// Pre-registered set (PRIV/bench/PROTOCOL.md, "Mask experiment"): every complete, not-skipped photo with NO declined or
// blocked run, whose source run cited at least one removable clue. Source run = the fix's source run when the photo was
// re-attacked, else the ok 'before' run with the smallest d. Each entry records refusedRuns (always 0 here); the harness
// refuses to re-attack any entry that does not say 0 (invariant 7).
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = '/Users/mac/StrangersEyes-private/bench/fixsrc.json';
const file = process.argv[2];
if (!file) { console.error('usage: build-fixsrc.mjs <live bench raw.json>'); process.exit(2); }
const raw = JSON.parse(readFileSync(file, 'utf8'));
if (raw.mode !== 'live' || raw.set !== 'bench' || raw.fixExp) { console.error(`${file}: not a live benchmark run`); process.exit(2); }
const REFUSED = ['declined', 'blocked'];
const out = {};
for (const p of raw.photos) {
  if (!p.complete || p.skipped) continue;
  const refusedRuns = p.runs.filter((r) => REFUSED.includes(r.status)).length;
  if (refusedRuns) continue;
  const before = p.runs.filter((r) => r.kind === 'before');
  let src;
  if (p.fix && !p.fix.skipped) src = before.find((r) => r.idx === p.fix.sourceRunIdx);
  else {
    const oks = before.filter((r) => r.status === 'ok' && r.dKm !== null && r.dKm !== undefined);
    src = oks.length ? oks.reduce((a, b) => (b.dKm < a.dKm ? b : a)) : undefined;
  }
  const clues = (src?.parsed?.clues ?? []).map((c) => ({ id: c.id, type: c.type, removable: c.removable, box2d: c.box2d }));
  if (!clues.some((c) => c.removable)) continue;
  out[p.id] = { sourceRunIdx: src.idx, refusedRuns, cloudW: p.cloud.width, cloudH: p.cloud.height, clues };
}
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`build-fixsrc: ${Object.keys(out).length} photos → ${OUT}: ${Object.keys(out).map((k) => k.slice(-2)).join(',')}`);
