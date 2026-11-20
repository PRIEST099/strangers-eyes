// web/src/ui/screens/Check.tsx: #/check, the current check (SCR-05…12). T-050 skeleton: the stepper and an empty
// step panel. The pipeline (core/session.ts) advances the position with moveToStep once the check flow lands;
// revisiting a finished step keeps `reached`, so the later steps stay reachable (SPEC §8.2).
import { useState } from 'react';
import { t } from '../../core/strings';
import { StepperNav } from '../components/StepperNav';
import { STEPPER_START, moveToStep, stepLabelId, type StepperPosition } from '../layout';

export function Check() {
  const [pos, setPos] = useState<StepperPosition>(STEPPER_START);
  const current = pos.current;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('ui.screen.check')}</h1>
      <StepperNav current={current} reached={pos.reached} onSelect={(step) => setPos((p) => moveToStep(p, step))} />
      <section aria-labelledby="check-step-title" className="rounded-xl border border-line bg-surface p-4">
        <h2 id="check-step-title" className="text-lg font-semibold">
          {t(stepLabelId(current))}
        </h2>
        <p className="mt-2 text-sm text-muted">{t('ui.placeholder')}</p>
      </section>
    </div>
  );
}
