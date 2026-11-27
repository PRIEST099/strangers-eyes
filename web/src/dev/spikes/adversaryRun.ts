// DEV-only Spike B (T-031): adversary pass-B go/no-go (G1) and fix test (G1b). __SE_DEV_ONLY__
// SPEC §0.3 (G1/G1b), RUNBOOK §5.1, TASKS T-031. Never in production builds (App.tsx loads it behind import.meta.env.DEV).
// Day-1 spikes predate the Egress Gate, so check-boundaries lets web/src/dev/spikes/ call the SDK directly. This file
// still applies the gate's image rules by hand: every frame sent is a fresh canvas re-encode (no EXIF/GPS), asserted
// clean with assertCleanJpeg, with faces solid-masked and re-checked (CLAUDE.md invariants 2, 4, 6).
// Truth coordinates are read from PRIV and kept in memory only. Raw results (with model coordinates) are written to
// PRIV/raw by the headless harness (benchmark/spike/run-spike.mjs), never to the repo.
// Pass A (grounded) is not run: it needs the paid tier (D-70, T-039).
import { AIError, AIErrorCode, FinishReason, getGenerativeModel, InferenceMode, ThinkingLevel } from 'firebase/ai';
import { ai, authReady } from '../../firebase/init';
import { setVaultScanner, tripwire } from '../../ai/tripwire';
import { MANIFEST, render, segmentsText, systemText } from '../../ai/prompts';
import { ADV_B_SCHEMA } from '../../ai/schemas';
import { parseAdvB, type ParsedAdvB } from '../../ai/parse';
import { checkCleanJpeg, assertCleanJpeg, reencodeClean } from '../../tier0/exif';
import { decodeToMaster, downscaleTo, toJpeg } from '../../tier0/decode';
import { detectFaces, DEFAULT_FACE_MIN_CONFIDENCE } from '../../tier0/faces';
import { applyMasks } from '../../core/mask';
import { box2dToPx, cloudToMaster, DEFAULT_MASK_PAD_RATIO, padRect } from '../../core/boxes';
import { bandRank, haversineMeters, pinBand } from '../../core/geo';
import { ocrMaster } from '../../tier0/ocr';
import { DEFAULT_FUZZY_THRESHOLD, findInText, makeTerm, termInWords } from '../../tier0/fuzzy';
import { DISTANCE_BANDS } from '../../core/types';
import type { DistanceBand, ImageFrame, Pin, PxRect } from '../../core/types';

export const DEV_ONLY_MARKER = '__SE_DEV_ONLY__';
export const SPIKE_VERSION = 'spikeB.1';
const PRIV_ROOT = '/@fs/Users/mac/StrangersEyes-private'; // PRIV/spike and PRIV/bench, served only when VITE_SPIKE=1 (vite.config.ts)
export const ALL_PHOTOS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'] as const;
/** D-174: photo sets. `spike` = the Day-1 ten; `bench` = the held-out benchmark (PRIV/bench/bench-NN.jpg + truth.csv). */
export const PHOTO_SETS = {
  spike: ALL_PHOTOS as readonly string[],
  bench: Array.from({ length: 40 }, (_, i) => String(i + 1).padStart(2, '0')) as readonly string[],
} as const;
export type PhotoSet = keyof typeof PHOTO_SETS;
/** The set of the current run (set once by runSpike). */
let photoSet: PhotoSet = 'spike';
const setDir = () => `${PRIV_ROOT}/${photoSet}`;
export const FLASH = 'gemini-3.8-flash';
export const HYDROGEN = 'gemini-4-hydrogen';
export const CONFIG = {
  promptId: 'advB.v1',
  thinkingLevel: 'MEDIUM',
  maxOutputTokens: 16384, // generous: whether thinking counts toward it is U-12 (probed separately)
  timeoutMs: 240_000,
  masterMaxPx: 2048,
  cloudMaxPx: 1536,
  cloudJpegQuality: 0.85, // ARCH §11.1 cloud frame
  faceMinConfidence: DEFAULT_FACE_MIN_CONFIDENCE,
  fixPadRatio: DEFAULT_MASK_PAD_RATIO, // 15 % in total (T-031 step 6)
  locatedKm: 5,
  minGapMs: 3000, // ≥ 3 s between call starts (RUNBOOK §5.3)
  primaryRuns: 3, // the primary adversary model: G1 runs, G1b rerun and the U-12 probe (gemini-3.8-flash by default)
  secondaryRuns: 1, // the A/B model
  maxRetries: 1, // one identical resend, only for 429/5xx/network errors raised before any response (RUNBOOK §5.5, API-NOTES §6.6)
  stopAfterErrors: 3, // consecutive failed calls (quota, permissions…): stop instead of spending more
} as const;
/** The lighter cloud model (RC explain_cloud_model), for latency comparisons only (?models=lite). */
export const LITE = 'gemini-3.5-flash-lite';
const MODEL_IDS: Record<string, string> = { flash: FLASH, hydrogen: HYDROGEN, lite: LITE };
export const SPIKE_THINKING = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type SpikeThinking = (typeof SPIKE_THINKING)[number];
/** Latency experiment knobs (?thinking, ?px, ?runs, ?retries) override these four; everything else is CONFIG. */
export type SpikeConfig = Omit<typeof CONFIG, 'thinkingLevel' | 'cloudMaxPx' | 'primaryRuns' | 'maxRetries'>
  & { thinkingLevel: SpikeThinking; cloudMaxPx: number; primaryRuns: number; maxRetries: number };
/** The effective config of the current run (set once by runSpike, recorded in the raw JSON). */
let cfg: SpikeConfig = CONFIG;

export type RunStatus = 'ok' | 'no_location_signal' | 'declined' | 'blocked' | 'truncated' | 'unreadable' | 'error';
export interface RunRec {
  model: string;
  kind: 'before' | 'fix' | 'probe';
  /** D-174 mask experiment only: which fill hid the clues on this 'fix' run. Absent = solid (the app's only fill). */
  variant?: 'solid' | 'blur';
  idx: number;
  status: RunStatus;
  attempts: number;
  latencyMs: number;
  finishReason?: string;
  blockReason?: string;
  httpStatus?: number;
  error?: string;
  usage?: Record<string, number>;
  requestBytes?: number;
  maxOutputTokens: number;
  parsed?: ParsedAdvB; // full output (PRIV only)
  rawText?: string; // kept only for unreadable or truncated runs, to debug (PRIV only)
  /** Closest hypothesis CENTRE to the truth (SPEC §15.3 `d`), km. null when there are no hypotheses. */
  dKm: number | null;
  top1Km: number | null;
  /** D-10 `e` via the app's pinBand (pin = truth). */
  eKm: number | null;
  /** null when the run produced no scorable output (refused, error, unreadable, truncated). */
  band: DistanceBand | null;
  /** The hypothesis that sets `e` and the band (D-10). */
  bandHypId: string | null;
  closest: { id: string; radiusKm: number; level: string; confidence: string } | null;
}
export interface ImgCheck { bytes: number; width?: number; height?: number; segments: string[]; hasGps: boolean; sha256?: string }
export interface FixRec {
  sourceRunIdx: number;
  /** Band of the run whose clues were masked (the located run with the smallest e). */
  sourceBand: DistanceBand;
  /** Median band rank over the scorable 'before' flash runs: the headline baseline (review metrics-2). */
  medianBeforeBand: DistanceBand;
  /** After vs the median 'before' band; null unless the fix run is ok or no_location_signal. */
  movedOutward?: boolean | null;
  maskedClueIds: string[];
  maskedTypes: string[];
  keptNonRemovable: string[];
  cloud?: ImgCheck;
  skipped?: string;
}
export interface PhotoRec {
  id: string;
  placeType: string;
  source: ImgCheck;
  master: ImgCheck;
  cloud: ImgCheck;
  faces: { found: number; scores: number[]; afterMask: number };
  runs: RunRec[];
  fix?: FixRec;
  skipped?: string;
  /** Every planned call for this photo has finished (a --photos resume can skip it). */
  complete?: boolean;
}
export interface SpikeResult {
  spikeVersion: string;
  startedAt: string;
  finishedAt?: string;
  mode: 'dry' | 'live' | 'schema';
  config: SpikeConfig;
  /** D-174: the photo set and the number of re-attack runs after the fix. */
  set?: PhotoSet;
  fixRuns?: number;
  fixExp?: boolean;
  blurSigmaRatio?: number;
  /** D-177 text experiment records (PRIV only: the answers hold the made-up names). */
  textExp?: TextExpRec[];
  /** The 3-run adversary model (D-73). */
  primary: string;
  /** D-74: skip a primary run that can no longer change the photo's G1 classification. */
  adaptive: boolean;
  schemaProbes?: SchemaProbe[];
  models: string[];
  prompt: { id: string; released: boolean; files: Record<string, string> };
  authUid: boolean;
  photos: PhotoRec[];
  probes: RunRec[];
  /** Count of cloud calls actually sent (attempts included): the runner snapshots on every change. */
  callsSent: number;
  stoppedEarly?: string;
}
/** U-45 follow-up: which pass-B schema variant Gemini's constrained decoder accepts (text-only call, no image). */
export interface SchemaProbe { variant: string; model: string; accepted: boolean; httpStatus?: number; error?: string; latencyMs: number; outputOk?: boolean }
export interface SpikeState {
  state: 'idle' | 'running' | 'done' | 'error';
  log: string[];
  result: SpikeResult | null;
  /** Cloud JPEG contact sheets (base64, no prefix) for visual checks: what was sent, and the fixed frames. */
  contactSent?: string;
  contactFix?: string;
  error?: string;
}

declare global {
  var __advSpike: SpikeState | undefined;
  var __advSpikeStarted: boolean | undefined;
}

// ---------------------------------------------------------------- helpers
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function sha256Hex(b: Blob): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', await b.arrayBuffer());
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('');
}
async function blobToBase64(b: Blob): Promise<string> {
  const url = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
  return url.slice(url.indexOf(',') + 1);
}
async function imgCheck(b: Blob, w?: number, h?: number, withSha = false): Promise<ImgCheck> {
  const c = await checkCleanJpeg(b);
  return { bytes: b.size, width: w, height: h, segments: c.segments, hasGps: c.hasGps, ...(withSha ? { sha256: await sha256Hex(b) } : {}) };
}

interface Truth { lat: number; lng: number; placeType: string }
async function loadTruth(): Promise<Map<string, Truth>> {
  const res = await fetch(`${setDir()}/truth.csv`);
  if (!res.ok) throw new Error(`truth.csv: HTTP ${res.status} (is the dev server running with VITE_SPIKE=1?)`);
  const out = new Map<string, Truth>();
  for (const line of (await res.text()).split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const [id, lat, lng, placeType] = line.split(',');
    const t = { lat: Number(lat), lng: Number(lng), placeType: placeType ?? '' };
    if (!Number.isFinite(t.lat) || !Number.isFinite(t.lng)) throw new Error(`truth.csv: bad row for ${id}`);
    out.set(id, t);
  }
  return out;
}

/** Distances are code, never the LLM (invariant 5). `e` and the band go through the app's own pinBand. */
export function scoreHypotheses(p: ParsedAdvB | undefined, truth: Truth): Pick<RunRec, 'dKm' | 'top1Km' | 'eKm' | 'band' | 'bandHypId' | 'closest'> {
  const hs = p?.status === 'ok' ? p.hypotheses : [];
  if (!hs.length) return { dKm: null, top1Km: null, eKm: null, band: 'none', bandHypId: null, closest: null };
  const ds = hs.map((h) => haversineMeters(truth.lat, truth.lng, h.lat, h.lng) / 1000);
  let ci = 0;
  ds.forEach((d, i) => { if (d < ds[ci]) ci = i; });
  const pin: Pin = { lat: truth.lat, lng: truth.lng, accuracyM: 0, capturedAt: 0, source: 'manual' };
  const pb = pinBand('truth', pin, hs);
  const c = hs[ci];
  return { dKm: ds[ci], top1Km: ds[0], eKm: pb.effectiveKm, band: pb.band, bandHypId: pb.hypothesisId,
    closest: { id: c.id, radiusKm: c.radiusKm, level: c.level, confidence: c.confidence } };
}

// ---------------------------------------------------------------- the one cloud call (S3, ONLY_IN_CLOUD, no tools)
let lastCallAt = 0;
let permitSeq = 0;
const runTag = `spikeB-${crypto.randomUUID().slice(0, 8)}`; // permit ids unique per module instance

async function passB(model: string, jpegB64: string, truth: Truth, kind: RunRec['kind'], idx: number, log: (s: string) => void,
  counters: { sent: () => void }, maxOutputTokens: number = CONFIG.maxOutputTokens): Promise<RunRec> {
  const m = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model,
      systemInstruction: systemText(CONFIG.promptId),
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: ADV_B_SCHEMA,
        maxOutputTokens,
        thinkingConfig: { thinkingLevel: ThinkingLevel[cfg.thinkingLevel] },
      },
    },
  }, { timeout: CONFIG.timeoutMs });
  const userText = segmentsText(render(CONFIG.promptId)); // text part BEFORE the image (API-NOTES §6.9)
  const rec: RunRec = { model, kind, idx, status: 'error', attempts: 0, latencyMs: 0, maxOutputTokens, dKm: null, top1Km: null, eKm: null, band: null, bandHypId: null, closest: null };

  // 1. The request. Only this step may be resent, and only for errors raised BEFORE any response arrived:
  //    HTTP 429/5xx, or a network failure with no status. A timeout (AbortError) is never resent: the server may
  //    already have processed it (review sdk-1, runner-9).
  let res: Awaited<ReturnType<typeof m.generateContent>> | null = null;
  for (let attempt = 1; attempt <= 1 + cfg.maxRetries && !res; attempt++) {
    const wait = lastCallAt + CONFIG.minGapMs - performance.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = performance.now();
    const permitId = `${runTag}-${++permitSeq}`;
    const unobserve = tripwire.observe((o) => { if (o.permitId === permitId) rec.requestBytes = o.bytes; });
    tripwire.grantCloud({ id: permitId, scanText: true });
    rec.attempts = attempt;
    counters.sent();
    const t0 = performance.now();
    try {
      res = await m.generateContent([
        { type: 'text', text: userText },
        { type: 'inlineData', inlineData: { data: jpegB64, mimeType: 'image/jpeg' } },
      ]);
      rec.latencyMs = Math.round(performance.now() - t0);
    } catch (e) {
      tripwire.revokeCloud(permitId); // no-op if the fetch consumed it
      rec.latencyMs = Math.round(performance.now() - t0);
      if (e instanceof AIError && e.code === AIErrorCode.RESPONSE_ERROR) {
        // Blocked (SAFETY, SPII, PROHIBITED_CONTENT, …). NEVER re-prompt or reframe (invariant 7).
        rec.status = 'blocked';
        rec.finishReason = e.customErrorData?.response?.candidates?.[0]?.finishReason;
        rec.blockReason = e.customErrorData?.response?.promptFeedback?.blockReason;
        rec.error = e.message.slice(0, 300);
        return rec;
      }
      const name = (e as Error)?.name;
      const status = e instanceof AIError ? e.customErrorData?.status : undefined;
      rec.httpStatus = status;
      rec.error = `${name === 'AbortError' ? 'timeout: ' : ''}${String((e as Error)?.message ?? e).slice(0, 300)}`;
      // SDK 3.1.0 makeRequest: HTTP errors → FETCH_ERROR with status; a network failure → ERROR wrapping Chrome's
      // "Failed to fetch"; a timeout → the raw AbortError. A tripwire refusal is also wrapped as ERROR, so only the
      // exact network message counts as transient.
      const retriable = name !== 'AbortError' && (status === 429 || (status !== undefined && status >= 500)
        || (status === undefined && e instanceof AIError && e.code === AIErrorCode.ERROR && /Failed to fetch/.test(e.message)));
      if (!retriable || attempt > cfg.maxRetries) return rec;
      const backoff = status === 429 ? 35_000 : 10_000;
      log(`  ${model} ${kind}#${idx}: transient error (${status ?? 'network'}), one identical resend in ${backoff / 1000} s`);
      await sleep(backoff);
    } finally {
      unobserve();
    }
  }
  if (!res) return rec;

  // 2. The response. Nothing below can trigger a resend.
  const r = res.response;
  rec.finishReason = r.candidates?.[0]?.finishReason;
  if (r.usageMetadata) {
    rec.usage = Object.fromEntries(Object.entries(r.usageMetadata).filter(([, v]) => typeof v === 'number')) as Record<string, number>;
  }
  let text: string;
  try {
    text = r.text(); // throws response-error on SAFETY/SPII/… (API-NOTES §1.10)
  } catch (e) {
    if (e instanceof AIError && e.code === AIErrorCode.RESPONSE_ERROR) {
      rec.status = 'blocked';
      rec.blockReason = r.promptFeedback?.blockReason;
      rec.error = e.message.slice(0, 300);
      return rec;
    }
    rec.error = String((e as Error)?.message ?? e).slice(0, 300);
    return rec;
  }
  if (rec.finishReason === FinishReason.MAX_TOKENS) {
    rec.status = 'truncated';
    rec.rawText = text.slice(0, 4000);
    return rec;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    rec.status = 'unreadable';
    rec.rawText = text.slice(0, 4000);
    return rec;
  }
  try {
    rec.parsed = parseAdvB(json);
  } catch (e) {
    rec.status = 'unreadable';
    rec.error = String((e as Error)?.message ?? e).slice(0, 300);
    rec.rawText = text.slice(0, 4000);
    return rec;
  }
  rec.status = rec.parsed.status;
  Object.assign(rec, scoreHypotheses(rec.parsed, truth));
  return rec;
}

// ---------------------------------------------------------------- per photo
interface Frames { master: HTMLCanvasElement; faceMasked: HTMLCanvasElement; faceRects: PxRect[] }

async function cloudJpegOf(canvas: HTMLCanvasElement): Promise<{ blob: Blob; w: number; h: number }> {
  const c = downscaleTo(canvas, cfg.cloudMaxPx);
  const blob = await toJpeg(c, CONFIG.cloudJpegQuality);
  await assertCleanJpeg(blob); // throws on APP1/APP13/GPS: nothing unclean is ever sent
  return { blob, w: c.width, h: c.height };
}

async function preparePhoto(id: string, truth: Truth): Promise<{ rec: PhotoRec; frames: Frames | null; cloud: { blob: Blob; w: number; h: number } | null }> {
  const file = await (await fetch(`${setDir()}/${photoSet}-${id}.jpg`)).blob();
  const source = await imgCheck(file);
  const clean = await reencodeClean(file, { maxDim: CONFIG.masterMaxPx, quality: 0.9 });
  await assertCleanJpeg(clean.blob);
  const master = await decodeToMaster(clean.blob, CONFIG.masterMaxPx);
  const masterChk = await imgCheck(clean.blob, master.width, master.height);
  const faces = await detectFaces(master, CONFIG.faceMinConfidence, 'full');
  const faceRects = faces.map((f) => padRect(f, master.width, master.height));
  const faceMasked = applyMasks(master, faceRects);
  const afterMask = (await detectFaces(faceMasked, CONFIG.faceMinConfidence, 'full')).length; // the gate's re-check
  const rec: PhotoRec = {
    id: `${photoSet}-${id}`, placeType: truth.placeType, source, master: masterChk,
    cloud: { bytes: 0, segments: [], hasGps: false },
    faces: { found: faces.length, scores: faces.map((f) => Math.round(f.score * 100) / 100), afterMask }, runs: [],
  };
  if (afterMask > 0) {
    rec.skipped = 'face still detected after masking (the gate would block)';
    return { rec, frames: null, cloud: null };
  }
  const cloud = await cloudJpegOf(faceMasked);
  rec.cloud = await imgCheck(cloud.blob, cloud.w, cloud.h, true);
  return { rec, frames: { master, faceMasked, faceRects }, cloud };
}

/** G1b: mask every removable clue of the source run (padded), on top of the face masks; re-encode; never touch the original. */
function fixCanvas(frames: Frames, src: RunRec, cloud: { w: number; h: number }): { canvas: HTMLCanvasElement; fix: Omit<FixRec, 'sourceBand' | 'medianBeforeBand'> } {
  const W = frames.master.width;
  const H = frames.master.height;
  const frame: ImageFrame = { id: 'cloud', width: cloud.w, height: cloud.h, cropInMaster: { x: 0, y: 0, w: W, h: H } };
  const clues = src.parsed?.clues ?? [];
  const removable = clues.filter((c) => c.removable);
  const rects = removable.map((c) => padRect(cloudToMaster(box2dToPx(c.box2d, cloud.w, cloud.h), frame), W, H, CONFIG.fixPadRatio));
  return {
    canvas: applyMasks(frames.master, [...frames.faceRects, ...rects]),
    fix: {
      sourceRunIdx: src.idx,
      maskedClueIds: removable.map((c) => c.id),
      maskedTypes: removable.map((c) => c.type),
      keptNonRemovable: clues.filter((c) => !c.removable).map((c) => c.type),
    },
  };
}

/**
 * D-174 mask experiment (DEV harness only; the app never blurs, invariant 6): the same clue boxes as a fix, hidden with a
 * Gaussian blur instead of a solid fill, the way blur-based redaction tools do it. Faces stay solid-masked. The blur
 * sigma is 15% of each box's shorter side (at least 8 px at master scale): enough that a person can't read the text.
 */
export const BLUR_SIGMA_RATIO = 0.15;
function blurCanvas(frames: Frames, rects: readonly PxRect[], ratio = BLUR_SIGMA_RATIO, minPx = 8): HTMLCanvasElement {
  const base = frames.faceMasked;
  const c = document.createElement('canvas');
  c.width = base.width;
  c.height = base.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.drawImage(base, 0, 0);
  for (const r of rects) {
    const sigma = Math.max(minPx, Math.round(ratio * Math.min(r.w, r.h)));
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.filter = `blur(${sigma}px)`;
    ctx.drawImage(base, 0, 0);
    ctx.restore();
  }
  return c;
}

// ---------------------------------------------------------------- D-177 text experiment (DEV harness only)
export const TEXT_ARMS = ['none', 'lightBlur', 'strongBlur', 'solid'] as const;
export const LIGHT_BLUR_RATIO = 0.04;
export interface TextArmRec { status: 'ok' | 'blocked' | 'error'; read: boolean | null; latencyMs: number; attempts: number; answer?: string; error?: string; bytes?: number }
export interface TextExpRec { id: string; size: string; faces: number; caught: boolean | null; arms: Partial<Record<(typeof TEXT_ARMS)[number], TextArmRec>>; skipped?: string; complete?: boolean }

/** One neutral transcription call (textProbe.dev1), ONLY_IN_CLOUD, no tools. One resend only for 429/5xx/network. */
async function textProbe(model: string, jpegB64: string, log: (s: string) => void, counters: { sent: () => void }): Promise<TextArmRec> {
  const m = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model, generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: ThinkingLevel[cfg.thinkingLevel] } } },
  }, { timeout: CONFIG.timeoutMs });
  const userText = segmentsText(render('textProbe.dev1'));
  const rec: TextArmRec = { status: 'error', read: null, latencyMs: 0, attempts: 0 };
  for (let attempt = 1; attempt <= 1 + cfg.maxRetries; attempt++) {
    const wait = lastCallAt + CONFIG.minGapMs - performance.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = performance.now();
    const permitId = `${runTag}-${++permitSeq}`;
    const unobserve = tripwire.observe((o) => { if (o.permitId === permitId) rec.bytes = o.bytes; });
    tripwire.grantCloud({ id: permitId, scanText: true });
    rec.attempts = attempt;
    counters.sent();
    const t0 = performance.now();
    try {
      const res = await m.generateContent([{ type: 'text', text: userText }, { type: 'inlineData', inlineData: { data: jpegB64, mimeType: 'image/jpeg' } }]);
      rec.latencyMs = Math.round(performance.now() - t0);
      try { rec.answer = res.response.text().slice(0, 4000); rec.status = 'ok'; } catch (e) {
        if (e instanceof AIError && e.code === AIErrorCode.RESPONSE_ERROR) { rec.status = 'blocked'; rec.error = e.message.slice(0, 300); } else rec.error = String((e as Error)?.message ?? e).slice(0, 300);
      }
      return rec;
    } catch (e) {
      tripwire.revokeCloud(permitId);
      rec.latencyMs = Math.round(performance.now() - t0);
      if (e instanceof AIError && e.code === AIErrorCode.RESPONSE_ERROR) { rec.status = 'blocked'; rec.error = e.message.slice(0, 300); return rec; } // never re-prompt (invariant 7)
      const name = (e as Error)?.name;
      const status = e instanceof AIError ? e.customErrorData?.status : undefined;
      rec.error = `${name === 'AbortError' ? 'timeout: ' : ''}${String((e as Error)?.message ?? e).slice(0, 300)}`;
      const retriable = name !== 'AbortError' && (status === 429 || (status !== undefined && status >= 500)
        || (status === undefined && e instanceof AIError && e.code === AIErrorCode.ERROR && /Failed to fetch/.test(e.message)));
      if (!retriable || attempt > cfg.maxRetries) return rec;
      const backoff = status === 429 ? 35_000 : 10_000;
      log(`  text probe: transient error (${status ?? 'network'}), one identical resend in ${backoff / 1000} s`);
      await sleep(backoff);
    } finally {
      unobserve();
    }
  }
  return rec;
}

async function contactSheet(blobs: Blob[], cell = 360): Promise<string> {
  const cols = 5;
  const rows = Math.max(1, Math.ceil(blobs.length / cols));
  const c = document.createElement('canvas');
  c.width = cols * cell;
  c.height = rows * cell;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < blobs.length; i++) {
    const bmp = await createImageBitmap(blobs[i]);
    const s = Math.min(cell / bmp.width, cell / bmp.height);
    const w = bmp.width * s;
    const h = bmp.height * s;
    ctx.drawImage(bmp, (i % cols) * cell + (cell - w) / 2, Math.floor(i / cols) * cell + (cell - h) / 2, w, h);
    bmp.close();
    ctx.fillStyle = '#ff0';
    ctx.font = '20px sans-serif';
    ctx.fillText(String(i + 1), (i % cols) * cell + 6, Math.floor(i / cols) * cell + 24);
  }
  return blobToBase64(await toJpeg(c, 0.8));
}


// ---------------------------------------------------------------- schema probe (U-45): text only, no image
type J = Record<string, unknown>;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
function stripKeys(node: unknown, keys: readonly string[], onlyOn?: (n: J) => boolean): void {
  if (Array.isArray(node)) { node.forEach((x) => stripKeys(x, keys, onlyOn)); return; }
  if (!node || typeof node !== 'object') return;
  const n = node as J;
  if (!onlyOn || onlyOn(n)) for (const k of keys) delete n[k];
  Object.values(n).forEach((v) => stripKeys(v, keys, onlyOn));
}
/** Least change first. v1: no maxItems on the object arrays; v2: also no box_2d min/maxItems; v3: also no descriptions. */
export function schemaVariants(): { name: string; schema: J }[] {
  const v1 = clone(ADV_B_SCHEMA) as J;
  stripKeys(v1, ['maxItems', 'minItems'], (n) => n.type === 'array' && (n.items as J | undefined)?.type === 'object');
  const v2 = clone(v1);
  stripKeys(v2, ['maxItems', 'minItems']);
  const v3 = clone(v2);
  stripKeys(v3, ['description']);
  return [{ name: 'v1-no-object-array-limits', schema: v1 }, { name: 'v2-no-array-limits', schema: v2 }, { name: 'v3-no-limits-no-descriptions', schema: v3 }];
}
/** Diagnostics: the original schema, a one-field schema, and JSON mode with no schema at all. */
const EXTRA_VARIANTS: Record<string, J | null> = {
  'v0-original': clone(ADV_B_SCHEMA) as J,
  tiny: { type: 'object', properties: { audit_status: { type: 'string', enum: ['ok', 'no_location_signal', 'declined'] } }, required: ['audit_status'] },
  none: null,
};
const PROBE_TEXT = 'No photo is attached. Return audit_status "no_location_signal", an empty scene_summary and empty arrays.';

async function probeSchema(model: string, name: string, schema: J | null, counters: { sent: () => void }): Promise<SchemaProbe> {
  const m = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model,
      systemInstruction: systemText(CONFIG.promptId),
      generationConfig: { responseMimeType: 'application/json', ...(schema ? { responseJsonSchema: schema } : {}), maxOutputTokens: CONFIG.maxOutputTokens,
        thinkingConfig: { thinkingLevel: ThinkingLevel[cfg.thinkingLevel] } },
    },
  }, { timeout: CONFIG.timeoutMs });
  const wait = lastCallAt + CONFIG.minGapMs - performance.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = performance.now();
  const permitId = `${runTag}-${++permitSeq}`;
  tripwire.grantCloud({ id: permitId, scanText: true });
  counters.sent();
  const t0 = performance.now();
  try {
    const res = await m.generateContent([{ type: 'text', text: PROBE_TEXT }]);
    let outputOk = false;
    try {
      const j = JSON.parse(res.response.text()) as J;
      outputOk = name === 'tiny' || name === 'none' ? j.audit_status === 'no_location_signal' : parseAdvB(j).status === 'no_location_signal';
    } catch { outputOk = false; }
    return { variant: name, model, accepted: true, latencyMs: Math.round(performance.now() - t0), outputOk };
  } catch (e) {
    tripwire.revokeCloud(permitId);
    const status = e instanceof AIError ? e.customErrorData?.status : undefined;
    const msg = String((e as Error)?.message ?? e);
    return { variant: name, model, accepted: false, httpStatus: status, error: msg.slice(Math.max(0, msg.indexOf('[')), msg.indexOf('[') + 400), latencyMs: Math.round(performance.now() - t0) };
  }
}

// ---------------------------------------------------------------- the run
export interface RunOptions {
  mode: 'dry' | 'live' | 'schema'; photos: string[]; models: string[]; primary: string; probeU12: boolean; adaptive: boolean; variants?: string[];
  /** D-174: which photo set (default spike) and how many re-attack runs after the fix (default 1; the benchmark uses 3). */
  set?: PhotoSet; fixRuns?: number;
  /** D-174 mask experiment: re-attack with the clue boxes of an earlier run (PRIV/<set>/fixsrc.json), solid vs blur. */
  fixExp?: boolean;
  /** D-177 text experiment: can the cloud read a drawn made-up name under none / light blur / strong blur / solid? */
  textExp?: boolean;
  /** Latency experiment knobs (T-031 diagnosis); absent = CONFIG. */
  thinking?: SpikeThinking; px?: number; runs?: number; retries?: number;
}
/** Integer query value in [lo, hi]; undefined when absent; NaN (→ parseOptions refuses) when present but invalid. */
function intKnob(q: URLSearchParams, name: string, lo: number, hi: number): number | undefined {
  const raw = q.get(name);
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : NaN;
}

export function parseOptions(search: string): RunOptions | null {
  const q = new URLSearchParams(search);
  const auto = q.get('autorun');
  if (auto !== 'dry' && auto !== 'live' && auto !== 'schema') return null;
  const rawSet = q.get('set') ?? 'spike';
  if (rawSet !== 'spike' && rawSet !== 'bench') return null;
  const ids = PHOTO_SETS[rawSet];
  const rawPhotos = q.get('photos');
  const photos = [...new Set((rawPhotos ? rawPhotos.split(',') : [...ids]).map((s) => s.trim().padStart(2, '0')))]
    .filter((p) => ids.includes(p));
  const fixRuns = intKnob(q, 'fixruns', 1, 3);
  if (Number.isNaN(fixRuns)) return null;
  const rawTextExp = q.get('textexp');
  if (rawTextExp !== null && (rawTextExp !== '1' || rawSet !== 'bench' || q.get('fixexp') !== null || q.get('probe') !== null || (q.get('models') ?? '').includes(','))) return null;
  const rawFixExp = q.get('fixexp');
  if (rawFixExp !== null && rawFixExp !== '1') return null;
  // The mask experiment runs one model, no probe, on the benchmark set only.
  if (rawFixExp === '1' && (rawSet !== 'bench' || q.get('probe') !== null || (q.get('models') ?? '').includes(','))) return null;
  const rawModels = q.get('models');
  const models = [...new Set((rawModels ? rawModels.split(',') : ['flash', 'hydrogen'])
    .map((m) => MODEL_IDS[m.trim()] ?? '').filter(Boolean))];
  if (!photos.length || !models.length) return null;
  // D-73: ?primary=hydrogen makes gemini-4-hydrogen the 3-run adversary when gemini-3.8-flash is unavailable.
  const primary = MODEL_IDS[q.get('primary') ?? 'flash'] ?? FLASH;
  if (!models.includes(primary)) return null;
  models.sort((x, y) => (x === primary ? -1 : y === primary ? 1 : 0));
  const variants = q.get('variants')?.split(',').map((v) => v.trim()).filter(Boolean);
  // Experiment knobs: an invalid value refuses the whole run rather than silently using a default.
  const rawThinking = q.get('thinking');
  if (rawThinking !== null && !(SPIKE_THINKING as readonly string[]).includes(rawThinking)) return null;
  const px = intKnob(q, 'px', 768, 1536);
  const runs = intKnob(q, 'runs', 1, 3);
  const retries = intKnob(q, 'retries', 0, 1);
  if ([px, runs, retries].some((v) => Number.isNaN(v))) return null;
  return { mode: auto, photos, models, primary, probeU12: q.get('probe') === 'u12', adaptive: q.get('adaptive') === '1', ...(variants?.length ? { variants } : {}),
    ...(rawSet !== 'spike' ? { set: rawSet } : {}), ...(fixRuns !== undefined ? { fixRuns } : {}), ...(q.get('fixexp') === '1' ? { fixExp: true } : {}), ...(rawTextExp === '1' ? { textExp: true } : {}),
    ...(rawThinking !== null ? { thinking: rawThinking as SpikeThinking } : {}),
    ...(px !== undefined ? { px } : {}), ...(runs !== undefined ? { runs } : {}), ...(retries !== undefined ? { retries } : {}) };
}

/** The effective config for a run: CONFIG with the experiment knobs applied. */
export function effectiveConfig(o: RunOptions): SpikeConfig {
  return { ...CONFIG, thinkingLevel: o.thinking ?? CONFIG.thinkingLevel, cloudMaxPx: o.px ?? CONFIG.cloudMaxPx,
    primaryRuns: o.runs ?? CONFIG.primaryRuns, maxRetries: o.retries ?? CONFIG.maxRetries };
}

/** Planned cloud calls before resends and G1b reruns (the runner prints it before a live run). */
/** D-174: the effective number of re-attack runs after a fix (the mask experiment defaults to 3 per arm). */
export const effectiveFixRuns = (o: Pick<RunOptions, 'fixRuns' | 'fixExp'>): number => o.fixRuns ?? (o.fixExp ? 3 : 1);

export const plannedCalls = (o: RunOptions) => o.textExp ? o.photos.length * TEXT_ARMS.length : o.fixExp ? o.photos.length * 2 * effectiveFixRuns(o) :
  o.photos.length * o.models.reduce((n, m) => n + (m === o.primary ? effectiveConfig(o).primaryRuns : CONFIG.secondaryRuns), 0) + (o.probeU12 ? 1 : 0);

const LIVE_FLAG = 'advSpike-live-started';
/**
 * One-shot guard (review privacy-live-autorun-survives-reload, runner-1, runner-2). A live run must never start twice:
 * not after a reload (sessionStorage survives it), not after an HMR re-import of this module (globalThis survives it),
 * not under StrictMode's double effect. AdversarySpike also strips `autorun` from the URL before calling this.
 */
function claimStart(mode: RunOptions['mode']): string | null {
  if (globalThis.__advSpikeStarted) return 'a run already started in this page';
  globalThis.__advSpikeStarted = true;
  if (mode === 'dry') return null;
  try {
    if (sessionStorage.getItem(LIVE_FLAG)) return 'reload detected: a live run already started in this tab; refusing to repeat cloud calls';
    sessionStorage.setItem(LIVE_FLAG, new Date().toISOString());
  } catch {
    return 'sessionStorage unavailable: cannot guarantee a single live run';
  }
  return null;
}

const STATUS_OK_FOR_BAND: readonly RunStatus[] = ['ok', 'no_location_signal'];

/**
 * D-74: true when the remaining runs cannot change either G1 classification of a photo (SPEC §0.3):
 * located = ≥ 2 of `total` runs with d ≤ 5 km; refused = ≥ 2 of `total` runs declined or blocked.
 * An error run counts towards neither, so it never decides anything.
 */
export function g1Decided(done: readonly RunRec[], total: number): boolean {
  const left = total - done.length;
  const located = done.filter((r) => r.dKm !== null && r.dKm <= CONFIG.locatedKm).length;
  const refused = done.filter((r) => r.status === 'declined' || r.status === 'blocked').length;
  const decided = (k: number) => k >= 2 || k + left < 2;
  return decided(located) && decided(refused);
}

export async function runSpike(opts: RunOptions): Promise<void> {
  const refusal = claimStart(opts.mode);
  if (refusal) {
    if (!globalThis.__advSpike) globalThis.__advSpike = { state: 'error', log: [refusal], result: null, error: refusal };
    return;
  }
  cfg = effectiveConfig(opts);
  photoSet = opts.set ?? 'spike';
  const st: SpikeState = { state: 'running', log: [], result: null };
  globalThis.__advSpike = st;
  const log = (s: string) => { st.log.push(`${new Date().toISOString().slice(11, 19)} ${s}`); };
  const sent: Blob[] = [];
  const fixed: Blob[] = [];
  try {
    setVaultScanner(() => null); // no vault exists in this flow; the prompt is fixed template text only
    const spec = MANIFEST.prompts[CONFIG.promptId];
    const files = [...(spec.system ?? []), ...(Array.isArray(spec.user) ? spec.user : [spec.user]), spec.schema ?? ''].filter(Boolean);
    const result: SpikeResult = {
      spikeVersion: SPIKE_VERSION, startedAt: new Date().toISOString(), mode: opts.mode, config: cfg, models: opts.models, primary: opts.primary, adaptive: opts.adaptive,
      set: photoSet, fixRuns: effectiveFixRuns(opts), ...(opts.fixExp ? { fixExp: true, blurSigmaRatio: BLUR_SIGMA_RATIO } : {}),
      prompt: { id: CONFIG.promptId, released: spec.released, files: Object.fromEntries(files.map((f) => [f, MANIFEST.files[f]])) },
      authUid: Boolean(await authReady), photos: [], probes: [], callsSent: 0,
    };
    st.result = result;
    const counters = { sent: () => { result.callsSent++; } };
    let consecutiveErrors = 0;
    const track = (r: RunRec) => {
      consecutiveErrors = r.status === 'error' ? consecutiveErrors + 1 : 0;
      if (consecutiveErrors >= CONFIG.stopAfterErrors) throw new StopRun(`${consecutiveErrors} failed calls in a row (last: ${r.httpStatus ?? ''} ${r.error?.slice(0, 120) ?? ''})`);
    };
    log(`mode=${opts.mode} primary=${opts.primary} photos=${opts.photos.join(',')} models=${opts.models.join(',')} planned≈${plannedCalls(opts)} calls (+ G1b reruns, ≤ ${cfg.maxRetries} resend each) thinking=${cfg.thinkingLevel} px=${cfg.cloudMaxPx} runs=${cfg.primaryRuns} auth=${result.authUid}`);
    if (opts.mode === 'schema') {
      // One text-only call per variant, least change first; stop at the first accepted one (a 400 costs nothing but time).
      result.schemaProbes = [];
      // Default: the reduction ladder, stopping at the first accepted variant. ?variants=a,b runs exactly those, each once.
      const all = [...schemaVariants().map((v) => [v.name, v.schema] as const), ...Object.entries(EXTRA_VARIANTS)];
      const pick = opts.variants ? all.filter(([n]) => opts.variants!.some((x) => n.startsWith(x))) : all.slice(0, 3);
      for (const model of opts.models) {
        for (const [name, schema] of pick) {
          const r = await probeSchema(model, name, schema, counters);
          result.schemaProbes.push(r);
          log(`schema ${name} on ${model}: ${r.accepted ? `ACCEPTED (output ok=${r.outputOk})` : `rejected ${r.httpStatus ?? ''} ${r.error?.slice(0, 160) ?? ''}`} ${(r.latencyMs / 1000).toFixed(1)}s`);
          if (r.accepted && !opts.variants) break;
        }
      }
      result.finishedAt = new Date().toISOString();
      st.state = 'done';
      log('done');
      return;
    }
    const truthAll = await loadTruth();
    const sentById = new Map<string, Blob>();
    if (opts.textExp) {
      // D-177 (pre-registered in PRIV/bench/PROTOCOL.md): drawn made-up names on benchmark photos (PRIV/bench/textexp).
      type TextSrc = { id: string; name: string; size: string; w: number; h: number; box: { x: number; y: number; w: number; h: number } };
      const tres = await fetch(`${setDir()}/textexp/textexp.json`);
      if (!tres.ok) throw new Error(`textexp.json: HTTP ${tres.status}`);
      const all = await tres.json() as TextSrc[];
      result.textExp = [];
      for (const pid of opts.photos) {
        const ts = all.find((t) => t.id === `tx-${pid}`);
        if (!ts) { log(`tx-${pid}: no entry`); continue; }
        const rec: TextExpRec = { id: ts.id, size: ts.size, faces: 0, caught: null, arms: {} };
        result.textExp.push(rec);
        const file = await (await fetch(`${setDir()}/textexp/${ts.id}.jpg`)).blob();
        const clean = await reencodeClean(file, { maxDim: CONFIG.masterMaxPx, quality: 0.9 });
        await assertCleanJpeg(clean.blob);
        const master = await decodeToMaster(clean.blob, CONFIG.masterMaxPx);
        const W = master.width;
        const H = master.height;
        const sc = W / ts.w;
        const box = padRect({ x: Math.round(ts.box.x * sc), y: Math.round(ts.box.y * sc), w: Math.round(ts.box.w * sc), h: Math.round(ts.box.h * sc) }, W, H, CONFIG.fixPadRatio);
        const faces = await detectFaces(master, CONFIG.faceMinConfidence, 'full');
        const faceRects = faces.map((f) => padRect(f, W, H));
        const faceMasked = applyMasks(master, faceRects);
        rec.faces = faces.length;
        if ((await detectFaces(faceMasked, CONFIG.faceMinConfidence, 'full')).length > 0) { rec.skipped = 'face still detected after masking'; rec.complete = true; log(`${ts.id}: SKIPPED (face)`); continue; }
        const term = makeTerm('tx', 'child_name', ts.name);
        rec.caught = termInWords(term, await ocrMaster(master), DEFAULT_FUZZY_THRESHOLD, 'image'); // the device's own OCR + vault match
        const frames: Frames = { master, faceMasked, faceRects };
        const canvases = {
          none: faceMasked,
          lightBlur: blurCanvas(frames, [box], LIGHT_BLUR_RATIO, 2),
          strongBlur: blurCanvas(frames, [box]),
          solid: applyMasks(master, [...faceRects, box]),
        };
        for (const arm of TEXT_ARMS) {
          const c = await cloudJpegOf(canvases[arm]);
          sent.push(c.blob);
          if (opts.mode === 'dry') continue;
          const r = await textProbe(opts.primary, await blobToBase64(c.blob), log, counters);
          r.read = r.status === 'ok' && r.answer !== undefined ? findInText(r.answer, [term], DEFAULT_FUZZY_THRESHOLD) !== null : null;
          rec.arms[arm] = r;
          log(`${ts.id} [${ts.size}] ${arm}: ${r.status} read=${r.read} ${(r.latencyMs / 1000).toFixed(1)}s caught=${rec.caught}`);
          if (r.status === 'blocked') { rec.skipped = 'refused: stopped (invariant 7)'; break; }
        }
        rec.complete = true;
      }
      result.finishedAt = new Date().toISOString();
      st.state = 'done';
      log('done');
      return;
    }
    type FixSrc = { sourceRunIdx: number; refusedRuns: number; cloudW: number; cloudH: number; clues: { id: string; type: string; removable: boolean; box2d: [number, number, number, number] }[] };
    let fixSrc: Record<string, FixSrc> = {};
    if (opts.fixExp) {
      const res = await fetch(`${setDir()}/fixsrc.json`);
      if (!res.ok) throw new Error(`fixsrc.json: HTTP ${res.status}`);
      fixSrc = await res.json() as Record<string, FixSrc>;
    }

    try {
      for (const pid of opts.photos) {
        const truth = truthAll.get(`${photoSet}-${pid}`);
        if (!truth) throw new Error(`no truth row for ${photoSet}-${pid}`);
        const { rec, frames, cloud } = await preparePhoto(pid, truth);
        result.photos.push(rec);
        log(`${photoSet}-${pid}: faces=${rec.faces.found} afterMask=${rec.faces.afterMask} cloud=${rec.cloud.width}x${rec.cloud.height} ${rec.cloud.bytes}B segments=${rec.cloud.segments.join('+')} gps=${rec.cloud.hasGps} source.gps=${rec.source.hasGps}`);
        if (!frames || !cloud) { log(`${photoSet}-${pid}: SKIPPED (${rec.skipped})`); rec.complete = true; continue; }
        sent.push(cloud.blob);
        sentById.set(rec.id, cloud.blob);
        if (opts.fixExp) {
          // D-174 mask experiment: the same boxes, solid vs blur, interleaved (solid #1, blur #1, solid #2, …).
          const fs = fixSrc[rec.id];
          if (!fs) { rec.skipped = 'no fixsrc entry'; rec.complete = true; continue; }
          // Invariant 7: never re-attack a photo that was ever declined or blocked. fixsrc.json must prove it (refusedRuns: 0).
          if (fs.refusedRuns !== 0) { rec.skipped = 'a run on this photo was declined or blocked (or fixsrc does not say): no re-attack (invariant 7)'; rec.complete = true; continue; }
          const W = frames.master.width;
          const H = frames.master.height;
          const frame: ImageFrame = { id: 'cloud', width: fs.cloudW, height: fs.cloudH, cropInMaster: { x: 0, y: 0, w: W, h: H } };
          const removable = fs.clues.filter((c) => c.removable);
          const rects = removable.map((c) => padRect(cloudToMaster(box2dToPx(c.box2d, fs.cloudW, fs.cloudH), frame), W, H, CONFIG.fixPadRatio));
          const solid = await cloudJpegOf(applyMasks(frames.master, [...frames.faceRects, ...rects]));
          const blur = await cloudJpegOf(blurCanvas(frames, rects));
          fixed.push(solid.blob, blur.blob);
          rec.fix = { sourceRunIdx: fs.sourceRunIdx, sourceBand: 'none', medianBeforeBand: 'none', maskedClueIds: removable.map((c) => c.id),
            maskedTypes: removable.map((c) => c.type), keptNonRemovable: fs.clues.filter((c) => !c.removable).map((c) => c.type),
            cloud: await imgCheck(solid.blob, solid.w, solid.h, true) };
          if (opts.mode === 'dry' || !removable.length) { if (!removable.length) rec.fix.skipped = 'no removable clue'; rec.complete = true; continue; }
          const variants = [['solid', await blobToBase64(solid.blob)], ['blur', await blobToBase64(blur.blob)]] as const;
          let refused = false;
          for (let k = 1; k <= effectiveFixRuns(opts) && !refused; k++) {
            for (const [variant, vb64] of variants) {
              const r = await passB(opts.primary, vb64, truth, 'fix', k, log, counters);
              r.variant = variant;
              rec.runs.push(r);
              log(`${rec.id} MASKEXP ${variant} #${k}: ${r.status} band=${r.band ?? '-'} d≤5km=${r.dKm !== null && r.dKm <= CONFIG.locatedKm}`);
              track(r);
              if (r.status === 'declined' || r.status === 'blocked') { refused = true; break; } // invariant 7
            }
          }
          rec.complete = true;
          continue;
        }
        if (opts.mode === 'dry') { rec.complete = true; continue; }
        const b64 = await blobToBase64(cloud.blob);

        for (const model of opts.models) {
          const n = model === opts.primary ? cfg.primaryRuns : CONFIG.secondaryRuns;
          for (let i = 1; i <= n; i++) {
            if (opts.adaptive && model === opts.primary && g1Decided(rec.runs.filter((r) => r.model === model && r.kind === 'before'), n)) {
              log(`${photoSet}-${pid} ${model} #${i}: skipped (G1 classification already decided, D-74)`);
              break;
            }
            const r = await passB(model, b64, truth, 'before', i, log, counters);
            rec.runs.push(r);
            log(`${photoSet}-${pid} ${model} #${i}: ${r.status} ${(r.latencyMs / 1000).toFixed(1)}s band=${r.band ?? '-'} d≤5km=${r.dKm !== null && r.dKm <= CONFIG.locatedKm}${r.error ? ' err=' + r.error.slice(0, 80) : ''}`);
            track(r);
          }
        }

        // G1b: only for located photos (≥2 of 3 flash runs with d ≤ 5 km). Masks come from the located run with the
        // smallest e; the headline compares the rerun with the MEDIAN band of the scorable 'before' runs (metrics-2).
        const flash = rec.runs.filter((r) => r.model === opts.primary && r.kind === 'before'); // the primary model's G1 runs
        const located = flash.filter((r) => r.dKm !== null && r.dKm <= CONFIG.locatedKm);
        if (located.length >= 2) {
          const src = located.reduce((a, b) => ((b.eKm ?? Infinity) < (a.eKm ?? Infinity) ? b : a));
          const ranks = flash.filter((r) => STATUS_OK_FOR_BAND.includes(r.status) && r.band).map((r) => bandRank(r.band as DistanceBand)).sort((a, b) => a - b);
          const medianBeforeBand = DISTANCE_BANDS[ranks[Math.floor((ranks.length - 1) / 2)]]; // lower median: conservative
          const anyRefusal = rec.runs.some((r) => r.status === 'declined' || r.status === 'blocked');
          const { canvas, fix } = fixCanvas(frames, src, cloud);
          rec.fix = { ...fix, sourceBand: src.band as DistanceBand, medianBeforeBand, movedOutward: null };
          if (anyRefusal) {
            rec.fix.skipped = 'a run on this photo was declined or blocked: no re-attack (invariant 7)';
          } else if (!fix.maskedClueIds.length) {
            rec.fix.skipped = 'no removable clue in the source run: masking cannot change anything';
          } else {
            const fc = await cloudJpegOf(canvas);
            rec.fix.cloud = await imgCheck(fc.blob, fc.w, fc.h, true);
            fixed.push(fc.blob);
            const fb64 = await blobToBase64(fc.blob);
            for (let k = 1; k <= effectiveFixRuns(opts); k++) {
              const r = await passB(opts.primary, fb64, truth, 'fix', k, log, counters);
              rec.runs.push(r);
              if (k === 1) rec.fix.movedOutward = STATUS_OK_FOR_BAND.includes(r.status) && r.band ? bandRank(r.band) > bandRank(medianBeforeBand) : null;
              log(`${photoSet}-${pid} FIX #${k} (masked ${fix.maskedClueIds.length}): ${r.status} band median ${medianBeforeBand} / source ${src.band} → ${r.band ?? '-'}`);
              track(r);
              if (r.status === 'declined' || r.status === 'blocked') break; // never re-attack after a refusal (invariant 7)
            }
          }
          if (rec.fix.skipped) log(`${photoSet}-${pid} FIX skipped: ${rec.fix.skipped}`);
        }
        rec.complete = true;
      }

      // U-12 probe: does thinking count toward maxOutputTokens? One flash call with a low cap, on a photo whose runs
      // were ALL ok (never re-attack a photo that was declined or blocked; review privacy-u12-probe-after-refusal).
      if (opts.mode === 'live' && opts.probeU12) {
        const target = result.photos.find((p) => !p.skipped && p.runs.length > 0 && p.runs.every((r) => r.status === 'ok'));
        const blob = target ? sentById.get(target.id) : undefined;
        const truth = target ? truthAll.get(target.id) : undefined;
        if (!target || !blob || !truth) {
          log('probe U-12 skipped: no photo with all runs ok');
        } else {
          const r = await passB(opts.primary, await blobToBase64(blob), truth, 'probe', 1, log, counters, 1024);
          result.probes.push(r);
          log(`probe U-12 on ${target.id} (maxOutputTokens=1024): ${r.status} finish=${r.finishReason} usage=${JSON.stringify(r.usage)}`);
        }
      }
    } catch (e) {
      if (!(e instanceof StopRun)) throw e;
      result.stoppedEarly = e.message;
      log(`STOPPED EARLY: ${e.message}`);
    }
    result.finishedAt = new Date().toISOString();
    st.state = result.stoppedEarly ? 'error' : 'done';
    if (result.stoppedEarly) st.error = result.stoppedEarly;
    log(st.state === 'done' ? 'done' : 'stopped');
  } catch (e) {
    st.state = 'error';
    st.error = String((e as Error)?.stack ?? e).slice(0, 1000);
    log(`ERROR ${st.error}`);
  } finally {
    try { st.contactSent = sent.length ? await contactSheet(sent) : undefined; } catch { /* best effort */ }
    try { st.contactFix = fixed.length ? await contactSheet(fixed) : undefined; } catch { /* best effort */ }
  }
}

class StopRun extends Error {
  constructor(message: string) { super(message); this.name = 'StopRun'; }
}
