// web/src/ui/components/PrescreenPanel.tsx: the Pre-screen step (SPEC SCR-06; T-068). The progress list (each line with
// its route badge and latency: Tier-0 is RULES-ONLY), then the photo with its masks and the side list. Until T-066 the
// "Looking for clues" line is RULES-ONLY and says why, by capability state (prescreenView.nanoLineCopy). A failed
// reader blocks the photo (fail closed, D-123) and offers Try again. The primary actions are shown but disabled until
// the Send (T-069) and Export (T-079) steps exist; nothing here sends anything.
// TODO(T-064): each line also becomes a Router HUD entry once the HUD has its store.
import { t } from '../../core/strings';
import { TIER0_STEPS } from '../../tier0/tier0';
import type { EditorOp } from '../check/editor';
import { lineCopy, nanoLineCopy } from '../check/prescreenView';
import type { PrescreenState, ProgressLine } from '../checkState';
import { useOnline } from '../hooks/useOnline';
import { useShell } from '../shellContext';
import { Badge } from './Badge';
import { Button } from './Button';
import { ClueList } from './ClueList';
import { Icon } from './Icon';
import { PhotoStage } from './PhotoStage';

export interface PrescreenPanelProps {
  /** Check's master (null if it holds none: nothing to show). */
  master: HTMLCanvasElement | null;
  state: PrescreenState;
  onOp: (op: EditorOp) => void;
  onRetry: () => void;
}

function LineMark({ line }: { line: ProgressLine }) {
  if (line.status === 'done') return <Icon name="check" className="size-4 text-muted" />;
  if (line.status === 'failed') return <Icon name="close" className="size-4 text-verdict-red" />;
  return <span aria-hidden="true" className={`inline-block size-2 rounded-full bg-muted ${line.status === 'running' ? 'motion-safe:animate-pulse' : 'opacity-40'}`} />;
}

export function PrescreenPanel({ master, state, onOp, onRetry }: PrescreenPanelProps) {
  const shell = useShell();
  const online = useOnline();
  if (state.kind === 'idle' || !master) return <p className="mt-2 text-sm text-muted">{t('ui.prescreen.busy', { name: t('ui.prescreen.metadataName') })}</p>;
  const running = state.kind === 'running';
  const capState = shell?.caps.checked ? shell.caps.capability.state : null;

  return (
    <div className="mt-3 flex flex-col gap-4">
      <ul aria-label={t('ui.prescreen.progress')} aria-live="polite" aria-busy={running} className="flex flex-col gap-1.5 text-sm">
        {TIER0_STEPS.map((step) => {
          const line = state.lines[step];
          const c = lineCopy(step, line);
          const text = c.name ? t(c.id, { name: t(c.name) }) : t(c.id, c.params);
          return (
            <li key={step} data-step={step} data-status={line.status} className="flex flex-wrap items-center gap-2">
              <span className="inline-flex size-4 items-center justify-center"><LineMark line={line} /></span>
              <span className={line.status === 'failed' ? 'text-verdict-red' : undefined}>{text}</span>{' '}
              {/* real spaces between the parts, so the line reads "Finding faces (1) RULES-ONLY 38 ms" (F-177) */}
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                {line.status !== 'pending' && <Badge route="RULES_ONLY" />}{' '}
                {line.ms !== undefined && <span className="font-mono text-xs text-muted">{t('ui.prescreen.ms', { ms: line.ms })}</span>}
              </span>
            </li>
          );
        })}
        <li data-step="nano" className="flex items-start gap-2">
          <span className="inline-flex h-5 w-4 shrink-0 items-center justify-center"><Icon name="chip" className="size-4 text-muted" /></span>
          <span className="min-w-0">
            {t(nanoLineCopy(capState))} <Badge route="RULES_ONLY" className="align-middle" />
          </span>
        </li>
      </ul>

      {state.kind === 'done' && (
        <>
          {state.failed.length > 0 && (
            <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-verdict-red bg-verdict-red-bg p-3 text-sm">
              <p>{t('ui.prescreen.failed')}</p>
              <Button onClick={onRetry}>{t('ui.prescreen.retry')}</Button>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <PhotoStage master={master} editor={state.editor} onOp={onOp} />
            <ClueList editor={state.editor} onOp={onOp} />
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled aria-describedby="prescreen-next">{t(online ? 'ui.prescreen.cloud' : 'ui.prescreen.queue')}</Button>
              <Button disabled aria-describedby="prescreen-next">{t('ui.prescreen.export')}</Button>
            </div>
            <p id="prescreen-next" className="text-sm text-muted">{t('ui.prescreen.nextSoon')}</p>
          </div>
        </>
      )}
    </div>
  );
}
