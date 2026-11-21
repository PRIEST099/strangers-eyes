// web/src/ui/components/JudgeModeBanner.tsx: the Judge Mode banner (SPEC SCR-17, §8.2; T-105). Always visible while Judge
// Mode is active: what is fake (copy.judge.banner, copy.judge.fakeVault) and the Exit button, which discards the fake
// vault and the sample sessions and returns to Home (the Judge screen's unmount restores the real vault index).
import { t } from '../../core/strings';
import { Button } from './Button';
import { Icon } from './Icon';

export function JudgeModeBanner({ onExit }: { onExit: () => void }) {
  return (
    <div role="region" aria-label={t('ui.screen.judge')} data-testid="judge-banner"
      className="flex flex-col gap-2 rounded-xl border-2 border-dashed border-route-cached-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2 text-sm">
        <Icon name="eye" className="mt-0.5 size-5 shrink-0" />
        <div className="flex flex-col gap-1">
          <p className="font-medium">{t('copy.judge.banner')}</p>
          <p className="text-muted">{t('copy.judge.fakeVault')}</p>
        </div>
      </div>
      <Button onClick={onExit} data-action="exit-judge" className="shrink-0 self-start sm:self-center">{t('ui.judge.exit')}</Button>
    </div>
  );
}
