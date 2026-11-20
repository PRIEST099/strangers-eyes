// web/src/ui/components/RouterHUD.tsx: Router HUD placeholder (SCR-14), floating at the bottom left (SPEC §8.2).
// Collapsed it is a 40 px pill (AC-222; an invisible ::before extends the touch target to 44 px). Expanded it shows
// the Calls log (role="log", polite). T-064 adds the real lines, the Policy tab and the event tags.
// The log stays in the accessibility tree while collapsed (visually hidden with sr-only, not `hidden`), so the
// HUD is announced politely in its default state too (SPEC §8.4 AC-061 note). Collapsed, the log drops its
// scroll classes so the 1 px sr-only box can't become a focusable scroll container (an invisible tab stop).
import { useId, useState } from 'react';
import { t } from '../../core/strings';
import { Icon } from './Icon';

export function RouterHUD() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
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
            ? 'pointer-events-auto w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-line-strong bg-surface p-3 shadow-xl'
            : 'sr-only'
        }
      >
        <h2 id={titleId} className="text-xs font-semibold tracking-wide text-muted uppercase">
          {t('ui.hud.calls')}
        </h2>
        <div role="log" aria-live="polite" className={open ? 'mt-2 max-h-48 overflow-y-auto font-mono text-xs' : undefined}>
          <p className="text-muted">{t('ui.hud.empty')}</p>
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
        <span className="truncate text-muted">{t('ui.hud.idle')}</span>
        <Icon name={open ? 'chevronDown' : 'chevronUp'} className="size-4" />
      </button>
    </aside>
  );
}
