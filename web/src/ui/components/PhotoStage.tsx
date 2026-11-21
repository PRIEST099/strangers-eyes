// web/src/ui/components/PhotoStage.tsx: the pre-screen photo with its masks (SPEC SCR-06 "Mask editor"; T-068, AC-113,
// AC-116). The picture is the CLOUD FRAME's own pixels: frames.renderFrame paints the solid masks on a copy of the
// master and downscales it to ≤ 1536 px, exactly as the Send step will (minus the JPEG). Masks are solid #000, never
// blur. A render that fails shows solid black, never the unmasked photo. The master is never modified.
// Over the picture (positions in % of the master, so it scales with the layout):
//   - items that are NOT masked get an outline: red for a high-severity flag or anything the user un-ticked,
//     amber for a possible identifier, dashed for an approximate (grid-cell) area;
//   - the user's masks are solid black buttons. Drag on the photo to add one; drag one to move it; drag its corner
//     handle to resize it. Keyboard: Tab to a mask (it is selected on focus), arrows move it, Shift+arrows resize it,
//     Alt for 1 px steps, Delete/Backspace removes it (focus returns to "Add mask"). "Add mask" adds a centred one.
// While a user mask is being dragged the picture is re-rendered without it, so its old place does not stay black.
import { useEffect, useMemo, useRef, useState, type RefObject, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { deriveFrame, renderFrame } from '../../core/frames';
import { t } from '../../core/strings';
import type { ImageFrame, PxRect } from '../../core/types';
import {
  dragRect, keyToOp, masksOf, moveRect, resizeRect, toImagePoint, warningOf, type EditorOp, type EditorState, type UserMask,
} from '../check/editor';
import { Button } from './Button';

export interface PhotoStageProps {
  master: HTMLCanvasElement;
  editor: EditorState;
  onOp: (op: EditorOp) => void;
  /** The Add mask button's ref, owned by the parent so the side list can return focus to it. */
  addButtonRef?: RefObject<HTMLButtonElement | null>;
}

type Pt = { x: number; y: number };
type Drag =
  | { kind: 'draw'; start: Pt; rect: PxRect }
  | { kind: 'move' | 'resize'; id: string; start: Pt; origin: PxRect; rect: PxRect };

/** Solid black, everywhere: what a failed render shows instead of the photo. */
function blackout(c: HTMLCanvasElement, w: number, h: number) {
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const ctx = c.getContext('2d');
  if (ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height); }
}

/**
 * Paint the cloud frame of `master` with `masks` into `out`. Only ever the RENDERED copy is drawn: if rendering or
 * drawing fails, `out` is solid black (fail closed), never the master. The rendered copy is always freed. Exported for
 * the tests (injectable `render`).
 */
export function paintPreview(
  out: HTMLCanvasElement, master: HTMLCanvasElement, masks: readonly PxRect[],
  render: (m: HTMLCanvasElement, f: ImageFrame, r: readonly PxRect[]) => HTMLCanvasElement = renderFrame,
): 'ok' | 'blackout' {
  const frame = deriveFrame('cloud', master.width, master.height);
  let rendered: HTMLCanvasElement | null = null;
  try {
    rendered = render(master, frame, masks);
    out.width = frame.width;
    out.height = frame.height;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(rendered, 0, 0);
    return 'ok';
  } catch {
    blackout(out, frame.width, frame.height);
    return 'blackout';
  } finally {
    if (rendered) { rendered.width = 0; rendered.height = 0; }
  }
}

export function PhotoStage({ master, editor, onOp, addButtonRef }: PhotoStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const ownAddRef = useRef<HTMLButtonElement>(null);
  const addRef = addButtonRef ?? ownAddRef;
  const [drag, setDrag] = useState<Drag | null>(null);
  const W = editor.width;
  const H = editor.height;
  const except = drag && drag.kind !== 'draw' ? drag.id : undefined;
  const masks = useMemo(() => masksOf(editor, { except }), [editor, except]);

  useEffect(() => {
    if (canvasRef.current) paintPreview(canvasRef.current, master, masks);
  }, [master, masks]);

  // The selected mask has the focus (a new mask, from a drag or the button, is selected when it is added).
  useEffect(() => {
    if (!editor.selected) return;
    const el = overlayRef.current?.querySelector<HTMLElement>(`[data-mask="${editor.selected}"]`);
    if (el && document.activeElement !== el) el.focus();
  }, [editor.selected]);

  const pct = (r: PxRect) => ({ left: `${(r.x / W) * 100}%`, top: `${(r.y / H) * 100}%`, width: `${(r.w / W) * 100}%`, height: `${(r.h / H) * 100}%` });
  const point = (e: ReactPointerEvent): Pt => {
    const box = overlayRef.current?.getBoundingClientRect();
    return box ? toImagePoint(e.clientX, e.clientY, box, W, H) : { x: 0, y: 0 };
  };
  const capture = (e: ReactPointerEvent) => {
    try { overlayRef.current?.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
  };

  const onBackgroundDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return; // a mask or its handle started its own drag
    e.preventDefault();
    capture(e);
    const p = point(e);
    onOp({ op: 'select', id: null });
    setDrag({ kind: 'draw', start: p, rect: { x: p.x, y: p.y, w: 0, h: 0 } });
  };
  const onMaskDown = (e: ReactPointerEvent, m: UserMask, kind: 'move' | 'resize') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    capture(e);
    (e.currentTarget.closest('[data-mask]') as HTMLElement | null)?.focus();
    setDrag({ kind, id: m.id, start: point(e), origin: m.rect, rect: m.rect });
  };
  /** The drag's rect with the pointer at `p`. */
  const rectAt = (d: Drag, p: Pt): PxRect => {
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    if (d.kind === 'draw') return dragRect(d.start, p);
    return d.kind === 'move' ? moveRect(d.origin, dx, dy, W, H) : resizeRect(d.origin, dx, dy, W, H);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, rect: rectAt(drag, point(e)) });
  };
  // The release point decides the rect (F-174): pointermove events are coalesced, so the last one seen may lag it.
  const onUp = (e: ReactPointerEvent) => {
    if (!drag) return;
    const rect = e.type === 'pointercancel' ? drag.rect : rectAt(drag, point(e));
    if (drag.kind === 'draw') onOp({ op: 'add', rect });
    else onOp({ op: 'set', id: drag.id, rect });
    setDrag(null);
  };

  const onMaskKey = (e: ReactKeyboardEvent, m: UserMask) => {
    const op = keyToOp(m.id, e.key, { shift: e.shiftKey, alt: e.altKey }, W, H);
    if (!op) return;
    e.preventDefault();
    onOp(op);
    if (op.op === 'remove') addRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button ref={addRef} onClick={() => onOp({ op: 'addDefault' })}>{t('ui.editor.addMask')}</Button>
      </div>
      <p id="stage-hint" className="text-sm text-muted">{t('ui.editor.hint')}</p>
      <div className="relative w-fit max-w-full self-start">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={t('ui.editor.stage')}
          className="block h-auto max-h-[70vh] w-auto max-w-full rounded-md bg-mask"
        />
        <div
          ref={overlayRef}
          data-testid="stage-overlay"
          className="absolute inset-0 cursor-crosshair touch-none select-none"
          onPointerDown={onBackgroundDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {editor.items.filter((it) => !it.clue.masked).map((it) => {
            const red = it.flag !== 'possible' || warningOf(it, editor) !== null; // amber only for a possible identifier
            return (
              <div
                key={it.clue.id}
                aria-hidden="true"
                data-flag={it.clue.id}
                className={`pointer-events-none absolute border-2 ${it.approximate ? 'border-dashed' : 'border-solid'} ${red ? 'border-verdict-red' : 'border-verdict-amber'}`}
                style={pct(it.clue.box)}
              />
            );
          })}
          {editor.userMasks.map((m) => {
            const r = drag && drag.kind !== 'draw' && drag.id === m.id ? drag.rect : m.rect;
            const selected = editor.selected === m.id;
            return (
              <button
                key={m.id}
                type="button"
                data-mask={m.id}
                aria-label={t('ui.editor.userMaskAria', { n: m.n, w: r.w, h: r.h })}
                aria-describedby="stage-hint"
                aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight Delete"
                className={`absolute cursor-move bg-mask ${selected ? 'outline-2 outline-offset-2 outline-focus' : 'outline-1 outline-line-strong'} outline`}
                style={pct(r)}
                onFocus={() => onOp({ op: 'select', id: m.id })}
                onKeyDown={(e) => onMaskKey(e, m)}
                onPointerDown={(e) => onMaskDown(e, m, 'move')}
              >
                <span
                  aria-hidden="true"
                  data-handle={m.id}
                  className="absolute right-0 bottom-0 size-4 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm border border-line-strong bg-surface"
                  onPointerDown={(e) => onMaskDown(e, m, 'resize')}
                />
              </button>
            );
          })}
          {drag?.kind === 'draw' && drag.rect.w > 0 && drag.rect.h > 0 && (
            <div aria-hidden="true" className="pointer-events-none absolute bg-mask outline-1 outline-focus outline" style={pct(drag.rect)} />
          )}
        </div>
      </div>
    </div>
  );
}
