// web/src/ui/components/BurnVaultDialog.tsx: Burn vault (SPEC SCR-19, D-31, ARCH §16.4). A sheet with copy.burn.confirm
// and ONE hold-to-confirm button (1.5 s) labelled "Burn vault". There is no checkbox and no partial option: a burn
// always deletes the key first, then the vault, recent and queued checks and the ledger (vault/burn.ts performBurn).
// - Success: copy.burn.done.
// - BurnPendingError: a pending state with a retry, never copy.burn.done (T-054). The key is already gone at that point
//   (it is deleted first, AC-271), so the vault cannot be read; some data is still being deleted. The deletion stays
//   queued and, when it completes, a vault change is announced: a load that then succeeds means the burn finished
//   (loadVault finishes an interrupted burn before reading, and rejects while it cannot), so the state turns to done
//   by itself (D-93). The copy never claims that other tabs are the only cause.
// - Any other failure: an error with a retry.
// - An outcome that arrives while the sheet is closed (Escape mid-burn, or a pending burn finishing later) is reported
//   to the parent (onOutcome) and the sheet starts over at the confirm step; only a pending burn keeps its state (D-99).
// Hold logic is a pure state machine (holdStep), driven by pointer and keyboard (Space/Enter) alike. Sliding off the
// button abandons the hold. A click with no press before it (a screen reader's or switch's activation) opens an explicit
// second confirmation instead (D-99). No console (SR-15).
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { t } from '../../core/strings';
import { performBurn } from '../../vault/burn';
import { BurnPendingError } from '../../vault/crypto';
import { onVaultChange } from '../../vault/sync';
import { loadVault } from '../../vault/vaultStore';
import { Button } from './Button';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

// ---------- hold to confirm (pure) ----------

/** SCR-19: the Burn vault button must be held this long. */
export const HOLD_MS = 1500;

export type HoldState = { phase: 'idle' } | { phase: 'holding'; since: number } | { phase: 'fired' };
export type HoldEvent = { type: 'press' | 'release' | 'tick' | 'cancel'; at: number };
export const HOLD_IDLE: HoldState = { phase: 'idle' };
const HOLD_FIRED: HoldState = { phase: 'fired' };

/**
 * One step of the hold. `press` starts a hold (a repeated press while holding keeps the original start, so key
 * auto-repeat never restarts it); `tick` fires once the hold has lasted `ms`; `release` fires if it lasted `ms` (a late
 * timer never cheats a full hold) and otherwise abandons it; `cancel` (sliding off, pointer cancel, blur, close)
 * abandons it. `fired` is terminal: the caller acts once and starts again from HOLD_IDLE.
 */
export function holdStep(s: HoldState, e: HoldEvent, ms: number = HOLD_MS): HoldState {
  switch (e.type) {
    case 'press':
      return s.phase === 'idle' ? { phase: 'holding', since: e.at } : s;
    case 'tick':
      return s.phase === 'holding' && e.at - s.since >= ms ? HOLD_FIRED : s;
    case 'release':
      if (s.phase !== 'holding') return s;
      return e.at - s.since >= ms ? HOLD_FIRED : HOLD_IDLE;
    case 'cancel':
      return s.phase === 'holding' ? HOLD_IDLE : s;
  }
}

/** 0…1 for the fill: how much of the hold has passed. */
export function holdProgress(s: HoldState, now: number, ms: number = HOLD_MS): number {
  if (s.phase === 'fired') return 1;
  if (s.phase === 'idle') return 0;
  return Math.min(1, Math.max(0, (now - s.since) / ms));
}

/** A captured pointer outside the button's box has slid off it (SCR-19: leaving the button abandons the hold). */
export function isOutside(r: { left: number; top: number; right: number; bottom: number }, x: number, y: number): boolean {
  return !(x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
}

/**
 * Pointer and keyboard holds over holdStep. `onFire` runs once per completed hold; `disabled` ignores presses.
 * `onUnheldClick` runs for a click that no pointer or key press of ours preceded: an assistive technology's activation.
 * A pointer click always follows its own pointerdown, and our Space/Enter handling prevents the browser's click.
 */
function useHoldToConfirm(onFire: () => void, onUnheldClick: () => void, disabled: boolean, ms: number = HOLD_MS) {
  const state = useRef<HoldState>(HOLD_IDLE);
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  /** A pointer press whose click has not arrived yet. */
  const pointerPressed = useRef(false);
  const fire = useRef(onFire);
  fire.current = onFire;
  const unheld = useRef(onUnheldClick);
  unheld.current = onUnheldClick;

  const stopClock = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    if (frame.current !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame.current);
    timer.current = undefined;
    frame.current = undefined;
  }, []);

  const apply = useCallback((type: HoldEvent['type']) => {
    const prev = state.current;
    const now = performance.now();
    const next = holdStep(prev, { type, at: now }, ms);
    if (next === prev) return;
    if (next.phase === 'holding') {
      state.current = next;
      const arm = (wait: number) => {
        timer.current = setTimeout(() => {
          apply('tick');
          const s = state.current;
          if (s.phase === 'holding') arm(Math.max(1, ms - (performance.now() - s.since)));   // a timer that ran early
        }, wait);
      };
      arm(ms);
      const draw = () => {
        const s = state.current;
        if (s.phase !== 'holding') return;
        setProgress(holdProgress(s, performance.now(), ms));
        frame.current = requestAnimationFrame(draw);
      };
      if (typeof requestAnimationFrame === 'function') frame.current = requestAnimationFrame(draw);
      return;
    }
    stopClock();
    state.current = HOLD_IDLE;
    setProgress(0);
    if (next.phase === 'fired') fire.current();
  }, [ms, stopClock]);

  useEffect(() => () => stopClock(), [stopClock]);
  useEffect(() => { if (disabled) apply('cancel'); }, [disabled, apply]);

  const isHoldKey = (e: KeyboardEvent) => e.key === ' ' || e.key === 'Enter';
  return {
    progress,
    cancel: () => apply('cancel'),
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0) return;
        pointerPressed.current = true;
        if (disabled) return;
        // Captured, so the button keeps receiving the moves and the release even off its box.
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable: the hold still works */ }
        apply('press');
      },
      onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
        if (state.current.phase !== 'holding') return;
        const el = e.currentTarget;
        if (typeof el.getBoundingClientRect === 'function' && isOutside(el.getBoundingClientRect(), e.clientX, e.clientY)) apply('cancel');
      },
      onPointerUp: () => apply('release'),
      onPointerCancel: () => { pointerPressed.current = false; apply('cancel'); },
      onLostPointerCapture: () => apply('cancel'),
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
        if (!isHoldKey(e)) return;
        e.preventDefault();   // no page scroll, no synthetic click
        if (!disabled && !e.repeat) apply('press');
      },
      onKeyUp: (e: KeyboardEvent<HTMLButtonElement>) => {
        if (!isHoldKey(e)) return;
        e.preventDefault();
        apply('release');
      },
      onClick: () => {
        const pressed = pointerPressed.current;
        pointerPressed.current = false;
        if (pressed || disabled) return;   // a pointer press: the hold decides, the click means nothing
        unheld.current();
      },
      onBlur: () => apply('cancel'),
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),   // a long press on touch screens
    },
  };
}

// ---------- the burn ----------

export type BurnPhase = 'confirm' | 'burning' | 'done' | 'pending' | 'error';
export type BurnOutcome = 'done' | 'pending' | 'error';

/** BurnPendingError → pending (a deletion is still queued; never copy.burn.done). Anything else → error. */
export const burnFailurePhase = (e: unknown): 'pending' | 'error' => (e instanceof BurnPendingError ? 'pending' : 'error');

/**
 * The phase an outcome leaves the sheet in. While open: the outcome itself. While closed nobody sees it, so the next
 * open starts at the confirm step (with its hold button), except a pending burn, whose retry and watch must survive.
 */
export const phaseAfter = (outcome: BurnOutcome, open: boolean): BurnPhase => (open || outcome === 'pending' ? outcome : 'confirm');

export interface BurnDialogDeps {
  /** vault/burn.ts performBurn: storage (key first), then this tab's index. */
  burn: () => Promise<void>;
  /** vault/sync.ts onVaultChange. */
  watch: (listener: () => void) => () => void;
  /** vault/vaultStore.ts loadVault: resolves only once no burn is pending (it finishes one first). */
  check: () => Promise<unknown>;
}
const APP_DEPS: BurnDialogDeps = { burn: () => performBurn(), watch: onVaultChange, check: loadVault };

export interface BurnVaultDialogProps {
  open: boolean;
  onClose: () => void;
  /** Every outcome, and whether the sheet was open to show it (the Vault screen shows it otherwise). */
  onOutcome?: (outcome: BurnOutcome, shown: boolean) => void;
  deps?: BurnDialogDeps;
}

export function BurnVaultDialog({ open, onClose, onOutcome, deps = APP_DEPS }: BurnVaultDialogProps) {
  const [phase, setPhase] = useState<BurnPhase>('confirm');
  /** The explicit second step for an assistive technology's activation (no hold possible). */
  const [atConfirm, setAtConfirm] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  const openRef = useRef(open);
  openRef.current = open;
  const outcomeRef = useRef(onOutcome);
  outcomeRef.current = onOutcome;
  const hintId = useId();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const atRef = useRef<HTMLParagraphElement>(null);
  const holdRef = useRef<HTMLButtonElement>(null);
  const wasAt = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const finish = useCallback((outcome: BurnOutcome) => {
    if (!alive.current) return;
    const shown = openRef.current;
    setPhase(phaseAfter(outcome, shown));
    outcomeRef.current?.(outcome, shown);
  }, []);

  const runBurn = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setAtConfirm(false);
    setPhase('burning');
    deps.burn().then(
      () => { busy.current = false; finish('done'); },
      (e: unknown) => { busy.current = false; finish(burnFailurePhase(e)); },
    );
  }, [deps, finish]);

  const burning = phase === 'burning';
  const hold = useHoldToConfirm(runBurn, () => setAtConfirm(true), burning || !open || atConfirm);

  // Pending: once the queued deletions complete (announced as a vault change), a load that succeeds means the burn is
  // finished. Checked once on entry too, in case they completed before this subscription. Kept while closed.
  useEffect(() => {
    if (phase !== 'pending') return;
    let live = true;
    const check = () => {
      deps.check().then(
        () => { if (live && !busy.current) finish('done'); },
        () => undefined,   // still pending: stay, the next announcement checks again
      );
    };
    const off = deps.watch(check);
    check();
    return () => { live = false; off(); };
  }, [phase, deps, finish]);

  // Focus follows the outcome to the status text, not to an action: a Space/Enter still held from the hold must not
  // land on Close or Try again (key repeat would activate it). The actions are one Tab away.
  useEffect(() => {
    if (phase === 'done' || phase === 'pending' || phase === 'error') statusRef.current?.focus();
  }, [phase]);

  // The assistive-technology step: its question takes focus; cancelling it returns focus to the hold button.
  useEffect(() => {
    if (atConfirm) atRef.current?.focus();
    else if (wasAt.current) holdRef.current?.focus();
    wasAt.current = atConfirm;
  }, [atConfirm]);

  // Every close (Escape, the sheet's close button, the backdrop, or ours via the parent's `open`) ends here, once the
  // dialog is already closed, so resetting the phase never flashes the confirm step. A finished or failed burn starts
  // over next time; a pending one keeps its retry (and keeps watching); a running one is reported via onOutcome.
  const handleClose = () => {
    hold.cancel();
    setAtConfirm(false);
    if (phase === 'done' || phase === 'error') setPhase('confirm');
    onClose();
  };

  const status = phase === 'burning' ? t('ui.burn.burning')
    : phase === 'done' ? t('copy.burn.done')
    : phase === 'pending' ? t('ui.burn.pending')
    : phase === 'error' ? t('ui.burn.failed')
    : '';
  const holdStage = phase === 'confirm' || phase === 'burning';

  return (
    <Sheet open={open} onClose={handleClose} title={t('ui.burn.action')}>
      <div className="flex flex-col gap-4">
        {holdStage && (
          <p className="flex items-start gap-2.5 rounded-card border-l-4 border-l-verdict-red bg-verdict-red-hero p-4 text-body text-fg">
            <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-verdict-red" />
            <span>{t('copy.burn.confirm')}</span>
          </p>
        )}
        {holdStage && !atConfirm && (
          <>
            <Button
              ref={holdRef}
              variant="danger"
              size="lg"
              className="relative w-full touch-none overflow-hidden"
              aria-describedby={hintId}
              aria-disabled={burning || undefined}
              {...hold.handlers}
            >
              <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-black/35" style={{ width: `${hold.progress * 100}%` }} />
              <span className="relative">{t(burning ? 'ui.burn.burning' : 'ui.burn.action')}</span>
            </Button>
            <p id={hintId} className="text-small text-muted">{t('ui.burn.holdHint')}</p>
          </>
        )}
        {phase === 'confirm' && atConfirm && (
          <div className="flex flex-col gap-3">
            <p ref={atRef} tabIndex={-1} className="text-body font-semibold">{t('ui.burn.atConfirm')}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setAtConfirm(false)}>{t('ui.vault.cancel')}</Button>
              <Button variant="danger" onClick={runBurn}>{t('ui.burn.atYes')}</Button>
            </div>
          </div>
        )}
        <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className={holdStage ? 'sr-only' : 'text-body font-medium'}>
          {status}
        </p>
        {phase === 'done' && (
          <Button variant="primary" className="self-end" onClick={onClose}>{t('ui.close')}</Button>
        )}
        {(phase === 'pending' || phase === 'error') && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>{t('ui.close')}</Button>
            <Button variant="danger" onClick={runBurn}>{t('ui.burn.retry')}</Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
