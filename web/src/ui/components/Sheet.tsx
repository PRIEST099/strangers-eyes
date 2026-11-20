// web/src/ui/components/Sheet.tsx: an accessible modal sheet on the native <dialog> (AC-061).
// - showModal() makes the rest of the page inert, so focus stays inside the sheet (the browser's own UI aside).
// - Focus moves into the sheet on open and returns to the element that opened it on close.
// - Escape, the close button and a click on the backdrop all close it; the parent's `open` stays the truth.
// - A bottom sheet below 640 px, a centred dialog above. The slide-in is motion-safe only (AC-063).
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { t } from '../../core/strings';
import { Button } from './Button';
import { Icon } from './Icon';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Sheet({ open, onClose, title, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const downOnBackdrop = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  // Fires for every close: Escape, the button, the backdrop, or the parent setting open=false.
  const handleClose = () => {
    const el = returnTo.current;
    returnTo.current = null;
    if (el && el.isConnected) el.focus();
    onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={handleClose}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // Only a press that starts and ends on the backdrop closes (not a text selection dragged out of the sheet).
        if (downOnBackdrop.current && e.target === e.currentTarget) ref.current?.close();
        downOnBackdrop.current = false;
      }}
      className={
        'mx-0 mt-auto mb-0 max-h-[85dvh] w-full max-w-none overflow-hidden rounded-t-2xl border border-line bg-surface p-0 text-fg shadow-2xl ' +
        'motion-safe:open:animate-sheet-in sm:m-auto sm:max-w-lg sm:rounded-2xl'
      }
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-line py-1 pr-1 pl-4">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <Button variant="ghost" size="icon" aria-label={t('ui.close')} onClick={() => ref.current?.close()}>
            <Icon name="close" />
          </Button>
        </div>
        <div className="overflow-y-auto px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </dialog>
  );
}
