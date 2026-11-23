// web/src/ui/components/UnsupportedPage.tsx: the full-page message for a browser without WebAssembly or IndexedDB
// (SPEC SCR-22, copy.err.browser). App shows it in place of everything else (ui/gate.ts topScreen), so nothing that
// needs either one is ever started. Layout (docs/DESIGN.md §5.1): one centred card with the brand mark.
import { useEffect } from 'react';
import { t } from '../../core/strings';
import { BrandMark } from './Icon';
import { CARD } from './surface';

export function UnsupportedPage() {
  useEffect(() => {
    if (typeof document !== 'undefined') document.title = t('ui.app.name');
  }, []);

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <div className={`${CARD} flex w-full max-w-lg flex-col items-center gap-4 text-center`}>
        <BrandMark className="size-16" />
        <h1 className="text-h2-sm font-bold tracking-[-0.015em] sm:text-h2">{t('ui.app.name')}</h1>
        <p data-unsupported="" className="text-lead max-w-[68ch]">
          {t('copy.err.browser')}
        </p>
      </div>
    </main>
  );
}
