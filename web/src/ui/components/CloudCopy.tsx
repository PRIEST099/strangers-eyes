// web/src/ui/components/CloudCopy.tsx: the exact redacted copy the cloud received (SCR-15, docs/DESIGN.md §5.6). It
// shows ONLY the bytes kept by the sent-image store (core/ledgerImages.ts, via useSentImages()) for the most recent
// IN_CLOUD send in the Ledger, looked up by the hash the gate computed (AC-230): never the original photo, never a
// re-render from masks. Variants:
// - `stage`: the Check stage's left column (ring in the cloud colour, IN CLOUD badge, caption, sha/model).
// - `rail`: the Ledger's "What the cloud saw" block. The ONLY variant that renders `data-cloud-saw`, so tests see it once.
// - `thumb`: a 64 px decorative thumbnail (alt="") for the lanes and the packet; a drawn "redacted copy" glyph until
//   something has been sent.
// `sessionId` scopes the stage and thumb to one check (the rail stays global: it is the whole Ledger).
// The object URL lives only while the component is mounted (revoked on change and unmount).
// When the newest attacker result is a CACHED replay (ledgerView.lastAttackReplayed), the stage and the rail say so in
// words (ui.cloudSaw.cached) instead of "Nothing has left this device" beside a result, or an earlier photo's copy.
// Settings › Technical details adds the sha256 prefix, the prompt version and the exact model id; off, the meta is
// "sent to Gemini" and the size.
import { useEffect, useId, useState } from 'react';
import type { SentImageStore } from '../../core/ledgerImages';
import { bytesText, engineName, lastAttackReplayed, lastCloudImageSend } from '../../core/ledgerView';
import { t } from '../../core/strings';
import type { LedgerEntry } from '../../core/types';
import { useTechDetails } from '../hooks/usePrefs';
import { useLedgerEntries, useSentImages } from '../hud/useLedger';
import { Badge } from './Badge';

export interface CloudCopyProps {
  variant: 'stage' | 'rail' | 'thumb';
  /** Thumb only: size override (the packet uses a 40×28 thumb). */
  className?: string;
  /** The Ledger panel passes its own entries and store; otherwise the app's live Ledger and sent-image store. */
  entries?: readonly LedgerEntry[];
  images?: SentImageStore | null;
  /** Scope to one check: only that session's IN_CLOUD send counts (stage and thumb). The rail (global Ledger) omits it.
   *  A blocked or CACHED send in this session then shows the empty state, never an earlier photo's copy. */
  sessionId?: string;
  /** Tests only: override Settings › Technical details. */
  tech?: boolean;
}

/** An object URL for the blob while mounted (revoked on change and unmount). */
function useBlobUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** A drawn stand-in (aria-hidden): a photo frame with a solid black mask, until a real copy exists. */
export function RedactedGlyph({ className = 'h-10 w-16' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" aria-hidden="true" className={`shrink-0 ${className}`} preserveAspectRatio="xMidYMid meet">
      <rect x="1" y="1" width="62" height="38" rx="6" fill="var(--se-surface-2)" stroke="var(--se-route-cloud-fill)" strokeWidth="1.5" />
      <path d="M6 33 20 21l9 8 8-6 21 10" fill="none" stroke="var(--se-line-strong)" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="38" y="7" width="16" height="11" fill="#000" stroke="var(--se-line-strong)" strokeWidth="1" />
    </svg>
  );
}

function Meta({ sha, entry, size, withPrompt, tech }: { sha: string; entry: LedgerEntry; size: number; withPrompt: boolean; tech: boolean }) {
  if (!tech) {
    return (
      // data-sha-prefix is a test hook only (not shown): the copy is still the hashed image (AC-230).
      <dl data-sha-prefix={sha.slice(0, 8)} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-small">
        <dt className="text-muted">{t('ui.cloudSaw.sentTo')}</dt>
        <dd>{engineName(entry.model, false)}</dd>
        <dt className="text-muted">{t('ui.cloudSaw.size')}</dt>
        <dd className="tabular-nums">{bytesText(size)}</dd>
      </dl>
    );
  }
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-hud">
      <dt className="text-muted">{t('ui.cloudSaw.sha')}</dt>
      <dd data-sha-prefix={sha.slice(0, 8)} className="tabular-nums">{sha.slice(0, 8)}</dd>
      {withPrompt && (
        <>
          <dt className="text-muted">{t('ui.cloudSaw.prompt')}</dt>
          <dd className="break-all">{entry.promptVersion ?? '—'}</dd>
        </>
      )}
      <dt className="text-muted">{t('ui.cloudSaw.model')}</dt>
      <dd className="break-all">{entry.model}</dd>
      {withPrompt && (
        <>
          <dt className="text-muted">{t('ui.cloudSaw.size')}</dt>
          <dd className="tabular-nums">{bytesText(size)}</dd>
        </>
      )}
    </dl>
  );
}

export function CloudCopy({ variant, className, entries: givenEntries, images: givenImages, sessionId, tech: givenTech }: CloudCopyProps) {
  const liveEntries = useLedgerEntries();
  const liveImages = useSentImages();
  const prefTech = useTechDetails();
  const tech = givenTech ?? prefTech;
  const entries = givenEntries ?? liveEntries;
  const images = givenImages === undefined ? liveImages : givenImages;
  const replayed = lastAttackReplayed(entries, sessionId);
  // A recording on screen: no copy of THIS result was sent, so no image is shown for it (not even an earlier photo's).
  const sent = replayed ? null : lastCloudImageSend(entries, sessionId);
  const sha = sent?.imageSha256[0] ?? null;
  const blob = sha && images ? images.get(sha) : null;
  const url = useBlobUrl(blob);
  const titleId = useId();

  if (variant === 'thumb') {
    const size = className ?? 'h-10 w-16';
    return url ? (
      <img src={url} alt="" className={`shrink-0 rounded-chip bg-mask object-cover ring-1 ring-route-cloud-fill ${size}`} />
    ) : (
      <RedactedGlyph className={size} />
    );
  }

  if (variant === 'stage') {
    return (
      <figure aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3">
        {!sent || !sha ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-line-strong bg-surface p-6 text-center">
            <RedactedGlyph className="h-12 w-20" />
            <p className="text-body text-muted" data-cloud-saw-replayed={replayed ? '' : undefined}>{t(replayed ? 'ui.cloudSaw.cached' : 'copy.cloudSaw.empty')}</p>
          </div>
        ) : url ? (
          <div className="overflow-hidden rounded-card bg-mask ring-2 ring-route-cloud-fill">
            <img src={url} alt={t('ui.cloudSaw.alt')} className="block max-h-[60vh] w-full object-contain" />
          </div>
        ) : (
          <p className="rounded-card border border-line bg-surface p-4 text-body text-muted">{t('ui.cloudSaw.notKept')}</p>
        )}
        <figcaption className="flex min-w-0 flex-col gap-2">
          <span className="flex flex-wrap items-center gap-2">
            <Badge route="IN_CLOUD" />
            <span id={titleId} className="text-title font-semibold">{t('ui.cloudSaw.title')}</span>
          </span>
          <span className="text-small text-muted">{t('ui.stage.caption')}</span>
          {sent && sha && <Meta sha={sha} entry={sent} size={blob?.size ?? sent.bytesOut} withPrompt={false} tech={tech} />}
        </figcaption>
      </figure>
    );
  }

  // rail
  return (
    <section aria-labelledby={titleId} data-cloud-saw={sha ?? 'none'} className="flex flex-col gap-2">
      <h3 id={titleId} className="text-title font-semibold">{t('ui.cloudSaw.title')}</h3>
      {!sent || !sha ? (
        <p className="flex items-center gap-3 text-small text-muted" data-cloud-saw-replayed={replayed ? '' : undefined}>
          <RedactedGlyph />
          {t(replayed ? 'ui.cloudSaw.cached' : 'copy.cloudSaw.empty')}
        </p>
      ) : (
        <>
          {url ? (
            <div className="overflow-hidden rounded-card bg-mask ring-1 ring-route-cloud-fill">
              <img src={url} alt={t('ui.cloudSaw.alt')} className="block max-h-48 w-full object-contain" />
            </div>
          ) : (
            <p className="text-small text-muted">{t('ui.cloudSaw.notKept')}</p>
          )}
          <Meta sha={sha} entry={sent} size={blob?.size ?? sent.bytesOut} withPrompt tech={tech} />
        </>
      )}
    </section>
  );
}
