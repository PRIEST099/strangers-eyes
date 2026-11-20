// web/src/ui/components/StepperNav.tsx: the check stepper (SPEC §8.2): Import › Pre-screen › Send › Attack ›
// Verdict › Fix › Re-attack › Export. The current step is highlighted (and aria-current="step") with an accent
// bar, not the focus colour, so it never looks like keyboard focus. Steps already reached are buttons that
// revisit them without re-running any call: finished ones are marked done, the furthest one is not (it may still
// be in progress). Later steps are plain text. It wraps instead of scrolling sideways at 375 px (AC-060).
import { t } from '../../core/strings';
import { CHECK_STEPS, stepLabelId, stepStatus, type CheckStep } from '../layout';
import { Icon } from './Icon';

export interface StepperNavProps {
  current: CheckStep;
  /** The furthest step reached so far. */
  reached: CheckStep;
  onSelect: (step: CheckStep) => void;
}

export function StepperNav({ current, reached, onSelect }: StepperNavProps) {
  const ci = CHECK_STEPS.indexOf(current);
  const ri = CHECK_STEPS.indexOf(reached);
  return (
    <nav aria-label={t('ui.stepper.label')}>
      <ol className="flex flex-wrap items-center gap-x-0.5 gap-y-1 text-sm">
        {CHECK_STEPS.map((step, i) => {
          const status = stepStatus(i, ci, ri);
          const name = t(stepLabelId(step));
          return (
            <li key={step} className="flex items-center gap-0.5">
              {i > 0 && <Icon name="chevronRight" className="size-3.5 text-muted" />}
              {status === 'current' && (
                <span
                  aria-current="step"
                  className="inline-flex min-h-11 items-center rounded-md bg-surface-2 px-2.5 font-semibold text-fg shadow-[inset_0_-3px_0_0_var(--se-accent)]"
                >
                  {name}
                </span>
              )}
              {status === 'done' && (
                <button
                  type="button"
                  onClick={() => onSelect(step)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-md px-2.5 text-fg underline-offset-4 hover:bg-surface-2 hover:underline"
                >
                  <Icon name="check" className="size-4 text-muted" />
                  <span className="sr-only">{t('ui.stepper.done', { name })}</span>
                  <span aria-hidden="true">{name}</span>
                </button>
              )}
              {status === 'reached' && (
                <button
                  type="button"
                  onClick={() => onSelect(step)}
                  className="inline-flex min-h-11 items-center rounded-md px-2.5 text-fg underline-offset-4 hover:bg-surface-2 hover:underline"
                >
                  {name}
                </button>
              )}
              {status === 'upcoming' && (
                <span className="inline-flex min-h-11 items-center px-2.5 text-muted">{name}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
