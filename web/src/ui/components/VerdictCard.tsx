// web/src/ui/components/VerdictCard.tsx: the verdict card (T-077; SPEC SCR-09, §10; ARCH §12.3, §12.4; D-124).
// Renders a Verdict from core/verdict.ts; every rule (tones, confidence wording, muted vault labels) is in
// verdict/model.ts. Layout, top to bottom (SCR-09):
//   [compare header: "Risk reduced" green, or "Still exposed"]   (only after a re-attack; a level-terms "Risk reduced"
//                                                                 is the heading itself, the headline not repeated, D-134)
//   LEVEL  headline                                              (a heading; LOW's copy carries "This isn't a guarantee.")
//   the lines (a list): icon · text (muted vault label) · confidence · [Why?]
//   Not linked: … · Attacker's best guess: … · noVault + "Add places"
//   Referee: <route> <latency> · Distances: code              ("Guess check:" unless Settings › Technical details)
//   [actions]                                                    (Fix / Export, supplied by the Check screen)
//   The cloud never learns whether it was right.                 (always visible, whatever the level; AC-163)
// A polite live region announces the headline when the card appears or the verdict changes.
// Never: the word "safe", a measured distance, a map pin or an address for the attacker's guess (SR-07, invariant 5).
// DESIGN.md §5.3 look: [banner] → tinted hero band (level tone, never green) → RiskMeter → lines → rows → referee →
// actions → the teal never-learns footer. Green appears only in the "Risk reduced" banner.
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { t } from '../../core/strings';
import type { Route, VaultItem, Verdict, VerdictComparison } from '../../core/types';
import { useSettings } from '../hooks/usePrefs';
import { hrefFor } from '../router';
import { Badge } from './Badge';
import { ButtonLink } from './Button';
import { secondsText, verdictCardView } from './verdict/model';
import { VerdictIcon } from './verdict/VerdictIcon';
import { RiskMeter } from './verdict/RiskMeter';
import { TONE_BORDER, TONE_HERO, TONE_TEXT } from './verdict/tones';
import { VerdictLineItem } from './verdict/VerdictLineItem';

/** The "Risk reduced" banner's words: the verdict scale, the one green moment on screen (DESIGN.md §5.3). */
const BANNER_TEXT = 'min-w-0 text-verdict-sm font-extrabold tracking-[-0.03em] text-balance break-words text-fg sm:text-verdict';
/** The "{before} → {after}" part under it, at title scale, so the banner stays short on a phone. */
const BANNER_REST = 'mt-1 block text-title font-semibold tracking-normal sm:text-h2-sm';
const SENTINEL = '\u0000';

/**
 * Splits "Risk reduced: {before} → {after}" into its lead ("Risk reduced:") and the rest, reading the lead off the
 * copy template itself (en.json), so the words are never re-typed here. The text is unchanged: lead + ' ' + rest.
 */
function bannerParts(text: string): { lead: string; rest: string | null } {
  const tpl = t('copy.verdict.reduced', { before: SENTINEL, after: SENTINEL });
  const lead = tpl.slice(0, Math.max(0, tpl.indexOf(SENTINEL))).trim();
  if (!lead || !text.startsWith(lead)) return { lead: text, rest: null };
  const rest = text.slice(lead.length).trim();
  return rest ? { lead, rest } : { lead: text, rest: null };
}
/**
 * The actions row. The Check screen passes its Fix button (`data-action="fix"`) at the default size; the card draws it
 * at the `lg` size (DESIGN.md §5.3, Button SIZE.lg) with child selectors, which outrank the button's own utilities.
 */
const ACTIONS =
  'flex flex-wrap items-center gap-2 [&>[data-action=fix]]:min-h-12 [&>[data-action=fix]]:px-6 ' +
  '[&>[data-action=fix]]:text-body [&>[data-action=fix]]:font-semibold';

export interface VerdictCardProps {
  /** The verdict to show. With `comparison`, `comparison.after` is shown instead, under its compare header. */
  verdict: Verdict;
  /** The local vault: muted labels and the "Not linked" names. Display only; never logged or sent. */
  vault: readonly VaultItem[];
  comparison?: VerdictComparison | null;
  /** Overrides Settings › "Show vault labels in results" (on by default). */
  showVaultLabels?: boolean;
  /**
   * Who graded the attacker and how long it took (SCR-09 "Referee: ON-DEVICE 1.3 s"). `note`: the honest line under a
   * RULES-ONLY referee (copy.ref.rules, or why on-device AI did not decide this time; T-074).
   */
  referee?: { route: Route; latencyMs: number | null; note?: string | null } | null;
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
  /** Overrides Settings › Technical details (clue ids in "Why?", "Referee:" wording). */
  tech?: boolean;
}

export function VerdictCard({
  verdict, vault, comparison = null, showVaultLabels, referee = null, actions, onFocusClues, onExplain,
  headingLevel = 3, defaultOpenLineId = null, announce = true, tech: givenTech,
}: VerdictCardProps) {
  const settings = useSettings();
  const show = showVaultLabels ?? settings.showVaultLabels;
  const tech = givenTech ?? settings.techDetails;
  const view = useMemo(
    () => verdictCardView(verdict, vault, { showVaultLabels: show, comparison, tech }),
    [verdict, vault, show, comparison, tech],
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
  const banner = bannerParts(view.compare?.text ?? '');

  return (
    <section
      aria-labelledby={headingId}
      data-level={view.level}
      className="flex flex-col overflow-hidden rounded-stage border border-line bg-surface shadow-e1"
    >
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announced}
      </p>

      {view.compare && (
        // Inset by the card's own padding so the green glow shows around the banner and never under text.
        <div className="p-3 pb-0 sm:p-4 sm:pb-0">
          {view.compare.reduced ? (
            <div
              data-compare="reduced"
              data-tone={view.compare.tone}
              className="flex animate-pop items-center gap-3 rounded-card bg-verdict-green-hero px-5 py-5 shadow-glow-green"
            >
              <span className="shrink-0 text-verdict-green">
                <VerdictIcon name="check" className="size-8" />
              </span>
              {view.compare.isHeadline ? (
                <Heading id={headingId} className={BANNER_TEXT}>
                  {banner.lead}
                  {banner.rest !== null && <>{' '}<span className={BANNER_REST}>{banner.rest}</span></>}
                </Heading>
              ) : (
                <p className={BANNER_TEXT}>
                  {banner.lead}
                  {banner.rest !== null && <>{' '}<span className={BANNER_REST}>{banner.rest}</span></>}
                </p>
              )}
            </div>
          ) : (
            <div
              data-compare="still"
              data-tone={view.compare.tone}
              className={`flex items-start gap-3 rounded-card border-l-4 px-5 py-4 ${TONE_HERO[view.compare.tone]} ${TONE_BORDER[view.compare.tone]}`}
            >
              {/* The after-level's tone and icon, so the drawn colour matches data-tone (RED red, AMBER amber). */}
              <span className={`mt-0.5 shrink-0 ${TONE_TEXT[view.compare.tone]}`}>
                <VerdictIcon name={view.compare.icon} className="size-6" />
              </span>
              {view.compare.isHeadline ? (
                <Heading id={headingId} className="text-title font-semibold break-words text-fg">
                  {view.compare.text}
                </Heading>
              ) : (
                <span className="text-title font-semibold break-words text-fg">{view.compare.text}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* The hero keeps its LEVEL tone, compare or not: it never turns green (DESIGN.md §6.4). */}
      <div
        data-tone={view.tone}
        className={`flex animate-wipe items-start gap-3 border-l-[6px] px-5 py-5 ${view.compare ? 'mt-3 sm:mt-4' : ''} ${TONE_HERO[view.tone]} ${TONE_BORDER[view.tone]}`}
      >
        <span className={`mt-0.5 shrink-0 ${TONE_TEXT[view.tone]}`}>
          <VerdictIcon name={view.icon} className="size-8" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span
            className={`font-mono text-caption font-bold tracking-[0.12em] ${TONE_TEXT[view.tone]} ${view.compare?.isHeadline ? 'mt-2' : ''}`}
            aria-hidden="true"
          >
            {view.levelLabel}
          </span>
          {!view.compare?.isHeadline && (
            <Heading
              id={headingId}
              className="text-verdict-sm font-extrabold tracking-[-0.03em] text-balance break-words text-fg sm:text-verdict"
            >
              {view.headline}
            </Heading>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 sm:px-5">
        <RiskMeter meter={view.meter} />
      </div>

      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
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
                tech={tech}
              />
            ))}
          </ul>
        )}

        {(view.notLinked || view.bestGuess || view.noVault) && (
          <div className="flex flex-col gap-2 text-body">
            {view.notLinked && (
              <p className="flex items-start gap-3 px-3 text-fg">
                <span className="mt-0.5 text-verdict-grey"><VerdictIcon name="info" /></span>
                <span className="min-w-0 break-words">{view.notLinked}</span>
              </p>
            )}
            {view.bestGuess && (
              <p className="flex items-start gap-3 px-3 text-fg">
                <span className="mt-0.5 text-verdict-grey"><VerdictIcon name="eye" /></span>
                <span className="min-w-0 break-words">{view.bestGuess}</span>
              </p>
            )}
            {view.noVault && (
              <div className="mt-1 flex flex-wrap items-center gap-3 rounded-lg bg-surface-2 p-3">
                <p className="min-w-0 flex-1 text-fg">{view.noVault}</p>
                <ButtonLink href={hrefFor({ name: 'vault' })} size="compact">
                  {t('ui.verdict.addPlaces')}
                </ButtonLink>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted">
            {referee && (
              <>
                <span>{t(tech ? 'ui.verdict.referee' : 'ui.verdict.refereePlain')}</span>{' '}
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
          {referee?.note && <p className="text-small text-muted" data-testid="referee-note">{referee.note}</p>}
        </div>

        {actions && <div className={ACTIONS}>{actions}</div>}
      </div>

      <p data-never-learns="" className="flex items-center gap-3 bg-verdict-teal-bg px-5 py-3 text-body font-medium text-fg">
        <VerdictIcon name="lock" className="size-5 text-verdict-teal" />
        {view.neverLearns}
      </p>
    </section>
  );
}
