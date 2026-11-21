// web/src/ui/components/UnsupportedPage.tsx: the full-page message for a browser without WebAssembly or IndexedDB
// (SPEC SCR-22, copy.err.browser). App shows it in place of everything else (ui/gate.ts topScreen), so nothing that
// needs either one is ever started.
import { useEffect } from 'react';
import { t } from '../../core/strings';
import { Icon } from './Icon';

export function UnsupportedPage() {
  useEffect(() => {
    if (typeof document !== 'undefined') document.title = t('ui.app.name');
  }, []);

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <div className="flex w-full max-w-lg flex-col gap-4">
        <h1 className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Icon name="eye" className="size-7" />
          {t('ui.app.name')}
        </h1>
        <p data-unsupported="" className="text-lg">
          {t('copy.err.browser')}
        </p>
      </div>
    </main>
  );
}
