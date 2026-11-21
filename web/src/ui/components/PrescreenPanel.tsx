// web/src/ui/components/PrescreenPanel.tsx: the Pre-screen step (SPEC SCR-06; T-068). The progress list (each line with
// its route badge and latency: Tier-0 is RULES-ONLY), then the photo with its masks and the side list. Until T-066 the
// "Looking for clues" line is RULES-ONLY and says why, by capability state (prescreenView.nanoLineCopy). A failed
// reader blocks the photo (fail closed, D-123) and offers Try again; after it, focus goes to the progress list, which
// stays mounted (all pending) while the run restarts (D-132). "Check with the cloud attacker" opens the Send step
// (T-069) when the candidate may be sent; Export stays disabled until T-079. Nothing here sends anything.
// TODO(T-064): each line also becomes a Router HUD entry once the HUD has its store.
import { useRef } from 'react';
import { t } from '../../core/strings';
import { TIER0_STEPS } from '../../tier0/tier0';
import type { EditorOp } from '../check/editor';
import { lineCopy, nanoLineCopy } from '../check/prescreenView';
import { PENDING_LINES, type PrescreenState, type ProgressLine } from '../checkState';
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
  /** The candidate may be sent (no failed reader, no un-ticked face, not sent yet; T-069). */
  canSend?: boolean;
  /** Opens the Send step (SCR-07). */
  onCloud?: () => void;
}

function LineMark({ line }: { line: ProgressLine }) {
  if (line.status === 'done') return <Icon name="check" className="size-4 text-muted" />;
  if (line.status === 'failed') return <Icon name="close" className="size-4 text-verdict-red" />;
  return <span aria-hidden="true" className={`inline-block size-2 rounded-full bg-muted ${line.status === 'running' ? 'motion-safe:animate-pulse' : 'opacity-40'}`} />;
}

export function PrescreenPanel({ master, state, onOp, onRetry, canSend = false, onCloud }: PrescreenPanelProps) {
  const shell = useShell();
  const online = useOnline();
  const progressRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  if (!master) return <p className="mt-2 text-sm text-muted">{t('ui.placeholder')}</p>;
  // idle (just opened, or after Try again) shows the same list, all pending, so the focus target stays mounted
  const lines = state.kind === 'idle' ? PENDING_LINES : state.lines;
  const running = state.kind !== 'done';
  const capState = shell?.caps.checked ? shell.caps.capability.state : null;
  const retry = () => {
    onRetry();
    progressRef.current?.focus(); // the alert and its button go away: focus stays on the step, never on <body>
  };

  return (
    <div className="mt-3 flex flex-col gap-4">
      <ul
        ref={progressRef}
        tabIndex={-1}
        aria-label={t('ui.prescreen.progress')}
        aria-live="polite"
        aria-busy={running}
        className="flex flex-col gap-1.5 rounded-md text-sm"
      >
        {TIER0_STEPS.map((step) => {
          const line = lines[step];
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
              <Button onClick={retry}>{t('ui.prescreen.retry')}</Button>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <PhotoStage master={master} editor={state.editor} onOp={onOp} addButtonRef={addRef} />
            <ClueList editor={state.editor} onOp={onOp} failed={state.failed} afterRemove={() => addRef.current?.focus()} />
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <div className="flex flex-wrap gap-2">
              {/* Offline: "Queue cloud check" (SCR-18) stays disabled until the offline queue exists (T-084). */}
              <Button variant="primary" disabled={!online || !canSend || !onCloud} onClick={onCloud} data-action="cloud">
                {t(online ? 'ui.prescreen.cloud' : 'ui.prescreen.queue')}
              </Button>
              <Button disabled aria-describedby="prescreen-next">{t('ui.prescreen.export')}</Button>
            </div>
            <p id="prescreen-next" className="text-sm text-muted">{t('ui.prescreen.exportSoon')}</p>
          </div>
        </>
      )}
    </div>
  );
}
