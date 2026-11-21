// web/src/core/pretick.ts: the pre-tick rules (SPEC SCR-06 table, D-16; ARCH §11.3; AC-112). Pure, shared by the
// Tier-0 path (T-068) and the Nano pre-screen once T-066 lands: a Nano clue only needs `source: 'nano_prescreen'`,
// its severity and its boxPrecision (`exact` when located by OCR, `grid_cell` otherwise; ARCH §11.4).
//
// | Item                                                                 | Standard        | Strict |
// | Faces (any detection ≥ face_min_confidence)                          | masked          | masked |
// | Vault hits (Tier-0 matcher, or Nano W3b exact/likely)                | masked          | masked |
// | Regex plates, phones and house-number candidates                     | masked          | masked |
// | High-severity clues of an auto_mask_types type, located by OCR        | masked          | masked |
// | The same clues not located by OCR (grid cell only)                   | flagged, dashed | masked |
// | Other high-severity clues                                            | flagged         | masked |
// | Medium- or low-severity clues                                        | flagged amber   | masked |
//
// A user-drawn mask (`manual`) is always masked. Applying the pre-ticks resets `userUnmasked` (the Strict switch
// re-applies them after a confirmation; SPEC SCR-06).
import type { Clue, ClueType, MaskReason } from './types';

export type PreTickMode = 'standard' | 'strict';

/** RC `auto_mask_types` default (SPEC SCR-06, ARCH §13). */
export const DEFAULT_AUTO_MASK_TYPES: readonly ClueType[] = Object.freeze(['name_text', 'house_number', 'plate', 'mail_or_document', 'screen']);

/**
 * How an item is shown when it is NOT masked: `high` (flagged), `possible` (amber, copy.prescreen.possible) or none
 * (it is masked). `approximate`: a grid-cell box, drawn dashed and labelled copy.prescreen.approximate (ARCH §11.4).
 */
export type PreTickFlag = 'none' | 'high' | 'possible';
export interface PreTick {
  masked: boolean;
  maskReason?: MaskReason;
  flag: PreTickFlag;
  approximate: boolean;
}

/** The pre-tick of one clue (the table above). */
export function preTickOf(c: Clue, mode: PreTickMode, autoMaskTypes: readonly ClueType[] = DEFAULT_AUTO_MASK_TYPES): PreTick {
  const approximate = c.boxPrecision === 'grid_cell';
  const mask = (maskReason: MaskReason): PreTick => ({ masked: true, maskReason, flag: 'none', approximate });
  if (c.type === 'face') return mask('face');
  if (c.vaultHits.length > 0) return mask('vault_text'); // a vault hit with no OCR box masks its whole grid cell (fail closed)
  if (c.source === 'tier0_regex') return mask('regex');
  if (c.source === 'manual') return mask('user');
  const high = c.severity === 'high';
  const autoType = high && autoMaskTypes.includes(c.type);
  if (autoType && !approximate) return mask('auto_type');
  if (mode === 'strict') return mask('strict');
  return { masked: false, flag: high ? 'high' : 'possible', approximate };
}

/** The clue with its pre-tick applied: `masked`, `maskReason` set (or cleared), `userUnmasked` reset. */
export function applyPreTick(c: Clue, mode: PreTickMode, autoMaskTypes: readonly ClueType[] = DEFAULT_AUTO_MASK_TYPES): Clue {
  const p = preTickOf(c, mode, autoMaskTypes);
  const out: Clue = { ...c, masked: p.masked, userUnmasked: false };
  if (p.maskReason) out.maskReason = p.maskReason;
  else delete out.maskReason;
  return out;
}
