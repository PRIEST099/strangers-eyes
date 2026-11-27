// web/src/ui/judge/SealedAnswer.tsx: the sealed answer card and its stamp (Judge Mode "Prove it offline", D-182).
// The card holds the attacker's first answer, unchecked, until the judge opens it: "Open it offline" is enabled only
// while the browser reports no connection; "Open it now" is always there and gets no stamp. Copy in en.json (ui.seal.*).
import { t } from '../../core/strings';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { canOpenOffline, type SealCounts } from './seal';

export interface SealedAnswerProps {
  online: boolean;
  /** The app's own "Simulate offline" setting is on (it does not cut the network, so it does not count here). */
  simulated?: boolean;
  /** `offline` is true only for "Open it offline", which is only enabled with the connection off. */
  onOpen: (offline: boolean) => void;
}

export function SealedAnswer({ online, simulated = false, onOpen }: SealedAnswerProps) {
  const offlineOk = canOpenOffline(online);
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-card border border-line bg-surface-2 p-4" data-testid="sealed-answer">
      <p className="flex items-center gap-2 text-title font-semibold"><Icon name="lock" className="size-5" />{t('ui.seal.title')}</p>
      <p className="text-body">{t('ui.seal.body')}</p>
      <p
        className={`flex w-fit items-center gap-2 rounded-chip border px-2.5 py-1 font-mono text-caption font-bold tracking-[0.06em] ${offlineOk ? 'border-verdict-teal text-verdict-teal' : 'border-line text-muted'}`}
        data-connection={offlineOk ? 'off' : 'on'} role="status" aria-live="polite"
      >
        <Icon name={offlineOk ? 'offline' : 'cloud'} className="size-4" />
        {t(offlineOk ? 'ui.seal.connOff' : 'ui.seal.connOn')}
      </p>
      {simulated && online && <p className="text-small text-muted" data-testid="seal-simulated">{t('ui.seal.simulated')}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" data-action="open-offline" disabled={!offlineOk} aria-describedby={offlineOk ? undefined : 'seal-offline-why'} onClick={() => { if (canOpenOffline(navigator.onLine)) onOpen(true); }}>
          {t('ui.seal.openOffline')}
        </Button>
        <Button variant="secondary" data-action="open-now" onClick={() => onOpen(false)}>{t('ui.seal.openNow')}</Button>
      </div>
      {!offlineOk && <p id="seal-offline-why" className="sr-only">{t('ui.seal.offlineWhy')}</p>}
      <p className="text-small text-muted">{t('ui.seal.note')}</p>
    </div>
  );
}

/** The stamp over the verdict after an offline open: what the Cloud Ledger saw while the connection was off. */
export function SealStamp({ counts, backOnline }: { counts: SealCounts; backOnline: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-dashed border-line-strong px-3 py-2" data-testid="seal-stamp">
      <p className="flex items-center gap-2 text-small font-semibold"><Icon name="offline" className="size-4" />{t('ui.seal.stampTitle')}</p>
      <p className="font-mono text-small tabular-nums text-muted" data-cloud={counts.cloud}>
        {t('ui.seal.stampCounts', { onDevice: counts.onDevice, rules: counts.rules, cloud: counts.cloud })}
      </p>
      <p className="text-caption text-muted">{t(backOnline ? 'ui.seal.stampScopeBack' : 'ui.seal.stampScope')}</p>
    </div>
  );
}
