// web/src/ai/parse.ts: hand-written validators for model output (ARCH AD-12, §10.6; API-NOTES §6.8). No zod.
// Structured output is VALID JSON, not necessarily CORRECT JSON (API-NOTES §1.7): every value is checked here.
// parseAdvB was written for the Day-1 spike (T-031) and is the validator T-071 builds on.
import { CLUE_TYPES, CONF, INFERENCE_KINDS, LEVELS } from '../core/types';
import type { AdversaryClue, AdversaryHypothesis, AuditStatus, Box2D, Inference, Reveals } from '../core/types';

export class ParseError extends Error {
  constructor(message: string) { super(message); this.name = 'ParseError'; }
}

export const ADV_B_LIMITS = { clues: 12, hypotheses: 3, inferences: 8 } as const;
export const MIN_RADIUS_KM = 0.1;
const AUDIT_STATUSES: readonly AuditStatus[] = ['ok', 'no_location_signal', 'declined'];
const REVEALS: readonly Reveals[] = [...LEVELS, 'venue_or_organisation'];

export interface ParsedAdvB {
  status: AuditStatus;
  declineReason?: string;
  sceneSummary: string;
  clues: AdversaryClue[];
  hypotheses: AdversaryHypothesis[];
  inferences: Inference[];
  /** What the parser removed or repaired, for logs and the spike record (never user-facing). */
  repairs: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(o: Obj, k: string, path: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new ParseError(`${path}.${k}: expected a string`);
  return v;
}
function num(o: Obj, k: string, path: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ParseError(`${path}.${k}: expected a finite number`);
  return v;
}
function bool(o: Obj, k: string, path: string): boolean {
  const v = o[k];
  if (typeof v !== 'boolean') throw new ParseError(`${path}.${k}: expected a boolean`);
  return v;
}
function oneOf<T extends string>(o: Obj, k: string, allowed: readonly T[], path: string): T {
  const v = str(o, k, path);
  if (!(allowed as readonly string[]).includes(v)) throw new ParseError(`${path}.${k}: "${v}" is not an allowed value`);
  return v as T;
}
function arr(o: Obj, k: string, path: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new ParseError(`${path}.${k}: expected an array`);
  return v;
}
function strArr(o: Obj, k: string, path: string): string[] {
  return arr(o, k, path).map((x, i) => {
    if (typeof x !== 'string') throw new ParseError(`${path}.${k}[${i}]: expected a string`);
    return x;
  });
}
function item(v: unknown, path: string): Obj {
  if (!isObj(v)) throw new ParseError(`${path}: expected an object`);
  return v;
}

/** Keep the first item for each id; later duplicates are dropped (deterministic, D-72). */
function dedupe<T extends { id: string }>(items: T[], what: string, repairs: string[]): T[] {
  const seen = new Set<string>();
  return items.filter((x) => {
    if (seen.has(x.id)) { repairs.push(`${what} ${x.id}: duplicate id dropped`); return false; }
    seen.add(x.id);
    return true;
  });
}

function cap<T>(items: T[], max: number, what: string, repairs: string[]): T[] {
  if (items.length <= max) return items;
  repairs.push(`${what}: ${items.length - max} beyond the limit of ${max} dropped`);
  return items.slice(0, max);
}

/**
 * Clamp every value to 0..1000 (rounded to an integer), swap reversed corners, and return null for a zero-area box.
 * box_2d is [ymin, xmin, ymax, xmax] (API-NOTES §6.1).
 */
export function normaliseBox2d(raw: unknown, path: string): Box2D | null {
  if (!Array.isArray(raw) || raw.length !== 4) throw new ParseError(`${path}: box_2d must have 4 numbers`);
  const v = raw.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new ParseError(`${path}[${i}]: expected a finite number`);
    return Math.round(Math.max(0, Math.min(1000, x)));
  });
  const [y0, x0, y1, x1] = v;
  const box: Box2D = [Math.min(y0, y1), Math.min(x0, x1), Math.max(y0, y1), Math.max(x0, x1)];
  return box[2] > box[0] && box[3] > box[1] ? box : null;
}

/**
 * Validate pass-B JSON (after JSON.parse). Throws ParseError when a required field or enum value is wrong (the
 * caller records the run as `unreadable`). Repairs instead of failing where ARCH §10.6 says so: duplicate ids,
 * dangling clue_ids, bad boxes, out-of-range lat/lng, radius below 0.1, and over-long arrays.
 * `MAX_TOKENS` is the caller's job (it never reaches here as a valid object).
 */
export function parseAdvB(raw: unknown): ParsedAdvB {
  const root = item(raw, '$');
  const repairs: string[] = [];
  const status = oneOf(root, 'audit_status', AUDIT_STATUSES, '$');
  const sceneSummary = str(root, 'scene_summary', '$');
  const declineReason = typeof root.decline_reason === 'string' ? root.decline_reason : undefined;

  const rawClues = arr(root, 'clues', '$');
  const rawHyps = arr(root, 'hypotheses', '$');
  const rawInfs = arr(root, 'inferences', '$');

  let clues: AdversaryClue[] = [];
  rawClues.forEach((v, i) => {
    const p = `$.clues[${i}]`;
    const o = item(v, p);
    const c = {
      id: str(o, 'id', p),
      type: oneOf(o, 'type', CLUE_TYPES, p),
      evidence: str(o, 'evidence', p),
      reveals: oneOf(o, 'reveals', REVEALS, p),
      severity: oneOf(o, 'severity', CONF, p),
      removable: bool(o, 'removable', p),
    };
    const box2d = normaliseBox2d(o.box_2d, `${p}.box_2d`);
    if (!box2d) { repairs.push(`clue ${c.id}: zero-area box dropped`); return; }
    clues.push({ ...c, box2d });
  });
  clues = cap(dedupe(clues, 'clue', repairs), ADV_B_LIMITS.clues, 'clues', repairs);
  const clueIds = new Set(clues.map((c) => c.id));
  const keepKnown = (ids: string[], owner: string): string[] => {
    const out = [...new Set(ids)].filter((id) => clueIds.has(id));
    const gone = ids.filter((id) => !clueIds.has(id));
    if (gone.length) repairs.push(`${owner}: dangling clue_ids ${[...new Set(gone)].join(',')} dropped`);
    return out;
  };

  let hypotheses: AdversaryHypothesis[] = [];
  rawHyps.forEach((v, i) => {
    const p = `$.hypotheses[${i}]`;
    const o = item(v, p);
    const id = str(o, 'id', p);
    const h = {
      id,
      label: str(o, 'label', p),
      level: oneOf(o, 'level', LEVELS, p),
      lat: num(o, 'lat', p),
      lng: num(o, 'lng', p),
      radiusKm: num(o, 'radius_km', p),
      confidence: oneOf(o, 'confidence', CONF, p),
      clueIds: strArr(o, 'clue_ids', p),
    };
    if (Math.abs(h.lat) > 90 || Math.abs(h.lng) > 180) { repairs.push(`hypothesis ${id}: lat/lng out of range, dropped`); return; }
    if (h.radiusKm < MIN_RADIUS_KM) { repairs.push(`hypothesis ${id}: radius_km floored to ${MIN_RADIUS_KM}`); h.radiusKm = MIN_RADIUS_KM; }
    hypotheses.push(h);
  });
  hypotheses = cap(dedupe(hypotheses, 'hypothesis', repairs), ADV_B_LIMITS.hypotheses, 'hypotheses', repairs)
    .map((h) => ({ ...h, clueIds: keepKnown(h.clueIds, `hypothesis ${h.id}`) }));

  let inferences: Inference[] = [];
  rawInfs.forEach((v, i) => {
    const p = `$.inferences[${i}]`;
    const o = item(v, p);
    inferences.push({
      id: str(o, 'id', p),
      kind: oneOf(o, 'kind', INFERENCE_KINDS, p),
      value: str(o, 'value', p),
      confidence: oneOf(o, 'confidence', CONF, p),
      clueIds: strArr(o, 'clue_ids', p),
    });
  });
  inferences = cap(dedupe(inferences, 'inference', repairs), ADV_B_LIMITS.inferences, 'inferences', repairs)
    .map((x) => ({ ...x, clueIds: keepKnown(x.clueIds, `inference ${x.id}`) }));

  if (status !== 'ok') {
    if (clues.length || hypotheses.length || inferences.length) repairs.push(`audit_status ${status}: arrays emptied`);
    return { status, declineReason, sceneSummary, clues: [], hypotheses: [], inferences: [], repairs };
  }
  return { status, declineReason, sceneSummary, clues, hypotheses, inferences, repairs };
}
