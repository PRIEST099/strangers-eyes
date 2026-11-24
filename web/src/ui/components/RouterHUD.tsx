// web/src/ui/components/RouterHUD.tsx: the Router HUD (SCR-14, T-064), floating at the bottom left (SPEC §8.2).
// Collapsed it is a 48 px pill showing the last call (`referee › ON-DEVICE (Gemini Nano) 1.3 s`; AC-222), led by a dot
// in the last finished call's route colour that pulses once per call (docs/DESIGN.md §5.6). Expanded it shows the
// Calls log (role="log", polite, newest at the bottom): one line per Ledger entry (AC-220) with a lane dot
// (laneOf(hudRoute)), job, class, route badge (S2/S4 from inferenceSource), engine,
// latency, bytes and the event tags (fallbacks, RECLASSIFIED, simulated, Nano off, block reasons). Lines come only from
// Ledger entries, which hold no vault string, prompt text or coordinate. The Policy tab (AC-026) is not built (D-149).
// Settings › Technical details (off by default) adds the payload class, raw engine/model ids and the gate's raw notes and
// codes; off, lines and the pill use plain words (`Attacker › IN CLOUD (Gemini) 2.1 s`). The route badge and the latency
// show on every finished line either way (CLAUDE.md: inference source and latency for every AI call).
// Layout (never over content): at ≥1024 px the shell reserves a 72 px band under main and the rail (AppShell) and the
// pill floats inside it; below 1024 px the HUD is a full-width solid dock at the bottom (like the sticky header at the
// top) and main keeps bottom padding taller than the dock, so the end of every page scrolls clear of it.
// The log stays in the accessibility tree while collapsed (visually hidden with sr-only, not `hidden`), so the
// HUD is announced politely in its default state too (SPEC §8.4 AC-061 note). Collapsed, the log drops its
// scroll classes so the 1 px sr-only box can't become a focusable scroll container (an invisible tab stop).
import { useEffect, useId, useRef, useState } from 'react';
import { hudLine, hudPill, hudRoute } from '../../core/ledgerView';
import { t } from '../../core/strings';
import type { LedgerEntry, Route } from '../../core/types';
import { useTechDetails } from '../hooks/usePrefs';
import { laneOf } from '../hud/lanes';
import { useLedgerEntries } from '../hud/useLedger';
import { Badge } from './Badge';
import { Icon } from './Icon';
import { EYEBROW } from './surface';

const clock = (ts: number) => {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
};

export function HudLines({ entries, tech = false }: { entries: readonly LedgerEntry[]; tech?: boolean }) {
  if (entries.length === 0) return <p className="text-muted">{t('ui.hud.empty')}</p>;
  return (
    <ol className="flex flex-col gap-1.5">
      {entries.map((e) => {
        const l = hudLine(e, tech);
        return (
          <li key={l.id} data-hud-line={l.route ?? 'pending'} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span
              aria-hidden="true"
              className={`size-1.5 shrink-0 rounded-full ${
                l.route === null ? 'border border-line-strong' : laneOf(l.route) === 'cloud' ? 'bg-route-cloud-fill' : 'bg-route-device-fill'
              }`}
            />
            <span className="text-muted tabular-nums">{clock(l.ts)}</span>
            <span className="font-semibold">{l.job}</span>
            {tech && <span className="text-muted">[{l.cls}]</span>}
            <span aria-hidden="true">›</span>
            {l.route === null ? (
              <span className="text-muted">{t('ui.hud.running')}</span>
            ) : (
              <>
                <Badge route={l.route} />
                <span className="text-muted">({l.engine})</span>
                <span className="tabular-nums">{l.latency}</span>
                <span className="text-muted tabular-nums">{l.bytes}</span>
                {l.tags.map((tag, i) => (
                  <span key={i} className="rounded-chip border border-line px-1 text-muted">{tag}</span>
                ))}
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The pill's leading dot, coloured by the last FINISHED call's route (hudRoute): solid for a route that ran, an
 *  outline ring for QUEUED (not sent) and CACHED (replayed), a grey ring before any call. Decorative: the text says it. */
const DOT_TONE: Record<Route, string> = {
  ON_DEVICE: 'text-route-device-fill',
  IN_CLOUD: 'text-route-cloud-fill',
  RULES_ONLY: 'text-route-rules',
  BLOCKED: 'text-route-blocked',
  QUEUED: 'text-route-queued-line',
  CACHED: 'text-route-cached-line',
};
const DOT_FILL: Record<Route, string> = {
  ON_DEVICE: 'bg-current',
  IN_CLOUD: 'bg-current',
  RULES_ONLY: 'bg-current',
  BLOCKED: 'bg-current',
  QUEUED: 'border-2 border-current',
  CACHED: 'border-2 border-dashed border-current',
};

function lastDone(entries: readonly LedgerEntry[]): LedgerEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i].status === 'done') return entries[i];
  return null;
}

export interface RouterHUDProps {
  /** Tests only: render these entries instead of the app's live Ledger. */
  entries?: readonly LedgerEntry[];
  /** Tests only: override Settings › Technical details. */
  tech?: boolean;
}

export function RouterHUD({ entries: given, tech: givenTech }: RouterHUDProps) {
  const live = useLedgerEntries();
  const entries = given ?? live;
  const prefTech = useTechDetails();
  const tech = givenTech ?? prefTech;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  // Newest at the bottom: keep the log scrolled to the end as calls arrive.
  useEffect(() => {
    const el = logRef.current;
    if (open && el) el.scrollTop = el.scrollHeight;
  }, [open, entries]);
  const done = lastDone(entries);
  const dotRoute = done ? hudRoute(done) : null;
  return (
    <aside
      aria-label={t('ui.hud.label')}
      data-hud="dock"
      className={
        // Below lg: a solid full-width dock (72 px: 12 + the 48 px pill + 12), so nothing scrolls UNDER a floating pill
        // mid-card. At lg: the pill floats in the band AppShell reserves under main and the rail.
        'fixed inset-x-0 bottom-0 z-30 flex flex-col items-start gap-2 border-t border-line bg-canvas px-3 pt-3 '
        + 'pb-[max(0.75rem,env(safe-area-inset-bottom))] '
        + 'lg:pointer-events-none lg:inset-x-auto lg:bottom-3 lg:left-3 lg:max-w-[calc(100vw-1.5rem)] lg:border-0 lg:bg-transparent lg:p-0'
      }
    >
      <section
        id={panelId}
        aria-labelledby={titleId}
        data-state={open ? 'open' : 'collapsed'}
        className={
          open
            ? 'pointer-events-auto w-[min(32rem,calc(100vw-1.5rem))] rounded-stage border border-line-strong bg-surface p-4 shadow-pop'
            : 'sr-only'
        }
      >
        <h2 id={titleId} className={EYEBROW}>
          {t('ui.hud.calls')}
        </h2>
        <div ref={logRef} role="log" aria-live="polite" className={open ? 'mt-2 max-h-64 overflow-y-auto font-mono text-hud' : undefined}>
          <HudLines entries={entries} tech={tech} />
        </div>
      </section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto inline-flex h-12 max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-full border border-line-strong bg-surface-3 px-4 font-mono text-hud text-fg shadow-pop transition-colors duration-150 hover:bg-surface-2"
      >
        <span aria-hidden="true" className={`relative inline-flex size-2.5 shrink-0 ${dotRoute ? DOT_TONE[dotRoute] : 'text-line-strong'}`}>
          <span className={`size-full rounded-full ${dotRoute ? DOT_FILL[dotRoute] : 'border-2 border-current'}`} />
          {done && <span key={done.id} className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-current opacity-0" />}
        </span>
        <span className="shrink-0 font-bold text-muted">{t(tech ? 'ui.hud.name' : 'ui.hud.namePlain')}</span>
        <span className="min-w-0 truncate tabular-nums">{hudPill(entries, tech)}</span>
        <Icon name={open ? 'chevronDown' : 'chevronUp'} className="size-4 shrink-0 text-muted" />
      </button>
    </aside>
  );
}
