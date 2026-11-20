// web/src/ui/screens/Placeholder.tsx: the frame for screens whose task has not landed yet (T-050 shell).
// Shows only true statements: the screen name, SPEC copy that holds regardless of build state, and a note.
import type { ReactNode } from 'react';
import { t, type StringId } from '../../core/strings';

export function PlaceholderScreen({ titleId, children }: { titleId: StringId; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t(titleId)}</h1>
      {children}
      <p className="text-sm text-muted">{t('ui.placeholder')}</p>
    </div>
  );
}
