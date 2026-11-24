// web/src/ui/components/AttackPanel.tsx: the Attack step, pass B (SPEC SCR-08; T-071; D-138). The status line, the
// call's route badge, model and latency (the Router HUD's numbers, kept in state), then by outcome:
//   result   ui.attack.summary + copy.adv.notesOff (grounding is off: pass A is not built), or copy.adv.noSignal,
//            and "Clues the attacker found": type · what it reveals · severity · removable ("Street sign · reveals the
//            street · High · can be masked"); the clue id only with Settings › Technical details.
// Misuse hardening (Nov 24, user-approved): nothing the attacker WROTE is rendered: no scene summary, no clue evidence,
// no hypothesis label, no inference value, never a coordinate. Only code enums (type, reveals, severity, removable) and
// the count. So the app never answers "where was this photo taken"; the data stays in memory for the referee and fix.
// The call line shows the route badge and latency always; the model id only with Technical details (else "Gemini").
//   refused  copy.adv.declined, NO Try again (invariant 7, D-18); the Verdict shows the on-device findings.
//   notSent  the gate's block copy (nothing left the device).
//   failed   the error copy; Try again only for network / 5xx / timeout / 429 (after 60 s), never for a cut-off or
//            unreadable answer (D-129, D-138). "Show the on-device findings" goes to the partial verdict.
import { useEffect, useState } from 'react';
import { engineName } from '../../core/ledgerView';
import { t, type StringId } from '../../core/strings';
import type { AdversaryClue } from '../../core/types';
import type { AttackOutcome } from '../../ai/jobs/adversaryB';
import type { AttackState } from '../checkState';
import { useTechDetails } from '../hooks/usePrefs';
import { severityLabelId } from '../check/prescreenView';
import { Badge } from './Badge';
import { Button } from './Button';
import { Icon } from './Icon';

export interface AttackPanelProps {
  attack: AttackState;
  model: string;
  onRetry: () => void;
  onToVerdict: () => void;
  /** Tests only: override Settings › Technical details. */
  tech?: boolean;
}

/**
 * One clue as words, from code enums only (never `evidence`): "Street sign · reveals the street · High · can be masked".
 * Exported for tests.
 */
export function clueRowText(c: Pick<AdversaryClue, 'type' | 'reveals' | 'severity' | 'removable'>): string {
  return t('ui.attack.clueRow', {
    type: t(`ui.clue.${c.type}` as StringId),
    reveals: t(`ui.attack.reveals.${c.reveals}` as StringId),
    severity: t(severityLabelId(c.severity)),
    removable: t(c.removable ? 'ui.attack.removable.yes' : 'ui.attack.removable.no'),
  });
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

/** The cloud attacker's card: the lane-cloud tint and blue rule, the call's own route badge (IN CLOUD, or CACHED for a
 *  replay: never assumed), the model in mono and the latency. */
const CLOUD_CARD = 'flex flex-col gap-3 rounded-card border border-route-cloud-fill/40 bg-lane-cloud-bg p-4';

function CallLine({ o, model, tech }: { o: AttackOutcome; model: string; tech: boolean }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-small text-muted" data-testid="attack-call">
      <Badge route={o.call.route} />
      <span className={tech ? 'font-mono text-small break-all' : 'text-small'}>{engineName(model, tech)}</span>
      {o.call.latencyMs !== null && <span className="font-mono text-small tabular-nums">{t('ui.prescreen.ms', { ms: o.call.latencyMs })}</span>}
    </p>
  );
}

export function AttackPanel({ attack, model, onRetry, onToVerdict, tech: givenTech }: AttackPanelProps) {
  const prefTech = useTechDetails();
  const tech = givenTech ?? prefTech;
  const o = attack.kind === 'done' ? attack.outcome : null;
  const retryAfter = o && o.kind === 'failed' ? o.retryAfterMs : undefined;
  const wait = useCountdown(retryAfter, attack.kind === 'done' ? attack.run : -1);
  if (attack.kind !== 'done' || !o) {
    return (
      <div className={`mt-3 ${CLOUD_CARD}`}>
        <p role="status" className="flex items-center gap-2 text-body">
          {/* pulses only while the attacker runs; off under reduced motion */}
          <span aria-hidden="true" className="inline-block size-2.5 shrink-0 rounded-full bg-route-cloud-fill motion-safe:animate-pulse" />
          {t('copy.adv.running')}
        </p>
        <p className="flex flex-wrap items-center gap-2 text-small text-muted"><Badge route="IN_CLOUD" /><span className={tech ? 'font-mono text-small break-all' : 'text-small'}>{engineName(model, tech)}</span></p>
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-3" data-testid="attack-panel" data-outcome={o.kind}>
      {o.kind === 'result' ? (
        <div className={CLOUD_CARD}>
          <CallLine o={o} model={model} tech={tech} />
          {o.result.status === 'no_location_signal' ? (
            <p className="text-body">{t('copy.adv.noSignal')}</p>
          ) : (
            <div className="flex max-w-[68ch] flex-col gap-1">
              {/* Never o.result.sceneSummary: attacker free text may name the place (misuse hardening). */}
              <p className="text-body">{t('ui.attack.summary')}</p>
              <p className="text-small text-muted">{t('copy.adv.notesOff')}</p>
            </div>
          )}
          {o.result.clues.length > 0 && (
            <div className="border-t border-route-cloud-fill/30 pt-3">
              <p className="text-title font-semibold">{t('ui.attack.clues')}</p>
              <ul className="mt-2 flex flex-col gap-1.5 text-small">
                {o.result.clues.map((c) => (
                  <li key={c.id} className="rounded-lg bg-surface px-3 py-2" data-clue-type={c.type}>
                    {tech && <><span className="font-mono text-small">{c.id}</span>{' · '}</>}
                    {clueRowText(c)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <CallLine o={o} model={model} tech={tech} />
      )}
      {/* A decline is a plain grey card: on-device findings only, and nothing that looks like a retry (invariant 7). */}
      {o.kind === 'refused' && <p role="alert" className="flex items-start gap-2 rounded-card border border-line bg-surface-2 p-4 text-body"><Icon name="info" className="mt-0.5 size-5 text-muted" />{t('copy.adv.declined')}</p>}
      {o.kind === 'notSent' && <p role="alert" className="flex items-start gap-2 rounded-card border border-line bg-surface-2 p-4 text-body"><Icon name="lock" className="mt-0.5 size-5 text-verdict-teal" />{t(o.copyId, o.params ?? {})}</p>}
      {o.kind === 'failed' && <p role="alert" className="flex items-start gap-2 rounded-card border border-line bg-surface-2 p-4 text-body"><Icon name="info" className="mt-0.5 size-5 shrink-0 text-muted" />{t(o.copyId)}</p>}
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
