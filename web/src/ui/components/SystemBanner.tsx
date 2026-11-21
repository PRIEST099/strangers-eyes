// web/src/ui/components/SystemBanner.tsx: the SCR-22 system banners, under the header (SPEC §8.2, SCR-22).
// Which banners show is decided by ui/systemStatus.ts selectBanners (D-105); this component only draws them.
// - The tripwire banner is red and assertive (role="alert", AC-061: assertive for gate blocks) and cannot be dismissed:
//   the cloud stays off until reload (AD-31).
// - Every other banner is polite (role="status"). Per-call events (429, network, failed cloud check) have a Dismiss
//   button; state banners (kill switch, App Check, sign-in, daily cap) go when their condition clears.
// Both live regions are always in the DOM, even when empty, so a banner inserted later is announced.
// Text and an icon, never colour alone (AC-062). Nothing here blocks a screen: on-device features keep working (AC-290).
import { t } from '../../core/strings';
import type { Banner, BannerKind } from '../systemStatus';
import { Button } from './Button';
import { Icon } from './Icon';

const TONE: Record<Banner['tone'], string> = {
  danger: 'border-verdict-red bg-verdict-red-bg text-verdict-red',
  warn: 'border-route-queued-line bg-verdict-amber-bg text-fg',
};

function BannerLine({ b, onDismiss }: { b: Banner; onDismiss?: (kind: BannerKind) => void }) {
  return (
    <div data-banner={b.kind} className={`flex items-start gap-3 border-b px-4 py-2 sm:px-6 ${TONE[b.tone]}`}>
      <Icon name={b.tone === 'danger' ? 'lock' : 'offline'} className="mt-2.5 size-5" />
      <p className="min-w-0 flex-1 py-2 text-sm font-medium">{t(b.copy, b.params)}</p>
      {b.dismissible && onDismiss && (
        <Button variant="ghost" size="icon" aria-label={t('ui.banner.dismiss')} onClick={() => onDismiss(b.kind)}>
          <Icon name="close" />
        </Button>
      )}
    </div>
  );
}

export interface SystemBannerProps {
  banners: readonly Banner[];
  onDismiss?: (kind: BannerKind) => void;
}

export function SystemBanner({ banners, onDismiss }: SystemBannerProps) {
  const danger = banners.filter((b) => b.tone === 'danger');
  const warn = banners.filter((b) => b.tone !== 'danger');
  return (
    <div data-system-banners="">
      <div role="alert">
        {danger.map((b) => (
          <BannerLine key={b.kind} b={b} onDismiss={onDismiss} />
        ))}
      </div>
      <div role="status" aria-live="polite">
        {warn.map((b) => (
          <BannerLine key={b.kind} b={b} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  );
}
