// web/src/ui/components/RouterHUD.tsx: the Router HUD (SCR-14, T-064), floating at the bottom left (SPEC §8.2).
// Collapsed it is a 40 px pill showing the last call (`referee › ON-DEVICE (Gemini Nano) 1.3 s`; AC-222; an invisible
// ::before extends the touch target to 44 px). Expanded it shows the Calls log (role="log", polite, newest at the
// bottom): one line per Ledger entry (AC-220) with job, class, route badge (S2/S4 from inferenceSource), engine,
// latency, bytes and the event tags (fallbacks, RECLASSIFIED, simulated, Nano off, block reasons). Lines come only from
// Ledger entries, which hold no vault string, prompt text or coordinate. The Policy tab (AC-026) is not built (D-149).
// The log stays in the accessibility tree while collapsed (visually hidden with sr-only, not `hidden`), so the
// HUD is announced politely in its default state too (SPEC §8.4 AC-061 note). Collapsed, the log drops its
// scroll classes so the 1 px sr-only box can't become a focusable scroll container (an invisible tab stop).
import { useEffect, useId, useRef, useState } from 'react';
import { hudLine, hudPill } from '../../core/ledgerView';
import { t } from '../../core/strings';
import type { LedgerEntry } from '../../core/types';
import { useLedgerEntries } from '../hud/useLedger';
import { Badge } from './Badge';
import { Icon } from './Icon';

const clock = (ts: number) => {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
};

export function HudLines({ entries }: { entries: readonly LedgerEntry[] }) {
  if (entries.length === 0) return <p className="text-muted">{t('ui.hud.empty')}</p>;
  return (
    <ol className="flex flex-col gap-1.5">
      {entries.map((e) => {
        const l = hudLine(e);
        return (
          <li key={l.id} data-hud-line={l.route ?? 'pending'} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-5">
            <span className="text-muted tabular-nums">{clock(l.ts)}</span>
            <span className="font-semibold">{l.job}</span>
            <span className="text-muted">[{l.cls}]</span>
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
                  <span key={i} className="rounded border border-line px-1 text-muted">{tag}</span>
                ))}
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export interface RouterHUDProps {
  /** Tests only: render these entries instead of the app's live Ledger. */
  entries?: readonly LedgerEntry[];
}

export function RouterHUD({ entries: given }: RouterHUDProps) {
  const live = useLedgerEntries();
  const entries = given ?? live;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  // Newest at the bottom: keep the log scrolled to the end as calls arrive.
  useEffect(() => {
    const el = logRef.current;
    if (open && el) el.scrollTop = el.scrollHeight;
  }, [open, entries]);
  return (
    <aside
      aria-label={t('ui.hud.label')}
      className="pointer-events-none fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-30 flex max-w-[calc(100vw-1.5rem)] flex-col items-start gap-2"
    >
      <section
        id={panelId}
        aria-labelledby={titleId}
        data-state={open ? 'open' : 'collapsed'}
        className={
          open
            ? 'pointer-events-auto w-[min(28rem,calc(100vw-1.5rem))] rounded-xl border border-line-strong bg-surface p-3 shadow-xl'
            : 'sr-only'
        }
      >
        <h2 id={titleId} className="text-xs font-semibold tracking-wide text-muted uppercase">
          {t('ui.hud.calls')}
        </h2>
        <div ref={logRef} role="log" aria-live="polite" className={open ? 'mt-2 max-h-56 overflow-y-auto font-mono text-xs' : undefined}>
          <HudLines entries={entries} />
        </div>
      </section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={
          'pointer-events-auto relative inline-flex h-10 max-w-full items-center gap-2 rounded-full border border-line-strong bg-surface px-3 font-mono text-xs text-fg shadow-lg ' +
          "before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-[''] hover:bg-surface-2"
        }
      >
        <span className="font-semibold">{t('ui.hud.name')}</span>
        <span className="truncate text-muted">{hudPill(entries)}</span>
        <Icon name={open ? 'chevronDown' : 'chevronUp'} className="size-4" />
      </button>
    </aside>
  );
}
