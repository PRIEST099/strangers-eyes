// web/src/ui/components/AppShell.tsx: the global layout (SPEC §8.2) around every product route.
//   header · main (the screen) · Cloud Ledger rail at ≥1024 px (a bottom sheet below that) · Router HUD at the
//   bottom left · the SCR-02 capability sheet.
// Landmarks: banner, main, two labelled complementary regions (Ledger rail, HUD). A skip button jumps to main
// (a `#main` link would change the hash route). On a route change, focus moves to main and the title updates.
// A sheet belongs to the route it was opened on, so a route change (Back, Forward, a typed hash) closes it
// (derived in render, no setState in an effect); focus then moves to main once the sheet has closed.
// The capability chip and the SCR-02 panel share one useCapabilities view (T-061); Settings reads it too (ShellContext).
// "Use Gemini Nano" (Settings) and the developer simulations (AC-006: downgrade only) feed it, and simulated offline
// feeds the connectivity chip (ARCH §8.2 online()). The SCR-22 system banners sit under the header (T-094); the same
// cloud-off reason drives the connectivity chip and SCR-02 row 3 (ui/systemStatus.ts, D-105).
// A Welcome finished on #/judge mounts the shell with SCR-02 open (capabilityOnStart; AC-071, D-103). A link in SCR-02
// to the route already shown (no hash change, so no route change) closes the sheet and moves focus to main.
// Focus is never left on <body> (D-117): after Welcome the shell focuses main; when a sheet closes and its opener is
// gone (focus fell back to <body>), main takes it; dismissing a banner moves it to main.
// "Simulate: no Nano" shows state (c) as a browser without the Prompt API would (ui/simulate.ts, AC-072).
// The header counters, the Ledger rail/sheet (counters, "What the cloud saw", entries) and the HUD read the app's
// in-memory Ledger live (ui/hud/useLedger.ts; T-063/T-064, D-148). Placeholder until its task: the Judge banner across
// the top (SPEC §8.2, T-105).
import { useEffect, useRef, useState, type MouseEvent, type PropsWithChildren } from 'react';
import { t } from '../../core/strings';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useCapabilities } from '../hooks/useCapabilities';
import { useOnline } from '../hooks/useOnline';
import { useCapUsed, useSettings, useSimulations } from '../hooks/usePrefs';
import { useLedgerCounters, useLedgerEntries, useSentImages } from '../hud/useLedger';
import { useSystemStatus } from '../hooks/useSystemStatus';
import { hrefFor, type AppRoute } from '../router';
import { ShellContext } from '../shellContext';
import { simulateNoNano } from '../simulate';
import { chipInputsOf, cloudOffReason, cloudRowOf, selectBanners, systemStatus } from '../systemStatus';
import {
  LEDGER_RAIL_ID,
  LEDGER_RAIL_QUERY,
  SCREEN_TITLE,
  connectivityOf,
} from '../layout';
import { CapabilityPanel } from './CapabilityPanel';
import { Header } from './Header';
import { LedgerPanel } from './LedgerPanel';
import { RouterHUD } from './RouterHUD';
import { Sheet } from './Sheet';
import { SystemBanner } from './SystemBanner';

const RAIL_TITLE_ID = 'ledger-rail-title';

/** The href of the link a click landed in, if any (the click may land on an icon inside the link). */
function linkHref(target: EventTarget | null): string | null {
  const el = target instanceof Element ? target.closest('a[href]') : null;
  return el ? el.getAttribute('href') : null;
}

/** No element has focus: it fell back to <body> (its element went away). */
const focusLost = (): boolean =>
  typeof document !== 'undefined' && (document.activeElement === null || document.activeElement === document.body);

export interface AppShellProps {
  route: AppRoute;
  /** Open SCR-02 when the shell mounts (the `?judge=1` flow after Welcome; AC-071). */
  capabilityOnStart?: boolean;
  /** Focus main when the shell mounts (straight after Welcome, whose Continue button is gone). */
  focusMainOnStart?: boolean;
}

export function AppShell({ route, capabilityOnStart = false, focusMainOnStart = false, children }: PropsWithChildren<AppShellProps>) {
  const settings = useSettings();
  const sims = useSimulations();
  const online = useOnline() && !sims.offline; // simulate offline (AC-006): downgrade only
  const rail = useMediaQuery(LEDGER_RAIL_QUERY);
  // The routeKey each sheet was opened on, or null when closed.
  const [ledgerOpenOn, setLedgerOpenOn] = useState<string | null>(null);
  const [capOpenOn, setCapOpenOn] = useState<string | null>(() => (capabilityOnStart ? hrefFor(route) : null));
  const mainRef = useRef<HTMLElement>(null);
  const railHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusMainOnSheetClose = useRef(false);

  const ledgerEntries = useLedgerEntries();
  const counters = useLedgerCounters();
  const images = useSentImages();
  // ONE view for the chip, the panel and Settings (fails closed: Rules-only first). Nano off → (c) 'disabled'; simulated
  // "no Nano" → (c) exactly as a browser without the Prompt API shows it.
  const realCaps = useCapabilities({ online, nanoEnabled: settings.useNano });
  const caps = sims.noNano ? simulateNoNano(realCaps, { nanoEnabled: settings.useNano, online }) : realCaps;
  const capability = caps.chip;
  const status = useSystemStatus();
  const capUsed = useCapUsed();
  const cloudOff = cloudOffReason(status, capUsed);
  const banners = selectBanners(status, capUsed);
  const connectivity = connectivityOf({ online, ...chipInputsOf(cloudOff) });
  const routeKey = hrefFor(route);
  // Judge Mode and the Check flow lay the cloud copy beside the step at lg (docs/DESIGN.md §5.2), so they get room.
  // Home gets room too: at xl its lanes explainer and the two cards sit side by side, so both CTAs clear the fold (§5.1).
  const wide = route.name === 'judge' || route.name === 'check' || route.name === 'home';
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
  /** Focus main where the page is (no scroll): for a focus that would otherwise be lost. */
  const focusMainInPlace = () => mainRef.current?.focus({ preventScroll: true });

  // Straight after Welcome its Continue button is gone: start in main (unless SCR-02 opened and holds focus).
  const startFocus = useRef(focusMainOnStart && !capabilityOnStart);
  useEffect(() => {
    if (!startFocus.current) return;
    startFocus.current = false;
    focusMainInPlace();
  }, []);

  // Per-call event banners are about a cloud that has since gone off: drop them, so they never reappear later (D-117).
  useEffect(() => {
    if (cloudOff !== null) systemStatus.clearEvents();
  }, [cloudOff]);

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
    if (focusMainOnSheetClose.current) {
      focusMainOnSheetClose.current = false;
      focusMain();
    } else if (focusLost()) {
      focusMainInPlace(); // the sheet's opener is gone (e.g. SCR-02 opened on mount after Welcome)
    }
  };

  // A panel link to the route already shown changes nothing, so close the sheet here (main then takes focus).
  const onCapabilityClick = (e: MouseEvent<HTMLDivElement>) => {
    if (linkHref(e.target) !== routeKey) return;
    focusMainOnSheetClose.current = true;
    setCapOpenOn(null);
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
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-card focus:bg-accent focus:px-4 focus:py-3 focus:text-accent-fg"
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

      <SystemBanner
        banners={banners}
        onDismiss={(kind) => {
          systemStatus.dismiss(kind);
          focusMainInPlace(); // the Dismiss button is gone
        }}
      />

      <div className="flex min-h-0 min-w-0 flex-1">
        {/* pb-28 keeps the last content scrollable above the 48 px HUD pill (AC-222). */}
        <main id="main" ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 px-4 pt-6 pb-28 sm:px-6 lg:overflow-y-auto lg:px-8">
          <div className={`mx-auto w-full ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
            <ShellContext.Provider value={{ caps, openCapability: () => setCapOpenOn(routeKey) }}>{children}</ShellContext.Provider>
          </div>
        </main>
        <aside
          id={LEDGER_RAIL_ID}
          aria-labelledby={RAIL_TITLE_ID}
          className="hidden w-72 shrink-0 overflow-y-auto border-l border-line bg-canvas p-4 lg:block xl:w-80"
        >
          <LedgerPanel counters={counters} entries={ledgerEntries} images={images} headingId={RAIL_TITLE_ID} headingRef={railHeadingRef} />
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
        <LedgerPanel counters={counters} entries={ledgerEntries} images={images} />
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
        <div onClickCapture={onCapabilityClick}>
          <CapabilityPanel caps={caps} cloud={cloudRowOf(cloudOff)} />
        </div>
      </Sheet>
    </div>
  );
}
