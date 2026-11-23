// web/src/ui/components/Header.tsx: the global header (SPEC §8.2), left to right: logo and name · capability chip
// (opens SCR-02) · connectivity chip (only when offline or the cloud is paused) · Ledger button with live counters
// (faces · vault items sent) · Settings. One sticky 56 px row on a solid canvas (no blur, docs/DESIGN.md §4); the name
// is visually hidden below 480 px so the row fits at 375. It can still wrap rather than scroll sideways, and the DOM
// order is the visual order, so the focus order matches (AC-060, AC-061).
import type { LedgerCounters } from '../../core/types';
import { t } from '../../core/strings';
import type { AppRoute } from '../router';
import {
  LEDGER_RAIL_ID,
  capabilityChipCopy,
  connectivityChipCopy,
  type CapabilityChipState,
  type Connectivity,
} from '../layout';
import { Button } from './Button';
import { BrandMark, Icon } from './Icon';

export interface HeaderProps {
  route: AppRoute;
  capability: CapabilityChipState;
  capabilityOpen: boolean;
  onCapability: () => void;
  connectivity: Connectivity;
  counters: LedgerCounters;
  /** ≥1024 px: the button moves focus to the rail. Below: it opens the Ledger sheet. */
  ledgerIsRail: boolean;
  ledgerSheetOpen: boolean;
  onLedger: () => void;
}

export function Header(p: HeaderProps) {
  const cap = capabilityChipCopy(p.capability);
  const capText = t(cap.id, cap.params);
  const connId = connectivityChipCopy(p.connectivity);
  const f = p.counters.facesSent;
  const v = p.counters.vaultItemsSent;

  const onDevice = p.capability.kind === 'nano' || p.capability.kind === 'nanoTextOnly';

  return (
    // Solid canvas, never a backdrop blur (docs/DESIGN.md §4, §6.1). One 56 px row; flex-wrap is only a fallback for
    // the connectivity chip at 375 px.
    <header className="sticky top-0 z-20 border-b border-line bg-canvas">
      <div className="flex min-h-14 flex-wrap items-center gap-x-2 gap-y-0.5 px-4 sm:px-6">
        <a
          href="#/"
          aria-current={p.route.name === 'home' ? 'page' : undefined}
          className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-lg pr-1.5"
        >
          <BrandMark className="size-7" />
          <span className="text-[17px] font-bold tracking-[-0.02em] whitespace-nowrap max-[479px]:sr-only">{t('ui.app.name')}</span>
        </a>

        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={p.capabilityOpen}
          aria-label={t('ui.cap.chipAria', { state: capText })}
          onClick={p.onCapability}
          className="group inline-flex min-h-11 min-w-0 items-center rounded-full"
        >
          <span
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-small font-medium whitespace-nowrap transition-colors duration-150 group-hover:bg-surface-3 ${
              onDevice ? 'border-route-device-fill/50 bg-route-device-bg text-route-device' : 'border-line-strong bg-surface-2 text-fg'
            }`}
          >
            <Icon name="chip" className="size-4" />
            {capText}
          </span>
        </button>

        <span role="status" className="inline-flex">
          {connId && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-route-queued-line px-3 text-small font-medium whitespace-nowrap text-route-queued">
              <Icon name="offline" className="size-4" />
              {t(connId)}
            </span>
          )}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="compact"
            onClick={p.onLedger}
            // WCAG 2.5.3: the name starts with the visible text ("Ledger 0 · 0"; "0 · 0" below 640 px is inside it).
            aria-label={t('ui.ledger.buttonAria', { f, v, counters: t('copy.ledger.counters', { f, v }) })}
            aria-controls={p.ledgerIsRail ? LEDGER_RAIL_ID : undefined}
            aria-haspopup={p.ledgerIsRail ? undefined : 'dialog'}
            aria-expanded={p.ledgerIsRail ? undefined : p.ledgerSheetOpen}
          >
            <Icon name="lock" className="size-5 text-verdict-teal" />
            <span className="hidden font-mono tabular-nums sm:inline">{t('ui.ledger.button', { f, v })}</span>
            <span className="font-mono tabular-nums sm:hidden">{t('ui.ledger.buttonShort', { f, v })}</span>
          </Button>
          <a
            href="#/settings"
            aria-current={p.route.name === 'settings' ? 'page' : undefined}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2.5 text-sm font-medium transition-colors duration-150 hover:bg-surface-2"
          >
            <Icon name="gear" />
            <span className="sr-only sm:not-sr-only">{t('ui.screen.settings')}</span>
          </a>
        </div>
      </div>
    </header>
  );
}
