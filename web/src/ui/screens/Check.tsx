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
// plan (BUILT-IN · code, D-179: core/fixPlan over the NEWEST pass-B result and the verdict built from it) as a checklist; Apply adds
// solid fix masks (and an optional crop) on top of the masks already sent. "Re-attack the fixed photo" runs the SAME
// dry run, a NEW consent for the new bytes, the gate and pass B ('r2', 'r3'…), then the referee: buildVerdict
// ('after_fix') vs the first verdict → compareVerdicts → VerdictCard's compare header (green only when riskReduced),
// the Before → After rows and the receipt line. At most RC max_fix_rounds re-attacks; none after any decline. Export
// is not built.
// T-105 (D-150..D-152): Judge Mode runs THIS flow on a sample (the `judge` prop, from the Judge screen): the sample is
// imported instead of a drop, the pre-screen's model step and the referee run as S4 (ON-DEVICE with Nano, else IN CLOUD,
// honestly badged), pass B runs live as S3 tagged with the sample, and when the live attacker is unavailable (and RC
// judge_cached_fallback is on) the recorded pass B is replayed, badged CACHED. Autoplay (RC judge_autoplay_default)
// advances each step after a beat (consent after a visible 3 s countdown) with coach marks; it stops at the re-attack's
// verdict, at any failure, or when there is nothing to fix.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
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
import { consentTierCopy, sendBlockedCopy, userUnmaskedBoxes, verdictOf } from '../check/sendFlow';
import { compareRows, receiptParams } from '../check/fixFlow';
import { FixPanel } from '../check/FixPanel';
import { deterministicFix, residualAfter, selectedFix } from '../../core/fixPlan';
import { compareVerdicts } from '../../core/verdict';
import type { PxRect } from '../../core/types';
import { AttackPanel } from '../components/AttackPanel';
import { Button } from '../components/Button';
import { CloudCopy } from '../components/CloudCopy';
import { ConsentPanel } from '../components/ConsentPanel';
import { HybridLanes } from '../components/HybridLanes';
import { Icon } from '../components/Icon';
import { EYEBROW, H1, H2, PANEL } from '../components/surface';
import { VerdictCard } from '../components/VerdictCard';
import { ImportDropzone } from '../components/ImportDropzone';
import { PrescreenPanel } from '../components/PrescreenPanel';
import { StepperNav } from '../components/StepperNav';
import { BUILT_STEPS, CHECK_START, checkReducer, fixBlocked, latestResult, maskedCandidate, settledReattack } from '../checkState';
import { useOcrWarm } from '../hooks/useOcrWarm';
import { useLedgerEntries } from '../hud/useLedger';
import { lastCloudImageSend } from '../../core/ledgerView';
import { systemStatus } from '../systemStatus';
import { caps, prefs } from '../../core/localPrefs';
import { autoDelay, coachFor, liveUnavailable, nextAutoAction, type AutoAction } from '../judge/judgeFlow';
import { judgeNanoStep, loadSamplePhoto, recordedAttack } from '../judge/judgeRun';
import { JudgeCoach } from '../judge/JudgeCoach';
import type { JudgeSample } from '../../vault/judgeVault';
import type { ImportStatus } from '../importTransfer';
import { stepLabelId, type CheckStep } from '../layout';

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

/** Steps whose stage is two columns at lg: the exact cloud copy (left, sticky) beside the step (DESIGN §5.2). Import and
 *  the pre-screen need the full width for the editor; Send (and the re-attack's own consent) already show the image. */
const STAGED: ReadonlySet<CheckStep> = new Set<CheckStep>(['attack', 'verdict', 'fix', 'reattack']);

/**
 * The stage (DESIGN §5.2): on the staged steps, at lg, the exact cloud copy sits left (sticky) beside the step section.
 * The copy is scoped to THIS photo's session and shown only once this session has a finished IN_CLOUD image send:
 * while the attack is still pending, after a gate block, or on a CACHED/recorded replay there is no copy of this photo
 * to show, so the stage stays one column instead of showing an earlier photo under "What the cloud saw" (AC-230). The
 * children keep the same slot either way, so the step panel never remounts when the copy appears.
 */
function Stage({ staged, sessionId, copyOnPhone, children }: { staged: boolean; sessionId: string; copyOnPhone: boolean; children: ReactNode }) {
  const entries = useLedgerEntries();
  const mine = useMemo(() => entries.filter((e) => e.sessionId === sessionId), [entries, sessionId]);
  const show = staged && lastCloudImageSend(mine) !== null;
  return (
    <div className={show ? 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]' : 'flex flex-col'}>
      {show && (
        // Below lg the cloud copy shows only on the Attack step, so the verdict and the fix stay near the top on a phone.
        <div className={`min-w-0 lg:sticky lg:top-4${copyOnPhone ? '' : ' max-lg:hidden'}`}>
          <CloudCopy variant="stage" entries={mine} />
        </div>
      )}
      {children}
    </div>
  );
}

/** One receipt tile (aria-hidden: the receipt sentence below says the same in words). */
function ReceiptTile({ value, label, tone }: { value: number; label: string; tone: 'cloud' | 'kept' | 'device' }) {
  const box = tone === 'kept' ? 'bg-verdict-teal-bg text-verdict-teal' : `bg-surface-2 border-l-4 ${tone === 'cloud' ? 'border-l-route-cloud-fill' : 'border-l-route-device-fill'}`;
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-card border border-line p-3 ${box}`}>
      <span className="flex items-center gap-1.5 font-mono text-stat-sm font-bold tabular-nums sm:text-stat">
        {tone === 'kept' && <Icon name="lock" className="size-5" />}
        {value}
      </span>
      <span className={`text-small ${tone === 'kept' ? 'text-fg' : 'text-muted'}`}>{label}</span>
    </div>
  );
}

function ReceiptTiles({ images, k }: { images: number; k: number }) {
  return (
    <div aria-hidden="true" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <ReceiptTile value={images} label={t('ui.tile.images')} tone="cloud" />
      {/* faces and vault items are the literal 0 that copy.receipt.line asserts */}
      <ReceiptTile value={0} label={t('ui.tile.faces')} tone="kept" />
      <ReceiptTile value={0} label={t('ui.tile.vault')} tone="kept" />
      <ReceiptTile value={k} label={t('ui.tile.onDevice')} tone="device" />
    </div>
  );
}

const NO_MASKS: readonly PxRect[] = Object.freeze([]) as readonly PxRect[];

const newSessionId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random()}`);

/** A Judge Mode check (T-105): the sample, the ACTIVE fake vault object, autoplay, and "this sample is finished". */
export interface JudgeCheck {
  sample: JudgeSample;
  vault: readonly VaultItem[];
  autoplay: boolean;
  onFinished?: () => void;
}

export function Check({ judge = null }: { judge?: JudgeCheck | null } = {}) {
  // The stepper position, the last import status (`ready` exactly while master.current is set) and the pre-screen.
  const [state, dispatch] = useReducer(checkReducer, CHECK_START);
  const master = useRef<{ canvas: HTMLCanvasElement; jpeg: Blob; sha256: string } | null>(null);
  // The epoch whose Tier-0 run has been started, and the epoch in force (read by a run to see it was superseded).
  const started = useRef(-1);
  const epochNow = useRef(state.epoch);
  epochNow.current = state.epoch;
  // D-164 review: a pre-screen run does not outlive its Check. Judge Mode switches the active fake vault per sample, so
  // an unmounted sample's run must not go on to an S4 call with its own (no longer active) vault.
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
  // One dispatch site per action type (the source pin in checkState.test.ts); Judge Mode reuses these.
  const onContinue = useCallback(() => dispatch({ type: 'continue' }), []);
  const markSent = useCallback((run: number) => dispatch({ type: 'sent', run }), []);
  const attackDone = useCallback((run: number, outcome: AttackOutcome) => dispatch({ type: 'attackDone', run, outcome }), []);
  const markResent = useCallback((run: number) => dispatch({ type: 'resent', run }), []);
  const reattackDone = useCallback((run: number, outcome: AttackOutcome) => dispatch({ type: 'reattackDone', run, outcome }), []);

  // ---------- Judge Mode (T-105) ----------
  const sampleId = judge?.sample.id ?? null;
  const judgeTag = useMemo(() => (sampleId ? { sampleId } : undefined), [sampleId]);
  const rcNow = useRef(rc);
  rcNow.current = rc;
  /** The masks and crop of the re-attack image being sent (for the CACHED "after fix" recording, D-150). */
  const fixNow = useRef<{ masks: readonly PxRect[]; crop: PxRect | null } | null>(null);
  /** The live outcome, or the recorded replay when the live attacker is unavailable and RC allows it (AC-243, AC-246). */
  const withRecorded = useCallback(async (o: AttackOutcome, sent: SentImage, runId: string, fix: { masks: readonly PxRect[]; crop: PxRect | null } | null): Promise<AttackOutcome> => {
    const m = master.current;
    if (!judge || !m || !(rcNow.current?.judgeCachedFallback ?? true) || !liveUnavailable(o)) return o;
    return (await recordedAttack({ sample: judge.sample, image: sent.image, runId, fix, master: { width: m.canvas.width, height: m.canvas.height }, sessionId: session.current.id })) ?? o;
  }, [judge]);
  // The sample is the photo: imported once (the ref survives StrictMode's second effect run), then straight to the pre-screen.
  const sampleStarted = useRef(false);
  useEffect(() => {
    if (!judge || sampleStarted.current) return;
    sampleStarted.current = true;
    onImportStatus({ kind: 'busy' });
    void loadSamplePhoto(judge.sample).then((p) => {
      onPhoto(p);
      if (!p) { onImportStatus({ kind: 'error', copyId: 'ui.judge.sampleFailed' }); return; }
      onImportStatus({ kind: 'ready', lines: [] });
      onContinue();
    });
  }, [judge, onPhoto, onImportStatus, onContinue]);
  // Read at render (no store hook: Check re-renders on every step, and a send while the cloud is off is refused by the
  // gate and replaced by the recording anyway).
  const cloudOff = !!judge && sendBlockedCopy({
    online: (typeof navigator === 'undefined' || navigator.onLine !== false) && !prefs.simulateOffline(), status: systemStatus.get(), capUsed: caps.usedToday(),
  }) !== null;

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
    void runAttack(sent, cache).then((o) => withRecorded(o, sent, 'r1', null)).then(
      (outcome) => attackDone(run, outcome),
      () => undefined, // ABORTED: a newer episode replaced this one
    );
  }, [withRecorded, attackDone]);
  const onSend = useCallback(() => {
    const s = state.flow.send;
    if (s.kind !== 'ready' || s.dry.failed.length > 0) return;
    const run = s.run;
    const sid = session.current.id;
    void consentTo(s.dry, sid, judgeTag).then((sent) => {
      if (flowNow.current !== run || session.current.id !== sid) return;
      session.current.sent = sent;
      markSent(run);
      attack(run);
    });
  }, [state.flow.send, attack, judgeTag, markSent]);
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
      void runReferee(o.result, vault, session.current.id, vaultScan.threshold(), judgeTag).then((r) => {
        setRefs((cur) => {
          if (refPending.current !== batch) return cur; // the vault was re-read meanwhile: this run is stale
          const by = new Map(cur.vault === vault ? cur.by : []);
          by.set(o, r);
          return { vault, by };
        });
      });
    }
  }, [outcome, afterOutcome, latest, vault, judgeTag]);
  /**
   * The VerdictCard referee row: the referee's route and latency, and the honest note when the rules decided. D-179: no
   * referee ran (a declined, blocked or failed attack: nothing to grade) shows no referee badge; a referee that needed
   * no model ('skipped': nothing a model could add) reads BUILT-IN · code. RULES-ONLY stays for a real fallback.
   */
  const refereeRow = useCallback((r: RefereeOutcome | undefined) => {
    if (!r) return null;
    if (r.route === 'RULES_ONLY' && r.fallback === 'skipped') return { route: r.route, latencyMs: r.latencyMs, builtIn: true };
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
    const fix = fixNow.current;
    void runAttack(sent, session.current.cache, runId).then((o) => withRecorded(o, sent, runId, fix)).then(
      (outcome) => reattackDone(run, outcome),
      () => undefined,
    );
  }, [withRecorded, reattackDone]);
  const rounds = re.rounds;
  const onResend = useCallback(() => {
    const s = state.reattack.send;
    if (s.kind !== 'ready' || s.dry.failed.length > 0) return;
    const run = s.run;
    const sid = session.current.id;
    const runId = `r${rounds + 2}`;
    fixNow.current = { masks: s.dry.masks, crop: applied?.crop ?? null };
    void consentTo(s.dry, sid, judgeTag).then((sent) => {
      if (reNow.current !== run || session.current.id !== sid) return;
      session.current.resent = sent;
      markResent(run);
      reattack(run, runId);
    });
  }, [state.reattack.send, rounds, reattack, judgeTag, applied, markResent]);
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

  // Judge Mode: the recording when the cloud is off (the consent sheet shows the reason and offers no Send; nothing is
  // sent and no consent is minted for a replay), then autoplay.
  const cachedOk = !!judge && (rc?.judgeCachedFallback ?? true);
  const onUseRecorded = useCallback(() => {
    const s = state.flow.send;
    const m = master.current;
    if (!judge || s.kind !== 'ready' || s.dry.failed.length > 0 || attackKind !== 'idle' || !m) return;
    const run = s.run;
    void recordedAttack({ sample: judge.sample, image: s.dry.image, runId: 'r1', fix: null, master: { width: m.canvas.width, height: m.canvas.height }, sessionId: session.current.id }).then((rec) => {
      if (!rec || flowNow.current !== run) return;
      markSent(run);
      attackDone(run, rec);
    });
  }, [judge, state.flow.send, attackKind, markSent, attackDone]);
  const onUseRecordedAgain = useCallback(() => {
    const s = state.reattack.send;
    const m = master.current;
    if (!judge || s.kind !== 'ready' || s.dry.failed.length > 0 || reAttackKind !== 'idle' || !m) return;
    const run = s.run;
    const runId = `r${rounds + 2}`;
    void recordedAttack({ sample: judge.sample, image: s.dry.image, runId, fix: { masks: s.dry.masks, crop: applied?.crop ?? null }, master: { width: m.canvas.width, height: m.canvas.height }, sessionId: session.current.id }).then((rec) => {
      if (!rec || reNow.current !== run) return;
      markResent(run);
      reattackDone(run, rec);
    });
  }, [judge, state.reattack.send, reAttackKind, rounds, applied, markResent, reattackDone]);
  const planHasFix = !!plan && (plan.fix.masks.length > 0 || plan.fix.crop !== null);
  const auto: AutoAction | null = judge?.autoplay ? nextAutoAction({
    current, importReady: state.importStatus.kind === 'ready',
    canSend: !!candidate && candidate.blockedBy.length === 0 && attackKind === 'idle' && state.prescreen.kind === 'done' && state.prescreen.failed.length === 0,
    sendReady: state.flow.send.kind === 'ready' && state.flow.send.dry.failed.length === 0 && attackKind === 'idle',
    cloudOff, cachedFallback: cachedOk, attackDone: attackKind === 'done', fixAvailable: fixAction !== null, planHasFix,
    reattackPending: re.pending && !!applied,
    reSendReady: re.send.kind === 'ready' && re.send.dry.failed.length === 0 && reAttackKind === 'idle',
    afterSettled: !!afterOutcome,
  }) : null;
  const autoHandlers = useRef<Record<AutoAction, () => void>>(null as unknown as Record<AutoAction, () => void>);
  autoHandlers.current = {
    continue: onContinue, toSend: onCloud, send: onSend, useRecorded: onUseRecorded, toVerdict: onToVerdict,
    toFix: onToFix, applyFix: onApplyFix, toReattack: onToReattack, resend: onResend, useRecordedAgain: onUseRecordedAgain,
  };
  const [countdown, setCountdown] = useState<number | null>(null);
  const autoKey = auto ? `${auto}|${current}|${flowRun}|${reRun}|${rounds}` : null;
  useEffect(() => {
    if (!auto) return;
    const ms = autoDelay(auto);
    const t0 = Date.now();
    const consent = ms >= 3000;
    if (consent) setCountdown(Math.ceil(ms / 1000));
    const tick = consent ? setInterval(() => setCountdown(Math.max(1, Math.ceil((ms - (Date.now() - t0)) / 1000))), 250) : undefined;
    const fire = setTimeout(() => { setCountdown(null); autoHandlers.current[auto](); }, ms);
    return () => { clearTimeout(fire); clearInterval(tick); setCountdown(null); };
  }, [autoKey]); // eslint-disable-line react-hooks/exhaustive-deps -- autoKey names the step the timer is for
  // "This sample is finished" (Run all moves on): the re-attack's verdict shows, or there is nothing to fix.
  const finished = !!judge && ((!!afterOutcome && !!compare) || (current === 'verdict' && !!verdict && !!plan && !planHasFix));
  const finishedOnce = useRef(false);
  useEffect(() => {
    if (!finished || finishedOnce.current) return;
    finishedOnce.current = true;
    judge?.onFinished?.();
  }, [finished, judge]);
  const shownOutcome = current === 'reattack' ? (afterOutcome ?? (re.attack.kind === 'done' ? re.attack.outcome : null)) : current === 'attack' || current === 'verdict' || current === 'fix' ? outcome : null;
  const recordedShown = shownOutcome?.kind === 'result' ? shownOutcome.recorded ?? null : null;
  const offerRecorded = cachedOk && cloudOff && ((current === 'send' && attackKind === 'idle' && state.flow.send.kind === 'ready') || (current === 'reattack' && reAttackKind === 'idle' && re.send.kind === 'ready'));

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
      { isCurrent: () => mounted.current && epochNow.current === run, sessionId: session.current.id, ...(judge ? { nano: judgeNanoStep(judge.sample, judge.vault) } : {}) },
    ).then((outcome) => dispatch({ type: 'prescreenDone', run, outcome }));
  }, [current, prescreenKind, epoch, judge]);

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {judge
        ? <h2 className={H2}>{judge.sample.title}</h2>
        : <h1 className={H1}>{t('ui.screen.check')}</h1>}
      <HybridLanes mode="live" sessionId={session.current.id} />
      <StepperNav
        current={current}
        reached={state.pos.reached}
        available={BUILT_STEPS}
        onSelect={(step) => dispatch({ type: 'selectStep', step })}
      />
      <Stage staged={STAGED.has(current) && !(current === 'reattack' && reAttackKind === 'idle')} sessionId={session.current.id} copyOnPhone={current === 'attack'}>
      <section aria-labelledby="check-step-title" className={`min-w-0 ${PANEL}`}>
        <h2 id="check-step-title" className={H2}>
          {t(stepLabelId(current))}
        </h2>
        {judge && (
          <JudgeCoach
            coach={coachFor(current)} countdownS={countdown} recorded={recordedShown}
            onUseRecorded={offerRecorded ? (current === 'send' ? onUseRecorded : onUseRecordedAgain) : null}
          />
        )}
        {current === 'import' && judge && (
          <p className="mt-3 text-body text-muted">{state.importStatus.kind === 'error' ? t('ui.judge.sampleFailed') : t('ui.judge.sampleLoading')}</p>
        )}
        {current === 'import' && !judge && (
          <div className="mt-4 flex flex-col gap-4">
            <ImportDropzone getPins={activePins} status={state.importStatus} onStatus={onImportStatus} onPhoto={onPhoto} />
            {state.importStatus.kind === 'ready' && (
              <Button variant="primary" size="lg" className="self-start max-sm:w-full" data-action="continue" onClick={onContinue}>
                {t('ui.check.continue')}
              </Button>
            )}
          </div>
        )}
        {current === 'prescreen' && (
          <PrescreenPanel
            master={master.current?.canvas ?? null} state={state.prescreen} onOp={onOp} onRetry={onRetry}
            canSend={!!candidate && candidate.blockedBy.length === 0 && attackKind === 'idle'} onCloud={onCloud} judge={judgeTag !== undefined}
          />
        )}
        {devFake && (current === 'send' || current === 'attack' || current === 'reattack') && (
          <p className="mt-2 rounded-md border border-dashed border-line-strong px-2 py-1 font-mono text-small text-muted">{t('ui.dev.fakeAdversary', { mode: devFake })}</p>
        )}
        {devNano && (current === 'prescreen' || current === 'verdict' || current === 'fix' || current === 'reattack') && (
          <p className="mt-2 rounded-md border border-dashed border-line-strong px-2 py-1 font-mono text-small text-muted">{t('ui.dev.fakeNano', { mode: devNano })}</p>
        )}
        {current === 'send' && (
          <ConsentPanel
            send={state.flow.send} candidate={candidate} tierCopy={consentTierCopy(rc)}
            model={rc?.adversaryModel ?? ''} sent={attackKind !== 'idle'} onSend={onSend} onCancel={onCancelSend}
          />
        )}
        {current === 'attack' && (
          <AttackPanel attack={state.flow.attack} model={rc?.adversaryModel ?? ''} onRetry={onRetryAttack} onToVerdict={onToVerdict} />
        )}
        {current === 'verdict' && (
          verdict && vault ? (
            <div className="mt-4 flex flex-col gap-3">
              <VerdictCard
                verdict={verdict.v} vault={vault} referee={refereeRow(verdict.ref)} headingLevel={3}
                actions={fixAction ?? (blockedCopy ? <p className="text-small text-muted">{blockedCopy}</p> : null)}
              />
              <p className="text-small text-muted">{t('ui.verdict.nextSoon')}</p>
            </div>
          ) : (
            <p className="mt-3 text-body text-muted">{outcome?.kind === 'result' && vault ? t('copy.ref.running') : t('ui.verdict.loading')}</p>
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
            {re.send.kind === 'ready' && <p className="self-start rounded-chip border border-line bg-surface-2 px-3 py-1.5 text-small font-medium" data-testid="consent-diff">{t('ui.consent.diff', { n: Math.max(0, re.send.dry.masks.length - prevSentMasks) })}</p>}
            <ConsentPanel
              send={re.send} candidate={candidate} tierCopy={consentTierCopy(rc)}
              model={rc?.adversaryModel ?? ''} sent={false} onSend={onResend} onCancel={() => dispatch({ type: 'cancelResend' })}
            />
          </div>
        )}
        {current === 'reattack' && reAttackKind !== 'idle' && !afterOutcome && (
          <AttackPanel attack={re.attack} model={rc?.adversaryModel ?? ''} onRetry={onRetryReattack} onToVerdict={() => dispatch({ type: 'reattackSettle' })} />
        )}
        {current === 'reattack' && afterOutcome && (
          compare && vault ? (
            <div className="mt-4 flex flex-col gap-4" data-testid="compare">
              <p className={`${EYEBROW} self-start rounded-chip border border-line px-2 py-1`}>{t('ui.fix.round', { n: rounds, max: maxRounds })}</p>
              <VerdictCard
                verdict={compare.cmp.after} comparison={compare.cmp} vault={vault} referee={refereeRow(compare.ref)} headingLevel={3}
                actions={fixAction ?? (blockedCopy ? <p className="text-small text-muted">{blockedCopy}</p> : null)}
              />
              {compareRows(compare.cmp.before, compare.cmp.after, vault).length > 0 && (
                <div>
                  <p className="text-title font-semibold">{t('ui.compare.title')}</p>
                  <ul className="mt-2 flex flex-col gap-1.5 text-body [&>li]:rounded-lg [&>li]:bg-surface-2 [&>li]:px-3 [&>li]:py-2" data-testid="compare-rows">
                    {compareRows(compare.cmp.before, compare.cmp.after, vault).map((row, i) => <li key={i}>{row}</li>)}
                  </ul>
                </div>
              )}
              <ReceiptTiles {...receiptParams(allOutcomes, onDeviceCalls)} />
              <p className="border-t border-dashed border-line-strong pt-3 font-mono text-small text-muted" data-testid="receipt">{t('copy.receipt.line', receiptParams(allOutcomes, onDeviceCalls))}</p>
              <p className="text-small text-muted">{t('ui.verdict.nextSoon')}</p>
            </div>
          ) : (
            <p className="mt-3 text-body text-muted">{t('ui.verdict.loading')}</p>
          )
        )}
        {current === 'export' && <p className="mt-2 text-body text-muted">{t('ui.placeholder')}</p>}
      </section>
      </Stage>
    </div>
  );
}
