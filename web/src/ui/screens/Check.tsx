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
// (checkState.maskedCandidate) that the Send step (T-069) will show; nothing is sent from here. T-066: the same run
// then asks Gemini Nano (S1, on this device only, through the gate) for clues; they join the Tier-0 findings. Steps that are not
// built yet are shown as not available (BUILT_STEPS, D-121).
// T-069/T-071/T-086 (D-137..D-139): "Check with the cloud attacker" opens the Send step. Its consent dry run builds the
// cloud JPEG from candidate.masks and checks those exact bytes (ui/check/runSend.ts); "Send this image" mints the consent
// token for that sha256 and runs pass B through the Egress Gate (ai/jobs/adversaryB.ts); a final outcome opens the
// Verdict: the referee over pass B's validated JSON → buildVerdict → VerdictCard. T-074: the referee runs on this
// device through the gate (ui/check/runSend.runReferee → ai/jobs/referee.ts, S0): Gemini Nano unioned with the rules
// (Referee: ON-DEVICE + latency), or RULES-ONLY when Nano is absent, off or fails (an honest note says which). Each photo is one session (a fresh sessionId per import epoch) with its own pass-B cache. The sent image
// and its token stay in a ref (memory only).
// T-078..T-080 (D-142..D-144): from a verdict built on a pass-B result, "Fix it on this device" opens the Fix step: the
// RULES-ONLY plan (core/fixPlan over the NEWEST pass-B result and the verdict built from it) as a checklist; Apply adds
// solid fix masks (and an optional crop) on top of the masks already sent. "Re-attack the fixed photo" runs the SAME
// dry run, a NEW consent for the new bytes, the gate and pass B ('r2', 'r3'…), then the referee: buildVerdict
// ('after_fix') vs the first verdict → compareVerdicts → VerdictCard's compare header (green only when riskReduced),
// the Before → After rows and the receipt line. At most RC max_fix_rounds re-attacks; none after any decline. Export
// is not built.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { AdvBCache, AttackOutcome } from '../../ai/jobs/adversaryB';
import type { RefereeOutcome } from '../../ai/jobs/referee';
import { vaultScan } from '../../ai/vaultScan';
import { t } from '../../core/strings';
import type { VaultItem } from '../../core/types';
import type { AppConfig } from '../../firebase/remoteConfig';
import { loadVault } from '../../vault/vaultStore';
import { pinsWhenReady, type GpsPinLike } from '../../tier0/gpsWarning';
import type { ImportedPhoto } from '../../tier0/importPhoto';
import type { EditorOp } from '../check/editor';
import { runPrescreen } from '../check/runPrescreen';
import { consentTo, newAttackCache, runAttack, runConsentDryRun, runReferee, type SentImage } from '../check/runSend';
import { consentTierCopy, userUnmaskedBoxes, verdictOf } from '../check/sendFlow';
import { compareRows, receiptParams } from '../check/fixFlow';
import { FixPanel } from '../check/FixPanel';
import { deterministicFix, residualAfter, selectedFix } from '../../core/fixPlan';
import { compareVerdicts } from '../../core/verdict';
import type { PxRect } from '../../core/types';
import { AttackPanel } from '../components/AttackPanel';
import { Button } from '../components/Button';
import { ConsentPanel } from '../components/ConsentPanel';
import { VerdictCard } from '../components/VerdictCard';
import { ImportDropzone } from '../components/ImportDropzone';
import { PrescreenPanel } from '../components/PrescreenPanel';
import { StepperNav } from '../components/StepperNav';
import { BUILT_STEPS, CHECK_START, checkReducer, fixBlocked, latestResult, maskedCandidate, settledReattack } from '../checkState';
import { useOcrWarm } from '../hooks/useOcrWarm';
import type { ImportStatus } from '../importTransfer';
import { stepLabelId } from '../layout';

/**
 * The active vault's pins (Judge Mode: JUDGE_VAULT's) once its index is built, so a photo dropped while the vault is
 * unsealing still gets copy.import.gpsNear. [] before boot has chosen a vault, or if it cannot be read.
 */
const activePins = (): Promise<readonly GpsPinLike[]> => pinsWhenReady(vaultScan);

/** The active vault for the referee: Judge Mode's fake vault, else the sealed real one ([] if it cannot be read). */
async function activeVault(): Promise<readonly VaultItem[]> {
  if (vaultScan.mode() === 'judge') return vaultScan.judgeVault() ?? [];
  try { return await loadVault(); } catch { return []; }
}

/** RC values the slice shows (model id, tier, bands, θ); defaults while RC cannot be read. */
function useRc() {
  const [rc, setRc] = useState<AppConfig | null>(null);
  useEffect(() => {
    let live = true;
    void import('../../firebase/remoteConfig').then((m) => { if (live) setRc(m.cfg()); }, () => undefined);
    return () => { live = false; };
  }, []);
  return rc;
}

const NO_MASKS: readonly PxRect[] = Object.freeze([]) as readonly PxRect[];

const newSessionId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random()}`);

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
  const rc = useRc();
  // One session per photo (import epoch): its id, its pass-B cache, and the image it sent (memory only).
  const session = useRef<{ epoch: number; id: string; cache: AdvBCache; sent: SentImage | null; resent: SentImage | null }>({ epoch: -1, id: '', cache: newAttackCache(), sent: null, resent: null });
  if (session.current.epoch !== epoch) session.current = { epoch, id: newSessionId(), cache: newAttackCache(), sent: null, resent: null };
  const flowRun = state.flow.run;
  const flowNow = useRef(flowRun);
  flowNow.current = flowRun;
  const heldSha = master.current?.sha256 ?? null;
  const candidate = useMemo(() => maskedCandidate(state, heldSha), [state.prescreen, state.importStatus, heldSha]);
  const sendKind = state.flow.send.kind;
  const attackKind = state.flow.attack.kind;

  const onPhoto = useCallback((p: ImportedPhoto | null) => {
    master.current = p ? { canvas: p.master, jpeg: p.jpeg, sha256: p.sha256 } : null;
  }, []);
  const onImportStatus = useCallback((status: ImportStatus) => dispatch({ type: 'importStatus', status }), []);
  const onOp = useCallback((op: EditorOp) => dispatch({ type: 'edit', op }), []);
  const onRetry = useCallback(() => dispatch({ type: 'retry' }), []);
  const onCloud = useCallback(() => dispatch({ type: 'toSend' }), []);
  const onCancelSend = useCallback(() => dispatch({ type: 'cancelSend' }), []);
  const onToVerdict = useCallback(() => dispatch({ type: 'toVerdict' }), []);

  // The consent dry run, once per flow run, when the Send step is shown (local only; while the cloud is off the
  // sheet shows the reason instead and offers no Send, ConsentPanel).
  useEffect(() => {
    const m = master.current;
    if (current !== 'send' || sendKind !== 'idle' || attackKind !== 'idle' || !m || !candidate || candidate.blockedBy.length > 0) return;
    const run = flowRun;
    dispatch({ type: 'preflightStart', run });
    void runConsentDryRun(m.canvas, candidate.masks, userUnmaskedBoxes(candidate)).then((dry) => dispatch({ type: 'preflightDone', run, dry }));
  }, [current, sendKind, attackKind, flowRun, candidate]);

  const attack = useCallback((run: number) => {
    const sent = session.current.sent;
    if (!sent) return;
    const cache = session.current.cache;
    void runAttack(sent, cache).then(
      (outcome) => dispatch({ type: 'attackDone', run, outcome }),
      () => undefined, // ABORTED: a newer episode replaced this one
    );
  }, []);
  const onSend = useCallback(() => {
    const s = state.flow.send;
    if (s.kind !== 'ready' || s.dry.failed.length > 0) return;
    const run = s.run;
    const sid = session.current.id;
    void consentTo(s.dry, sid).then((sent) => {
      if (flowNow.current !== run || session.current.id !== sid) return;
      session.current.sent = sent;
      dispatch({ type: 'sent', run });
      attack(run);
    });
  }, [state.flow.send, attack]);
  const onRetryAttack = useCallback(() => {
    const run = flowNow.current;
    dispatch({ type: 'retryAttack', run });
    attack(run);
  }, [attack]);

  // The verdict: the active vault (read on this device) and the rules referee over pass B.
  const [vault, setVault] = useState<readonly VaultItem[] | null>(null);
  useEffect(() => {
    if (attackKind !== 'done') { setVault(null); return; }
    let live = true;
    void activeVault().then((v) => { if (live) setVault(v); });
    return () => { live = false; };
  }, [attackKind, flowRun]);
  const outcome = state.flow.attack.kind === 'done' ? state.flow.attack.outcome : null;
  // T-074: one referee run per pass-B result and vault, on this device (Nano through the gate, else RULES-ONLY).
  const [refs, setRefs] = useState<{ vault: readonly VaultItem[] | null; by: ReadonlyMap<AttackOutcome, RefereeOutcome> }>({ vault: null, by: new Map() });
  const refPending = useRef<{ vault: readonly VaultItem[] | null; started: Set<AttackOutcome> }>({ vault: null, started: new Set() });
  const refOf = useCallback((o: AttackOutcome | null): RefereeOutcome | undefined => (o && refs.vault === vault ? refs.by.get(o) : undefined), [refs, vault]);
  const latest = latestResult(state);
  const afterOutcome = settledReattack(state);
  useEffect(() => {
    if (!vault) return;
    if (refPending.current.vault !== vault) refPending.current = { vault, started: new Set() };
    const batch = refPending.current;
    for (const o of [outcome, afterOutcome, latest]) {
      if (!o || o.kind !== 'result' || batch.started.has(o)) continue;
      batch.started.add(o);
      void runReferee(o.result, vault, session.current.id, vaultScan.threshold()).then((r) => {
        setRefs((cur) => {
          if (refPending.current !== batch) return cur; // the vault was re-read meanwhile: this run is stale
          const by = new Map(cur.vault === vault ? cur.by : []);
          by.set(o, r);
          return { vault, by };
        });
      });
    }
  }, [outcome, afterOutcome, latest, vault]);
  /** The VerdictCard referee row: the referee's route and latency, and the honest note when the rules decided. */
  const refereeRow = useCallback((r: RefereeOutcome | undefined, rulesMs: number) => {
    if (!r) return { route: 'RULES_ONLY' as const, latencyMs: rulesMs };
    const note = r.route === 'ON_DEVICE' ? null : r.fallback === 'device_failed' ? t('ui.verdict.refFallback') : r.fallback === 'no_device' ? t('copy.ref.rules') : null;
    return { route: r.route, latencyMs: r.latencyMs, note };
  }, []);
  const verdict = useMemo(() => {
    if (!outcome || !vault) return null;
    const ref = refOf(outcome);
    if (outcome.kind === 'result' && !ref) return null; // the referee is still running
    const t0 = performance.now();
    const v = verdictOf(outcome, vault, candidate, { theta: vaultScan.threshold(), ...(rc ? { bands: rc.bandsM } : {}), ...(ref ? { matches: ref.matches } : {}) });
    return { v, ms: Math.round(performance.now() - t0), ref };
  }, [outcome, vault, candidate, rc, refOf]);
  // ---------- Fix → Re-attack (T-078..T-080) ----------
  const maxRounds = rc?.maxFixRounds ?? 3;
  const blocked = fixBlocked(state, maxRounds);
  const blockedCopy = blocked === 'declined' ? t('ui.fix.declined') : blocked === 'noResult' ? t('ui.fix.needsResult') : blocked === 'maxRounds' ? t('copy.fix.maxRounds') : null;
  const re = state.reattack;
  const applied = state.fix.applied;
  // The masks of the first image sent (the candidate's plus the dry run's auto masks), then every fix applied since.
  const sentMasks = state.flow.send.kind === 'ready' ? state.flow.send.dry.masks : NO_MASKS;
  const fixMasks = useMemo(() => [...sentMasks, ...(applied?.masks ?? [])], [sentMasks, applied]);
  const plan = useMemo(() => {
    const m = master.current;
    const ref = refOf(latest);
    if (!latest || !vault || !m || !candidate || !ref) return null;
    const v = verdictOf(latest, vault, candidate, { theta: vaultScan.threshold(), ...(rc ? { bands: rc.bandsM } : {}), matches: ref.matches });
    const input = { adv: latest.result, verdict: v, vault, width: m.canvas.width, height: m.canvas.height, padRatio: rc?.maskPadRatio ?? 0.15 };
    return { input, fix: deterministicFix(input) };
  }, [latest, vault, candidate, rc, refOf]);
  const unchecked = state.fix.unchecked;
  const cropOff = state.fix.cropOff;
  const residual = useMemo(() => (plan ? residualAfter(plan.input, plan.fix, new Set(unchecked), cropOff) : null), [plan, unchecked, cropOff]);
  const onToFix = useCallback(() => dispatch({ type: 'toFix', maxRounds }), [maxRounds]);
  const onApplyFix = useCallback(() => {
    if (!plan) return;
    const sel = selectedFix(plan.fix, new Set(unchecked), cropOff);
    dispatch({ type: 'applyFix', masks: sel.masks, crop: sel.crop });
  }, [plan, unchecked, cropOff]);
  const onToReattack = useCallback(() => dispatch({ type: 'toReattack', maxRounds }), [maxRounds]);

  // The re-attack's dry run: the same preflight as the first send, on the fixed bytes (fix masks + crop).
  const reSendKind = re.send.kind;
  const reAttackKind = re.attack.kind;
  const reRun = re.run;
  useEffect(() => {
    const m = master.current;
    if (current !== 'reattack' || !re.pending || reSendKind !== 'idle' || reAttackKind !== 'idle' || !m || !candidate || !applied) return;
    const run = reRun;
    dispatch({ type: 'reflightStart', run });
    void runConsentDryRun(m.canvas, fixMasks, userUnmaskedBoxes(candidate), applied.crop).then((dry) => dispatch({ type: 'reflightDone', run, dry }));
  }, [current, re.pending, reSendKind, reAttackKind, reRun, candidate, applied, fixMasks]);
  const reNow = useRef(reRun);
  reNow.current = reRun;
  const reattack = useCallback((run: number, runId: string) => {
    const sent = session.current.resent;
    if (!sent) return;
    void runAttack(sent, session.current.cache, runId).then(
      (outcome) => dispatch({ type: 'reattackDone', run, outcome }),
      () => undefined,
    );
  }, []);
  const rounds = re.rounds;
  const onResend = useCallback(() => {
    const s = state.reattack.send;
    if (s.kind !== 'ready' || s.dry.failed.length > 0) return;
    const run = s.run;
    const sid = session.current.id;
    const runId = `r${rounds + 2}`;
    void consentTo(s.dry, sid).then((sent) => {
      if (reNow.current !== run || session.current.id !== sid) return;
      session.current.resent = sent;
      dispatch({ type: 'resent', run });
      reattack(run, runId);
    });
  }, [state.reattack.send, rounds, reattack]);
  const onRetryReattack = useCallback(() => {
    const run = reNow.current;
    dispatch({ type: 'retryReattack', run });
    reattack(run, `r${rounds + 1}`);
  }, [reattack, rounds]);
  const compare = useMemo(() => {
    if (!afterOutcome || !vault || !verdict) return null;
    const ref = refOf(afterOutcome);
    if (afterOutcome.kind === 'result' && !ref) return null; // the referee is still running
    const t0 = performance.now();
    const after = verdictOf(afterOutcome, vault, candidate, { theta: vaultScan.threshold(), phase: 'after_fix', ...(rc ? { bands: rc.bandsM } : {}), ...(ref ? { matches: ref.matches } : {}) });
    return { cmp: compareVerdicts(verdict.v, after), ms: Math.round(performance.now() - t0), ref };
  }, [afterOutcome, vault, verdict, candidate, rc, refOf]);
  const allOutcomes = useMemo(() => (outcome ? [outcome, ...re.history] : [...re.history]), [outcome, re.history]);
  const onDeviceCalls = allOutcomes.filter((o) => refOf(o)?.route === 'ON_DEVICE').length;
  const prevSentMasks = re.lastSentMasks;
  const fixAction = blocked === null && latest ? (
    <Button variant="primary" data-action="fix" onClick={onToFix}>{state.reattack.rounds > 0 ? t('ui.fix.again') : t('copy.fix.button')}</Button>
  ) : null;

  const devFake = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('fakeAdv') : null;
  const devNano = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('fakeNano') : null;

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
      { isCurrent: () => epochNow.current === run, sessionId: session.current.id },
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
          <PrescreenPanel
            master={master.current?.canvas ?? null} state={state.prescreen} onOp={onOp} onRetry={onRetry}
            canSend={!!candidate && candidate.blockedBy.length === 0 && attackKind === 'idle'} onCloud={onCloud}
          />
        )}
        {devFake && (current === 'send' || current === 'attack' || current === 'reattack') && (
          <p className="mt-2 rounded-md border border-dashed border-line px-2 py-1 font-mono text-xs text-muted">{t('ui.dev.fakeAdversary', { mode: devFake })}</p>
        )}
        {devNano && (current === 'prescreen' || current === 'verdict' || current === 'fix' || current === 'reattack') && (
          <p className="mt-2 rounded-md border border-dashed border-line px-2 py-1 font-mono text-xs text-muted">{t('ui.dev.fakeNano', { mode: devNano })}</p>
        )}
        {current === 'send' && (
          <ConsentPanel
            send={state.flow.send} candidate={candidate} tierCopy={consentTierCopy(rc?.dataTier ?? 'free')}
            model={rc?.adversaryModel ?? ''} sent={attackKind !== 'idle'} onSend={onSend} onCancel={onCancelSend}
          />
        )}
        {current === 'attack' && (
          <AttackPanel attack={state.flow.attack} model={rc?.adversaryModel ?? ''} onRetry={onRetryAttack} onToVerdict={onToVerdict} />
        )}
        {current === 'verdict' && (
          verdict && vault ? (
            <div className="mt-3 flex flex-col gap-3">
              <VerdictCard
                verdict={verdict.v} vault={vault} referee={refereeRow(verdict.ref, verdict.ms)} headingLevel={3}
                actions={fixAction ?? (blockedCopy ? <p className="text-sm text-muted">{blockedCopy}</p> : null)}
              />
              <p className="text-sm text-muted">{t('ui.verdict.nextSoon')}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">{outcome?.kind === 'result' && vault ? t('copy.ref.running') : t('ui.verdict.loading')}</p>
          )
        )}
        {current === 'fix' && (
          <FixPanel
            master={master.current?.canvas ?? null} baseMasks={fixMasks} baseCrop={applied?.crop ?? null} fix={plan?.fix ?? null}
            unchecked={unchecked} cropOff={cropOff} residual={residual}
            applied={re.pending && applied ? { added: state.fix.lastAdded } : null}
            blockedCopy={re.pending ? (blocked === 'declined' || blocked === 'maxRounds' ? blockedCopy : null) : blockedCopy}
            round={{ n: Math.min(rounds + 1, maxRounds), max: maxRounds }}
            onToggle={(clueId) => dispatch({ type: 'toggleFixMask', clueId })} onToggleCrop={() => dispatch({ type: 'toggleFixCrop' })}
            onApply={onApplyFix} onCancel={() => dispatch({ type: 'cancelFix' })} onReattack={onToReattack}
          />
        )}
        {current === 'reattack' && reAttackKind === 'idle' && (
          <div className="mt-3 flex flex-col gap-2">
            {re.send.kind === 'ready' && <p className="text-sm font-medium" data-testid="consent-diff">{t('ui.consent.diff', { n: Math.max(0, re.send.dry.masks.length - prevSentMasks) })}</p>}
            <ConsentPanel
              send={re.send} candidate={candidate} tierCopy={consentTierCopy(rc?.dataTier ?? 'free')}
              model={rc?.adversaryModel ?? ''} sent={false} onSend={onResend} onCancel={() => dispatch({ type: 'cancelResend' })}
            />
          </div>
        )}
        {current === 'reattack' && reAttackKind !== 'idle' && !afterOutcome && (
          <AttackPanel attack={re.attack} model={rc?.adversaryModel ?? ''} onRetry={onRetryReattack} onToVerdict={() => dispatch({ type: 'reattackSettle' })} />
        )}
        {current === 'reattack' && afterOutcome && (
          compare && vault ? (
            <div className="mt-3 flex flex-col gap-3" data-testid="compare">
              <p className="text-xs text-muted">{t('ui.fix.round', { n: rounds, max: maxRounds })}</p>
              <VerdictCard
                verdict={compare.cmp.after} comparison={compare.cmp} vault={vault} referee={refereeRow(compare.ref, compare.ms)} headingLevel={3}
                actions={fixAction ?? (blockedCopy ? <p className="text-sm text-muted">{blockedCopy}</p> : null)}
              />
              {compareRows(compare.cmp.before, compare.cmp.after, vault).length > 0 && (
                <div>
                  <p className="text-sm font-medium">{t('ui.compare.title')}</p>
                  <ul className="mt-1 flex flex-col gap-1 text-sm" data-testid="compare-rows">
                    {compareRows(compare.cmp.before, compare.cmp.after, vault).map((row, i) => <li key={i}>{row}</li>)}
                  </ul>
                </div>
              )}
              <p className="font-mono text-xs text-muted" data-testid="receipt">{t('copy.receipt.line', receiptParams(allOutcomes, onDeviceCalls))}</p>
              <p className="text-sm text-muted">{t('ui.verdict.nextSoon')}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">{t('ui.verdict.loading')}</p>
          )
        )}
        {current === 'export' && <p className="mt-2 text-sm text-muted">{t('ui.placeholder')}</p>}
      </section>
    </div>
  );
}
