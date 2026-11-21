// web/src/ui/check/FixPanel.tsx: the Fix step (SPEC SCR-11 "Fix" and "Apply"; T-078, T-079; D-142).
// The RULES-ONLY plan card (copy.fix.title, copy.fix.rules): a checklist of the masks to add (type and ID) and the
// optional crop, each highlighted on the photo (dashed outline while planned), the template explanation, "Expected
// after fix: {level}" recomputed from what is ticked (D-51), copy.fix.unremovable / copy.fix.cropTooMuch. Unticking is
// SCR-11's "Adjust". Apply paints solid fills (invariant 6: never blur) on a copy of the master: the master is never
// changed and nothing is sent from here. After Apply: "Re-attack the fixed photo", which opens the consent sheet.
// LOCAL ONLY: the original photo is drawn on this device; no logging.
import { useEffect, useRef } from 'react';
import { t } from '../../core/strings';
import { deriveFrame, renderFrame } from '../../core/frames';
import type { RulesFix, Residual } from '../../core/fixPlan';
import type { PxRect } from '../../core/types';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';

/** The photo as the fix leaves it: master + solid masks + crop, never the master itself (a failure is solid black). */
function FixPreview({ master, masks, crop, planned }: { master: HTMLCanvasElement; masks: readonly PxRect[]; crop: PxRect | null; planned: readonly PxRect[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const frame = deriveFrame('cloud', master.width, master.height, crop ? { crop } : {});
  useEffect(() => {
    const out = ref.current;
    if (!out) return;
    let rendered: HTMLCanvasElement | null = null;
    try {
      rendered = renderFrame(master, frame, masks);
      out.width = frame.width;
      out.height = frame.height;
      out.getContext('2d')?.drawImage(rendered, 0, 0);
    } catch {
      out.width = Math.max(1, frame.width);
      out.height = Math.max(1, frame.height);
      const ctx = out.getContext('2d');
      if (ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, out.width, out.height); }
    } finally {
      if (rendered) { rendered.width = 0; rendered.height = 0; }
    }
  }, [master, masks, frame.width, frame.height, frame.cropInMaster.x, frame.cropInMaster.y, frame.cropInMaster.w, frame.cropInMaster.h]);
  const c = frame.cropInMaster;
  const pct = (r: PxRect) => ({
    left: `${((r.x - c.x) / c.w) * 100}%`, top: `${((r.y - c.y) / c.h) * 100}%`, width: `${(r.w / c.w) * 100}%`, height: `${(r.h / c.h) * 100}%`,
  });
  return (
    <div className="relative self-start" style={{ maxWidth: '100%' }}>
      <canvas ref={ref} role="img" aria-label={t('ui.fix.previewAlt')} className="block h-auto max-h-[60vh] w-auto max-w-full rounded-lg border border-line" data-testid="fix-preview" />
      {planned.map((r, i) => (
        <div key={i} aria-hidden className="pointer-events-none absolute border-2 border-dashed border-verdict-amber" style={pct(r)} />
      ))}
    </div>
  );
}

export interface FixPanelProps {
  master: HTMLCanvasElement | null;
  /** Masks already on the photo (the candidate's, the first send's auto masks and earlier fixes). */
  baseMasks: readonly PxRect[];
  baseCrop: PxRect | null;
  fix: RulesFix | null;
  unchecked: readonly string[];
  cropOff: boolean;
  residual: Residual | null;
  /** An Apply is waiting for its re-attack. */
  applied: { added: number } | null;
  /** Why no fix round may start, as copy (decline, no result, round cap), or null. */
  blockedCopy: string | null;
  round: { n: number; max: number };
  onToggle: (clueId: string) => void;
  onToggleCrop: () => void;
  onApply: () => void;
  onCancel: () => void;
  onReattack: () => void;
}

export function FixPanel(p: FixPanelProps) {
  const { master, fix, applied } = p;
  if (!master) return <p className="mt-3 text-sm text-muted">{t('ui.verdict.loading')}</p>;
  const roundLine = <p className="text-xs text-muted">{t('ui.fix.round', { n: p.round.n, max: p.round.max })}</p>;

  if (applied) {
    return (
      <div className="mt-3 flex flex-col gap-3" data-testid="fix-applied">
        {roundLine}
        <FixPreview master={master} masks={p.baseMasks} crop={p.baseCrop} planned={[]} />
        <p role="status" className="text-sm">{t('ui.fix.applied', { n: applied.added })}</p>
        {p.blockedCopy ? (
          <p className="rounded-lg border border-line bg-surface-2 p-3 text-sm">{p.blockedCopy}</p>
        ) : (
          <Button variant="primary" className="self-start" data-action="reattack" onClick={p.onReattack}>{t('copy.fix.reattack')}</Button>
        )}
      </div>
    );
  }
  if (p.blockedCopy || !fix) {
    return (
      <div className="mt-3 flex flex-col items-start gap-3">
        <p className="rounded-lg border border-line bg-surface-2 p-3 text-sm">{p.blockedCopy ?? t('ui.verdict.loading')}</p>
        <Button onClick={p.onCancel}>{t('ui.fix.cancel')}</Button>
      </div>
    );
  }
  const off = new Set(p.unchecked);
  const planned = fix.masks.filter((m) => !off.has(m.clueId)).map((m) => m.box);
  const cropOn = !!fix.crop && !p.cropOff;
  const nothing = planned.length === 0 && !cropOn;
  return (
    <div className="mt-3 flex flex-col gap-3" data-testid="fix-plan">
      {roundLine}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-base font-semibold">{t('copy.fix.title')}</p>
        <Badge route={fix.plan.route} />
      </div>
      <p className="text-sm text-muted">{t('copy.fix.rules')}</p>
      <FixPreview master={master} masks={p.baseMasks} crop={p.baseCrop} planned={planned} />
      {(fix.masks.length > 0 || fix.crop) && (
        <ul className="flex flex-col gap-1 text-sm" aria-label={t('copy.fix.title')}>
          {fix.masks.map((m) => (
            <li key={m.clueId}>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!off.has(m.clueId)} onChange={() => p.onToggle(m.clueId)} data-clue={m.clueId} />
                <span>{t('ui.fix.maskItem', { type: m.type.replace(/_/g, ' '), id: m.clueId })}</span>
              </label>
            </li>
          ))}
          {fix.crop && (
            <li>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!p.cropOff} onChange={p.onToggleCrop} data-crop={fix.plan.crop} />
                <span>{t('ui.fix.cropItem', { side: fix.plan.crop })}</span>
              </label>
            </li>
          )}
        </ul>
      )}
      <p className="text-sm">{fix.plan.explanation}</p>
      {p.residual && <p className="text-sm font-medium" data-testid="fix-expected">{t('ui.fix.expected', { level: p.residual })}</p>}
      {fix.unremovable && <p className="text-sm text-muted">{t('copy.fix.unremovable')}</p>}
      {fix.cropTooMuch && <p className="text-sm text-muted">{t('copy.fix.cropTooMuch')}</p>}
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <Button variant="primary" disabled={nothing} onClick={p.onApply} data-action="apply-fix">{t('ui.fix.apply')}</Button>
        <Button onClick={p.onCancel} data-action="cancel-fix">{t('ui.fix.cancel')}</Button>
      </div>
    </div>
  );
}
