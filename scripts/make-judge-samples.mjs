#!/usr/bin/env node
// scripts/make-judge-samples.mjs: Judge Mode's SYNTHETIC PLACEHOLDER samples (T-105, D-150). No dependencies: a tiny
// rasteriser (rectangles, ellipses, a stroke font, 2x supersampling) and a baseline JPEG encoder (JFIF APP0, DQT,
// SOF0, DHT, SOS only: no EXIF, no ICC, nothing check-images or the gate's strict validator would reject).
//
//   node scripts/make-judge-samples.mjs            draw the 3 placeholder scenes, write every sample file + manifest.json
//   node scripts/make-judge-samples.mjs --hash     keep the images and pass-B files; re-check them and rewrite only the
//                                                  sha256 values in manifest.json (the T-010 swap, RUNBOOK §6.2a)
//
// Output (web/public/samples/): judge-0N.jpg (1600x1200), judge-0N.nano768.jpg (768x576, the S4 pre-screen input whose
// hash is in the manifest, ARCH §5.4), judge-0N.advB.v1.json (the CACHED pass B on the default-masked sample) and
// judge-0N.advB.fixed.v1.json (the CACHED pass B on the sample after the default fix), and manifest.json.
// Every scene is drawn: no people, no real places, no real logos (invariant 9); each carries a "LUCAS" name tag, a
// "HOSPITAL STAFF" lanyard card, a house-number card, a street sign and a visible PLACEHOLDER watermark. Every pass-B
// coordinate is in the open-ocean test area near 0.5, -30.5 (no land within 100 km).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'web/public/samples');
const W = 1600;
const H = 1200;
const SS = 2; // supersampling factor

// ---------------------------------------------------------------- raster
class Raster {
  constructor(w, h) { this.w = w; this.h = h; this.px = new Float32Array(w * h * 3); }
  set(x, y, c, a = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const k = (y * this.w + x) * 3;
    for (let i = 0; i < 3; i++) this.px[k + i] = this.px[k + i] * (1 - a) + c[i] * a;
  }
  /** Rect in 0..1000 normalised coordinates (x0, y0, x1, y1). */
  rect(x0, y0, x1, y1, c, a = 1) {
    const X0 = Math.round((x0 / 1000) * this.w); const X1 = Math.round((x1 / 1000) * this.w);
    const Y0 = Math.round((y0 / 1000) * this.h); const Y1 = Math.round((y1 / 1000) * this.h);
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) this.set(x, y, c, a);
  }
  vgrad(x0, y0, x1, y1, top, bottom) {
    const Y0 = Math.round((y0 / 1000) * this.h); const Y1 = Math.round((y1 / 1000) * this.h);
    const X0 = Math.round((x0 / 1000) * this.w); const X1 = Math.round((x1 / 1000) * this.w);
    for (let y = Y0; y < Y1; y++) {
      const t = (y - Y0) / Math.max(1, Y1 - Y0 - 1);
      const c = top.map((v, i) => v + (bottom[i] - v) * t);
      for (let x = X0; x < X1; x++) this.set(x, y, c);
    }
  }
  ellipse(cx, cy, rx, ry, c, a = 1) {
    const CX = (cx / 1000) * this.w; const CY = (cy / 1000) * this.h;
    const RX = (rx / 1000) * this.w; const RY = (ry / 1000) * this.h;
    for (let y = Math.floor(CY - RY); y <= CY + RY; y++) {
      for (let x = Math.floor(CX - RX); x <= CX + RX; x++) {
        const dx = (x + 0.5 - CX) / RX; const dy = (y + 0.5 - CY) / RY;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
    }
  }
  line(x0, y0, x1, y1, width, c) {
    const n = Math.ceil(Math.hypot(((x1 - x0) / 1000) * this.w, ((y1 - y0) / 1000) * this.h));
    const r = width / 2;
    for (let i = 0; i <= n; i++) {
      const t = i / Math.max(1, n);
      const x = ((x0 + (x1 - x0) * t) / 1000) * this.w; const y = ((y0 + (y1 - y0) * t) / 1000) * this.h;
      for (let yy = Math.floor(y - r); yy <= y + r; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
        if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= r * r) this.set(xx, yy, c);
      }
    }
  }
  /** Thick round-capped segment in raster pixels. */
  seg(x0, y0, x1, y1, r, c) {
    const minX = Math.floor(Math.min(x0, x1) - r); const maxX = Math.ceil(Math.max(x0, x1) + r);
    const minY = Math.floor(Math.min(y0, y1) - r); const maxY = Math.ceil(Math.max(y0, y1) + r);
    const dx = x1 - x0; const dy = y1 - y0; const L2 = dx * dx + dy * dy || 1;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / L2));
      if ((x + 0.5 - x0 - t * dx) ** 2 + (y + 0.5 - y0 - t * dy) ** 2 <= r * r) this.set(x, y, c);
    }
  }
  /** Stroke-font text; `x`, `y` normalised (top-left); `cell` ≈ 1/7 of the cap height in output pixels. */
  text(str, x, y, cell, c) {
    const u = cell * 1.1 * (this.w / W); // one font unit in raster pixels (glyphs are 4 × 6 units)
    let cx = (x / 1000) * this.w; const cy = (y / 1000) * this.h;
    for (const ch of str) {
      for (const line of STROKES[ch] ?? []) {
        for (let k = 0; k + 1 < line.length; k++) {
          const [ax, ay] = line[k]; const [bx, by] = line[k + 1];
          this.seg(cx + ax * u, cy + ay * u, cx + bx * u, cy + by * u, 0.45 * u, c);
        }
      }
      cx += 5.4 * u;
    }
  }
  /** Deterministic fine grain so the scene is not flat colour. */
  grain(seed, amp) {
    let s = seed >>> 0;
    for (let i = 0; i < this.px.length; i += 3) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const d = ((s >>> 8) / 0xffffff - 0.5) * amp;
      for (let k = 0; k < 3; k++) this.px[i + k] += d;
    }
  }
  /** Box-filter downscale to (w, h); returns 8-bit RGB. */
  toRgb(w, h) {
    const out = new Uint8Array(w * h * 3);
    const fx = this.w / w; const fy = this.h / h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x * fx); const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * fx));
      const sy0 = Math.floor(y * fy); const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * fy));
      const acc = [0, 0, 0]; let n = 0;
      for (let yy = sy0; yy < sy1; yy++) for (let xx = sx0; xx < sx1; xx++) {
        const k = (yy * this.w + xx) * 3;
        acc[0] += this.px[k]; acc[1] += this.px[k + 1]; acc[2] += this.px[k + 2]; n++;
      }
      for (let i = 0; i < 3; i++) out[(y * w + x) * 3 + i] = Math.max(0, Math.min(255, Math.round(acc[i] / n)));
    }
    return out;
  }
}

// A simple stroke font (polylines in a 4 × 6 box): readable by OCR, unlike a 5 × 7 block font (F-224).
const O_ = [[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]];
const P_ = [[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]];
const STROKES = {
  ' ': [],
  A: [[[0, 6], [2, 0], [4, 6]], [[0.7, 4], [3.3, 4]]],
  B: [[[0, 3], [3, 3], [4, 4], [4, 5], [3, 6], [0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
  C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
  D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
  G: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3.5], [2.5, 3.5]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[1, 0], [3, 0]], [[2, 0], [2, 6]], [[1, 6], [3, 6]]],
  K: [[[0, 0], [0, 6]], [[4, 0], [0, 3.5]], [[1.3, 2.7], [4, 6]]],
  L: [[[0, 0], [0, 6], [4, 6]]],
  M: [[[0, 6], [0, 0], [2, 3.5], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  O: [O_],
  P: [P_],
  R: [P_, [[2, 3], [4, 6]]],
  S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  W: [[[0, 0], [1, 6], [2, 2.5], [3, 6], [4, 0]]],
  Y: [[[0, 0], [2, 3]], [[4, 0], [2, 3], [2, 6]]],
  0: [O_],
  1: [[[1, 1], [2, 0], [2, 6]], [[1, 6], [3, 6]]],
  2: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [0, 6], [4, 6]]],
  3: [[[0, 0], [4, 0], [2, 2.5], [3, 2.5], [4, 3.5], [4, 5], [3, 6], [1, 6], [0, 5]]],
  4: [[[3, 6], [3, 0], [0, 4], [4, 4]]],
  5: [[[4, 0], [0, 0], [0, 2.7], [3, 2.7], [4, 3.7], [4, 5], [3, 6], [0, 6]]],
  6: [[[3.5, 0], [1.5, 0], [0, 1.5], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]],
  7: [[[0, 0], [4, 0], [1.5, 6]]],
  8: [[[1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3]]],
  9: [[[4, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 4.5], [2.5, 6], [0.5, 6]]],
};

// ---------------------------------------------------------------- colours
const C = {
  white: [246, 246, 242], ink: [24, 24, 28], sky0: [150, 190, 228], sky1: [214, 230, 240], stone: [214, 204, 186],
  stoneLine: [188, 176, 156], wood: [96, 64, 44], pave: [150, 150, 146], paveLine: [124, 124, 120], signBlue: [28, 74, 150],
  signGreen: [22, 116, 74], red: [196, 40, 40], bag: [46, 84, 62], strap: [40, 60, 150], grey: [92, 92, 96],
  wall: [226, 214, 190], floor: [150, 112, 76], glass: [180, 208, 226], brick: [168, 92, 70], table: [236, 230, 218],
  cup: [250, 250, 250], amber: [212, 150, 40], water: [20, 20, 20],
};

// ---------------------------------------------------------------- props shared by the scenes
function nameTag(r, x0, y0, x1, y1) { // the backpack/bag tag: "LUCAS" (fictional; the fake vault's child_name)
  r.rect(x0 - 4, y0 - 6, x1 + 4, y1 + 6, C.grey);
  r.rect(x0, y0, x1, y1, C.white);
  r.text('LUCAS', x0 + (x1 - x0) * 0.1, y0 + (y1 - y0) * 0.22, Math.max(5, ((y1 - y0) / 1000) * H * 0.072), C.ink);
}
function lanyard(r, x0, y0, x1, y1, hookY) { // generic "HOSPITAL STAFF" card (D-39) with a fictional red logo
  const mx = (x0 + x1) / 2;
  r.line(mx - 30, hookY, x0 + 20, y0, 7, C.strap);
  r.line(mx + 30, hookY, x1 - 20, y0, 7, C.strap);
  r.rect(x0, y0, x1, y1, C.white);
  r.ellipse(x0 + (x1 - x0) * 0.18, y0 + (y1 - y0) * 0.26, (x1 - x0) * 0.09, (y1 - y0) * 0.14, C.red);
  r.rect(x0 + (x1 - x0) * 0.155, y0 + (y1 - y0) * 0.14, x0 + (x1 - x0) * 0.205, y0 + (y1 - y0) * 0.38, C.white);
  const cell = ((x1 - x0) / 1000) * W / 56;
  r.text('HOSPITAL', x0 + (x1 - x0) * 0.06, y0 + (y1 - y0) * 0.5, cell, C.ink);
  r.text('STAFF', x0 + (x1 - x0) * 0.06, y0 + (y1 - y0) * 0.74, cell, C.ink);
}
function houseNumber(r, x0, y0, x1, y1, n) {
  r.rect(x0 - 3, y0 - 4, x1 + 3, y1 + 4, C.ink);
  r.rect(x0, y0, x1, y1, C.white);
  r.text(n, x0 + (x1 - x0) * 0.18, y0 + (y1 - y0) * 0.16, Math.min((((y1 - y0) / 1000) * H) / 9.5, ((((x1 - x0) / 1000) * W) * 0.7) / (6 * n.length)), C.ink);
}
function streetSign(r, x0, y0, x1, y1, l1, l2, poleTo) {
  r.rect((x0 + x1) / 2 - 4, y1, (x0 + x1) / 2 + 4, poleTo, C.grey);
  r.rect(x0 - 4, y0 - 6, x1 + 4, y1 + 6, C.white);
  r.rect(x0, y0, x1, y1, C.signBlue);
  const cell = (((y1 - y0) / 1000) * H) / 20;
  r.text(l1, x0 + (x1 - x0) * 0.06, y0 + (y1 - y0) * 0.14, cell, C.white);
  r.text(l2, x0 + (x1 - x0) * 0.06, y0 + (y1 - y0) * 0.56, cell, C.white);
}
function watermark(r, n) {
  r.rect(15, 15, 560, 135, C.ink, 0.55);
  r.text('PLACEHOLDER', 30, 30, 10, C.amber);
  r.text(`SYNTHETIC SAMPLE ${n}`, 30, 100, 3.4, C.white);
}

// ---------------------------------------------------------------- the three scenes (all props fictional)
function scene1(r) { // doorstep-style public entrance (SPEC SCR-17 scene 1)
  r.vgrad(0, 0, 1000, 360, C.sky0, C.sky1);
  r.rect(0, 150, 1000, 800, C.stone);
  for (let y = 210; y < 800; y += 60) r.rect(0, y, 1000, y + 4, C.stoneLine);
  r.rect(370, 290, 570, 800, C.ink);
  r.rect(385, 305, 555, 800, C.wood);
  r.rect(530, 540, 545, 560, C.amber);
  houseNumber(r, 600, 320, 680, 420, '27');
  r.rect(0, 800, 1000, 1000, C.pave);
  for (let y = 840; y < 1000; y += 50) r.rect(0, y, 1000, y + 3, C.paveLine);
  for (const y of [640, 690]) r.rect(80, y, 380, y + 10, C.ink);
  for (let x = 80; x <= 380; x += 50) r.rect(x, 640, x + 8, 800, C.ink);
  streetSign(r, 560, 80, 900, 220, 'HARBOUR', 'ROAD', 790);
  r.rect(926, 300, 934, 800, C.grey);
  r.ellipse(930, 320, 45, 50, C.signGreen);
  r.text('BUS', 900, 302, 6, C.white);
  lanyard(r, 300, 700, 470, 860, 650);
  r.ellipse(720, 800, 105, 150, C.bag);
  r.rect(615, 760, 825, 930, C.bag);
  nameTag(r, 650, 700, 790, 770);
}
function scene2(r) { // marketplace listing in a non-residential interior with a window onto a street (scene 2)
  r.rect(0, 0, 1000, 760, C.wall);
  r.rect(0, 760, 1000, 1000, C.floor);
  for (let x = 0; x < 1000; x += 90) r.rect(x, 760, x + 3, 1000, [120, 88, 60]);
  r.rect(540, 80, 960, 570, C.ink);
  r.vgrad(555, 95, 945, 300, C.sky0, C.sky1);
  r.rect(555, 260, 945, 555, C.brick);
  for (let y = 290; y < 555; y += 40) r.rect(555, y, 945, y + 3, [140, 76, 58]);
  r.rect(650, 400, 720, 555, C.wood);
  houseNumber(r, 760, 300, 830, 370, '14');
  r.rect(748, 95, 756, 555, C.ink);
  streetSign(r, 600, 150, 900, 250, 'MARKET', 'STREET', 260);
  // the item for sale: a wooden stool and a lamp
  r.rect(220, 640, 500, 680, C.wood);
  r.rect(240, 680, 265, 900, C.wood); r.rect(455, 680, 480, 900, C.wood);
  r.rect(345, 420, 365, 640, C.grey);
  r.ellipse(355, 400, 90, 60, C.amber);
  lanyard(r, 300, 520, 460, 680, 470);
  r.rect(60, 760, 280, 960, [180, 140, 90]);
  r.rect(60, 760, 280, 780, [150, 112, 70]);
  nameTag(r, 95, 820, 245, 890);
}
function scene3(r) { // creator: an outdoor café table, a transit sign behind (scene 3)
  r.vgrad(0, 0, 1000, 300, C.sky0, C.sky1);
  r.rect(0, 120, 1000, 620, C.stone);
  for (let x = 40; x < 1000; x += 160) r.rect(x, 300, x + 90, 450, C.glass);
  houseNumber(r, 470, 330, 540, 400, '8');
  r.rect(0, 560, 1000, 640, C.pave);
  streetSign(r, 650, 90, 930, 190, 'STATION', 'ROAD', 560);
  r.rect(208, 270, 216, 560, C.grey);
  r.rect(100, 160, 330, 270, C.signGreen);
  r.text('LINE 4', 125, 190, 6.5, C.white);
  r.rect(0, 640, 1000, 1000, C.table);
  r.rect(0, 640, 1000, 655, [200, 190, 170]);
  r.rect(430, 540, 560, 770, C.cup);
  r.rect(430, 610, 560, 670, C.red);
  r.text('KOFI', 445, 625, 5, C.white);
  lanyard(r, 120, 760, 320, 900, 720);
  r.rect(640, 650, 920, 920, C.bag);
  r.rect(640, 650, 920, 680, [36, 66, 50]);
  nameTag(r, 700, 720, 850, 790);
}

// ---------------------------------------------------------------- pass B (synthetic, open-ocean coordinates only)
const HOME = { lat: 0.5, lng: -30.5 };
const WORK = { lat: 0.53, lng: -30.46 };
const SAMPLES = [
  {
    id: 'judge-01', title: 'Doorstep entrance (placeholder)', draw: scene1,
    advB: {
      audit_status: 'ok',
      scene_summary: 'A stone building entrance with a street sign, a bus stop, a backpack and a lanyard on a railing.',
      clues: [
        { id: 'c1', type: 'street_sign', box_2d: [80, 560, 220, 900], evidence: 'Blue street sign naming a harbour road and a number range.', reveals: 'street', severity: 'high', removable: true },
        { id: 'c2', type: 'uniform_or_lanyard', box_2d: [700, 300, 860, 470], evidence: 'Lanyard card printed HOSPITAL STAFF with a red logo.', reveals: 'venue_or_organisation', severity: 'high', removable: true },
        { id: 'c3', type: 'house_number', box_2d: [320, 600, 420, 680], evidence: 'Door number plaque beside the entrance.', reveals: 'street', severity: 'medium', removable: true },
        { id: 'c4', type: 'transit_sign', box_2d: [250, 880, 380, 980], evidence: 'Green bus stop sign at the kerb.', reveals: 'neighbourhood', severity: 'medium', removable: true },
        { id: 'c5', type: 'architecture', box_2d: [150, 0, 800, 1000], evidence: 'Pale stone facade with regular courses.', reveals: 'city', severity: 'low', removable: false },
      ],
      hypotheses: [
        { id: 'h1', label: 'Harbour Road, a coastal district', level: 'street', lat: 0.502, lng: -30.497, radius_km: 0.6, confidence: 'medium', clue_ids: ['c1', 'c3'] },
        { id: 'h2', label: 'The harbour district of a coastal city', level: 'district', lat: 0.51, lng: -30.48, radius_km: 3, confidence: 'low', clue_ids: ['c4', 'c5'] },
      ],
      inferences: [
        { id: 'i1', kind: 'workplace', value: 'A hospital (staff lanyard)', confidence: 'medium', clue_ids: ['c2'] },
        { id: 'i2', kind: 'home_area', value: 'Near Harbour Road', confidence: 'medium', clue_ids: ['c1', 'c3'] },
      ],
    },
  },
  {
    id: 'judge-02', title: 'Marketplace listing (placeholder)', draw: scene2,
    advB: {
      audit_status: 'ok',
      scene_summary: 'An item for sale indoors: a stool and a lamp, a box, a lanyard, and a window onto a brick street.',
      clues: [
        { id: 'c1', type: 'window_view', box_2d: [80, 540, 570, 960], evidence: 'Window view of a brick terrace and a street sign.', reveals: 'street', severity: 'high', removable: true },
        { id: 'c2', type: 'street_sign', box_2d: [150, 600, 250, 900], evidence: 'Street sign naming a market street.', reveals: 'street', severity: 'high', removable: true },
        { id: 'c3', type: 'uniform_or_lanyard', box_2d: [520, 300, 680, 460], evidence: 'Lanyard card printed HOSPITAL STAFF hanging on the lamp.', reveals: 'venue_or_organisation', severity: 'high', removable: true },
        { id: 'c4', type: 'house_number', box_2d: [300, 760, 370, 830], evidence: 'House number plaque across the street.', reveals: 'street', severity: 'medium', removable: true },
      ],
      hypotheses: [
        { id: 'h1', label: 'Market Street, an old brick quarter', level: 'street', lat: 0.498, lng: -30.503, radius_km: 0.5, confidence: 'medium', clue_ids: ['c1', 'c2', 'c4'] },
      ],
      inferences: [
        { id: 'i1', kind: 'home_area', value: 'The seller lives near Market Street', confidence: 'medium', clue_ids: ['c1', 'c2'] },
        { id: 'i2', kind: 'workplace', value: 'A hospital (staff lanyard)', confidence: 'medium', clue_ids: ['c3'] },
      ],
    },
  },
  {
    id: 'judge-03', title: 'Café table creator shot (placeholder)', draw: scene3,
    advB: {
      audit_status: 'ok',
      scene_summary: 'An outdoor café table with a cup, a bag and a lanyard; a transit sign and a street sign behind.',
      clues: [
        { id: 'c1', type: 'transit_sign', box_2d: [160, 100, 270, 330], evidence: 'Green transit sign for line 4.', reveals: 'neighbourhood', severity: 'high', removable: true },
        { id: 'c2', type: 'street_sign', box_2d: [90, 650, 190, 930], evidence: 'Street sign naming a station road.', reveals: 'street', severity: 'high', removable: true },
        { id: 'c3', type: 'uniform_or_lanyard', box_2d: [760, 120, 900, 320], evidence: 'Lanyard card printed HOSPITAL STAFF on the table.', reveals: 'venue_or_organisation', severity: 'high', removable: true },
        { id: 'c4', type: 'storefront_text', box_2d: [540, 430, 770, 560], evidence: 'Cup with a small local brand name.', reveals: 'city', severity: 'low', removable: true },
      ],
      hypotheses: [
        { id: 'h1', label: 'Station Road, by the line 4 stop', level: 'street', lat: 0.528, lng: -30.463, radius_km: 0.7, confidence: 'medium', clue_ids: ['c1', 'c2'] },
      ],
      inferences: [
        { id: 'i1', kind: 'transit_line', value: 'Takes line 4 from Station Road', confidence: 'medium', clue_ids: ['c1'] },
        { id: 'i2', kind: 'workplace', value: 'A hospital near the line 4 route', confidence: 'medium', clue_ids: ['c1', 'c3'] },
      ],
    },
  },
];

/** The recorded answer on the FIXED sample: every removable clue is masked, so it and what it supported go. */
function fixedAnswer(a) {
  const gone = new Set(a.clues.filter((c) => c.removable).map((c) => c.id));
  const clues = a.clues.filter((c) => !gone.has(c.id));
  const left = new Set(clues.map((c) => c.id));
  const keep = (x) => x.clue_ids.every((id) => left.has(id));
  const hypotheses = a.hypotheses.filter(keep);
  if (hypotheses.length === 0) {
    hypotheses.push({ id: 'h9', label: 'A coastal city', level: 'city', lat: 0.6, lng: -30.3, radius_km: 25, confidence: 'low', clue_ids: clues.map((c) => c.id) });
  }
  return {
    ...a,
    scene_summary: 'The same scene with several solid black areas; little readable text remains.',
    clues, hypotheses, inferences: a.inferences.filter(keep),
  };
}

// ---------------------------------------------------------------- baseline JPEG encoder (4:4:4, JFIF)
const ZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
const QL = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const QC = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, ...Array(32).fill(99)];
const DC_L = { bits: [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], vals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
const DC_C = { bits: [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], vals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
const AC_L = { bits: [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d], vals: [0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa] };
const AC_C = { bits: [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77], vals: [0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa] };
for (const t of [DC_L, DC_C, AC_L, AC_C]) if (t.bits.reduce((a, b) => a + b, 0) !== t.vals.length) throw new Error('bad Huffman table');

function huffCodes(t) {
  const codes = new Map(); let code = 0; let k = 0;
  for (let len = 1; len <= 16; len++) { for (let i = 0; i < t.bits[len - 1]; i++) codes.set(t.vals[k++], [code++, len]); code <<= 1; }
  return codes;
}
const scaleQ = (q, quality) => {
  const s = quality < 50 ? 5000 / quality : 200 - quality * 2;
  return q.map((v) => Math.max(1, Math.min(255, Math.floor((v * s + 50) / 100))));
};
const COS = Array.from({ length: 8 }, (_, x) => Array.from({ length: 8 }, (_, u) => Math.cos(((2 * x + 1) * u * Math.PI) / 16)));
function fdct(block) { // block: 64 values (level-shifted), natural order → 64 coefficients
  const tmp = new Float64Array(64); const out = new Float64Array(64);
  for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) {
    let s = 0; for (let x = 0; x < 8; x++) s += block[y * 8 + x] * COS[x][u];
    tmp[y * 8 + u] = s * (u === 0 ? Math.SQRT1_2 : 1) / 2;
  }
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) {
    let s = 0; for (let y = 0; y < 8; y++) s += tmp[y * 8 + u] * COS[y][v];
    out[v * 8 + u] = s * (v === 0 ? Math.SQRT1_2 : 1) / 2;
  }
  return out;
}

function encodeJpeg(rgb, w, h, quality = 90) {
  const ql = scaleQ(QL, quality); const qc = scaleQ(QC, quality);
  const bytes = [];
  const u16 = (v) => bytes.push((v >> 8) & 255, v & 255);
  const seg = (marker, body) => { bytes.push(0xff, marker); u16(body.length + 2); bytes.push(...body); };
  bytes.push(0xff, 0xd8);
  seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]); // JFIF 1.01, aspect 1:1, no thumbnail
  seg(0xdb, [0, ...ZZ.map((i) => ql[i]), 1, ...ZZ.map((i) => qc[i])]);
  seg(0xc0, [8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const dht = (cls, id, t) => [(cls << 4) | id, ...t.bits, ...t.vals];
  seg(0xc4, [...dht(0, 0, DC_L), ...dht(1, 0, AC_L), ...dht(0, 1, DC_C), ...dht(1, 1, AC_C)]);
  seg(0xda, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);
  const H_ = { dcL: huffCodes(DC_L), acL: huffCodes(AC_L), dcC: huffCodes(DC_C), acC: huffCodes(AC_C) };
  let acc = 0; let nbits = 0;
  const put = ([code, len]) => {
    acc = (acc << len) | code; nbits += len;
    while (nbits >= 8) {
      const b = (acc >> (nbits - 8)) & 255; bytes.push(b); if (b === 0xff) bytes.push(0); nbits -= 8; acc &= (1 << nbits) - 1;
    }
  };
  const cat = (v) => { let a = Math.abs(v); let n = 0; while (a) { n++; a >>= 1; } return n; };
  const bitsOf = (v, n) => [v < 0 ? v + (1 << n) - 1 : v, n];
  const pred = [0, 0, 0];
  const comp = new Float64Array(64);
  for (let by = 0; by < h; by += 8) for (let bx = 0; bx < w; bx += 8) {
    for (let ci = 0; ci < 3; ci++) {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const k = (Math.min(h - 1, by + y) * w + Math.min(w - 1, bx + x)) * 3;
        const R = rgb[k]; const G = rgb[k + 1]; const B = rgb[k + 2];
        const v = ci === 0 ? 0.299 * R + 0.587 * G + 0.114 * B
          : ci === 1 ? -0.168736 * R - 0.331264 * G + 0.5 * B + 128 : 0.5 * R - 0.418688 * G - 0.081312 * B + 128;
        comp[y * 8 + x] = v - 128;
      }
      const q = ci === 0 ? ql : qc; const dc = ci === 0 ? H_.dcL : H_.dcC; const ac = ci === 0 ? H_.acL : H_.acC;
      const f = fdct(comp);
      const z = ZZ.map((i) => Math.round(f[i] / q[i]));
      const d = z[0] - pred[ci]; pred[ci] = z[0];
      const dn = cat(d); put(dc.get(dn)); if (dn) put(bitsOf(d, dn));
      let run = 0;
      for (let k = 1; k < 64; k++) {
        if (z[k] === 0) { run++; continue; }
        while (run > 15) { put(ac.get(0xf0)); run -= 16; }
        const n = cat(z[k]); put(ac.get((run << 4) | n)); put(bitsOf(z[k], n)); run = 0;
      }
      if (run > 0) put(ac.get(0x00));
    }
  }
  if (nbits > 0) put([(1 << (8 - nbits)) - 1, 8 - nbits]); // pad with 1-bits
  bytes.push(0xff, 0xd9);
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------- checks + manifest
const sha = (b) => createHash('sha256').update(b).digest('hex');
/** Only SOI, APP0 JFIF, DQT, DHT, SOF0/2, DRI, SOS before the scan (the gate's strict validator accepts no more). */
function assertCleanJpeg(b, name) {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error(`${name}: not a JPEG`);
  let i = 2;
  for (;;) {
    if (b[i] !== 0xff) throw new Error(`${name}: stray byte at ${i}`);
    const m = b[i + 1];
    if (m === 0xda) return;
    if (![0xe0, 0xdb, 0xc4, 0xc0, 0xc2, 0xdd].includes(m)) throw new Error(`${name}: segment FF${m.toString(16)} is not allowed (metadata?)`);
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
}

const RECORDED_AT = '2026-11-21';
const MODEL = 'placeholder (authored, not recorded)';
const fakeVault = { homePin: HOME, workPin: WORK };

function manifestFor(entries) {
  return {
    version: 1,
    placeholder: true,
    about: 'Judge Mode samples (T-105). PLACEHOLDERS: drawn synthetic scenes and authored pass-B answers until the T-010 photos and recorded pass B replace them (RUNBOOK §6.2a). Coordinates are in the open-ocean test area.',
    fakeVault,
    samples: entries,
  };
}

mkdirSync(OUT, { recursive: true });
if (process.argv.includes('--hash')) {
  const m = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
  for (const s of m.samples) {
    const img = readFileSync(join(OUT, s.image)); const n768 = readFileSync(join(OUT, s.nano768));
    assertCleanJpeg(img, s.image); assertCleanJpeg(n768, s.nano768);
    for (const f of [s.cachedAdvB, s.cachedAdvBFixed]) JSON.parse(readFileSync(join(OUT, f), 'utf8'));
    s.imageSha256 = sha(img); s.nano768Sha256 = sha(n768);
  }
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(m, null, 2)}\n`);
  console.log(`manifest.json: ${m.samples.length} samples re-hashed`);
} else {
  const entries = [];
  SAMPLES.forEach((s, k) => {
    const r = new Raster(W * SS, H * SS);
    s.draw(r);
    watermark(r, k + 1);
    r.grain(0x5e + k, 6);
    const jpg = encodeJpeg(r.toRgb(W, H), W, H, 90);
    const n768 = encodeJpeg(r.toRgb(768, 576), 768, 576, 85);
    assertCleanJpeg(jpg, s.id); assertCleanJpeg(n768, `${s.id}.nano768`);
    writeFileSync(join(OUT, `${s.id}.jpg`), jpg);
    writeFileSync(join(OUT, `${s.id}.nano768.jpg`), n768);
    writeFileSync(join(OUT, `${s.id}.advB.v1.json`), `${JSON.stringify(s.advB, null, 2)}\n`);
    writeFileSync(join(OUT, `${s.id}.advB.fixed.v1.json`), `${JSON.stringify(fixedAnswer(s.advB), null, 2)}\n`);
    entries.push({
      id: s.id, title: s.title, placeholder: true,
      image: `${s.id}.jpg`, imageSha256: sha(jpg), nano768: `${s.id}.nano768.jpg`, nano768Sha256: sha(n768),
      cachedAdvB: `${s.id}.advB.v1.json`, cachedAdvBFixed: `${s.id}.advB.fixed.v1.json`, recordedAt: RECORDED_AT, model: MODEL,
      expected: null,
    });
    console.log(`${s.id}: ${jpg.length} B, nano768 ${n768.length} B`);
  });
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifestFor(entries), null, 2)}\n`);
}
