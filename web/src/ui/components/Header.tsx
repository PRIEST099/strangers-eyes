// web/src/ui/components/Header.tsx: the global header (SPEC §8.2), left to right: logo and name · capability chip
// (opens SCR-02) · connectivity chip (only when offline or the cloud is paused) · Ledger button with live counters
// (faces · vault items sent) · Settings. It wraps onto a second row at 375 px rather than scrolling sideways,
// and the DOM order is the visual order, so the focus order matches (AC-060, AC-061).
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
import { Icon } from './Icon';

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

  return (
    <header className="border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-4 py-1 sm:px-6">
        <a
          href="#/"
          aria-current={p.route.name === 'home' ? 'page' : undefined}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-1.5 font-semibold tracking-tight"
        >
          <Icon name="eye" className="size-6" />
          <span>{t('ui.app.name')}</span>
        </a>

        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={p.capabilityOpen}
          aria-label={t('ui.cap.chipAria', { state: capText })}
          onClick={p.onCapability}
          className="group inline-flex min-h-11 items-center rounded-full"
        >
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface-2 px-3 text-xs font-medium whitespace-nowrap group-hover:bg-canvas">
            <Icon name="chip" className="size-4" />
            {capText}
          </span>
        </button>

        <span role="status" className="inline-flex">
          {connId && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-route-queued-line px-3 text-xs font-medium whitespace-nowrap text-route-queued">
              <Icon name="offline" className="size-4" />
              {t(connId)}
            </span>
          )}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="compact"
            className="font-mono"
            onClick={p.onLedger}
            // WCAG 2.5.3: the name starts with the visible text ("Ledger 0 · 0"; "0 · 0" below 640 px is inside it).
            aria-label={t('ui.ledger.buttonAria', { f, v, counters: t('copy.ledger.counters', { f, v }) })}
            aria-controls={p.ledgerIsRail ? LEDGER_RAIL_ID : undefined}
            aria-haspopup={p.ledgerIsRail ? undefined : 'dialog'}
            aria-expanded={p.ledgerIsRail ? undefined : p.ledgerSheetOpen}
          >
            <Icon name="ledger" />
            <span className="hidden sm:inline">{t('ui.ledger.button', { f, v })}</span>
            <span className="sm:hidden">{t('ui.ledger.buttonShort', { f, v })}</span>
          </Button>
          <a
            href="#/settings"
            aria-current={p.route.name === 'settings' ? 'page' : undefined}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2.5 text-sm font-medium hover:bg-surface-2"
          >
            <Icon name="gear" />
            <span className="sr-only sm:not-sr-only">{t('ui.screen.settings')}</span>
          </a>
        </div>
      </div>
    </header>
  );
}
