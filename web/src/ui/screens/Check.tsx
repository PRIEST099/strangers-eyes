// web/src/ui/screens/Check.tsx: #/check, the current check (SCR-05…12). The stepper and one step panel.
// T-053: the Import step mounts ImportDropzone. A successful import keeps the master canvas and its clean JPEG in
// refs (never React state, never storage); a new drop, paste or pick clears them at once, so later steps can never
// run on a photo the user meant to replace. The import STATUS ("Photo ready" plus the P1 GPS warning, or the error)
// lives here next to the master, not in the dropzone: the dropzone mounts only while the Import step is shown, so
// revisiting the step shows the panel that matches the stored master. The dropzone's one live region renders it.
// The step, the status and the pre-screen are one pure reducer (ui/checkState.ts): selecting a step never touches the
// import status; only the dropzone's onStatus changes it (and a new attempt drops the pre-screen and later steps).
// The original file is not kept.
// T-057: the Tesseract worker is kept warm while this screen is open (useOcrWarm; ARCH §18).
// T-068: "Continue to pre-screen" moves to the Pre-screen step (AC-100), which runs Tier-0 once per photo on this
// device (ui/check/runPrescreen.ts) and then shows the mask editor. Its result is the masked frame candidate
// (checkState.maskedCandidate) that the Send step (T-069) will show; nothing is sent from here. Steps that are not
// built yet are shown as not available (BUILT_STEPS, D-121).
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { vaultScan } from '../../ai/vaultScan';
import { t } from '../../core/strings';
import { pinsWhenReady, type GpsPinLike } from '../../tier0/gpsWarning';
import type { ImportedPhoto } from '../../tier0/importPhoto';
import type { EditorOp } from '../check/editor';
import { runPrescreen } from '../check/runPrescreen';
import { Button } from '../components/Button';
import { ImportDropzone } from '../components/ImportDropzone';
import { PrescreenPanel } from '../components/PrescreenPanel';
import { StepperNav } from '../components/StepperNav';
import { BUILT_STEPS, CHECK_START, checkReducer } from '../checkState';
import { useOcrWarm } from '../hooks/useOcrWarm';
import type { ImportStatus } from '../importTransfer';
import { stepLabelId } from '../layout';

/**
 * The active vault's pins (Judge Mode: JUDGE_VAULT's) once its index is built, so a photo dropped while the vault is
 * unsealing still gets copy.import.gpsNear. [] before boot has chosen a vault, or if it cannot be read.
 */
const activePins = (): Promise<readonly GpsPinLike[]> => pinsWhenReady(vaultScan);

export function Check() {
  // The stepper position, the last import status (`ready` exactly while master.current is set) and the pre-screen.
  const [state, dispatch] = useReducer(checkReducer, CHECK_START);
  const master = useRef<{ canvas: HTMLCanvasElement; jpeg: Blob; sha256: string } | null>(null);
  // The epoch whose Tier-0 run has been started, and the epoch in force (read by a run to see it was superseded).
  const started = useRef(-1);
  const epochNow = useRef(state.epoch);
  epochNow.current = state.epoch;
  const current = state.pos.current;
  const prescreenKind = state.prescreen.kind;
  const epoch = state.epoch;
  useOcrWarm();

  const onPhoto = useCallback((p: ImportedPhoto | null) => {
    master.current = p ? { canvas: p.master, jpeg: p.jpeg, sha256: p.sha256 } : null;
  }, []);
  const onImportStatus = useCallback((status: ImportStatus) => dispatch({ type: 'importStatus', status }), []);
  const onOp = useCallback((op: EditorOp) => dispatch({ type: 'edit', op }), []);
  const onRetry = useCallback(() => dispatch({ type: 'retry' }), []);

  // Tier-0 runs once per photo, when the Pre-screen step is first shown (and again after Try again). The run number is
  // the epoch (D-133): never started twice for one epoch (StrictMode runs an effect twice in dev), and the reducer
  // ignores a run whose photo has been replaced meanwhile. A superseded run skips the readers it has not started yet.
  useEffect(() => {
    const m = master.current;
    if (current !== 'prescreen' || prescreenKind !== 'idle' || !m || started.current === epoch) return;
    started.current = epoch;
    const run = epoch;
    dispatch({ type: 'prescreenStart', run, sha256: m.sha256 });
    void runPrescreen(
      { canvas: m.canvas, jpeg: m.jpeg },
      (report) => dispatch({ type: 'prescreenStep', run, report }),
      { isCurrent: () => epochNow.current === run },
    ).then((outcome) => dispatch({ type: 'prescreenDone', run, outcome }));
  }, [current, prescreenKind, epoch]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('ui.screen.check')}</h1>
      <StepperNav
        current={current}
        reached={state.pos.reached}
        available={BUILT_STEPS}
        onSelect={(step) => dispatch({ type: 'selectStep', step })}
      />
      <section aria-labelledby="check-step-title" className="rounded-xl border border-line bg-surface p-4">
        <h2 id="check-step-title" className="text-lg font-semibold">
          {t(stepLabelId(current))}
        </h2>
        {current === 'import' && (
          <div className="mt-3 flex flex-col gap-3">
            <ImportDropzone getPins={activePins} status={state.importStatus} onStatus={onImportStatus} onPhoto={onPhoto} />
            {state.importStatus.kind === 'ready' && (
              <Button variant="primary" className="self-start" data-action="continue" onClick={() => dispatch({ type: 'continue' })}>
                {t('ui.check.continue')}
              </Button>
            )}
          </div>
        )}
        {current === 'prescreen' && (
          <PrescreenPanel master={master.current?.canvas ?? null} state={state.prescreen} onOp={onOp} onRetry={onRetry} />
        )}
        {current !== 'import' && current !== 'prescreen' && <p className="mt-2 text-sm text-muted">{t('ui.placeholder')}</p>}
      </section>
    </div>
  );
}
