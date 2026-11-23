// web/src/ui/components/StepperNav.tsx: the check stepper (SPEC §8.2): Import › Pre-screen › Send › Attack ›
// Verdict › Fix › Re-attack › Export, as a 4×2 grid on phones and one row of 8 from md (DESIGN §5.2). Each step has an
// aria-hidden marker (a 3 px bar and "01"…"08") above its control. The current step is highlighted (and
// aria-current="step") with an accent bar, not the focus colour, so it never looks like keyboard focus. Steps already reached are buttons that
// revisit them without re-running any call: finished ones are marked done, the furthest one is not (it may still
// be in progress). Later steps are plain text, never buttons: screen readers hear "(not reached yet)", and a step that
// is not built yet is shown in italics and read as "(not available yet)" (T-068, D-121). Names wrap inside their cell
// instead of scrolling sideways at 375 px (AC-060).
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

/** The marker bar per status: done fg, current the accent with the device glow, reached line-strong, upcoming line. */
const MARKER: Record<ReturnType<typeof stepStatus>, string> = {
  done: 'bg-fg',
  current: 'bg-accent shadow-glow-device',
  reached: 'bg-line-strong',
  upcoming: 'bg-line',
};

export function StepperNav({ current, reached, onSelect, available = CHECK_STEPS }: StepperNavProps) {
  const ci = CHECK_STEPS.indexOf(current);
  const ri = CHECK_STEPS.indexOf(reached);
  return (
    <nav aria-label={t('ui.stepper.label')}>
      <ol className="grid grid-cols-4 gap-1 text-sm md:grid-cols-8">
        {CHECK_STEPS.map((step, i) => {
          const status = stepStatus(i, ci, ri);
          const name = t(stepLabelId(step));
          return (
            <li key={step} className="flex min-w-0 flex-col gap-1 rounded-lg">
              {/* The marker sits OUTSIDE the button/span, so their accessible names (and the tests) stay the step name. */}
              <div aria-hidden="true" className="flex items-center gap-1.5 px-2 pt-1">
                <span className={`font-mono text-caption font-bold tabular-nums ${status === 'current' ? 'text-fg' : 'text-muted'}`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className={`h-[3px] min-w-0 flex-1 rounded-full ${MARKER[status]}`} />
              </div>
              {status === 'current' && (
                <span
                  aria-current="step"
                  className="inline-flex min-h-11 w-full min-w-0 items-center rounded-md bg-surface-2 px-2 leading-tight font-semibold break-words text-fg"
                >
                  {name}
                </span>
              )}
              {status === 'done' && (
                <button
                  type="button"
                  onClick={() => onSelect(step)}
                  className="inline-flex min-h-11 w-full min-w-0 items-center gap-1 rounded-md px-2 text-left leading-tight break-words text-fg underline-offset-4 transition-colors duration-150 hover:bg-surface-2 hover:underline"
                >
                  <Icon name="check" className="size-4 shrink-0 text-fg" />
                  <span className="sr-only">{t('ui.stepper.done', { name })}</span>
                  <span aria-hidden="true" className="min-w-0">{name}</span>
                </button>
              )}
              {status === 'reached' && (
                <button
                  type="button"
                  onClick={() => onSelect(step)}
                  className="inline-flex min-h-11 w-full min-w-0 items-center rounded-md px-2 text-left leading-tight break-words text-fg underline-offset-4 transition-colors duration-150 hover:bg-surface-2 hover:underline"
                >
                  {name}
                </button>
              )}
              {status === 'upcoming' && (
                <span
                  data-available={available.includes(step) ? 'true' : 'false'}
                  className={`inline-flex min-h-11 w-full min-w-0 items-center px-2 leading-tight break-words text-muted${available.includes(step) ? '' : ' italic'}`}
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
