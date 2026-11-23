// web/src/ui/components/SystemBanner.tsx: the SCR-22 system banners, under the header (SPEC §8.2, SCR-22).
// Which banners show is decided by ui/systemStatus.ts selectBanners (D-105); this component only draws them.
// - The tripwire banner is red and assertive (role="alert", AC-061: assertive for gate blocks) and cannot be dismissed:
//   the cloud stays off until reload (AD-31).
// - Every other banner is polite (role="status"). Per-call events (429, network, failed cloud check) have a Dismiss
//   button; state banners (kill switch, App Check, sign-in, daily cap) go when their condition clears.
// Both live regions are always in the DOM, even when empty, so a banner inserted later is announced.
// Each banner is a CARD with a coloured left rule; the wrapper markup is fixed (systemScreens.test).
// Text and an icon, never colour alone (AC-062). Nothing here blocks a screen: on-device features keep working (AC-290).
import { t } from '../../core/strings';
import type { Banner, BannerKind } from '../systemStatus';
import { Button } from './Button';
import { Icon } from './Icon';
import { CARD } from './surface';

/** The 4 px left rule: red for the tripwire and the kill switch (the cloud is off), amber for everything else. */
const RED_RULE: ReadonlySet<BannerKind> = new Set<BannerKind>(['tripwire', 'killSwitch']);

function BannerLine({ b, onDismiss }: { b: Banner; onDismiss?: (kind: BannerKind) => void }) {
  const red = RED_RULE.has(b.kind);
  return (
    <div
      data-banner={b.kind}
      className={`${CARD} mx-4 mt-3 flex items-start gap-3 border-l-4 py-2 pr-2 sm:mx-6 lg:py-2 lg:pr-2 ${
        red ? 'border-l-verdict-red' : 'border-l-route-queued-line'
      }`}
    >
      <Icon
        name={b.tone === 'danger' ? 'alert' : 'offline'}
        className={`mt-2.5 size-5 ${red ? 'text-verdict-red' : 'text-route-queued'}`}
      />
      <p className="min-w-0 flex-1 py-2 text-small font-medium text-fg">{t(b.copy, b.params)}</p>
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
