// web/src/ui/screens/Check.tsx: #/check, the current check (SCR-05…12). T-050 skeleton: the stepper and an empty
// step panel. The pipeline (core/session.ts) advances the position with moveToStep once the check flow lands;
// revisiting a finished step keeps `reached`, so the later steps stay reachable (SPEC §8.2).
// T-053: the Import step mounts ImportDropzone. A successful import keeps the master canvas and its clean JPEG in
// refs (never React state, never storage); a new drop, paste or pick clears them at once, so later steps can never
// run on a photo the user meant to replace. The import STATUS ("Photo ready" plus the P1 GPS warning, or the error)
// lives here next to the master, not in the dropzone: the dropzone mounts only while the Import step is shown, so
// revisiting the step shows the panel that matches the stored master. The dropzone's one live region renders it.
// The step and the status are one pure reducer (ui/checkState.ts): selecting a step never touches the import status;
// only the dropzone's onStatus changes it. The original file is not kept.
// T-057: the Tesseract worker is kept warm while this screen is open (useOcrWarm; ARCH §18).
import { useCallback, useReducer, useRef } from 'react';
import { vaultScan } from '../../ai/vaultScan';
import { t } from '../../core/strings';
import { pinsWhenReady, type GpsPinLike } from '../../tier0/gpsWarning';
import type { ImportedPhoto } from '../../tier0/importPhoto';
import { ImportDropzone } from '../components/ImportDropzone';
import { StepperNav } from '../components/StepperNav';
import { CHECK_START, checkReducer } from '../checkState';
import { useOcrWarm } from '../hooks/useOcrWarm';
import type { ImportStatus } from '../importTransfer';
import { stepLabelId } from '../layout';

/**
 * The active vault's pins (Judge Mode: JUDGE_VAULT's) once its index is built, so a photo dropped while the vault is
 * unsealing still gets copy.import.gpsNear. [] before boot has chosen a vault, or if it cannot be read.
 */
const activePins = (): Promise<readonly GpsPinLike[]> => pinsWhenReady(vaultScan);

export function Check() {
  // The stepper position and the last import status (`ready` exactly while master.current is set).
  const [state, dispatch] = useReducer(checkReducer, CHECK_START);
  const master = useRef<{ canvas: HTMLCanvasElement; jpeg: Blob; sha256: string } | null>(null);
  const current = state.pos.current;
  useOcrWarm();

  const onPhoto = useCallback((p: ImportedPhoto | null) => {
    master.current = p ? { canvas: p.master, jpeg: p.jpeg, sha256: p.sha256 } : null;
  }, []);
  const onImportStatus = useCallback((status: ImportStatus) => dispatch({ type: 'importStatus', status }), []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('ui.screen.check')}</h1>
      <StepperNav current={current} reached={state.pos.reached} onSelect={(step) => dispatch({ type: 'selectStep', step })} />
      <section aria-labelledby="check-step-title" className="rounded-xl border border-line bg-surface p-4">
        <h2 id="check-step-title" className="text-lg font-semibold">
          {t(stepLabelId(current))}
        </h2>
        {current === 'import' ? (
          <div className="mt-3 flex flex-col gap-3">
            <ImportDropzone getPins={activePins} status={state.importStatus} onStatus={onImportStatus} onPhoto={onPhoto} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">{t('ui.placeholder')}</p>
        )}
      </section>
    </div>
  );
}
