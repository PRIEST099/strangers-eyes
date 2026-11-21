// web/src/ui/screens/Judge.tsx: #/judge, SCR-17 Judge Mode (T-105; D-12, D-37; ARCH §5.4, AD-09, AD-17).
// Loads the bundled /samples/manifest.json, builds the fake vault in memory (vault/judgeVault.makeJudgeVault) and makes
// it the ACTIVE vault for as long as this screen is mounted (holdJudge → vaultScan.useJudge): Tier-0, preflight, the
// gate and the tripwire then scan only it, and the real vault is never unsealed (a `#/judge` or `?judge=1` boot never
// loads it either, boot.ts). Leaving the screen (Exit, or any navigation) discards the fake vault and every sample
// session and restores the real index (vaultScan.useReal, on the next tick so StrictMode's remount does not unseal it).
// A sample runs the normal Check flow (screens/Check with `judge`): S4 for the device-class jobs, live S3 for the
// attacker, the CACHED recording when the live attacker is unavailable. Autoplay defaults to RC judge_autoplay_default;
// "Run all" plays the samples one after another.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { vaultScan } from '../../ai/vaultScan';
import { t } from '../../core/strings';
import type { AppConfig } from '../../firebase/remoteConfig';
import { activateJudgeVault, claimJudge, loadJudgeManifest, makeJudgeVault, type JudgeManifest } from '../../vault/judgeVault';
import { Button } from '../components/Button';
import { JudgeModeBanner } from '../components/JudgeModeBanner';
import { Toggle } from '../components/Toggle';
import { Check } from './Check';

function useRc(): AppConfig | null {
  const [rc, setRc] = useState<AppConfig | null>(null);
  useEffect(() => {
    let live = true;
    void import('../../firebase/remoteConfig').then((m) => { if (live) setRc(m.cfg()); }, () => undefined);
    return () => { live = false; };
  }, []);
  return rc;
}

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; manifest: JudgeManifest };

export function Judge() {
  const rc = useRc();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  useEffect(() => claimJudge(vaultScan), []);
  useEffect(() => {
    let live = true;
    void loadJudgeManifest().then((m) => { if (live) setLoad(m ? { kind: 'ready', manifest: m } : { kind: 'failed' }); });
    return () => { live = false; };
  }, []);
  const manifest = load.kind === 'ready' ? load.manifest : null;
  // One fake vault per visit (a new object: the gate's S4 proof is identity, and Exit discards it).
  const vault = useMemo(() => (manifest ? makeJudgeVault(manifest) : null), [manifest]);
  useEffect(() => { if (vault) activateJudgeVault(vaultScan, vault); }, [vault]);

  const [autoplayPick, setAutoplay] = useState<boolean | null>(null);
  const autoplay = autoplayPick ?? rc?.judgeAutoplayDefault ?? true;
  // The sample running now (null: the picker), a nonce so "run again" starts a fresh session, and the Run-all queue.
  const [run, setRun] = useState<{ index: number; nonce: number; all: boolean } | null>(null);
  const start = useCallback((index: number, all: boolean) => setRun((r) => ({ index, nonce: (r?.nonce ?? 0) + 1, all })), []);
  const total = manifest?.samples.length ?? 0;
  const onFinished = useCallback(() => {
    setTimeout(() => setRun((r) => (r && r.all && r.index + 1 < total ? { index: r.index + 1, nonce: r.nonce + 1, all: true } : r)), 2500);
  }, [total]);
  const exit = useCallback(() => { location.hash = '#/'; }, []);
  const sample = manifest && run ? manifest.samples[run.index] ?? null : null;
  const judgeRun = useMemo(() => (sample && vault ? { sample, vault, autoplay, onFinished } : null), [sample, vault, autoplay, onFinished]);

  if (rc && !rc.judgeModeEnabled) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t('ui.screen.judge')}</h1>
        <p role="status" className="text-sm text-muted">{t('ui.judge.disabled')}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <JudgeModeBanner onExit={exit} />
      <h1 className="text-2xl font-semibold tracking-tight">{t('ui.screen.judge')}</h1>
      {load.kind === 'loading' && <p role="status" className="text-sm text-muted">{t('ui.judge.loading')}</p>}
      {load.kind === 'failed' && <p role="alert" className="text-sm">{t('ui.judge.loadFailed')}</p>}
      {manifest && vault && (
        <>
          <p className="text-sm">{t('ui.judge.intro')}</p>
          {manifest.placeholder && <p className="text-sm text-muted" data-testid="judge-placeholder-note">{t('ui.judge.placeholderNote')}</p>}
          <section aria-labelledby="judge-pick" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <h2 id="judge-pick" className="text-lg font-semibold">{t('ui.judge.pick')}</h2>
            <ul className="flex flex-col gap-2">
              {manifest.samples.map((s, i) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <Button variant={run?.index === i ? 'primary' : 'secondary'} data-sample={s.id} onClick={() => start(i, false)}>{s.title}</Button>
                  {s.placeholder && <span className="rounded border border-dashed border-line px-1.5 py-0.5 font-mono text-xs text-muted">{t('ui.judge.placeholder')}</span>}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Button data-action="run-all" onClick={() => start(0, true)}>{t('ui.judge.runAll')}</Button>
              {run?.all && <span className="text-sm text-muted">{t('ui.judge.runningAll', { n: run.index + 1, total })}</span>}
            </div>
            <Toggle label={t('ui.judge.autoplay')} hint={t('ui.judge.autoplayHint')} checked={autoplay} onChange={setAutoplay} />
          </section>
          {judgeRun && <Check key={`${judgeRun.sample.id}-${run?.nonce ?? 0}`} judge={judgeRun} />}
        </>
      )}
    </div>
  );
}
