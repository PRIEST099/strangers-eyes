// web/src/ui/components/ImportDropzone.tsx: SCR-05 import (T-053, AC-100, AC-103). A file picker, drag and drop, and
// paste (Ctrl/Cmd+V) of an image. There is NO URL input anywhere (R8): a dropped or pasted link or text, or an image
// that arrives with its web address, shows copy.import.noUrl and starts nothing. One photo per check (the first image
// file). The drop area is a real button that opens the picker, so it is keyboard reachable with the global focus ring.
// ONE always-mounted aria-live region carries every status: working, the error, or "Photo ready" plus the P1 GPS
// warning, so each change is announced and a new attempt replaces what the previous photo showed. The status is
// OWNED BY THE PARENT (screens/Check.tsx keeps it next to the master): this component mounts only while the Import step
// is shown, so a step round-trip must show the panel that matches the stored master, not an idle dropzone. The
// decisions are pure functions in ui/importTransfer.ts. The original file is handed to tier0/importPhoto and never kept.
import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { t } from '../../core/strings';
import type { GpsPinLike } from '../../tier0/gpsWarning';
import { importPhoto, type ImportedPhoto } from '../../tier0/importPhoto';
import {
  importAndSettle, pickFromTransfer, pickStep, refuseDragOutsideZone, statusLines, type ImportStatus, type TransferPick,
} from '../importTransfer';
import { Art } from './Art';
import { Icon } from './Icon';

export interface ImportDropzoneProps {
  /**
   * The active vault's pins, awaited when an import starts (the vault may still be unsealing). Used only by the local
   * GPS warning (S0). Should never reject; if it does, the warning is gpsFound only.
   */
  getPins: () => Promise<readonly GpsPinLike[]>;
  /**
   * The step's status, owned by the parent so it outlives this component (it is unmounted while another step is
   * shown). It must describe the photo the parent holds: `ready` exactly while that photo is set.
   */
  status: ImportStatus;
  /** Every status change: busy on a new attempt, then the error or `ready` (with the GPS warning lines). */
  onStatus: (status: ImportStatus) => void;
  /**
   * The new photo once it is ready, or null as soon as a new drop, paste or pick replaces the current one. Called
   * with the matching onStatus, even if the step was left while the photo was being prepared.
   */
  onPhoto: (photo: ImportedPhoto | null) => void;
}

/** Files and types of a drop or paste. Text payloads are never read: their presence (types) is enough. */
function transferOf(dt: DataTransfer): { files: File[]; types: string[] } {
  let files = Array.from(dt.files);
  if (files.length === 0) {
    files = Array.from(dt.items)
      .filter((i) => i.kind === 'file')
      .map((i) => i.getAsFile())
      .filter((x): x is File => x !== null);
  }
  return { files, types: Array.from(dt.types) };
}

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement);

export function ImportDropzone({ getPins, status, onStatus, onPhoto }: ImportDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Set synchronously, so a second paste in the same tick is refused before the parent re-renders with `busy`. After
  // a step round-trip during an import this mount's ref is false, and the parent's `busy` status refuses picks instead.
  const busy = useRef(false);
  const [dragging, setDragging] = useState(false);
  const statusId = useId();

  // The result always reaches the parent, even if this step was left meanwhile: the parent outlives this component,
  // and its `busy` status must settle (to ready or an error) or the step would refuse every later pick. The settle
  // step is ui/importTransfer.importAndSettle (Node-tested): the parent's callbacks go to it unwrapped, never behind a
  // "still mounted?" guard. ui/checkState.test.ts drives this component through an unmount mid-import to pin that.
  const run = useCallback(async (file: File) => {
    busy.current = true;
    try {
      await importAndSettle(file, { getPins, importFn: importPhoto, onPhoto, onStatus });
    } finally {
      busy.current = false;
    }
  }, [getPins, onPhoto, onStatus]);

  const handle = useCallback((pick: TransferPick<File>) => {
    const step = pickStep(busy.current || status.kind === 'busy', pick);
    if (step.clearPhoto) onPhoto(null);
    if (step.status) onStatus(step.status);
    if (step.start) void run(step.start);
  }, [onPhoto, onStatus, run, status.kind]);

  // Paste anywhere on the page while the import step is shown (not into a text field). A drag outside the zone is
  // refused (no copy cursor), so the browser never opens a dropped file or follows a dropped link.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target) || !e.clipboardData) return;
      const pick = pickFromTransfer(transferOf(e.clipboardData));
      if (pick.kind === 'none') return;
      e.preventDefault();
      handle(pick);
    };
    const onWindowDragOver = (e: globalThis.DragEvent) => refuseDragOutsideZone(e);
    const onWindowDrop = (e: globalThis.DragEvent) => e.preventDefault();
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragover', onWindowDragOver);
    window.addEventListener('drop', onWindowDrop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragover', onWindowDragOver);
      window.removeEventListener('drop', onWindowDrop);
    };
  }, [handle]);

  const onDragOver = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dragging) setDragging(true);
  };
  const onDragLeave = (e: DragEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    handle(pickFromTransfer(transferOf(e.dataTransfer)));
  };

  const lines = statusLines(status);
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = ''; // the same file can be chosen again after an error
          handle(pickFromTransfer({ files, types: files.length ? ['Files'] : [] }));
        }}
      />
      <button
        type="button"
        aria-describedby={statusId}
        aria-busy={status.kind === 'busy'}
        data-dragging={dragging ? 'true' : undefined}
        onClick={() => { if (!busy.current && status.kind !== 'busy') inputRef.current?.click(); }}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={
          'flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-stage border-2 border-dashed p-8 ' +
          'text-center text-body transition-colors duration-150 sm:flex-row sm:gap-6 sm:p-6 sm:text-left ' +
          (dragging ? 'border-accent bg-surface-2' : 'border-line-strong bg-surface hover:bg-surface-2')
        }
      >
        {/* D-170: decorative; the drop copy below says what to do. */}
        <Art name="check" eager className="aspect-[4/3] w-40 shrink-0 sm:w-48" />
        <span className="flex flex-col items-center gap-3 sm:items-start">
          <span aria-hidden="true" className="inline-flex size-10 items-center justify-center rounded-card bg-surface-3 text-fg">
            <Icon name="arrowRight" className="size-5 rotate-90" />
          </span>
          <span className="max-w-sm font-medium text-fg">{t('copy.import.drop')}</span>
        </span>
      </button>
      <div
        id={statusId}
        role="status"
        aria-live="polite"
        data-state={status.kind}
        className={
          status.kind === 'error' ? 'min-h-5 text-small font-medium text-danger-line'
            : status.kind === 'ready' ? 'flex flex-col gap-2 rounded-card border border-line bg-surface-2 p-4 text-small'
              : 'min-h-5 text-small text-muted'
        }
      >
        {lines.map((m, i) => (
          <p key={`${m.id}:${i}`} className={status.kind === 'ready' ? (i === 0 ? 'font-medium' : 'text-fg') : undefined}>
            {t(m.id, m.params)}
          </p>
        ))}
      </div>
    </div>
  );
}
