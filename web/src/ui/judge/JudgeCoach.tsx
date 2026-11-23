// web/src/ui/judge/JudgeCoach.tsx: what Check adds on a Judge Mode sample (SCR-17; T-105): the step's coach marks
// (copy.judge.coach.*), the autoplay countdown (copy.judge.autoConfirm), the CACHED badge with copy.judge.cached and
// copy.judge.notesNeedLive on a recorded replay (AC-243), and "Use recorded result" when the live attacker is off.
// The coach marks are ONE neutral callout (docs/DESIGN.md §5.4), never lane-tinted: in Judge Mode without Nano the
// private steps may run in the cloud, so the callout must not imply where a step ran (the badges and the HUD say that).
import { useEffect, useState } from 'react';
import { t } from '../../core/strings';
import type { StringId } from '../../core/strings';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { EYEBROW } from '../components/surface';

export interface JudgeCoachProps {
  coach: readonly StringId[];
  /** Seconds left before autoplay sends the sample (null: no countdown). */
  countdownS: number | null;
  /** The outcome on screen is a recorded replay. */
  recorded: { recordedAt: string; model: string } | null;
  /** The cloud is off and the recording may be used: offer it (autoplay presses it itself). */
  onUseRecorded: (() => void) | null;
}

/** The 3 s autoplay countdown has three one-second segments. */
const SEGMENTS = 3;

/**
 * A decorative bar under the countdown text: segment i fills (scaleX 0 → 1, 1 s, linear) while i seconds have passed.
 * The fill starts one frame after mount so the first segment animates too; reduced motion zeroes the transition.
 */
function CountdownBar({ s }: { s: number }) {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setStarted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const filled = started ? Math.min(SEGMENTS, Math.max(0, SEGMENTS + 1 - s)) : 0;
  return (
    <div aria-hidden="true" className="grid max-w-xs grid-cols-3 gap-1.5">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span key={i} className="h-1.5 overflow-hidden rounded-full bg-surface-3">
          <span className={`block h-full origin-left rounded-full bg-fg transition-transform duration-1000 ease-linear ${i < filled ? 'scale-x-100' : 'scale-x-0'}`} />
        </span>
      ))}
    </div>
  );
}

export function JudgeCoach({ coach, countdownS, recorded, onUseRecorded }: JudgeCoachProps) {
  return (
    <div className="mt-3 flex flex-col gap-3" data-testid="judge-coach">
      {coach.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-card border-l-4 border-l-line-strong bg-surface-2 p-3">
          <p className={EYEBROW}>{t('ui.judge.coachLabel')}</p>
          {coach.map((id) => (
            <p key={id} className="max-w-[68ch] text-body">{t(id)}</p>
          ))}
        </div>
      )}
      {recorded && (
        <div className="flex flex-col gap-1 rounded-card border border-dashed border-route-cached-line p-3 text-small" data-testid="judge-cached">
          <p><Badge route="CACHED" /> {t('copy.judge.cached', { date: recorded.recordedAt, model: recorded.model })}</p>
          <p className="text-muted">{t('copy.judge.notesNeedLive')}</p>
        </div>
      )}
      {onUseRecorded && (
        <Button className="self-start" data-action="use-recorded" onClick={onUseRecorded}>{t('ui.judge.useRecorded')}</Button>
      )}
      {countdownS !== null && (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-lead font-medium tabular-nums">{t('copy.judge.autoConfirm', { s: countdownS })}</p>
          <CountdownBar s={countdownS} />
        </div>
      )}
    </div>
  );
}
