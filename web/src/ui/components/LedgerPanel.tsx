// web/src/ui/components/LedgerPanel.tsx: the Cloud Ledger body (SCR-13), shown in the ≥1024 px rail or in the
// bottom sheet. T-063 (minimal, D-148), redesigned per docs/DESIGN.md §5.6:
// 1. Zero Tiles (aria-hidden; they repeat the counters sentence below): faces and vault items sent, teal with a lock
//    at 0, red with an alert above 0.
// 2. The unchanged counters sentence, checked note and the `data-counter` lines.
// 3. "What the cloud saw" (SCR-15, <CloudCopy variant="rail">): the exact JPEG of the most recent cloud send, its
//    sha256 prefix as on the consent sheet (AC-130/AC-230), prompt id, model and size.
// 4. The entries newest first, each with a lane dot (laneOf(hudRoute(e))) and its route badge.
// Settings › Technical details (off by default) adds each entry's payload class, prompt version, sha256 prefix and raw
// model id and gate code; off, an entry reads `Attacker  IN CLOUD  Gemini · 48 KB`. The route badge always shows.
// Entries hold IDs, kinds, hashes and numbers only (AC-045). Not built yet: the receipt download, the session filter,
// per-entry gate checks.
import type { Ref } from 'react';
import type { SentImageStore } from '../../core/ledgerImages';
import { bytesText, engineName, hudRoute, jobName } from '../../core/ledgerView';
import type { LedgerCounters, LedgerEntry } from '../../core/types';
import { t, type StringId } from '../../core/strings';
import { useTechDetails } from '../hooks/usePrefs';
import { laneOf } from '../hud/lanes';
import { kilobytes } from '../layout';
import { Badge } from './Badge';
import { CloudCopy } from './CloudCopy';
import { Icon } from './Icon';

export interface LedgerPanelProps {
  counters: LedgerCounters;
  /** Newest last (as the Ledger keeps them). */
  entries?: readonly LedgerEntry[];
  /** The sent-image store; omitted → the app's live store. */
  images?: SentImageStore | null;
  /** Rail only: its own heading (focus target of the header's Ledger button). In the sheet, the sheet title is the heading. */
  headingId?: string;
  headingRef?: Ref<HTMLHeadingElement>;
  /** Tests only: override Settings › Technical details. */
  tech?: boolean;
}

/** One Zero Tile. Decorative copy of the counters sentence (the real <p> follows), so the grid is aria-hidden. */
function ZeroTile({ value, label }: { value: number; label: StringId }) {
  const sent = value > 0;
  return (
    <div
      className={`flex min-w-0 flex-col gap-1 rounded-card p-3 ${
        sent ? 'bg-verdict-red-bg text-verdict-red' : 'bg-verdict-teal-bg text-verdict-teal'
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-stat-sm font-bold tabular-nums">{value}</span>
        <Icon name={sent ? 'alert' : 'lock'} className="size-5" />
      </span>
      <span className="text-small font-medium">{t(label)}</span>
    </div>
  );
}

export function LedgerPanel({ counters: c, entries = [], images, headingId, headingRef, tech: givenTech }: LedgerPanelProps) {
  const prefTech = useTechDetails();
  const tech = givenTech ?? prefTech;
  const newestFirst = [...entries].reverse();
  return (
    <div className="flex flex-col gap-4 text-small">
      {headingId && (
        // `focus:` rather than `focus-visible:`: the header's Ledger button moves focus here even after a mouse click,
        // and the ring is the only sign that anything happened.
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="rounded-md text-title font-semibold outline-offset-4 focus:outline-2 focus:outline-focus"
        >
          {t('ui.ledger.title')}
        </h2>
      )}
      <div aria-hidden="true" className="grid grid-cols-2 gap-2">
        <ZeroTile value={c.facesSent} label="ui.tile.faces" />
        <ZeroTile value={c.vaultItemsSent} label="ui.tile.vault" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-small font-semibold">{t('copy.ledger.counters', { f: c.facesSent, v: c.vaultItemsSent })}</p>
        <p className="text-small text-muted">{t('ui.ledger.checkedNote')}</p>
        <p className="text-small text-muted tabular-nums" data-counter="traffic">
          {t('ui.ledger.traffic', {
            unique: c.uniqueImages,
            n: c.cloudRequests,
            kb: t('ui.unit.kb', { n: kilobytes(c.bytesSent) }),
          })}
        </p>
        <p className="text-small text-muted tabular-nums" data-counter="local">
          {t('ui.ledger.local', { k: c.onDeviceCalls, r: c.rulesChecks, b: c.blocked })}
        </p>
      </div>
      <CloudCopy variant="rail" entries={entries} images={images} tech={tech} />
      {newestFirst.length === 0 ? (
        <p className="text-muted">{t('ui.ledger.empty')}</p>
      ) : (
        <ol aria-label={t('ui.ledger.entries')} className="flex flex-col divide-y divide-line">
          {newestFirst.map((e) => {
            const route = e.status === 'done' ? hudRoute(e) : null;
            const lane = route ? laneOf(route) : null;
            return (
              <li
                key={e.id}
                className={`flex flex-wrap items-center gap-x-2 gap-y-1 py-2 ${
                  route === 'IN_CLOUD' ? 'border-l-2 border-l-route-cloud-fill pl-2' : ''
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`size-1.5 shrink-0 rounded-full ${
                    lane === 'cloud' ? 'bg-route-cloud-fill' : lane === 'device' ? 'bg-route-device-fill' : 'border border-line-strong'
                  }`}
                />
                <span className="font-semibold">{jobName(e.job, tech)}</span>
                {tech && <span className="font-mono text-hud text-muted">[{e.payloadClass}]</span>}
                {route ? <Badge route={route} /> : <span className="text-muted">{t('ui.hud.running')}</span>}
                {route && (
                  <span className="w-full min-w-0 break-words text-muted tabular-nums">
                    {engineName(e.model, tech)} · {bytesText(e.bytesOut)}
                    {tech && e.promptVersion ? ` · ${e.promptVersion}` : ''}
                    {tech && e.imageSha256.length > 0 && e.imagesOut > 0 ? ` · ${t('ui.cloudSaw.sha')} ${e.imageSha256[0].slice(0, 8)}` : ''}
                    {e.blocked ? ` · ${tech ? e.blocked.reason : t('ui.hud.tagPlain.blocked')}` : ''}
                    {e.error ? ` · ${tech ? e.error : t('ui.hud.tagPlain.error')}` : ''}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="border-t border-line pt-3 text-small text-muted">{t('copy.ledger.otherTraffic')}</p>
    </div>
  );
}
