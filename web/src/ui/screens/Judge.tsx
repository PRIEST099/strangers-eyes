// web/src/ui/screens/Judge.tsx: #/judge, SCR-17 Judge Mode (T-105; D-12, D-37; ARCH §5.4, AD-09, AD-17).
// Loads the bundled /samples/manifest.json, builds the fake vault in memory (vault/judgeVault.makeJudgeVault) and makes
// it the ACTIVE vault for as long as this screen is mounted (holdJudge → vaultScan.useJudge): Tier-0, preflight, the
// gate and the tripwire then scan only it, and the real vault is never unsealed (a `#/judge` or `?judge=1` boot never
// loads it either, boot.ts). Leaving the screen (Exit, or any navigation) discards the fake vault and every sample
// session and restores the real index (vaultScan.useReal, on the next tick so StrictMode's remount does not unseal it).
// A sample runs the normal Check flow (screens/Check with `judge`): S4 for the device-class jobs, live S3 for the
// attacker, the CACHED recording when the live attacker is unavailable. Autoplay defaults to RC judge_autoplay_default;
// "Run all" plays the samples one after another.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { vaultScan } from '../../ai/vaultScan';
import { t } from '../../core/strings';
import type { AppConfig } from '../../firebase/remoteConfig';
import { activateJudgeVault, claimJudge, loadJudgeManifest, makeJudgeVault, type JudgeManifest } from '../../vault/judgeVault';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { JudgeModeBanner } from '../components/JudgeModeBanner';
import { H1, LEAD } from '../components/surface';
import { Toggle } from '../components/Toggle';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { SamplePicker } from '../judge/SamplePicker';
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

  // Presentation only (docs/DESIGN.md §5.4): when a sample starts, the picker collapses to a strip and the run scrolls to
  // the top of the page (main is the scroll container at lg; scrollIntoView finds it). On the first run the scroll waits
  // for the collapse and the cards' unmount (SamplePicker, ~300 ms), so the target does not move under the scroll; once
  // the strip is showing it scrolls at once. Reduced motion jumps instead of a smooth scroll.
  const runRef = useRef<HTMLDivElement>(null);
  const collapsed = useRef(false);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    if (!run) return;
    const go = () => runRef.current?.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    // The flag flips inside the timer, so StrictMode's effect re-run still waits for the collapse.
    const id = setTimeout(() => { collapsed.current = true; go(); }, collapsed.current ? 0 : 340);
    return () => clearTimeout(id);
  }, [run?.index, run?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps -- scroll once per started run, not on a motion-pref change

  if (rc && !rc.judgeModeEnabled) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className={H1}>{t('ui.screen.judge')}</h1>
        <p role="status" className="text-body text-muted">{t('ui.judge.disabled')}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <JudgeModeBanner onExit={exit} />
      <div className="flex flex-col gap-2">
        <h1 className={H1}>{t('ui.screen.judge')}</h1>
        {load.kind === 'loading' && <p role="status" className="text-body text-muted">{t('ui.judge.loading')}</p>}
        {load.kind === 'failed' && <p role="alert" className="text-body">{t('ui.judge.loadFailed')}</p>}
        {manifest && vault && <p className={LEAD}>{t('ui.judge.intro')}</p>}
        {manifest && vault && (
          <p className="flex max-w-[68ch] gap-2 text-small text-muted" data-testid={manifest.placeholder ? 'judge-placeholder-note' : 'judge-samples-note'}>
            <Icon name="info" className="mt-0.5 size-4" />
            {/* D-161: the CC0 disclosure stays when the answers are live recordings; only the stand-in wording goes. */}
            <span>{t(manifest.placeholder ? 'ui.judge.placeholderNote' : 'ui.judge.samplesNote')}</span>
          </p>
        )}
      </div>
      {manifest && vault && (
        <>
          <section aria-labelledby="judge-pick" className="flex flex-col gap-3">
            <h2 id="judge-pick" className="text-title font-semibold">{t('ui.judge.pick')}</h2>
            <SamplePicker samples={manifest.samples} selected={sample?.id ?? null} compact={run !== null} onPick={(i) => start(i, false)} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button variant={run ? 'secondary' : 'primary'} data-action="run-all" onClick={() => start(0, true)}>{t('ui.judge.runAll')}</Button>
              {run?.all && <span className="text-small text-muted tabular-nums">{t('ui.judge.runningAll', { n: run.index + 1, total })}</span>}
              <div className="min-w-0 basis-full sm:ml-auto sm:max-w-[26rem] sm:basis-auto">
                <Toggle label={t('ui.judge.autoplay')} hint={t('ui.judge.autoplayHint')} checked={autoplay} onChange={setAutoplay} />
              </div>
            </div>
          </section>
          {/* Below lg the window scrolls under the sticky 56 px header; at lg main scrolls. The min height gives a short
              step enough room to scroll its title to the top. `relative` makes this the containing block of the run's
              absolutely positioned sr-only spans (the stepper's), so they stay inside main's scroll box instead of
              growing the document, which would make scrollIntoView scroll the window and the header out of view. */}
          <div id="judge-run" ref={runRef} className={`relative scroll-mt-[4.5rem] lg:scroll-mt-4 ${judgeRun ? 'min-h-[calc(100dvh-4.5rem)]' : ''}`}>
            {judgeRun && <Check key={`${judgeRun.sample.id}-${run?.nonce ?? 0}`} judge={judgeRun} />}
          </div>
        </>
      )}
    </div>
  );
}
