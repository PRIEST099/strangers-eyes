// web/src/ui/components/StepperNav.tsx: the check stepper (SPEC §8.2): Import › Pre-screen › Send › Attack ›
// Verdict › Fix › Re-attack › Export. The current step is highlighted (and aria-current="step") with an accent
// bar, not the focus colour, so it never looks like keyboard focus. Steps already reached are buttons that
// revisit them without re-running any call: finished ones are marked done, the furthest one is not (it may still
// be in progress). Later steps are plain text, never buttons: screen readers hear "(not reached yet)", and a step that
// is not built yet is shown in italics and read as "(not available yet)" (T-068, D-121). It wraps instead of scrolling sideways
// at 375 px (AC-060).
import { t } from '../../core/strings';
import { CHECK_STEPS, stepLabelId, stepStatus, type CheckStep } from '../layout';
import { Icon } from './Icon';

export interface StepperNavProps {
  current: CheckStep;
  /** The furthest step reached so far. */
  reached: CheckStep;
  onSelect: (step: CheckStep) => void;
  /** The steps that exist (checkState.BUILT_STEPS). Default: all of them. */
  available?: readonly CheckStep[];
}

export function StepperNav({ current, reached, onSelect, available = CHECK_STEPS }: StepperNavProps) {
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
                <span
                  data-available={available.includes(step) ? 'true' : 'false'}
                  className={`inline-flex min-h-11 items-center px-2.5 text-muted${available.includes(step) ? '' : ' italic'}`}
                >
                  <span className="sr-only">{t(available.includes(step) ? 'ui.stepper.upcoming' : 'ui.stepper.unavailable', { name })}</span>
                  <span aria-hidden="true">{name}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
