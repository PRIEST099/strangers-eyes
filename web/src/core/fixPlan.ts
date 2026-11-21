// web/src/core/fixPlan.ts: the deterministic (RULES-ONLY) fix plan (SPEC §10.4, SCR-11; ARCH §12.5; T-078, D-142).
// Pure code over pass B's validated JSON (invariant 8) and the verdict built from it; no model call. nanoFix.v1 and
// validateDevicePlan (the Nano plan, S0) come later and will reuse these helpers.
//   - Targets: every match (exact, likely, possible), plus, for each pin whose band is district or closer, the
//     hypothesis that gives it. Mask every REMOVABLE clue any target cites; with no targets, every removable clue of
//     severity high.
//   - Crop (D-35): only when some exact/likely target (or a district-or-closer hypothesis) cites nothing but
//     non-removable clues; then the side whose minimal crop removes those boxes within the 40% cap (bestCrop). No side
//     fits → no crop, `cropTooMuch`.
//   - Boxes: pass B's box_2d on the image AS SENT, mapped to master px (box2dToMaster), padded by RC mask_pad_ratio
//     (padRect: at least 4 px). Solid fills only (invariant 6); the OCR-union refinement (SCR-11) is not applied yet.
//   - expectedResidual (D-51): the finest `reveals` among clues left visible (venue_or_organisation = street), else
//     country, recomputed from what is actually applied (unticked items stay visible; cropped-away clues are gone).
//   - The explanation is a template with generic phrases (KIND_PHRASE): never a vault label, never "safe" (AC-197).
// LOCAL ONLY: vault kinds pass through here (never labels into the text); nothing is logged, persisted or sent.
import enums from '@prompts/enums.v1.json';
import { area, bestCrop, box2dToMaster, intersect, padRect } from './boxes';
import { bandRank } from './geo';
import { t as lookup, type StringId } from './strings';
import type { AdversaryClue, AdversaryHypothesis, ClueType, CropSide, FixPlan, ImageFrame, PxRect, Reveals, VaultItem, VaultKind, Verdict } from './types';

export type Residual = FixPlan['expectedResidual'];
const RESIDUAL_ORDER: readonly Residual[] = ['street', 'neighbourhood', 'district', 'city', 'region', 'country'];
const residualOf = (r: Reveals): Residual => (r === 'venue_or_organisation' ? 'street' : r);
const KIND_PHRASE: Readonly<Record<VaultKind, string>> = enums.KIND_PHRASE;

/** The finest level still revealed by the clues NOT in `removed` (SPEC §10.4); `country` when none remain. */
export function expectedResidual(clues: readonly Pick<AdversaryClue, 'id' | 'reveals'>[], removed: ReadonlySet<string>): Residual {
  let best = RESIDUAL_ORDER.length - 1;
  for (const c of clues) {
    if (removed.has(c.id)) continue;
    const i = RESIDUAL_ORDER.indexOf(residualOf(c.reveals));
    if (i >= 0 && i < best) best = i;
  }
  return RESIDUAL_ORDER[best] ?? 'country';
}

export interface FixTarget {
  readonly vaultId: string;
  /** exact or likely match, or a district-or-closer hypothesis: may ask for a crop. */
  readonly strong: boolean;
  readonly clueIds: readonly string[];
}

/** SPEC §10.4 targets over a (non-PARTIAL) verdict's matches and pin bands. */
export function fixTargets(v: Pick<Verdict, 'matches' | 'pinBands'>, hypotheses: readonly AdversaryHypothesis[]): FixTarget[] {
  const out: FixTarget[] = v.matches.map((m) => ({ vaultId: m.vaultId, strong: m.strength !== 'possible', clueIds: [...m.clueIds] }));
  for (const p of v.pinBands) {
    if (p.hypothesisId === null || bandRank(p.band) > bandRank('district')) continue;
    const h = hypotheses.find((x) => x.id === p.hypothesisId);
    if (h) out.push({ vaultId: p.vaultId, strong: true, clueIds: [...h.clueIds] });
  }
  return out;
}

/** One planned mask, as the checklist shows it (type and ID, SPEC SCR-11) with its padded master box. */
export interface FixMaskItem { readonly clueId: string; readonly type: ClueType; readonly box: PxRect }

export interface RulesFix {
  readonly plan: FixPlan;
  /** One per plan.maskClueIds entry whose box maps onto the master (a box that does not map cannot be masked). */
  readonly masks: readonly FixMaskItem[];
  /** The crop to keep (master px), or null. */
  readonly crop: PxRect | null;
  /** A target cites a clue that cannot be masked (copy.fix.unremovable). */
  readonly unremovable: boolean;
  /** A crop was needed but no side fits the 40% cap (copy.fix.cropTooMuch). */
  readonly cropTooMuch: boolean;
}

export interface FixInput {
  /** The validated pass B the verdict was built from (its clues, hypotheses and the frame it was sent as). */
  readonly adv: { readonly clues: readonly AdversaryClue[]; readonly hypotheses: readonly AdversaryHypothesis[]; readonly sentFrame: ImageFrame };
  readonly verdict: Pick<Verdict, 'matches' | 'pinBands'>;
  /** The local vault: only each target item's KIND reaches the explanation, as a generic phrase. */
  readonly vault: readonly VaultItem[];
  /** Master size (px). */
  readonly width: number;
  readonly height: number;
  /** RC mask_pad_ratio. */
  readonly padRatio: number;
}

type Tr = (id: StringId, params?: Record<string, string | number>) => string;
const appT: Tr = (id, params) => lookup(id, params);

/** The template explanation (≤ 2 sentences, generic phrases only). */
export function fixExplanation(n: number, kinds: readonly VaultKind[], tr: Tr = appT): string {
  const phrases = [...new Set(kinds.map((k) => (Object.hasOwn(KIND_PHRASE, k) ? KIND_PHRASE[k] : KIND_PHRASE.other_text)))];
  if (n === 0) return tr('ui.fix.explainNone');
  return phrases.length ? tr('ui.fix.explain', { n, phrases: phrases.join(', ') }) : tr('ui.fix.explainGeneric', { n });
}

/** Clues whose master box lies wholly outside the kept crop (removed by it). */
function croppedAway(clues: readonly AdversaryClue[], frame: ImageFrame, crop: PxRect | null): Set<string> {
  const out = new Set<string>();
  if (!crop) return out;
  for (const c of clues) {
    const b = box2dToMaster(c.box2d, frame);
    if (b && area(intersect(b, crop)) === 0) out.add(c.id);
  }
  return out;
}

/** SPEC §10.4 / ARCH §12.5 deterministicFix. */
export function deterministicFix(input: FixInput, tr: Tr = appT): RulesFix {
  const { adv, width: W, height: H } = input;
  const byId = new Map(adv.clues.map((c) => [c.id, c]));
  const targets = fixTargets(input.verdict, adv.hypotheses);
  const cited = new Set(targets.flatMap((t) => t.clueIds).filter((id) => byId.has(id)));

  const maskIds = targets.length
    ? adv.clues.filter((c) => c.removable && cited.has(c.id)).map((c) => c.id)
    : adv.clues.filter((c) => c.removable && c.severity === 'high').map((c) => c.id);
  const masks: FixMaskItem[] = [];
  for (const id of maskIds) {
    const c = byId.get(id);
    const b = c ? box2dToMaster(c.box2d, adv.sentFrame) : null;
    if (c && b) masks.push({ clueId: id, type: c.type, box: padRect(b, W, H, input.padRatio) });
  }

  // Crop: the boxes of strong targets that cite only non-removable clues.
  const cropIds = new Set<string>();
  for (const t of targets) {
    const own = t.clueIds.map((id) => byId.get(id)).filter((c): c is AdversaryClue => !!c);
    if (t.strong && own.length > 0 && own.every((c) => !c.removable)) for (const c of own) cropIds.add(c.id);
  }
  const cropBoxes = [...cropIds].flatMap((id) => {
    const c = byId.get(id);
    const b = c ? box2dToMaster(c.box2d, adv.sentFrame) : null;
    return b ? [padRect(b, W, H, input.padRatio)] : [];
  });
  let crop: PxRect | null = null;
  let side: CropSide = 'none';
  let cropTooMuch = false;
  if (cropBoxes.length) {
    const r = bestCrop(cropBoxes, W, H);
    if (r.ok) { crop = r.rect; side = r.side; } else cropTooMuch = r.reason === 'too_much';
  }
  const unremovable = [...cited].some((id) => byId.get(id)?.removable === false);

  const applied = new Set(masks.map((m) => m.clueId));
  for (const id of croppedAway(adv.clues, adv.sentFrame, crop)) applied.add(id);
  const kinds = [...new Set(targets.map((t) => t.vaultId))]
    .map((id) => input.vault.find((v) => v.id === id)?.kind)
    .filter((k): k is VaultKind => k !== undefined);
  const plan: FixPlan = {
    maskClueIds: masks.map((m) => m.clueId), crop: side, explanation: fixExplanation(masks.length, kinds, tr),
    expectedResidual: expectedResidual(adv.clues, applied), route: 'RULES_ONLY', rulesAddedMasks: 0,
  };
  return { plan, masks, crop, unremovable, cropTooMuch };
}

/** What Apply adds: the ticked masks (unticked ids dropped) and the crop, unless the user unticked it. */
export function selectedFix(fix: RulesFix, unchecked: ReadonlySet<string>, cropOff = false): { masks: PxRect[]; crop: PxRect | null } {
  return { masks: fix.masks.filter((m) => !unchecked.has(m.clueId)).map((m) => ({ ...m.box })), crop: cropOff ? null : fix.crop };
}

/** The residual shown for what will actually be applied (D-51, D-64): unticked clues stay visible. */
export function residualAfter(input: FixInput, fix: RulesFix, unchecked: ReadonlySet<string>, cropOff = false): Residual {
  const removed = new Set(fix.masks.filter((m) => !unchecked.has(m.clueId)).map((m) => m.clueId));
  for (const id of croppedAway(input.adv.clues, input.adv.sentFrame, cropOff ? null : fix.crop)) removed.add(id);
  return expectedResidual(input.adv.clues, removed);
}

/** Two crops (keep rects, master px) combine to their intersection: a later round never un-crops an earlier one. */
export function combineCrops(a: PxRect | null, b: PxRect | null): PxRect | null {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  const r = intersect(a, b);
  return area(r) > 0 ? r : { ...a };
}
