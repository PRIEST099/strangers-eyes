// web/src/ui/components/AppShell.tsx: the global layout (SPEC §8.2) around every product route.
//   header · main (the screen) · Cloud Ledger rail at ≥1024 px (a bottom sheet below that) · Router HUD at the
//   bottom left · the SCR-02 capability sheet.
// Landmarks: banner, main, two labelled complementary regions (Ledger rail, HUD). A skip button jumps to main
// (a `#main` link would change the hash route). On a route change, focus moves to main and the title updates.
// A sheet belongs to the route it was opened on, so a route change (Back, Forward, a typed hash) closes it
// (derived in render, no setState in an effect); focus then moves to main once the sheet has closed.
// The capability chip and the SCR-02 panel share one useCapabilities view (T-061).
// Placeholders until their tasks: connectivity cloud states (RC), Ledger
// counters and entries (T-063), HUD lines (T-064), the Judge banner across the top (SPEC §8.2, T-105).
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { t } from '../../core/strings';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useCapabilities } from '../hooks/useCapabilities';
import { useOnline } from '../hooks/useOnline';
import { hrefFor, type AppRoute } from '../router';
import {
  LEDGER_RAIL_ID,
  LEDGER_RAIL_QUERY,
  SCREEN_TITLE,
  ZERO_COUNTERS,
  connectivityOf,
} from '../layout';
import { CapabilityPanel } from './CapabilityPanel';
import { Header } from './Header';
import { LedgerPanel } from './LedgerPanel';
import { RouterHUD } from './RouterHUD';
import { Sheet } from './Sheet';

const RAIL_TITLE_ID = 'ledger-rail-title';

export function AppShell({ route, children }: PropsWithChildren<{ route: AppRoute }>) {
  const online = useOnline();
  const rail = useMediaQuery(LEDGER_RAIL_QUERY);
  // The routeKey each sheet was opened on, or null when closed.
  const [ledgerOpenOn, setLedgerOpenOn] = useState<string | null>(null);
  const [capOpenOn, setCapOpenOn] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const railHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusMainOnSheetClose = useRef(false);

  const counters = ZERO_COUNTERS;
  const caps = useCapabilities({ online }); // ONE view for the chip and the panel (fails closed: Rules-only first)
  const capability = caps.chip;
  const connectivity = connectivityOf({ online });
  const routeKey = hrefFor(route);
  const titleId = route.name === 'dev' ? SCREEN_TITLE.home : SCREEN_TITLE[route.name];
  const ledgerSheetOpen = ledgerOpenOn === routeKey && !rail;
  const capOpen = capOpenOn === routeKey;
  const sheetOnOldRoute =
    (ledgerOpenOn !== null && ledgerOpenOn !== routeKey) || (capOpenOn !== null && capOpenOn !== routeKey);

  const focusMain = () => {
    const m = mainRef.current;
    if (!m) return;
    m.scrollTop = 0;
    window.scrollTo(0, 0);
    m.focus({ preventScroll: true });
  };

  // Title on every route; focus to main only on a real change (not on first load, not on a StrictMode re-run).
  const lastKey = useRef(routeKey);
  useEffect(() => {
    document.title = route.name === 'home' ? t('ui.app.name') : t('ui.app.docTitle', { screen: t(titleId) });
    if (lastKey.current === routeKey) return;
    lastKey.current = routeKey;
    if (sheetOnOldRoute) {
      // That sheet is closing in this same commit (its `open` is now false). Its close event, a task that runs
      // after this effect, hands focus back to the opener, so main takes focus from afterSheetClose instead.
      focusMainOnSheetClose.current = true;
      return;
    }
    focusMain();
    // sheetOnOldRoute is a dependency only so the check above sees its current value; opening or closing a
    // sheet re-runs this effect but stops at the lastKey guard. focusMain only touches refs.
  }, [routeKey, route.name, titleId, sheetOnOldRoute]);

  const afterSheetClose = () => {
    if (!focusMainOnSheetClose.current) return;
    focusMainOnSheetClose.current = false;
    focusMain();
  };

  const onLedger = () => {
    if (rail) {
      railHeadingRef.current?.focus();
      railHeadingRef.current?.scrollIntoView({ block: 'nearest' });
    } else {
      setLedgerOpenOn(routeKey);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:min-h-0 lg:overflow-hidden">
      <button
        type="button"
        onClick={() => mainRef.current?.focus()}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-3 focus:text-accent-fg"
      >
        {t('ui.skip')}
      </button>

      <Header
        route={route}
        capability={capability}
        capabilityOpen={capOpen}
        onCapability={() => setCapOpenOn(routeKey)}
        connectivity={connectivity}
        counters={counters}
        ledgerIsRail={rail}
        ledgerSheetOpen={ledgerSheetOpen}
        onLedger={onLedger}
      />

      <div className="flex min-h-0 min-w-0 flex-1">
        {/* pb-24 keeps the last content scrollable above the HUD pill (AC-222). */}
        <main id="main" ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 px-4 pt-5 pb-24 sm:px-6 lg:overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>
        <aside
          id={LEDGER_RAIL_ID}
          aria-labelledby={RAIL_TITLE_ID}
          className="hidden w-80 shrink-0 overflow-y-auto border-l border-line bg-surface p-4 lg:block xl:w-96"
        >
          <LedgerPanel counters={counters} headingId={RAIL_TITLE_ID} headingRef={railHeadingRef} />
        </aside>
      </div>

      <RouterHUD />

      {/* Below 1024 px only; at ≥1024 px the rail is the Ledger, so the sheet closes itself. */}
      <Sheet
        open={ledgerSheetOpen}
        onClose={() => {
          setLedgerOpenOn(null);
          afterSheetClose();
        }}
        title={t('ui.ledger.title')}
      >
        <LedgerPanel counters={counters} />
      </Sheet>

      {/* SCR-02: the capability panel (T-061). Never claims on-device AI before a fresh check says so. */}
      <Sheet
        open={capOpen}
        onClose={() => {
          setCapOpenOn(null);
          afterSheetClose();
        }}
        title={t('copy.cap.title')}
      >
        <CapabilityPanel caps={caps} />
      </Sheet>
    </div>
  );
}
