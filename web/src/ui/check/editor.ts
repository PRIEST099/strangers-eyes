// web/src/ui/check/editor.ts: the mask editor's state and every edit (SPEC SCR-06 "Mask editor"; T-068, D-122). Pure:
// unit-tested in Node; components/PhotoStage and components/ClueList only dispatch EditorOps.
//   - Detected items (faces, vault text, regex flags; later the Nano clues of T-066) keep their unpadded box (D-88).
//     Their mask is toggled, never moved: un-ticking a face or a vault hit is allowed (the gate demo) and sets
//     `userUnmasked`, which shows copy.editor.warnFace / warnVault. A masked grid-cell box asks for a confirmation
//     before it is removed (copy.editor.confirmRemoveCell); `needsConfirm` says when.
//   - User masks ("Add mask": a drag on the photo, or the button) can be moved, resized and deleted, by pointer or by
//     keyboard (arrows move, Shift+arrows resize, Delete/Backspace removes; Alt makes the step 1 px). They are painted
//     exactly as drawn: no padding (D-122).
//   - `candidateOf` turns the state into the MASKED FRAME CANDIDATE that the Send step (T-069) shows and builds the
//     cloud JPEG from: `masks` is exactly what frames.renderFrame must paint (detected boxes padded by mask_pad_ratio,
//     user masks as drawn), in master pixels.
// LOCAL ONLY: clue texts and vault kinds are shown on this device and never leave it.
import { padRect } from '../../core/boxes';
import { preTickOf, type PreTickFlag, type PreTickMode } from '../../core/pretick';
import type { Clue, ClueType, PxRect, Route, VaultKind } from '../../core/types';
import type { RegexKind } from '../../tier0/regex';
import type { Tier0Finding, Tier0StepId } from '../../tier0/tier0';

/** Smallest user mask, in master px (a click without a drag adds nothing). */
export const MIN_MASK_PX = 8;
/** The Add-mask button's mask: centred, this share of each side. */
export const DEFAULT_MASK_SHARE = 0.2;

export interface EditorItem {
  readonly clue: Clue;
  readonly vaultKinds?: readonly VaultKind[];
  readonly regexKind?: RegexKind;
  /** How it is shown while unmasked (pre-tick table). */
  readonly flag: PreTickFlag;
  readonly approximate: boolean;
}
export interface UserMask {
  readonly id: string;
  /** 1-based, for "Your mask {n}"; never reused within one editor. */
  readonly n: number;
  readonly rect: PxRect;
}
export interface EditorState {
  readonly width: number;
  readonly height: number;
  readonly padRatio: number;
  readonly items: readonly EditorItem[];
  readonly userMasks: readonly UserMask[];
  readonly nextN: number;
  /** The selected user mask (keyboard target), or null. */
  readonly selected: string | null;
}

export type EditorOp =
  | { op: 'toggle'; id: string }
  | { op: 'add'; rect: PxRect }
  | { op: 'addDefault' }
  | { op: 'move'; id: string; dx: number; dy: number }
  | { op: 'resize'; id: string; dw: number; dh: number }
  | { op: 'set'; id: string; rect: PxRect }
  | { op: 'remove'; id: string }
  | { op: 'select'; id: string | null };

/** A new editor from Tier-0 findings (and, after T-066, localised Nano clues), with the pre-ticks applied. */
export function createEditor(
  findings: readonly Tier0Finding[], size: { width: number; height: number }, opts: { mode: PreTickMode; autoMaskTypes: readonly ClueType[]; padRatio: number },
): EditorState {
  const items = findings.map((f): EditorItem => {
    const p = preTickOf(f.clue, opts.mode, opts.autoMaskTypes);
    const clue: Clue = { ...f.clue, masked: p.masked, userUnmasked: false };
    if (p.maskReason) clue.maskReason = p.maskReason;
    else delete clue.maskReason;
    return { clue, vaultKinds: f.vaultKinds, regexKind: f.regexKind, flag: p.flag, approximate: p.approximate };
  });
  return { width: size.width, height: size.height, padRatio: opts.padRatio, items, userMasks: [], nextN: 1, selected: null };
}

const isPrivate = (c: Clue) => c.type === 'face' || c.vaultHits.length > 0;

/** A masked grid-cell box: removing it asks first (copy.editor.confirmRemoveCell; ARCH §11.4). */
export const needsConfirm = (item: EditorItem): boolean => item.clue.masked && item.approximate;

/** The warning an unmasked face or vault hit shows, however it came to be unmasked (the gate will block the send). */
export function warningOf(item: EditorItem): 'copy.editor.warnFace' | 'copy.editor.warnVault' | null {
  if (item.clue.masked) return null;
  if (item.clue.type === 'face') return 'copy.editor.warnFace';
  return item.clue.vaultHits.length > 0 ? 'copy.editor.warnVault' : null;
}

const int = (v: number) => (Number.isFinite(v) ? Math.round(v) : 0);
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A user rect normalised to the image: whole pixels, inside W×H, at least MIN_MASK_PX a side (or the image side when
 * the image is smaller). null when what is left inside the image is smaller than that (nothing to add).
 */
export function normaliseRect(r: PxRect, W: number, H: number): PxRect | null {
  if (![r.x, r.y, r.w, r.h].every(Number.isFinite)) return null;
  const x0 = clampN(Math.floor(Math.min(r.x, r.x + r.w)), 0, W);
  const y0 = clampN(Math.floor(Math.min(r.y, r.y + r.h)), 0, H);
  const x1 = clampN(Math.ceil(Math.max(r.x, r.x + r.w)), 0, W);
  const y1 = clampN(Math.ceil(Math.max(r.y, r.y + r.h)), 0, H);
  const minW = Math.min(MIN_MASK_PX, W);
  const minH = Math.min(MIN_MASK_PX, H);
  if (x1 - x0 < minW || y1 - y0 < minH) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The rect spanned by a drag from `a` to `b` (image px, any direction). */
export const dragRect = (a: { x: number; y: number }, b: { x: number; y: number }): PxRect =>
  ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });

/** A point on the displayed photo (client px) → master px. `box` is the photo's on-screen rect. */
export function toImagePoint(clientX: number, clientY: number, box: { left: number; top: number; width: number; height: number }, W: number, H: number): { x: number; y: number } {
  if (!(box.width > 0 && box.height > 0)) return { x: 0, y: 0 };
  return { x: clampN(((clientX - box.left) / box.width) * W, 0, W), y: clampN(((clientY - box.top) / box.height) * H, 0, H) };
}

/** `r` moved by (dx, dy), kept whole and inside the image (its size never changes). */
export function moveRect(r: PxRect, dx: number, dy: number, W: number, H: number): PxRect {
  return { x: clampN(r.x + int(dx), 0, Math.max(0, W - r.w)), y: clampN(r.y + int(dy), 0, Math.max(0, H - r.h)), w: r.w, h: r.h };
}

/** `r` with its right and bottom edges moved by (dw, dh): at least MIN_MASK_PX, never past the image. */
export function resizeRect(r: PxRect, dw: number, dh: number, W: number, H: number): PxRect {
  return {
    x: r.x, y: r.y,
    w: clampN(r.w + int(dw), Math.min(MIN_MASK_PX, W - r.x), W - r.x),
    h: clampN(r.h + int(dh), Math.min(MIN_MASK_PX, H - r.y), H - r.y),
  };
}

/** The keyboard step: 1% of the longer side (at least 1 px); 1 px with Alt. */
export const keyStep = (W: number, H: number, fine = false): number => (fine ? 1 : Math.max(1, Math.round(Math.max(W, H) / 100)));

/** A key on a selected user mask → its edit, or null when the key does nothing (the browser keeps it). */
export function keyToOp(id: string, key: string, mods: { shift?: boolean; alt?: boolean }, W: number, H: number): EditorOp | null {
  const s = keyStep(W, H, mods.alt);
  const d: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] };
  if (key === 'Delete' || key === 'Backspace') return { op: 'remove', id };
  const v = d[key];
  if (!v) return null;
  return mods.shift ? { op: 'resize', id, dw: v[0], dh: v[1] } : { op: 'move', id, dx: v[0], dy: v[1] };
}

const withMask = (s: EditorState, id: string, f: (r: PxRect) => PxRect): EditorState => {
  const i = s.userMasks.findIndex((m) => m.id === id);
  if (i < 0) return s;
  const next = f(s.userMasks[i].rect);
  const cur = s.userMasks[i].rect;
  if (next.x === cur.x && next.y === cur.y && next.w === cur.w && next.h === cur.h) return s;
  const userMasks = s.userMasks.slice();
  userMasks[i] = { ...userMasks[i], rect: next };
  return { ...s, userMasks };
};

const addMask = (s: EditorState, r: PxRect | null): EditorState => {
  if (!r) return s;
  const m: UserMask = { id: `mm-${s.nextN}`, n: s.nextN, rect: r };
  return { ...s, userMasks: [...s.userMasks, m], nextN: s.nextN + 1, selected: m.id };
};

/** Every edit. An op on an unknown id, or one that changes nothing, returns the same state object. */
export function editorReducer(s: EditorState, a: EditorOp): EditorState {
  const W = s.width;
  const H = s.height;
  switch (a.op) {
    case 'toggle': {
      const i = s.items.findIndex((it) => it.clue.id === a.id);
      if (i < 0) return s;
      const c = s.items[i].clue;
      // Un-ticking a face or a vault hit is allowed and remembered (userUnmasked); ticking any item masks it again.
      const clue: Clue = c.masked
        ? { ...c, masked: false, userUnmasked: isPrivate(c) || c.userUnmasked }
        : { ...c, masked: true, userUnmasked: false, maskReason: c.maskReason ?? 'user' };
      const items = s.items.slice();
      items[i] = { ...s.items[i], clue };
      return { ...s, items };
    }
    case 'add':
      return addMask(s, normaliseRect(a.rect, W, H));
    case 'addDefault': {
      const w = Math.max(MIN_MASK_PX, Math.round(W * DEFAULT_MASK_SHARE));
      const h = Math.max(MIN_MASK_PX, Math.round(H * DEFAULT_MASK_SHARE));
      return addMask(s, normaliseRect({ x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h }, W, H));
    }
    case 'move':
      return withMask(s, a.id, (r) => moveRect(r, a.dx, a.dy, W, H));
    case 'resize':
      return withMask(s, a.id, (r) => resizeRect(r, a.dw, a.dh, W, H));
    case 'set': {
      const r = normaliseRect(a.rect, W, H);
      return r ? withMask(s, a.id, () => r) : s;
    }
    case 'remove': {
      if (!s.userMasks.some((m) => m.id === a.id)) return s;
      return { ...s, userMasks: s.userMasks.filter((m) => m.id !== a.id), selected: s.selected === a.id ? null : s.selected };
    }
    case 'select':
      if (a.id !== null && !s.userMasks.some((m) => m.id === a.id)) return s;
      return a.id === s.selected ? s : { ...s, selected: a.id };
  }
}

// ---------- the masked frame candidate (what T-069's consent sheet shows and the cloud JPEG is built from) ----------

export interface MaskedFrameCandidate {
  /** The master this candidate belongs to (Check's stored master, by its sha256). */
  readonly masterSha256: string;
  readonly width: number;
  readonly height: number;
  /** Exactly what frames.renderFrame paints, in master px: detected boxes padded by mask_pad_ratio, user masks as drawn. */
  readonly masks: readonly PxRect[];
  /** Every item as a Clue (detected first, then user masks as source 'manual'), with masked / userUnmasked. */
  readonly clues: readonly Clue[];
  /** Private items the user un-ticked: the consent dry run shows copy.consent.unmasked and the gate blocks the send. */
  readonly unmaskedPrivate: { readonly faces: number; readonly vault: number };
  /** Tier-0 steps that failed: non-empty → nothing may go on from this photo (fail closed, D-123). */
  readonly blockedBy: readonly Tier0StepId[];
  /** Who produced the pre-screen. RULES_ONLY until T-066 adds the Nano pre-screen. */
  readonly route: Extract<Route, 'RULES_ONLY' | 'ON_DEVICE'>;
}

export const userMaskClue = (m: UserMask): Clue => ({
  id: m.id, source: 'manual', readers: 'user', type: 'other', box: { ...m.rect }, boxPrecision: 'exact', severity: 'high',
  removable: true, vaultHits: [], masked: true, userUnmasked: false, maskReason: 'user',
});

/** The rects to paint: every masked detected item padded (D-88), then every user mask as drawn (D-122). */
export function masksOf(s: EditorState, opts: { except?: string } = {}): PxRect[] {
  const out: PxRect[] = [];
  for (const it of s.items) if (it.clue.masked) out.push(padRect(it.clue.box, s.width, s.height, s.padRatio));
  for (const m of s.userMasks) if (m.id !== opts.except) out.push({ ...m.rect });
  return out;
}

export function candidateOf(s: EditorState, masterSha256: string, blockedBy: readonly Tier0StepId[], route: MaskedFrameCandidate['route'] = 'RULES_ONLY'): MaskedFrameCandidate {
  const unmasked = s.items.filter((it) => !it.clue.masked);
  return {
    masterSha256,
    width: s.width,
    height: s.height,
    masks: masksOf(s),
    clues: [...s.items.map((it) => it.clue), ...s.userMasks.map(userMaskClue)],
    unmaskedPrivate: {
      faces: unmasked.filter((it) => it.clue.type === 'face').length,
      vault: unmasked.filter((it) => it.clue.type !== 'face' && it.clue.vaultHits.length > 0).length,
    },
    blockedBy: [...blockedBy],
    route,
  };
}
