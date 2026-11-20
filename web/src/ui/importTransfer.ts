// web/src/ui/importTransfer.ts: what a drop or a paste hands the import step, and what the dropzone shows next
// (SPEC SCR-05, SR-06, AC-100; T-053). Pure, so it is unit-tested in Node; ImportDropzone only interprets it.
// Local files only: a link or text (text/uri-list, text/plain, text/html…) with no file is copy.import.noUrl, and so
// is an image that arrives WITH its web address (dragged from another tab, or "Copy image" on a website). Nothing
// here reads, opens or fetches a URL (R8 guards the component).
import type { StringId } from '../core/strings';
import { gpsWarningCopy, type CopyMessage, type GpsPinLike } from '../tier0/gpsWarning';
import type { ImportedPhoto, ImportResult } from '../tier0/importPhoto';

/** The parts of a DataTransfer item this decision needs. */
export interface FileLike { type: string }
export interface TransferLike<F extends FileLike> {
  /** Files carried by the drop or paste, in order (DataTransfer.files, or items of kind "file"). */
  files: readonly F[];
  /** DataTransfer.types, e.g. ["Files"], ["text/plain"], ["text/uri-list", "text/html", "Files"]. */
  types: readonly string[];
  /** Optional text payload; only its presence matters. */
  text?: string;
}
export type TransferPick<F extends FileLike> = { kind: 'file'; file: F } | { kind: 'noUrl' } | { kind: 'none' };

/**
 * Types that mean "this came from a web page": the image's address or the page's markup travels with the file. A
 * file dragged from Finder / Explorer / Photos, a picked file and a pasted screenshot carry "Files" only.
 * (Firefox adds text/x-moz-url and application/x-moz-file-promise-url to a web-image drag.)
 */
const WEB_SOURCE_TYPES = new Set(['text/uri-list', 'text/html', 'text/x-moz-url', 'application/x-moz-file-promise-url']);
const fromWebPage = (types: readonly string[]) => types.some((ty) => WEB_SOURCE_TYPES.has(ty.toLowerCase()));

/**
 * One photo per check: the first file whose MIME type is image/*, otherwise the first file of any type (the
 * magic-byte sniffer then decides: a non-image is copy.import.unsupported; a HEIC with an empty type still works).
 * A file that arrives with a web address or page markup → noUrl (SR-06: local files only). No file but some text or
 * link data → noUrl. Nothing at all → none (ignored).
 */
export function pickFromTransfer<F extends FileLike>(t: TransferLike<F>): TransferPick<F> {
  if (t.files.length > 0) {
    if (fromWebPage(t.types)) return { kind: 'noUrl' };
    const image = t.files.find((f) => f.type.toLowerCase().startsWith('image/'));
    return { kind: 'file', file: image ?? t.files[0] };
  }
  const data = t.types.some((ty) => ty !== 'Files') || (t.text ?? '').trim() !== '';
  return data ? { kind: 'noUrl' } : { kind: 'none' };
}

// ---------------------------------------------------------------- the dropzone's one status line (aria-live)

/**
 * The dropzone's single, always-mounted live region. `ready` carries the "Photo ready" line and the P1 GPS warning,
 * so a later attempt REPLACES them (never an error next to a stale ready panel) and screen readers hear each change.
 * The Check screen owns it, next to the master, so it survives the dropzone unmounting on a step round-trip.
 */
export type ImportStatus =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'error'; copyId: StringId }
  | { kind: 'ready'; lines: CopyMessage[] };

/** Before any attempt (and the status a new Check screen starts with). */
export const IMPORT_IDLE: ImportStatus = Object.freeze({ kind: 'idle' });

/** What a drop, paste or pick does. `clearPhoto`: the previous photo is no longer this check's photo. */
export interface PickStep<F> { status: ImportStatus | null; clearPhoto: boolean; start: F | null }

/**
 * While an import is being prepared every new pick is ignored (one photo per check). `none` changes nothing. Any
 * other pick replaces the previous photo at once, before it is known whether the new one is accepted.
 */
export function pickStep<F extends FileLike>(busy: boolean, pick: TransferPick<F>): PickStep<F> {
  if (busy || pick.kind === 'none') return { status: null, clearPhoto: false, start: null };
  if (pick.kind === 'noUrl') return { status: { kind: 'error', copyId: 'copy.import.noUrl' }, clearPhoto: true, start: null };
  return { status: { kind: 'busy' }, clearPhoto: true, start: pick.file };
}

/** The status after importPhoto settles (`crash`: it threw, which it should never do). */
export function resultStatus(r: ImportResult | 'crash'): ImportStatus {
  if (r === 'crash') return { kind: 'error', copyId: 'copy.import.unsupported' };
  if (!r.ok) return { kind: 'error', copyId: r.copyId };
  return {
    kind: 'ready',
    lines: [{ id: 'ui.import.ready', params: { w: r.width, h: r.height } }, ...(r.gpsWarning ? gpsWarningCopy(r.gpsWarning) : [])],
  };
}

// ---------------------------------------------------------------- one import, always settled

/** What importAndSettle needs. ImportDropzone passes its own props and tier0/importPhoto, unchanged. */
export interface SettleDeps<F> {
  /** The active vault's pins (S0, for the local GPS warning only). A rejection or a throw means no pins (gpsFound only). */
  getPins: () => Promise<readonly GpsPinLike[]>;
  importFn: (file: F, opts: { pins: readonly GpsPinLike[] }) => Promise<ImportResult>;
  onPhoto: (photo: ImportedPhoto | null) => void;
  onStatus: (status: ImportStatus) => void;
}

/**
 * Import one file and settle the parent, ALWAYS: on success onPhoto(photo) and then onStatus(ready); on a typed error,
 * or an importFn that throws (it never should), onStatus with the error and no onPhoto. There is no early-return path
 * and no "still mounted?" check: the parent (screens/Check.tsx) outlives the dropzone, and its `busy` status must settle
 * or the Import step would refuse every later pick after the user left the step mid-import. Returns what it reported.
 */
export async function importAndSettle<F>(file: F, d: SettleDeps<F>): Promise<ImportStatus> {
  let pins: readonly GpsPinLike[];
  try {
    pins = await d.getPins();
  } catch {
    pins = [];
  }
  let result: ImportResult | 'crash';
  try {
    result = await d.importFn(file, { pins });
  } catch {
    result = 'crash';
  }
  const status = resultStatus(result);
  if (result !== 'crash' && result.ok) d.onPhoto(result);
  d.onStatus(status);
  return status;
}

/** The lines the live region shows for a status (none when idle). */
export function statusLines(s: ImportStatus): CopyMessage[] {
  switch (s.kind) {
    case 'idle': return [];
    case 'busy': return [{ id: 'ui.import.working' }];
    case 'error': return [{ id: s.copyId }];
    case 'ready': return s.lines;
  }
}

// ---------------------------------------------------------------- drags that miss the drop zone

/** The parts of a dragover event the window-level handler needs. */
export interface DragOverLike {
  defaultPrevented: boolean;
  preventDefault(): void;
  dataTransfer: { dropEffect: string } | null;
}

/**
 * Window-level dragover while the import step is shown. The zone's own handler runs first and accepts the drag
 * (preventDefault + dropEffect "copy"); everywhere else the drag is cancelled with dropEffect "none", so the cursor
 * says "no drop here" and the browser neither opens a dropped file nor follows a dropped link.
 */
export function refuseDragOutsideZone(e: DragOverLike): void {
  if (e.defaultPrevented) return; // the drop zone accepted it
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
}
