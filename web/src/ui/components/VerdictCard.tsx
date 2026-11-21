// web/src/ui/components/VerdictCard.tsx: the verdict card (T-077; SPEC SCR-09, §10; ARCH §12.3, §12.4; D-124).
// Renders a Verdict from core/verdict.ts; every rule (tones, confidence wording, muted vault labels) is in
// verdict/model.ts. Layout, top to bottom (SCR-09):
//   [compare header: "Risk reduced" green, or "Still exposed"]   (only after a re-attack; a level-terms "Risk reduced"
//                                                                 is the heading itself, the headline not repeated, D-134)
//   LEVEL  headline                                              (a heading; LOW's copy carries "This isn't a guarantee.")
//   the lines (a list): icon · text (muted vault label) · confidence · [Why?]
//   Not linked: … · Attacker's best guess: … · noVault + "Add places"
//   Referee: <route> <latency> · Distances: code
//   [actions]                                                    (Fix / Export, supplied by the Check screen)
//   The cloud never learns whether it was right.                 (always visible, whatever the level; AC-163)
// A polite live region announces the headline when the card appears or the verdict changes.
// Never: the word "safe", a measured distance, a map pin or an address for the attacker's guess (SR-07, invariant 5).
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { t } from '../../core/strings';
import type { Route, VaultItem, Verdict, VerdictComparison } from '../../core/types';
import { useSettings } from '../hooks/usePrefs';
import { hrefFor } from '../router';
import { Badge } from './Badge';
import { ButtonLink } from './Button';
import { secondsText, verdictCardView } from './verdict/model';
import { VerdictIcon } from './verdict/VerdictIcon';
import { TONE_BG, TONE_BORDER, TONE_TEXT } from './verdict/tones';
import { VerdictLineItem } from './verdict/VerdictLineItem';

export interface VerdictCardProps {
  /** The verdict to show. With `comparison`, `comparison.after` is shown instead, under its compare header. */
  verdict: Verdict;
  /** The local vault: muted labels and the "Not linked" names. Display only; never logged or sent. */
  vault: readonly VaultItem[];
  comparison?: VerdictComparison | null;
  /** Overrides Settings › "Show vault labels in results" (on by default). */
  showVaultLabels?: boolean;
  /** Who graded the attacker and how long it took (SCR-09 "Referee: ON-DEVICE 1.3 s"). */
  referee?: { route: Route; latencyMs: number | null } | null;
  /** Fix / Export buttons (the Check screen owns the flow). */
  actions?: ReactNode;
  /** Called with the open line's clue IDs (to highlight them on the image), or null when no "Why?" is open. */
  onFocusClues?: (clueIds: readonly string[] | null) => void;
  /** SCR-16 explainer; the "Explain" button shows only when given. */
  onExplain?: (clueIds: readonly string[]) => void;
  /** The headline's heading level (the Check screen has h1 for the screen and h2 for the step). */
  headingLevel?: 2 | 3;
  /** A "Why?" open on first render (DEV gallery, tests). */
  defaultOpenLineId?: string | null;
  /**
   * Whether this card's live region announces the verdict (default true). A page showing several cards (the DEV
   * gallery) turns it off for all but the selected one, so they do not all speak at once.
   */
  announce?: boolean;
}

export function VerdictCard({
  verdict, vault, comparison = null, showVaultLabels, referee = null, actions, onFocusClues, onExplain,
  headingLevel = 3, defaultOpenLineId = null, announce = true,
}: VerdictCardProps) {
  const settings = useSettings();
  const show = showVaultLabels ?? settings.showVaultLabels;
  const view = useMemo(
    () => verdictCardView(verdict, vault, { showVaultLabels: show, comparison }),
    [verdict, vault, show, comparison],
  );
  const uid = useId();
  const headingId = `${uid}-headline`;
  const [openId, setOpenId] = useState<string | null>(defaultOpenLineId);
  const [announced, setAnnounced] = useState('');

  // Fill the live region after it is mounted, so screen readers announce the verdict when it appears.
  useEffect(() => {
    setAnnounced('');
    if (!announce) return;
    const timer = setTimeout(() => setAnnounced(view.announcement), 100);
    return () => clearTimeout(timer);
  }, [view.announcement, announce]);

  // A new verdict closes any "Why?" whose line no longer exists.
  const openLine = view.lines.find((l) => l.id === openId && l.why) ?? null;
  const openClues = openLine?.why?.clueIds ?? null;
  const openKey = openClues ? openClues.join('\u0000') : null;
  useEffect(() => {
    onFocusClues?.(openClues);
    // openKey stands for openClues' content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, onFocusClues]);

  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <section
      aria-labelledby={headingId}
      data-level={view.level}
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4"
    >
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announced}
      </p>

      {view.compare && (
        <div
          data-compare={view.compare.reduced ? 'reduced' : 'still'}
          data-tone={view.compare.tone}
          className={`flex items-start gap-2 rounded-lg border p-3 font-semibold ${TONE_BORDER[view.compare.tone]} ${TONE_BG[view.compare.tone]} ${TONE_TEXT[view.compare.tone]}`}
        >
          <VerdictIcon name={view.compare.icon} />
          {view.compare.isHeadline ? (
            <Heading id={headingId} className="text-lg leading-snug font-semibold">
              {view.compare.text}
            </Heading>
          ) : (
            <span>{view.compare.text}</span>
          )}
        </div>
      )}

      <div data-tone={view.tone} className={`flex items-start gap-3 rounded-lg p-3 ${TONE_BG[view.tone]}`}>
        <span className={`mt-0.5 ${TONE_TEXT[view.tone]}`}>
          <VerdictIcon name={view.icon} className="size-6" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className={`font-mono text-xs font-bold tracking-wider ${TONE_TEXT[view.tone]}`} aria-hidden="true">
            {view.levelLabel}
          </span>
          {!view.compare?.isHeadline && (
            <Heading id={headingId} className="text-lg leading-snug font-semibold text-fg">
              {view.headline}
            </Heading>
          )}
        </div>
      </div>

      {view.lines.length > 0 && (
        <ul aria-labelledby={headingId} className="flex flex-col gap-2">
          {view.lines.map((line, i) => (
            <VerdictLineItem
              key={line.id}
              line={line}
              idBase={`${uid}-l${i}`}
              open={openLine?.id === line.id}
              onToggle={() => setOpenId((cur) => (cur === line.id ? null : line.id))}
              onExplain={onExplain}
            />
          ))}
        </ul>
      )}

      {(view.notLinked || view.bestGuess || view.noVault) && (
        <div className="flex flex-col gap-1 text-sm">
          {view.notLinked && <p className="text-verdict-grey">{view.notLinked}</p>}
          {view.bestGuess && <p className="text-fg">{view.bestGuess}</p>}
          {view.noVault && (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <p className="text-fg">{view.noVault}</p>
              <ButtonLink href={hrefFor({ name: 'vault' })} size="compact">
                {t('ui.verdict.addPlaces')}
              </ButtonLink>
            </div>
          )}
        </div>
      )}

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        {referee && (
          <>
            <span>{t('ui.verdict.referee')}</span>{' '}
            <Badge route={referee.route} />{' '}
            {referee.latencyMs !== null && (
              <>
                <span className="font-mono tabular-nums">{secondsText(referee.latencyMs)}</span>{' '}
              </>
            )}
            <span aria-hidden="true">·</span>{' '}
          </>
        )}
        <span>{t('ui.verdict.distances')}</span>
      </p>

      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}

      <p data-never-learns="" className="flex items-center gap-2 border-t border-line pt-3 text-sm font-medium text-fg">
        <VerdictIcon name="lock" className="size-4 text-verdict-teal" />
        {view.neverLearns}
      </p>
    </section>
  );
}
