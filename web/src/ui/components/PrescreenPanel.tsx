// web/src/ui/components/PrescreenPanel.tsx: the Pre-screen step (SPEC SCR-06; T-068). The progress list (each line with
// a badge and latency), then the photo with its masks and the side list. D-179: the four Tier-0 lines carry BUILT-IN
// with their engine (code, MediaPipe, Tesseract), never RULES-ONLY: they always run on this device, with or without
// Nano, so RULES-ONLY (a model fallback, D-25) stays for the Nano line when Nano is missing. T-066: the
// "Looking for clues" line is the Nano pre-screen's: ON-DEVICE with its count and latency when Gemini Nano answered,
// else RULES-ONLY and why (prescreenView.nanoResultLine; before it answers, by capability state). A failed
// reader blocks the photo (fail closed, D-123) and offers Try again; after it, focus goes to the progress list, which
// stays mounted (all pending) while the run restarts (D-132). "Check with the cloud attacker" opens the Send step
// (T-069) when the candidate may be sent; "Just clean and export" opens the covered-copy card (D-185). Nothing here sends anything.
// The Tier-0 lines make no model call and are not HUD entries (D-179); the Nano line's gate call is.
import { useRef, type ReactNode } from 'react';
import { t } from '../../core/strings';
import { TIER0_STEPS, type Tier0StepId } from '../../tier0/tier0';
import type { EditorOp } from '../check/editor';
import { lineCopy, nanoResultLine } from '../check/prescreenView';
import { PENDING_LINES, type PrescreenState, type ProgressLine } from '../checkState';
import { useOnline } from '../hooks/useOnline';
import { useShell } from '../shellContext';
import { Badge } from './Badge';
import { BuiltInBadge, type BuiltInEngine } from './BuiltInBadge';
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
  /** Judge Mode: the clue step is S4 (may run in the cloud on the sample), so nothing is predicted before it answers. */
  judge?: boolean;
  /** "Just clean and export" (SCR-12, D-185): the covered-copy card, when the candidate may be exported. */
  exportCard?: ReactNode;
}

/** What each always-on Tier-0 step runs on (D-179). */
const ENGINE: Record<Tier0StepId, BuiltInEngine> = { metadata: 'code', faces: 'mediapipe', text: 'tesseract', vault: 'code' };

function LineMark({ line }: { line: ProgressLine }) {
  if (line.status === 'done') return <Icon name="check" className="size-4 text-fg" />;
  if (line.status === 'failed') return <Icon name="close" className="size-4 text-verdict-red" />;
  return <span aria-hidden="true" className={`inline-block size-2 rounded-full bg-muted ${line.status === 'running' ? 'motion-safe:animate-pulse' : 'opacity-40'}`} />;
}

const NOTE_ID = 'prescreen-builtin-note';

export function PrescreenPanel({ master, state, onOp, onRetry, canSend = false, onCloud, judge = false, exportCard }: PrescreenPanelProps) {
  const shell = useShell();
  const online = useOnline();
  const progressRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  if (!master) return <p className="mt-2 text-body text-muted">{t('ui.placeholder')}</p>;
  // idle (just opened, or after Try again) shows the same list, all pending, so the focus target stays mounted
  const lines = state.kind === 'idle' ? PENDING_LINES : state.lines;
  const running = state.kind !== 'done';
  const anyDone = TIER0_STEPS.some((st) => lines[st].status === 'done');
  const capState = shell?.caps.checked ? shell.caps.capability.state : null;
  const tier0Done = TIER0_STEPS.every((st) => lines[st].status === 'done' || lines[st].status === 'failed');
  const nanoLine = nanoResultLine(state.kind === 'done' ? state.nano : undefined, capState, { judge, tier0Done });
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
        aria-describedby={anyDone ? NOTE_ID : undefined}
        className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface-2 px-3 text-small"
      >
        {TIER0_STEPS.map((step) => {
          const line = lines[step];
          const c = lineCopy(step, line);
          const text = c.name ? t(c.id, { name: t(c.name) }) : t(c.id, c.params);
          return (
            <li key={step} data-step={step} data-status={line.status} className="flex min-h-10 flex-wrap items-center gap-2 py-1.5">
              <span className="inline-flex size-4 items-center justify-center"><LineMark line={line} /></span>
              <span className={line.status === 'failed' ? 'text-verdict-red' : undefined}>{text}</span>{' '}
              {/* real spaces between the parts, so the line reads "Finding faces (1) BUILT-IN · MediaPipe 38 ms" (F-177) */}
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                {line.status !== 'pending' && <BuiltInBadge engine={ENGINE[step]} dataKey={step} />}{' '}
                {line.ms !== undefined && <span className="font-mono text-small tabular-nums text-muted">{t('ui.prescreen.ms', { ms: line.ms })}</span>}
              </span>
            </li>
          );
        })}
        <li data-step="nano" data-route={nanoLine.route ?? undefined} className="flex items-start gap-2 py-2">
          <span className="inline-flex h-5 w-4 shrink-0 items-center justify-center"><Icon name="chip" className="size-4 text-muted" /></span>
          <span className="min-w-0">
            {t(nanoLine.id, nanoLine.params)}{' '}
            {nanoLine.route ? <Badge route={nanoLine.route} className="align-middle" /> : nanoLine.pending ? <span className="text-muted" data-pending="">{t('ui.hud.running')}</span> : null}{' '}
            {nanoLine.ms !== undefined && <span className="font-mono text-small tabular-nums text-muted">{t('ui.prescreen.ms', { ms: nanoLine.ms })}</span>}
          </span>
        </li>
      </ul>
      {anyDone && <p id={NOTE_ID} className="-mt-2 text-caption text-muted" data-testid="builtin-note">{t('ui.prescreen.builtinNote')}</p>}

      {state.kind === 'done' && (
        <>
          {state.failed.length > 0 && (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-verdict-red bg-verdict-red-bg p-4 text-body">
              <p className="flex items-start gap-2"><Icon name="alert" className="mt-0.5 size-5 text-verdict-red" />{t('ui.prescreen.failed')}</p>
              <Button onClick={retry}>{t('ui.prescreen.retry')}</Button>
            </div>
          )}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <PhotoStage master={master} editor={state.editor} onOp={onOp} addButtonRef={addRef} />
            <ClueList editor={state.editor} onOp={onOp} failed={state.failed} afterRemove={() => addRef.current?.focus()} />
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {/* Offline: the button reads "Cloud check needs a connection" and stays disabled; there is no offline queue (T-084). */}
              <Button variant="primary" size="lg" disabled={!online || !canSend || !onCloud} onClick={onCloud} data-action="cloud">
                <Icon name="cloud" className="size-5" />
                {t(online ? 'ui.prescreen.cloud' : 'ui.prescreen.queue')}
              </Button>
              {!exportCard && <Button disabled aria-describedby="prescreen-next">{t('ui.prescreen.export')}</Button>}
            </div>
            {exportCard
              ? <details className="group" data-testid="prescreen-export"><summary className="cursor-pointer text-body font-medium">{t('ui.prescreen.export')}</summary><p className="mt-1 text-small text-muted">{t('ui.prescreen.exportSoon')}</p><div className="mt-3">{exportCard}</div></details>
              : <p id="prescreen-next" className="text-small text-muted">{t('ui.prescreen.exportBlocked')}</p>}
          </div>
        </>
      )}
    </div>
  );
}
