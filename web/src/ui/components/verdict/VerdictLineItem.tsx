// web/src/ui/components/verdict/VerdictLineItem.tsx: one verdict line (T-077; SPEC SCR-09). Icon + text + confidence,
// and a "Why?" disclosure (aria-expanded / aria-controls) with the referee's reason, the supporting clue IDs, who
// decided (route badge) and, once SCR-16 exists, an "Explain" button. The vault label is muted text after the KIND.
import { t } from '../../../core/strings';
import { Badge } from '../Badge';
import { Button } from '../Button';
import type { LineView } from './model';
import { TONE_BG, TONE_BORDER, TONE_TEXT } from './tones';
import { VerdictIcon } from './VerdictIcon';

export interface VerdictLineItemProps {
  line: LineView;
  /** DOM id base (unique per card). */
  idBase: string;
  open: boolean;
  onToggle: () => void;
  /** SCR-16 explainer for the line's clues; the button shows only when given. */
  onExplain?: (clueIds: readonly string[]) => void;
}

export function VerdictLineItem({ line, idBase, open, onToggle, onExplain }: VerdictLineItemProps) {
  const textId = `${idBase}-text`;
  const panelId = `${idBase}-why`;
  const { before, kind, label, after } = line.segments;
  return (
    <li
      data-line-id={line.id}
      data-severity={line.severity}
      data-tone={line.tone}
      className={`flex flex-col gap-2 rounded-lg border-l-4 p-3 ${TONE_BORDER[line.tone]} ${TONE_BG[line.tone]}`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 ${TONE_TEXT[line.tone]}`}>
          <VerdictIcon name={line.icon} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p id={textId} className="font-medium break-words text-fg">
            {before}
            {kind}
            {label !== null && (
              <>
                {' '}
                <span className="font-normal text-muted" data-vault-label="">({label})</span>
              </>
            )}
            {after}
            {line.suffix !== null && (
              <>
                {' '}
                <span className="font-normal text-muted">{line.suffix}</span>
              </>
            )}
          </p>
          {line.confidence !== null && (
            <p className={`text-sm font-medium ${TONE_TEXT[line.tone]}`} data-confidence="">
              {line.confidence}
            </p>
          )}
        </div>
        {line.why && (
          <Button
            variant="ghost"
            size="compact"
            className="shrink-0"
            aria-expanded={open}
            aria-controls={panelId}
            aria-describedby={textId}
            onClick={onToggle}
          >
            {t('ui.verdict.why')}
          </Button>
        )}
      </div>
      {line.why && (
        <div id={panelId} hidden={!open} className="ml-8 flex flex-col gap-2 border-t border-line pt-2 text-sm">
          {line.why.reason !== null && <p className="text-fg">{line.why.reason}</p>}
          {line.why.clues !== null && <p className="font-mono text-muted">{line.why.clues}</p>}
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-muted">{t('ui.verdict.referee')}</span>{' '}
            <Badge route={line.why.route} />
          </p>
          {onExplain && line.why.clueIds.length > 0 && (
            <Button size="compact" className="self-start" onClick={() => onExplain(line.why?.clueIds ?? [])}>
              {t('ui.verdict.explain')}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
