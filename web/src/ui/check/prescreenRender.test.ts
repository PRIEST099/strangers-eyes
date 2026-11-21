// T-068 fix round (D-132): the pre-screen components rendered to static markup (no DOM in Vitest), and the stage's
// preview painter on fake canvases. Pins what the review's surviving mutants changed: unbuilt steps' wording, the
// failed alert, the "not checked" lines instead of "nothing found", vault text on an unmasked row, and the blackout.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { STRINGS } from '../../core/strings';
import type { Clue } from '../../core/types';
import type { Tier0Finding, Tier0StepId } from '../../tier0/tier0';
import { BUILT_STEPS, PENDING_LINES, type PrescreenState } from '../checkState';
import { ClueList } from '../components/ClueList';
import { paintPreview } from '../components/PhotoStage';
import { PrescreenPanel } from '../components/PrescreenPanel';
import { StepperNav } from '../components/StepperNav';
import { createEditor, editorReducer, type EditorState } from './editor';

const S = STRINGS as Record<string, string>;
const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const has = (html: string, id: string, params: Record<string, string | number> = {}) => {
  let text = S[id];
  for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
  return html.includes(esc(text));
};

const clue = (id: string, over: Partial<Clue>): Clue => ({
  id, source: 'tier0_face', readers: 'tier0', type: 'face', box: { x: 10, y: 10, w: 40, h: 40 }, boxPrecision: 'exact',
  severity: 'high', removable: true, vaultHits: [], masked: true, userUnmasked: false, ...over,
});
const FINDINGS: Tier0Finding[] = [
  { clue: clue('t0-1', {}) },
  { clue: clue('t0-2', { source: 'tier0_ocr_vault', type: 'name_text', vaultHits: ['v1'], localText: 'LUCAS', box: { x: 100, y: 20, w: 80, h: 20 } }), vaultKinds: ['child_name'] },
];
const OPTS = { mode: 'standard' as const, autoMaskTypes: ['name_text'] as const, padRatio: 0.15 };
const editor = (f: readonly Tier0Finding[] = FINDINGS): EditorState => createEditor(f, { width: 400, height: 300 }, OPTS);
const list = (e: EditorState, failed: Parameters<typeof ClueList>[0]['failed'] = []) =>
  renderToStaticMarkup(createElement(ClueList, { editor: e, onOp: () => {}, failed }));

describe('StepperNav: unbuilt steps are never "not reached yet" (D-121)', () => {
  it('Import current: Pre-screen is not reached yet, every unbuilt step is not available yet, none is a button', () => {
    const html = renderToStaticMarkup(createElement(StepperNav, { current: 'import', reached: 'import', available: BUILT_STEPS, onSelect: () => {} }));
    for (const name of ['Pre-screen', 'Send', 'Attack', 'Verdict', 'Fix', 'Re-attack']) expect(has(html, 'ui.stepper.upcoming', { name }), name).toBe(true);
    for (const name of ['Export']) {
      expect(has(html, 'ui.stepper.unavailable', { name }), name).toBe(true);
      expect(has(html, 'ui.stepper.upcoming', { name }), name).toBe(false);
    }
    expect(html.match(/<button/g)).toBeNull();
  });
});

describe('ClueList', () => {
  it('a masked vault hit names its text; an UNMASKED one never shows the vault text (only the warning)', () => {
    expect(list(editor())).toContain('LUCAS');
    const off = editorReducer(editor(), { op: 'toggle', id: 't0-2' });
    const html = list(off);
    expect(html).not.toContain('LUCAS');
    expect(has(html, 'copy.editor.warnVault')).toBe(true);
  });

  it('a failed reader: one honest line per failed step, and never "nothing found" (D-132)', () => {
    const html = list(editor([]), ['faces', 'vault']);
    expect(has(html, 'ui.editor.none')).toBe(false);
    expect(has(html, 'ui.editor.notChecked.faces')).toBe(true);
    expect(has(html, 'ui.editor.notChecked.vault')).toBe(true);
    expect(has(html, 'ui.editor.notChecked.text')).toBe(false);
    expect(has(list(editor([])), 'ui.editor.none')).toBe(true); // all readers ran and found nothing
  });

  it('the people notice says faces are masked only while every face is; an un-ticked face is announced and described', () => {
    expect(has(list(editor()), 'copy.prescreen.people')).toBe(true);
    const html = list(editorReducer(editor(), { op: 'toggle', id: 't0-1' }));
    expect(has(html, 'copy.prescreen.people')).toBe(false);
    const warn = esc(S['copy.editor.warnFace']);
    expect(html).toMatch(new RegExp(`role="status" aria-live="polite"[^>]*>${warn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`));
    const id = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
  });
});

describe('PrescreenPanel', () => {
  const master = { width: 400, height: 300 } as HTMLCanvasElement;
  const panel = (state: PrescreenState) => renderToStaticMarkup(createElement(PrescreenPanel, { master, state, onOp: () => {}, onRetry: () => {} }));
  const done = (failed: readonly Tier0StepId[]): PrescreenState =>
    ({ kind: 'done', run: 1, sha256: 'a', lines: PENDING_LINES, failed, editor: editor([]) });

  it('a failed run shows the alert with Try again; a clean one does not', () => {
    const bad = panel(done(['faces']));
    expect(bad).toContain('role="alert"');
    expect(has(bad, 'ui.prescreen.failed')).toBe(true);
    expect(has(bad, 'ui.prescreen.retry')).toBe(true);
    expect(has(bad, 'ui.editor.notChecked.faces')).toBe(true);
    const ok = panel(done([]));
    expect(ok).not.toContain('role="alert"');
    expect(has(ok, 'ui.prescreen.failed')).toBe(false);
  });

  it('idle shows the progress list (all pending), focusable, so Try again keeps the focus on the step', () => {
    const html = panel({ kind: 'idle' });
    expect(html).toMatch(/<ul[^>]*tabindex="-1"[^>]*aria-busy="true"/);
    expect(html.match(/data-status="pending"/g)).toHaveLength(4);
  });
});

describe('paintPreview: only the rendered copy is drawn; a failure is solid black (fail closed)', () => {
  function fakeCanvas() {
    const calls: Array<[string, ...unknown[]]> = [];
    const ctx = {
      fillStyle: '',
      drawImage: (...a: unknown[]) => calls.push(['drawImage', ...a]),
      fillRect: (...a: unknown[]) => calls.push(['fillRect', ctx.fillStyle, ...a]),
    };
    return { c: { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement, calls };
  }
  const master = { width: 3000, height: 1500 } as HTMLCanvasElement;

  it('ok: draws the rendered cloud frame (≤ 1536 px), never the master, and frees the copy', () => {
    const { c, calls } = fakeCanvas();
    const rendered = { width: 1536, height: 768 } as HTMLCanvasElement;
    const render = vi.fn((_m: HTMLCanvasElement, _f: unknown, _r: unknown) => rendered);
    expect(paintPreview(c, master, [{ x: 1, y: 1, w: 9, h: 9 }], render)).toBe('ok');
    expect(render.mock.calls[0][0]).toBe(master);
    expect(render.mock.calls[0][1]).toMatchObject({ id: 'cloud', width: 1536, height: 768 });
    expect(calls).toEqual([['drawImage', rendered, 0, 0]]);
    expect([c.width, c.height]).toEqual([1536, 768]);
    expect([rendered.width, rendered.height]).toEqual([0, 0]);
  });

  it('a render that throws: solid black over the whole frame, and the master is never drawn', () => {
    const { c, calls } = fakeCanvas();
    expect(paintPreview(c, master, [], () => { throw new Error('mask painted nothing'); })).toBe('blackout');
    expect(calls).toEqual([['fillRect', '#000', 0, 0, 1536, 768]]);
  });
});
