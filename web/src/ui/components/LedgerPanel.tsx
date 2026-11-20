// web/src/ui/components/LedgerPanel.tsx: the Cloud Ledger body (SCR-13), shown in the ≥1024 px rail or in the
// bottom sheet. T-050 shell: real counters are all zero because nothing can be sent yet. T-063 adds the entries,
// the receipt and the "checked on every request" note once the gate writes LedgerEntry records.
import type { Ref } from 'react';
import type { LedgerCounters } from '../../core/types';
import { t } from '../../core/strings';
import { kilobytes } from '../layout';

export interface LedgerPanelProps {
  counters: LedgerCounters;
  /** Rail only: its own heading (focus target of the header's Ledger button). In the sheet, the sheet title is the heading. */
  headingId?: string;
  headingRef?: Ref<HTMLHeadingElement>;
}

export function LedgerPanel({ counters: c, headingId, headingRef }: LedgerPanelProps) {
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
        <p className="mt-1 text-muted">
          {t('ui.ledger.traffic', {
            unique: c.uniqueImages,
            n: c.cloudRequests,
            kb: t('ui.unit.kb', { n: kilobytes(c.bytesSent) }),
          })}
        </p>
        <p className="mt-1 text-muted">
          {t('ui.ledger.local', { k: c.onDeviceCalls, r: c.rulesChecks, b: c.blocked })}
        </p>
      </div>
      <p className="text-muted">{t('ui.ledger.empty')}</p>
      <p className="border-t border-line pt-3 text-xs text-muted">{t('copy.ledger.otherTraffic')}</p>
    </div>
  );
}
