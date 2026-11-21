// ui/check/editor.ts (T-068, D-122): the mask editor's geometry, keyboard ops, toggles and the masked frame candidate.
import { describe, expect, it } from 'vitest';
import { padRect } from '../../core/boxes';
import type { Clue } from '../../core/types';
import type { Tier0Finding } from '../../tier0/tier0';
import {
  candidateOf, createEditor, DEFAULT_MASK_SHARE, dragRect, editorReducer, keyStep, keyToOp, masksOf, MIN_MASK_PX, moveRect,
  needsConfirm, normaliseRect, resizeRect, toImagePoint, userMaskClue, warningOf, type EditorState,
} from './editor';

const W = 1000;
const H = 500;
const clue = (id: string, over: Partial<Clue>): Clue => ({
  id, source: 'tier0_face', readers: 'tier0', type: 'face', box: { x: 100, y: 100, w: 40, h: 40 }, boxPrecision: 'exact',
  severity: 'high', removable: true, vaultHits: [], masked: true, userUnmasked: false, ...over,
});
const FINDINGS: Tier0Finding[] = [
  { clue: clue('t0-1', {}) },
  { clue: clue('t0-2', { source: 'tier0_ocr_vault', type: 'name_text', vaultHits: ['v1'], localText: 'LUCAS', box: { x: 300, y: 50, w: 80, h: 20 } }), vaultKinds: ['child_name'] },
  { clue: clue('t0-3', { source: 'tier0_regex', type: 'other', localText: '07700 900123', box: { x: 500, y: 300, w: 100, h: 20 } }), regexKind: 'phone' },
  // after T-066: a Nano clue, approximate (grid cell), high, auto type → flagged dashed in Standard
  { clue: clue('np-1', { source: 'nano_prescreen', readers: 'nano', type: 'mail_or_document', boxPrecision: 'grid_cell', box: { x: 0, y: 0, w: 333, h: 166 }, masked: false }) },
  { clue: clue('np-2', { source: 'nano_prescreen', readers: 'nano', type: 'street_sign', severity: 'medium', masked: false, box: { x: 700, y: 400, w: 50, h: 50 } }) },
];
const OPTS = { mode: 'standard' as const, autoMaskTypes: ['name_text', 'house_number', 'plate', 'mail_or_document', 'screen'] as const, padRatio: 0.15 };
const fresh = (): EditorState => createEditor(FINDINGS, { width: W, height: H }, OPTS);

describe('createEditor applies the pre-ticks', () => {
  it('Tier-0 items are masked; the grid-cell and medium Nano clues are flagged (dashed / amber)', () => {
    const s = fresh();
    expect(s.items.map((it) => [it.clue.id, it.clue.masked, it.flag, it.approximate])).toEqual([
      ['t0-1', true, 'none', false], ['t0-2', true, 'none', false], ['t0-3', true, 'none', false],
      ['np-1', false, 'high', true], ['np-2', false, 'possible', false],
    ]);
    expect(s.items[1].vaultKinds).toEqual(['child_name']);
    expect(s.items[2].regexKind).toBe('phone');
    expect(s.userMasks).toEqual([]);
    expect(s.selected).toBeNull();
  });

  it('Strict masks every flag', () => {
    const s = createEditor(FINDINGS, { width: W, height: H }, { ...OPTS, mode: 'strict' });
    expect(s.items.every((it) => it.clue.masked)).toBe(true);
  });
});

describe('toggle', () => {
  it('un-ticking a face or a vault hit is allowed and sets userUnmasked (warnFace / warnVault); ticking again clears it', () => {
    let s = editorReducer(fresh(), { op: 'toggle', id: 't0-1' });
    expect(s.items[0].clue).toMatchObject({ masked: false, userUnmasked: true });
    expect(warningOf(s.items[0])).toBe('copy.editor.warnFace');
    s = editorReducer(s, { op: 'toggle', id: 't0-2' });
    expect(warningOf(s.items[1])).toBe('copy.editor.warnVault');
    s = editorReducer(s, { op: 'toggle', id: 't0-1' });
    expect(s.items[0].clue).toMatchObject({ masked: true, userUnmasked: false, maskReason: 'face' });
    expect(warningOf(s.items[0])).toBeNull();
  });

  it('an unmasked face or vault hit always warns, however it came to be unmasked', () => {
    const it0 = fresh().items[0];
    expect(warningOf({ ...it0, clue: { ...it0.clue, masked: false, userUnmasked: false } })).toBe('copy.editor.warnFace');
  });

  it('un-ticking a regex flag is not a private item: no warning, userUnmasked stays false', () => {
    const s = editorReducer(fresh(), { op: 'toggle', id: 't0-3' });
    expect(s.items[2].clue).toMatchObject({ masked: false, userUnmasked: false });
    expect(warningOf(s.items[2])).toBeNull();
  });

  it('ticking a flagged clue masks it with maskReason user', () => {
    const s = editorReducer(fresh(), { op: 'toggle', id: 'np-2' });
    expect(s.items[4].clue).toMatchObject({ masked: true, maskReason: 'user' });
  });

  it('a masked grid-cell area needs a confirmation before removal; an exact box does not', () => {
    const s = editorReducer(fresh(), { op: 'toggle', id: 'np-1' });
    expect(needsConfirm(s.items[3])).toBe(true);
    expect(needsConfirm(fresh().items[3])).toBe(false); // not masked: nothing to remove
    expect(needsConfirm(s.items[0])).toBe(false);
  });

  it('an unknown id changes nothing (same object)', () => {
    const s = fresh();
    expect(editorReducer(s, { op: 'toggle', id: 'nope' })).toBe(s);
  });
});

describe('geometry', () => {
  it('normaliseRect: whole px, inside the image, any drag direction; too small → null', () => {
    expect(normaliseRect({ x: 10.4, y: 20.6, w: 30.2, h: 40.1 }, W, H)).toEqual({ x: 10, y: 20, w: 31, h: 41 });
    expect(normaliseRect({ x: 10.6, y: 20.6, w: 30, h: 40 }, W, H)).toEqual({ x: 10, y: 20, w: 31, h: 41 }); // outward, never rounded in
    expect(normaliseRect({ x: 50, y: 50, w: -20, h: -30 }, W, H)).toEqual({ x: 30, y: 20, w: 20, h: 30 });
    expect(normaliseRect({ x: -10, y: 490, w: 50, h: 50 }, W, H)).toEqual({ x: 0, y: 490, w: 40, h: 10 });
    expect(normaliseRect({ x: 10, y: 10, w: MIN_MASK_PX - 1, h: 50 }, W, H)).toBeNull();
    expect(normaliseRect({ x: 10, y: 10, w: MIN_MASK_PX, h: MIN_MASK_PX }, W, H)).toEqual({ x: 10, y: 10, w: MIN_MASK_PX, h: MIN_MASK_PX });
    expect(normaliseRect({ x: 1200, y: 10, w: 50, h: 50 }, W, H)).toBeNull();
    expect(normaliseRect({ x: Number.NaN, y: 0, w: 50, h: 50 }, W, H)).toBeNull();
    expect(normaliseRect({ x: 0, y: 0, w: 5, h: 5 }, 4, 4)).toEqual({ x: 0, y: 0, w: 4, h: 4 }); // tiny image: its own size
  });

  it('dragRect and toImagePoint map a drag on the displayed photo to master px', () => {
    expect(dragRect({ x: 50, y: 60 }, { x: 10, y: 100 })).toEqual({ x: 10, y: 60, w: 40, h: 40 });
    const box = { left: 100, top: 50, width: 500, height: 250 }; // shown at half size
    expect(toImagePoint(350, 175, box, W, H)).toEqual({ x: 500, y: 250 });
    expect(toImagePoint(0, 0, box, W, H)).toEqual({ x: 0, y: 0 }); // clamped
    expect(toImagePoint(9999, 9999, box, W, H)).toEqual({ x: W, y: H });
    expect(toImagePoint(1, 1, { left: 0, top: 0, width: 0, height: 0 }, W, H)).toEqual({ x: 0, y: 0 });
  });

  it('moveRect keeps the size and stays inside; resizeRect moves the far edges, at least MIN_MASK_PX, never past the image', () => {
    const r = { x: 900, y: 400, w: 50, h: 50 };
    expect(moveRect(r, 100, 100, W, H)).toEqual({ x: 950, y: 450, w: 50, h: 50 });
    expect(moveRect(r, -2000, -2000, W, H)).toEqual({ x: 0, y: 0, w: 50, h: 50 });
    expect(moveRect(r, 10.6, -0.4, W, H)).toEqual({ x: 911, y: 400, w: 50, h: 50 });
    expect(resizeRect(r, 500, 500, W, H)).toEqual({ x: 900, y: 400, w: 100, h: 100 });
    expect(resizeRect(r, -500, -500, W, H)).toEqual({ x: 900, y: 400, w: MIN_MASK_PX, h: MIN_MASK_PX });
    expect(resizeRect(r, 5, -5, W, H)).toEqual({ x: 900, y: 400, w: 55, h: 45 });
  });
});

describe('keyboard', () => {
  it('keyStep: 1% of the longer side (≥ 1 px), 1 px with Alt', () => {
    expect(keyStep(W, H)).toBe(10);
    expect(keyStep(40, 30)).toBe(1);
    expect(keyStep(W, H, true)).toBe(1);
  });

  it('arrows move, Shift+arrows resize, Delete/Backspace remove, other keys do nothing', () => {
    expect(keyToOp('mm-1', 'ArrowLeft', {}, W, H)).toEqual({ op: 'move', id: 'mm-1', dx: -10, dy: 0 });
    expect(keyToOp('mm-1', 'ArrowDown', { alt: true }, W, H)).toEqual({ op: 'move', id: 'mm-1', dx: 0, dy: 1 });
    expect(keyToOp('mm-1', 'ArrowRight', { shift: true }, W, H)).toEqual({ op: 'resize', id: 'mm-1', dw: 10, dh: 0 });
    expect(keyToOp('mm-1', 'ArrowUp', { shift: true }, W, H)).toEqual({ op: 'resize', id: 'mm-1', dw: 0, dh: -10 });
    expect(keyToOp('mm-1', 'Delete', {}, W, H)).toEqual({ op: 'remove', id: 'mm-1' });
    expect(keyToOp('mm-1', 'Backspace', { shift: true }, W, H)).toEqual({ op: 'remove', id: 'mm-1' });
    expect(keyToOp('mm-1', 'Enter', {}, W, H)).toBeNull();
    expect(keyToOp('mm-1', 'Tab', {}, W, H)).toBeNull();
  });
});

describe('user masks', () => {
  it('add selects the new mask; ids and numbers are never reused', () => {
    let s = editorReducer(fresh(), { op: 'add', rect: { x: 10, y: 10, w: 50, h: 50 } });
    expect(s.userMasks).toEqual([{ id: 'mm-1', n: 1, rect: { x: 10, y: 10, w: 50, h: 50 } }]);
    expect(s.selected).toBe('mm-1');
    s = editorReducer(s, { op: 'remove', id: 'mm-1' });
    expect(s.selected).toBeNull();
    s = editorReducer(s, { op: 'add', rect: { x: 10, y: 10, w: 50, h: 50 } });
    expect(s.userMasks.map((m) => [m.id, m.n])).toEqual([['mm-2', 2]]);
  });

  it('a click without a drag adds nothing (same object)', () => {
    const s = fresh();
    expect(editorReducer(s, { op: 'add', rect: { x: 10, y: 10, w: 2, h: 2 } })).toBe(s);
  });

  it('addDefault: a centred mask of DEFAULT_MASK_SHARE of each side', () => {
    const s = editorReducer(fresh(), { op: 'addDefault' });
    const w = W * DEFAULT_MASK_SHARE;
    const h = H * DEFAULT_MASK_SHARE;
    expect(s.userMasks[0].rect).toEqual({ x: (W - w) / 2, y: (H - h) / 2, w, h });
  });

  it('move / resize / set by keyboard or drag; a no-op returns the same object; unknown ids are ignored', () => {
    let s = editorReducer(fresh(), { op: 'add', rect: { x: 10, y: 10, w: 50, h: 50 } });
    s = editorReducer(s, { op: 'move', id: 'mm-1', dx: 10, dy: -100 });
    expect(s.userMasks[0].rect).toEqual({ x: 20, y: 0, w: 50, h: 50 });
    s = editorReducer(s, { op: 'resize', id: 'mm-1', dw: 10, dh: 10 });
    expect(s.userMasks[0].rect).toEqual({ x: 20, y: 0, w: 60, h: 60 });
    expect(editorReducer(s, { op: 'move', id: 'mm-1', dx: 0, dy: -10 })).toBe(s); // already at the top
    s = editorReducer(s, { op: 'set', id: 'mm-1', rect: { x: 100.2, y: 100, w: 30, h: 30 } });
    expect(s.userMasks[0].rect).toEqual({ x: 100, y: 100, w: 31, h: 30 });
    expect(editorReducer(s, { op: 'set', id: 'mm-1', rect: { x: 0, y: 0, w: 1, h: 1 } })).toBe(s); // too small: kept
    expect(editorReducer(s, { op: 'move', id: 'nope', dx: 1, dy: 1 })).toBe(s);
    expect(editorReducer(s, { op: 'remove', id: 'nope' })).toBe(s);
  });

  it('select: only a user mask or null; the same selection returns the same object', () => {
    let s = editorReducer(fresh(), { op: 'add', rect: { x: 10, y: 10, w: 50, h: 50 } });
    expect(editorReducer(s, { op: 'select', id: 't0-1' })).toBe(s);
    expect(editorReducer(s, { op: 'select', id: 'mm-1' })).toBe(s);
    s = editorReducer(s, { op: 'select', id: null });
    expect(s.selected).toBeNull();
  });
});

describe('the masked frame candidate (what T-069 sends)', () => {
  it('masks: every masked detected box padded by mask_pad_ratio, then every user mask exactly as drawn (D-122)', () => {
    let s = editorReducer(fresh(), { op: 'add', rect: { x: 10, y: 10, w: 50, h: 50 } });
    s = editorReducer(s, { op: 'toggle', id: 't0-3' }); // the phone is un-ticked
    const c = candidateOf(s, 'a'.repeat(64), []);
    expect(c.masks).toEqual([
      padRect(FINDINGS[0].clue.box, W, H, 0.15),
      padRect(FINDINGS[1].clue.box, W, H, 0.15),
      { x: 10, y: 10, w: 50, h: 50 },
    ]);
    expect(c.masks[0]).toEqual({ x: 96, y: 96, w: 48, h: 48 }); // ≥ 4 px per side
    expect(c).toMatchObject({ masterSha256: 'a'.repeat(64), width: W, height: H, blockedBy: [], route: 'RULES_ONLY' });
    expect(c.clues.map((x) => [x.id, x.masked])).toEqual([['t0-1', true], ['t0-2', true], ['t0-3', false], ['np-1', false], ['np-2', false], ['mm-1', true]]);
    expect(c.clues[5]).toEqual(userMaskClue(s.userMasks[0]));
    expect(c.clues[5]).toMatchObject({ source: 'manual', readers: 'user', maskReason: 'user', box: { x: 10, y: 10, w: 50, h: 50 } });
  });

  it('counts the private items the user un-ticked (copy.consent.unmasked), and carries the failed steps', () => {
    let s = editorReducer(fresh(), { op: 'toggle', id: 't0-1' });
    s = editorReducer(s, { op: 'toggle', id: 't0-2' });
    s = editorReducer(s, { op: 'toggle', id: 't0-3' });
    const c = candidateOf(s, 'b'.repeat(64), ['faces']);
    expect(c.unmaskedPrivate).toEqual({ faces: 1, vault: 1 });
    expect(c.blockedBy).toEqual(['faces']);
    expect(c.masks).toEqual([]);
  });

  it('masksOf can leave out the user mask being dragged (the stage re-renders without it)', () => {
    const s = editorReducer(fresh(), { op: 'add', rect: { x: 10, y: 10, w: 50, h: 50 } });
    expect(masksOf(s, { except: 'mm-1' })).toHaveLength(3); // the three masked Tier-0 items
    expect(masksOf(s)).toHaveLength(4);
  });
});
