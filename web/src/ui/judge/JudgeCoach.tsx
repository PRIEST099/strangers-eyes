// web/src/ui/judge/JudgeCoach.tsx: what Check adds on a Judge Mode sample (SCR-17; T-105): the step's coach marks
// (copy.judge.coach.*), the autoplay countdown (copy.judge.autoConfirm), the CACHED badge with copy.judge.cached and
// copy.judge.notesNeedLive on a recorded replay (AC-243), and "Use recorded result" when the live attacker is off.
import { t } from '../../core/strings';
import type { StringId } from '../../core/strings';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';

export interface JudgeCoachProps {
  coach: readonly StringId[];
  /** Seconds left before autoplay sends the sample (null: no countdown). */
  countdownS: number | null;
  /** The outcome on screen is a recorded replay. */
  recorded: { recordedAt: string; model: string } | null;
  /** The cloud is off and the recording may be used: offer it (autoplay presses it itself). */
  onUseRecorded: (() => void) | null;
}

export function JudgeCoach({ coach, countdownS, recorded, onUseRecorded }: JudgeCoachProps) {
  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="judge-coach">
      {coach.map((id) => (
        <p key={id} className="rounded-lg border border-dashed border-line bg-surface-2 p-3 text-sm">{t(id)}</p>
      ))}
      {recorded && (
        <div className="flex flex-col gap-1 rounded-lg border border-dashed border-route-cached-line p-3 text-sm" data-testid="judge-cached">
          <p><Badge route="CACHED" /> {t('copy.judge.cached', { date: recorded.recordedAt, model: recorded.model })}</p>
          <p className="text-muted">{t('copy.judge.notesNeedLive')}</p>
        </div>
      )}
      {onUseRecorded && (
        <Button className="self-start" data-action="use-recorded" onClick={onUseRecorded}>{t('ui.judge.useRecorded')}</Button>
      )}
      {countdownS !== null && <p role="status" className="text-sm font-medium">{t('copy.judge.autoConfirm', { s: countdownS })}</p>}
    </div>
  );
}
