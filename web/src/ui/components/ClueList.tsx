// web/src/ui/components/ClueList.tsx: the pre-screen side list (SPEC SCR-06 "Mask editor"; T-068). Below the photo on
// mobile, beside it on wide screens. One row per item: type · reader(s) · severity · the mask checkbox, with what it
// matched (a masked vault hit: copy.prescreen.vaultHit, LOCAL ONLY), an approximate-area note or an amber "possible"
// note. Un-ticking a face or a vault hit is allowed (the Egress Gate demo) and shows copy.editor.warnFace /
// warnVault inline: the checkbox is described by it and a polite live region announces it. An un-ticked face blocks
// the photo (D-132). Removing a masked grid-cell area asks first (copy.editor.confirmRemoveCell, a labelled group that
// takes the focus). The user's own masks are listed after, each with Remove (focus then goes to `afterRemove`).
// When a Tier-0 reader failed, the list never says "nothing found": it says which readers did not check (D-132).
// "Explain" (S2, SCR-16) joins the row once T-087's explainer exists.
import { useEffect, useId, useRef, useState } from 'react';
import { t, type StringId } from '../../core/strings';
import type { Tier0StepId } from '../../tier0/tier0';
import { needsConfirm, warningOf, type EditorItem, type EditorOp, type EditorState } from '../check/editor';
import { clueLabelId, readerLabelId, rowDetail, severityLabelId } from '../check/prescreenView';
import { Button } from './Button';
import { Icon } from './Icon';

/** What each failed Tier-0 step leaves unchecked (D-132). */
export const NOT_CHECKED: Readonly<Record<Tier0StepId, StringId>> = {
  metadata: 'ui.editor.notChecked.metadata',
  faces: 'ui.editor.notChecked.faces',
  text: 'ui.editor.notChecked.text',
  vault: 'ui.editor.notChecked.vault',
};

export interface ClueListProps {
  editor: EditorState;
  onOp: (op: EditorOp) => void;
  /** The Tier-0 steps that failed: while any did, "nothing found" is never said. */
  failed?: readonly Tier0StepId[];
  /** Where focus goes after a user mask is removed from the list (the Add mask button). */
  afterRemove?: () => void;
}

export function ClueList({ editor, onOp, failed = [], afterRemove }: ClueListProps) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const faces = editor.items.filter((it) => it.clue.type === 'face');
  const warnings = editor.items.map((it) => warningOf(it, editor)).filter((w): w is NonNullable<typeof w> => w !== null);
  const toggle = (it: EditorItem) => {
    if (needsConfirm(it)) setConfirming(it.clue.id);
    else onOp({ op: 'toggle', id: it.clue.id });
  };
  useEffect(() => {
    if (confirming) confirmRef.current?.focus(); // into the group: its least destructive choice
  }, [confirming]);

  return (
    <section aria-labelledby={`${uid}-title`} className="flex flex-col gap-3">
      <h3 id={`${uid}-title`} className="text-title font-semibold">{t('ui.editor.title')}</h3>
      {failed.map((st) => (
        <p key={st} data-not-checked={st} className="flex items-start gap-2 text-small font-medium text-verdict-red"><Icon name="alert" className="mt-0.5 size-4" />{t(NOT_CHECKED[st])}</p>
      ))}
      {faces.length > 0 && faces.every((it) => it.clue.masked) && <p className="text-small text-muted">{t('copy.prescreen.people')}</p>}
      {failed.length === 0 && editor.items.length === 0 && editor.userMasks.length === 0 && (
        <p className="text-small text-muted">{t('ui.editor.none')}</p>
      )}
      <p role="status" aria-live="polite" className="sr-only">{warnings.map((w) => t(w)).join(' ')}</p>
      <ul className="flex flex-col gap-2">
        {editor.items.map((it) => {
          const label = t(clueLabelId(it));
          const reader = readerLabelId(it.clue.readers);
          const detail = rowDetail(it, label);
          const warning = warningOf(it, editor);
          const warnId = `${uid}-warn-${it.clue.id}`;
          const promptId = `${uid}-confirm-${it.clue.id}`;
          const tone = it.clue.masked ? 'border-l-line-strong' : it.flag === 'possible' && !warning ? 'border-l-verdict-amber' : 'border-l-verdict-red';
          // Teal only for a caught private item (a masked face or vault hit): protected, never sent (DESIGN §6.1).
          const caught = it.clue.masked && (it.clue.type === 'face' || it.clue.vaultHits.length > 0);
          return (
            <li key={it.clue.id} data-clue={it.clue.id} className={`rounded-lg border-l-4 bg-surface-2 py-1 pr-2 pl-2 ${tone}`}>
              <div className="flex items-start gap-2">
                <label className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5 accent-current"
                    checked={it.clue.masked}
                    aria-label={t('ui.editor.maskAria', { type: label })}
                    aria-describedby={warning ? warnId : undefined}
                    onChange={() => toggle(it)}
                  />
                  <span className="text-sm">{t('ui.editor.mask')}</span>
                </label>
                <div className="flex min-w-0 flex-1 flex-col gap-1 pt-2.5">
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-small">
                    {caught ? (
                      <span aria-hidden="true" className="inline-flex size-5 items-center justify-center rounded-chip bg-verdict-teal-bg text-verdict-teal">
                        <Icon name="lock" className="size-3.5" />
                      </span>
                    ) : (
                      <Icon
                        name={it.clue.masked ? 'check' : 'alert'}
                        className={`size-4 ${it.clue.masked ? 'text-muted' : it.flag === 'possible' && !warning ? 'text-verdict-amber' : 'text-verdict-red'}`}
                      />
                    )}
                    <span className="font-medium">{label}</span>
                    {reader && <span className="text-muted"> · {t(reader)}</span>}
                    <span className="text-muted"> · </span>
                    <span className="rounded-full border border-line px-2 text-small text-fg">{t(severityLabelId(it.clue.severity))}</span>
                  </p>
                  {/* the read text of a regex flag; a vault hit's text shows only in copy.prescreen.vaultHit, while masked */}
                  {it.clue.localText && it.clue.vaultHits.length === 0 && (
                    <p className="font-mono text-small break-all text-muted">{it.clue.localText}</p>
                  )}
                  {detail && <p className="text-small text-muted">{t(detail.id, detail.params)}</p>}
                  {warning && <p id={warnId} className="text-small font-medium text-verdict-red">{t(warning)}</p>}
                  {confirming === it.clue.id && (
                    <div role="group" aria-labelledby={promptId} className="flex flex-col gap-2">
                      <p id={promptId} className="text-sm">{t('copy.editor.confirmRemoveCell', { TEXT: it.clue.localText ?? label })}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="danger" onClick={() => { setConfirming(null); onOp({ op: 'toggle', id: it.clue.id }); }}>
                          {t('ui.editor.remove')}
                        </Button>
                        <Button ref={confirmRef} onClick={() => setConfirming(null)}>{t('ui.editor.cancel')}</Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {editor.userMasks.map((m) => (
          <li key={m.id} data-user-mask={m.id} className="flex items-center justify-between gap-2 rounded-lg border-l-4 border-l-line-strong bg-surface-2 py-1 pr-1 pl-3">
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-small">
              <span aria-hidden="true" className="inline-block size-3 shrink-0 rounded-[2px] bg-mask ring-1 ring-line-strong" />
              <span className="font-medium">{t('ui.editor.userMask', { n: m.n })}</span>
              <span className="text-muted"> · {t('ui.editor.size', { w: m.rect.w, h: m.rect.h })}</span>
            </p>
            <Button
              size="compact"
              aria-label={t('ui.editor.removeAria', { n: m.n })}
              onClick={() => { onOp({ op: 'remove', id: m.id }); afterRemove?.(); }}
            >
              {t('ui.editor.remove')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
