// web/src/ui/components/JudgeModeBanner.tsx: the Judge Mode banner (SPEC SCR-17, §8.2; T-105). Always visible while Judge
// Mode is active: what is fake (copy.judge.banner, copy.judge.fakeVault) and the Exit button, which discards the fake
// vault and the sample sessions and returns to Home (the Judge screen's unmount restores the real vault index).
// One row (docs/DESIGN.md §5.4): the "Fake vault" chip, the text, Exit pushed right; below sm, Exit wraps under the text.
// The disclosure is never clamped: it says the private steps may run in the cloud, so it must stay readable in full.
import { t } from '../../core/strings';
import { Button } from './Button';

export function JudgeModeBanner({ onExit }: { onExit: () => void }) {
  return (
    <div role="region" aria-label={t('ui.screen.judge')} data-testid="judge-banner"
      className="flex flex-wrap items-center gap-3 rounded-card border border-dashed border-route-cached-line bg-surface px-4 py-2.5">
      <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-x-3 gap-y-1.5 sm:basis-0">
        <span className="inline-flex h-[22px] shrink-0 items-center rounded-chip border border-dashed border-route-cached-line px-2 font-mono text-caption font-bold uppercase tracking-[0.06em] whitespace-nowrap text-route-cached">
          {t('ui.judge.fakeChip')}
        </span>
        <p className="min-w-0 flex-[1_1_14rem] text-small">
          <span className="font-medium">{t('copy.judge.banner')}</span>{' '}
          <span className="text-muted">{t('copy.judge.fakeVault')}</span>
        </p>
      </div>
      <Button size="compact" onClick={onExit} data-action="exit-judge" className="ml-auto shrink-0">{t('ui.judge.exit')}</Button>
    </div>
  );
}
