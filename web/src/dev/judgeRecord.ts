// DEV-only Judge Mode recorder (__SE_DEV_ONLY__; RUNBOOK §6.2b step 5; D-161). Loaded by App.tsx inside
// `if (import.meta.env.DEV)`, so it is absent from production builds (check-dist scans web/dist for the marker).
// Opt-in: only with `?recordJudge=1` in the page URL (read on every answer). Then each LIVE pass-B answer in Judge Mode
// that the strict parser and every gate check accepted (never a decline, never a fake or CACHED replay, never pass A)
// is POSTed to the Vite dev server (/__se_dev/judge-record), which writes it OUTSIDE the repo
// (PRIV/raw/judge-rec/). Judge Mode only: sample photos and the fake vault, so no user data is involved.
import { devSetJudgeRecorder, type DevJudgeRecording } from '../ai/jobs/adversaryB';

export const DEV_ONLY_MARKER = '__SE_DEV_ONLY__';

function enabled(): boolean {
  try { return new URLSearchParams(location.search).get('recordJudge') === '1'; } catch { return false; }
}

export function installJudgeRecorder(): void {
  devSetJudgeRecorder((r: DevJudgeRecording) => {
    if (!enabled() || new URLSearchParams(location.search).has('fakeAdv')) return;
    void fetch('/__se_dev/judge-record', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...r, recordedAt: new Date().toISOString() }),
    }).catch(() => undefined);
  });
}
