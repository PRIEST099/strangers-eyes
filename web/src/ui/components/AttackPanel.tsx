// web/src/ui/components/AttackPanel.tsx: the Attack step, pass B (SPEC SCR-08; T-071; D-138). The status line, the
// call's route badge, model and latency (the Router HUD's numbers, kept in state), then by outcome:
//   result   pass B's scene summary + copy.adv.notesOff (grounding is off: pass A is not built), or copy.adv.noSignal,
//            and "Clues the attacker found" (id · type · evidence · severity). Never a hypothesis's coordinates.
//   refused  copy.adv.declined, NO Try again (invariant 7, D-18); the Verdict shows the on-device findings.
//   notSent  the gate's block copy (nothing left the device).
//   failed   the error copy; Try again only for network / 5xx / timeout / 429 (after 60 s), never for a cut-off or
//            unreadable answer (D-129, D-138). "Show the on-device findings" goes to the partial verdict.
import { useEffect, useState } from 'react';
import { t } from '../../core/strings';
import type { AttackOutcome } from '../../ai/jobs/adversaryB';
import type { AttackState } from '../checkState';
import { Badge } from './Badge';
import { Button } from './Button';

export interface AttackPanelProps {
  attack: AttackState;
  model: string;
  onRetry: () => void;
  onToVerdict: () => void;
}

function useCountdown(ms: number | undefined, key: unknown): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!ms) { setLeft(0); return; }
    const end = Date.now() + ms;
    setLeft(Math.ceil(ms / 1000));
    const id = setInterval(() => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [ms, key]);
  return left;
}

function CallLine({ o, model }: { o: AttackOutcome; model: string }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted" data-testid="attack-call">
      <Badge route={o.call.route} />
      <span className="font-mono text-xs">{model}</span>
      {o.call.latencyMs !== null && <span className="font-mono text-xs">{t('ui.prescreen.ms', { ms: o.call.latencyMs })}</span>}
    </p>
  );
}

export function AttackPanel({ attack, model, onRetry, onToVerdict }: AttackPanelProps) {
  const o = attack.kind === 'done' ? attack.outcome : null;
  const retryAfter = o && o.kind === 'failed' ? o.retryAfterMs : undefined;
  const wait = useCountdown(retryAfter, attack.kind === 'done' ? attack.run : -1);
  if (attack.kind !== 'done' || !o) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <p role="status" className="text-sm">{t('copy.adv.running')}</p>
        <p className="flex items-center gap-2 text-sm text-muted"><Badge route="IN_CLOUD" /><span className="font-mono text-xs">{model}</span></p>
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-3" data-testid="attack-panel" data-outcome={o.kind}>
      <CallLine o={o} model={model} />
      {o.kind === 'result' && (
        <>
          {o.result.status === 'no_location_signal' ? (
            <p className="text-sm">{t('copy.adv.noSignal')}</p>
          ) : (
            <div className="flex flex-col gap-1 text-sm">
              <p>{o.result.sceneSummary}</p>
              <p className="text-muted">{t('copy.adv.notesOff')}</p>
            </div>
          )}
          {o.result.clues.length > 0 && (
            <div>
              <p className="text-sm font-medium">{t('ui.attack.clues')}</p>
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {o.result.clues.map((c) => (
                  <li key={c.id}>
                    <span className="font-mono text-xs">{c.id}</span> · {t(`ui.clue.${c.type}`)} · {c.evidence} · <span className="text-muted">{c.severity}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {o.kind === 'refused' && <p role="alert" className="rounded-lg border border-line bg-surface-2 p-3 text-sm">{t('copy.adv.declined')}</p>}
      {o.kind === 'notSent' && <p role="alert" className="rounded-lg border border-line bg-surface-2 p-3 text-sm">{t(o.copyId, o.params ?? {})}</p>}
      {o.kind === 'failed' && <p role="alert" className="rounded-lg border border-line bg-surface-2 p-3 text-sm">{t(o.copyId)}</p>}
      {(o.kind === 'notSent' || o.kind === 'failed') && (
        <div className="flex flex-wrap gap-2">
          {o.retry && (
            <Button variant="primary" disabled={wait > 0} onClick={onRetry} data-action="retry">
              {wait > 0 ? t('ui.attack.retryIn', { s: wait }) : t('ui.attack.retry')}
            </Button>
          )}
          <Button onClick={onToVerdict} data-action="to-verdict">{t('ui.attack.toVerdict')}</Button>
        </div>
      )}
    </div>
  );
}
