// web/src/ai/jobs/prescreenClues.ts: the pure half of the Nano pre-screen (T-066; SPEC SCR-06 W3a; ARCH §10.7, §11.4).
// No gate, no Firebase: ui/check/runPrescreen imports it statically. ai/jobs/prescreen.ts is the gate job.
//   - parseNanoPreText: strict validation (AC-114). A root that is not {clues: [...]} is a ParseError (the gate's
//     "fallback: invalid output"); inside, an item that is not exactly {type, text, region, severity} with the 13
//     pre-screen types, the 3×3 regions and the three severities is dropped; at most 8.
//   - localiseNanoClues (ARCH §11.4): a clue with text is boxed by the OCR words inside its region's cell that match it
//     (tokenSim ≥ 0.7): 'exact'. Otherwise it gets the whole grid cell: 'grid_cell', which core/pretick only masks in
//     Strict mode (or flags dashed, copy.prescreen.approximate).
//   - mergeNanoFindings: Nano clues join the Tier-0 findings. A located Nano clue over a Tier-0 finding makes that
//     finding's reader 'both' instead of adding a second row (AC-111); either reader alone makes a candidate.
// LOCAL ONLY: the OCR words and the clue texts stay in memory on this device; nothing is logged or sent.
import type { Clue, ClueType, Confidence, GridRegion, OcrWord, PxRect } from '../../core/types';
import { CONF, PRESCREEN_CLUE_TYPES, REGIONS } from '../../core/types';
import { gridCellRect } from '../../core/boxes';
import { tokens, tokenSim } from '../../tier0/fuzzy';
import type { Tier0Finding } from '../../tier0/tier0';
import { ParseError } from '../parse';

export const MAX_NANO_CLUES = 8;
/** ARCH §11.4: an OCR word localises a clue when its token similarity to a clue token is at least this. */
export const LOCALISE_SIM = 0.7;
const MAX_TEXT_CHARS = 120;

export interface NanoPreClue { type: ClueType; text: string; region: GridRegion; severity: Confidence }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ITEM_KEYS = new Set(['type', 'text', 'region', 'severity']);
const TYPES: ReadonlySet<string> = new Set(PRESCREEN_CLUE_TYPES);
const REGION_SET: ReadonlySet<string> = new Set(REGIONS);
const SEVERITIES: ReadonlySet<string> = new Set(CONF);

/** The device answer → validated clues (AC-114). Throws ParseError only for non-JSON or a root without a clues array. */
export function parseNanoPreText(raw: string): NanoPreClue[] {
  let j: unknown;
  try { j = JSON.parse(raw); } catch { throw new ParseError('pre-screen: not JSON'); }
  if (!isObj(j) || !Array.isArray(j.clues)) throw new ParseError('pre-screen: expected {clues: [...]}');
  const out: NanoPreClue[] = [];
  for (const c of j.clues) {
    if (out.length >= MAX_NANO_CLUES) break;
    if (!isObj(c) || Object.keys(c).some((k) => !ITEM_KEYS.has(k))) continue;
    const { type, text, region, severity } = c;
    if (typeof type !== 'string' || !TYPES.has(type) || typeof text !== 'string' || typeof region !== 'string' || !REGION_SET.has(region)
      || typeof severity !== 'string' || !SEVERITIES.has(severity)) continue;
    out.push({ type: type as ClueType, text: text.trim().slice(0, MAX_TEXT_CHARS), region: region as GridRegion, severity: severity as Confidence });
  }
  return out;
}

const centre = (b: PxRect) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const inside = (p: { x: number; y: number }, r: PxRect) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
function union(rs: readonly PxRect[]): PxRect {
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** ARCH §11.4: Nano clues → findings in master pixels (ids np-1..), boxed by OCR words when they match, else the cell. */
export function localiseNanoClues(clues: readonly NanoPreClue[], words: readonly OcrWord[], W: number, H: number): Tier0Finding[] {
  return clues.map((c, k) => {
    const cell = gridCellRect(c.region, W, H);
    const want = tokens(c.text);
    const hits = want.length === 0 ? [] : words.filter((w) => inside(centre(w.box), cell)
      && tokens(w.text).some((t) => want.some((x) => tokenSim(t, x) >= LOCALISE_SIM)));
    const exact = hits.length > 0;
    const clue: Clue = {
      id: `np-${k + 1}`, source: 'nano_prescreen', readers: 'nano', type: c.type, box: exact ? union(hits.map((w) => w.box)) : cell,
      boxPrecision: exact ? 'exact' : 'grid_cell', region: c.region, severity: c.severity, removable: true, vaultHits: [],
      masked: false, userUnmasked: false, ...(c.text ? { localText: c.text } : {}),
    };
    return { clue };
  });
}

function overlapRatio(a: PxRect, b: PxRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.w * a.h || 1, b.w * b.h || 1);
}

/**
 * Tier-0 findings plus Nano findings. An exact Nano clue that covers most of a non-face Tier-0 finding marks that
 * finding 'both' (one row, the Tier-0 box and its mask rule kept); every other Nano clue is added as its own row.
 */
export function mergeNanoFindings(tier0: readonly Tier0Finding[], nano: readonly Tier0Finding[]): Tier0Finding[] {
  const out = tier0.map((f) => ({ ...f, clue: { ...f.clue } }));
  for (const n of nano) {
    const twin = n.clue.boxPrecision === 'exact'
      ? out.find((f) => f.clue.type !== 'face' && f.clue.source !== 'nano_prescreen' && overlapRatio(f.clue.box, n.clue.box) >= 0.5)
      : undefined;
    if (twin) { twin.clue.readers = 'both'; continue; }
    out.push({ clue: { ...n.clue } });
  }
  return out;
}

