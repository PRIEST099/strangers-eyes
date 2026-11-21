// web/src/ui/components/ClueList.tsx: the pre-screen side list (SPEC SCR-06 "Mask editor"; T-068). Below the photo on
// mobile, beside it on wide screens. One row per item: type · reader(s) · severity · the mask checkbox, with what it
// matched (a masked vault hit: copy.prescreen.vaultHit, LOCAL ONLY), an approximate-area note or an amber "possible"
// note. Un-ticking a face or a vault hit is allowed (the Egress Gate demo) and shows copy.editor.warnFace /
// warnVault inline. Removing a masked grid-cell area asks first (copy.editor.confirmRemoveCell). The user's own masks
// are listed after, each with Remove. "Explain" (S2, SCR-16) joins the row once T-087's explainer exists.
import { useState } from 'react';
import { t } from '../../core/strings';
import { needsConfirm, warningOf, type EditorItem, type EditorOp, type EditorState } from '../check/editor';
import { clueLabelId, readerLabelId, rowDetail, severityLabelId } from '../check/prescreenView';
import { Button } from './Button';

export interface ClueListProps {
  editor: EditorState;
  onOp: (op: EditorOp) => void;
}

export function ClueList({ editor, onOp }: ClueListProps) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const hasFaces = editor.items.some((it) => it.clue.type === 'face');
  const toggle = (it: EditorItem) => {
    if (needsConfirm(it)) setConfirming(it.clue.id);
    else onOp({ op: 'toggle', id: it.clue.id });
  };

  return (
    <section aria-labelledby="clue-list-title" className="flex flex-col gap-3">
      <h3 id="clue-list-title" className="text-base font-semibold">{t('ui.editor.title')}</h3>
      {hasFaces && <p className="text-sm text-muted">{t('copy.prescreen.people')}</p>}
      {editor.items.length === 0 && editor.userMasks.length === 0 && <p className="text-sm text-muted">{t('ui.editor.none')}</p>}
      <ul className="flex flex-col gap-2">
        {editor.items.map((it) => {
          const label = t(clueLabelId(it));
          const reader = readerLabelId(it.clue.readers);
          const detail = rowDetail(it, label);
          const warning = warningOf(it);
          const tone = it.clue.masked ? 'border-line' : it.flag === 'possible' && !warning ? 'border-verdict-amber' : 'border-verdict-red';
          return (
            <li key={it.clue.id} data-clue={it.clue.id} className={`rounded-lg border bg-surface-2 p-2 ${tone}`}>
              <div className="flex items-start gap-2">
                <label className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5 accent-current"
                    checked={it.clue.masked}
                    aria-label={t('ui.editor.maskAria', { type: label })}
                    onChange={() => toggle(it)}
                  />
                  <span className="text-sm">{t('ui.editor.mask')}</span>
                </label>
                <div className="flex min-w-0 flex-col gap-1 pt-2.5">
                  <p className="text-sm">
                    <span className="font-medium">{label}</span>
                    {reader && <span className="text-muted"> · {t(reader)}</span>}
                    <span className="text-muted"> · {t(severityLabelId(it.clue.severity))}</span>
                  </p>
                  {it.clue.localText && it.clue.vaultHits.length === 0 && (
                    <p className="font-mono text-xs break-all text-muted">{it.clue.localText}</p>
                  )}
                  {detail && <p className="text-sm text-muted">{t(detail.id, detail.params)}</p>}
                  {warning && <p className="text-sm font-medium text-verdict-red">{t(warning)}</p>}
                  {confirming === it.clue.id && (
                    <div role="group" className="flex flex-col gap-2">
                      <p className="text-sm">{t('copy.editor.confirmRemoveCell', { TEXT: it.clue.localText ?? label })}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="danger" onClick={() => { setConfirming(null); onOp({ op: 'toggle', id: it.clue.id }); }}>
                          {t('ui.editor.remove')}
                        </Button>
                        <Button onClick={() => setConfirming(null)}>{t('ui.editor.cancel')}</Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {editor.userMasks.map((m) => (
          <li key={m.id} data-user-mask={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2 p-2">
            <p className="text-sm">
              <span className="font-medium">{t('ui.editor.userMask', { n: m.n })}</span>
              <span className="text-muted"> · {t('ui.editor.size', { w: m.rect.w, h: m.rect.h })}</span>
            </p>
            <Button size="compact" aria-label={t('ui.editor.removeAria', { n: m.n })} onClick={() => onOp({ op: 'remove', id: m.id })}>
              {t('ui.editor.remove')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
