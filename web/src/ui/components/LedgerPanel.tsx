// web/src/ui/components/LedgerPanel.tsx: the Cloud Ledger body (SCR-13), shown in the ≥1024 px rail or in the
// bottom sheet. T-063 (minimal, D-148): live counters from the in-memory Ledger, "What the cloud saw" (SCR-15: the
// exact JPEG of the most recent cloud send, its sha256 prefix as on the consent sheet, AC-130/AC-230, the prompt id,
// model and size), and the entries newest first. Entries hold IDs, kinds, hashes and numbers only (AC-045); the
// thumbnail is drawn from a blob whose OWN hash equals the entry's hash (core/ledgerImages.ts), never re-rendered from
// masks and never the original photo. Not built yet: the receipt download, the session filter, per-entry gate checks.
import { useEffect, useId, useState, type Ref } from 'react';
import type { SentImageStore } from '../../core/ledgerImages';
import { bytesText, engineName, hudRoute, jobName, lastCloudImageSend } from '../../core/ledgerView';
import type { LedgerCounters, LedgerEntry } from '../../core/types';
import { t } from '../../core/strings';
import { kilobytes } from '../layout';
import { Badge } from './Badge';

export interface LedgerPanelProps {
  counters: LedgerCounters;
  /** Newest last (as the Ledger keeps them). */
  entries?: readonly LedgerEntry[];
  images?: SentImageStore | null;
  /** Rail only: its own heading (focus target of the header's Ledger button). In the sheet, the sheet title is the heading. */
  headingId?: string;
  headingRef?: Ref<HTMLHeadingElement>;
}

/** An object URL for the blob while mounted (revoked on change and unmount). */
function useBlobUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

function CloudSaw({ entries, images }: { entries: readonly LedgerEntry[]; images: SentImageStore | null }) {
  const sent = lastCloudImageSend(entries);
  const sha = sent?.imageSha256[0] ?? null;
  const blob = sha && images ? images.get(sha) : null;
  const url = useBlobUrl(blob);
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} data-cloud-saw={sha ?? 'none'} className="flex flex-col gap-2">
      <h3 id={titleId} className="font-semibold">{t('ui.cloudSaw.title')}</h3>
      {!sent || !sha ? (
        <p className="text-muted">{t('copy.cloudSaw.empty')}</p>
      ) : (
        <>
          {url ? (
            <img
              src={url}
              alt={t('ui.cloudSaw.alt')}
              className="max-h-48 w-full rounded-md border border-line bg-surface-2 object-contain"
            />
          ) : (
            <p className="text-muted">{t('ui.cloudSaw.notKept')}</p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-xs">
            <dt className="text-muted">{t('ui.cloudSaw.sha')}</dt>
            <dd data-sha-prefix={sha.slice(0, 8)}>{sha.slice(0, 8)}</dd>
            <dt className="text-muted">{t('ui.cloudSaw.prompt')}</dt>
            <dd>{sent.promptVersion ?? '—'}</dd>
            <dt className="text-muted">{t('ui.cloudSaw.model')}</dt>
            <dd className="break-all">{sent.model}</dd>
            <dt className="text-muted">{t('ui.cloudSaw.size')}</dt>
            <dd>{bytesText(blob?.size ?? sent.bytesOut)}</dd>
          </dl>
        </>
      )}
    </section>
  );
}

export function LedgerPanel({ counters: c, entries = [], images = null, headingId, headingRef }: LedgerPanelProps) {
  const newestFirst = [...entries].reverse();
  return (
    <div className="flex flex-col gap-4 text-sm">
      {headingId && (
        // `focus:` rather than `focus-visible:`: the header's Ledger button moves focus here even after a mouse click,
        // and the ring is the only sign that anything happened.
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="rounded-md text-base font-semibold outline-offset-4 focus:outline-2 focus:outline-focus"
        >
          {t('ui.ledger.title')}
        </h2>
      )}
      <div className="rounded-lg border border-line bg-surface-2 p-3">
        <p className="font-semibold">{t('copy.ledger.counters', { f: c.facesSent, v: c.vaultItemsSent })}</p>
        <p className="text-xs text-muted">{t('ui.ledger.checkedNote')}</p>
        <p className="mt-1 text-muted" data-counter="traffic">
          {t('ui.ledger.traffic', {
            unique: c.uniqueImages,
            n: c.cloudRequests,
            kb: t('ui.unit.kb', { n: kilobytes(c.bytesSent) }),
          })}
        </p>
        <p className="mt-1 text-muted" data-counter="local">
          {t('ui.ledger.local', { k: c.onDeviceCalls, r: c.rulesChecks, b: c.blocked })}
        </p>
      </div>
      <CloudSaw entries={entries} images={images} />
      {newestFirst.length === 0 ? (
        <p className="text-muted">{t('ui.ledger.empty')}</p>
      ) : (
        <ol aria-label={t('ui.ledger.entries')} className="flex flex-col divide-y divide-line">
          {newestFirst.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-xs">
              <span className="font-semibold">{jobName(e.job)}</span>
              <span className="text-muted">[{e.payloadClass}]</span>
              {e.status === 'done' ? <Badge route={hudRoute(e)} /> : <span className="text-muted">{t('ui.hud.running')}</span>}
              {e.status === 'done' && (
                <span className="text-muted">
                  {engineName(e.model)} · {bytesText(e.bytesOut)}
                  {e.promptVersion ? ` · ${e.promptVersion}` : ''}
                  {e.imageSha256.length > 0 && e.imagesOut > 0 ? ` · ${t('ui.cloudSaw.sha')} ${e.imageSha256[0].slice(0, 8)}` : ''}
                  {e.blocked ? ` · ${e.blocked.reason}` : ''}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="border-t border-line pt-3 text-xs text-muted">{t('copy.ledger.otherTraffic')}</p>
    </div>
  );
}
