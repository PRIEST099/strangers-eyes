// web/src/ui/check/ExportCard.tsx: "Save a covered copy" (SPEC SCR-12 P0 export; T-081, D-185). The parent's last
// step: the photo with every mask (and the crop) applied, re-encoded at master size with no hidden data, checked by the
// same readers as the consent sheet (no APP1/APP13/GPS, 0 faces, 0 vault words; anything they still find is masked
// first), shown as the EXACT bytes that will be saved, then shared (Web Share) or downloaded. Made on this device;
// nothing is sent. A reader failure means nothing is offered (fail closed). Copy says "covered", never "safe".
import { useEffect, useRef, useState } from 'react';
import type { DryRun } from '../../ai/preflight';
import { t } from '../../core/strings';
import type { PxRect, Verdict } from '../../core/types';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { EYEBROW } from '../components/surface';
import { kilobytes } from '../layout';
import { canShareFile, downloadBlob, exportFilename, shareFile } from './exportFile';
import { FAILURE_COPY } from './sendFlow';

export interface ExportCardProps {
  master: HTMLCanvasElement | null;
  /** Every mask applied so far (master px): the candidate's, the consent dry run's and every fix. */
  masks: readonly PxRect[];
  crop: PxRect | null;
  /** The latest result still places the photo near one of the user's places: say so next to the save button. */
  stillNear?: boolean;
  /** No cloud check ran (the pre-screen's "Just clean and export"). */
  noCloud?: boolean;
  /** Injectable for tests; defaults to the export dry run in runSend (lazy-loaded). */
  check?: (master: HTMLCanvasElement, masks: readonly PxRect[], crop: PxRect | null) => Promise<DryRun>;
}

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ready'; dry: DryRun; file: File; url: string }
  | { kind: 'failed'; dry: DryRun | null };

/** The guess lands within 5 km of one of the user's pins (code bands, never the model): shown next to Save. */
export function nearAPin(v: Pick<Verdict, 'pinBands'>): boolean {
  return v.pinBands.some((p) => p.band === 'street' || p.band === 'neighbourhood' || p.band === 'district');
}

/** A React key for the card: any change to a mask's geometry or the crop remounts it (drops a copy built from old masks). */
export function maskKey(masks: readonly PxRect[], crop: PxRect | null): string {
  const r = (m: PxRect) => `${m.x},${m.y},${m.w},${m.h}`;
  return `${masks.map(r).join(';')}|${crop ? r(crop) : ''}`;
}

/** The export may be offered only when every check passed on these exact bytes (AC-260). */
export function exportOk(dry: DryRun): boolean {
  return dry.failed.length === 0 && dry.facesVisible === 0 && dry.vaultVisible === 0;
}

export function ExportCard({ master, masks, crop, stillNear = false, noCloud = false, check }: ExportCardProps) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [shared, setShared] = useState<'saved' | 'shared' | null>(null);
  const live = useRef(true);
  // Set on every mount (StrictMode mounts, unmounts and mounts again in development).
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => () => { if (state.kind === 'ready') URL.revokeObjectURL(state.url); }, [state]);

  const run = async () => {
    if (!master) return;
    setShared(null);
    setState({ kind: 'checking' });
    let dry: DryRun | null = null;
    try {
      dry = await (check ?? (async (m, k, c) => (await import('./runSend')).runExportCheck(m, k, c)))(master, masks, crop);
    } catch {
      dry = null;
    }
    if (!live.current) return;
    if (!dry || !exportOk(dry)) { setState({ kind: 'failed', dry }); return; }
    const file = new File([dry.image.jpeg], exportFilename(), { type: 'image/jpeg' });
    setState({ kind: 'ready', dry, file, url: URL.createObjectURL(file) });
  };

  const nav = typeof navigator !== 'undefined' ? (navigator as unknown as Parameters<typeof canShareFile>[0]) : undefined;
  const shareable = state.kind === 'ready' && canShareFile(nav, state.file);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface-2 p-4" data-testid="export-card">
      <p className="flex items-center gap-2 text-title font-semibold"><Icon name="download" className="size-5" />{t('ui.export.title')}</p>
      <p className="text-body">{t(noCloud ? 'ui.export.bodyNoCloud' : 'ui.export.body')}</p>
      {stillNear && <p className="flex items-start gap-2 text-body"><Icon name="alert" className="mt-0.5 size-5 shrink-0 text-verdict-amber" />{t('ui.export.stillNear')}</p>}
      {state.kind === 'idle' && (
        <Button variant="secondary" className="self-start" data-action="export" disabled={!master} onClick={() => void run()}>{t('ui.export.make')}</Button>
      )}
      {state.kind === 'checking' && <p role="status" className="text-body text-muted">{t('ui.export.checking')}</p>}
      {state.kind === 'failed' && (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-card border border-verdict-red bg-verdict-red-bg p-3 text-body">
          <p>{t('ui.export.failed')}</p>
          {state.dry?.failed.map((f) => <p key={f} className="text-small">{t(FAILURE_COPY[f])}</p>)}
          <Button onClick={() => void run()}>{t('ui.prescreen.retry')}</Button>
        </div>
      )}
      {state.kind === 'ready' && (
        <>
          <figure className="flex flex-col gap-2">
            <div className="mx-auto w-fit max-w-full overflow-hidden rounded-card ring-1 ring-line-strong">
              <img src={state.url} alt={t('ui.export.imageAlt')} width={state.dry.image.frame.width} height={state.dry.image.frame.height} className="block h-auto max-h-[50vh] w-auto max-w-full" />
            </div>
            <figcaption className="font-mono text-small text-muted tabular-nums" data-testid="export-meta">
              {t('ui.export.meta', { w: state.dry.image.frame.width, h: state.dry.image.frame.height, kb: kilobytes(state.dry.bytes), name: state.file.name })}
            </figcaption>
          </figure>
          <p className={`${EYEBROW} flex items-center gap-2`} data-testid="export-check"><Icon name="check" className="size-4 text-verdict-teal" />{t('copy.export.check')}</p>
          {state.dry.autoMasked > 0 && <p className="text-body">{t('ui.export.autoMasked', { n: state.dry.autoMasked })}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {shareable && (
              <Button variant="primary" data-action="export-share" onClick={() => {
                if (state.kind !== 'ready' || !nav) return;
                void shareFile(nav, state.file).then((r) => { if (live.current && r === 'shared') setShared('shared'); });
              }}>
                <Icon name="share" className="size-5" />{t('ui.export.share')}
              </Button>
            )}
            <Button variant={shareable ? 'secondary' : 'primary'} data-action="export-save" onClick={() => {
              if (state.kind !== 'ready') return;
              downloadBlob(state.file, state.file.name);
              setShared('saved');
            }}>
              <Icon name="download" className="size-5" />{t('ui.export.save')}
            </Button>
          </div>
          {shared && <p role="status" className="text-small text-muted">{t(shared === 'shared' ? 'ui.export.sharedNote' : 'ui.export.savedNote')}</p>}
        </>
      )}
      <p className="text-small text-muted">{t('ui.export.note')}</p>
    </div>
  );
}
