// web/src/ui/screens/About.tsx: #/about (SPEC SCR-20 About, P0; AC-276). Every listed item, in SPEC order:
//   the version and commit · copy.about.notGuarantee · copy.about.howItWorks · a "What leaves this device" table (S0–S4
//   in plain words, plus the other network traffic) · the re-attack disclosure (D-24, SR-19) · third parties (Gemini via
//   Firebase AI Logic, App Check's reCAPTCHA Enterprise, the libraries and licences of THIRD_PARTY_NOTICES) · prior art
//   (E11, E12) · the 18+ notice · copy.about.support · the repo link.
// Honest limits: it says "reduces risk", never "safe" (CLAUDE.md invariant 6). Static: no AI call, works offline.
// Layout (docs/DESIGN.md §5.1, D-162): opens with the StoryReel strip (the six illustrated frames) and "How we know"
// (the Day-1 spike numbers with their scope and caveat), then the lanes explainer; prose at text-body max-w-[68ch];
// the how-it-works <li> stay bare (systemScreens.test), styled from their parent.
import pkg from '../../../package.json';
import { PAYLOAD_CLASSES, type PayloadClass } from '../../ai/capabilities';
import { t, type StringId } from '../../core/strings';
import type { Route } from '../../core/types';
import type { ReactNode } from 'react';
import { Art } from '../components/Art';
import { Badge } from '../components/Badge';
import { HybridLanes } from '../components/HybridLanes';
import { StoryReel } from '../components/StoryReel';
import { CARD, H1, H2 } from '../components/surface';
import { useTechDetails } from '../hooks/usePrefs';

/** Link targets (not copy). The repo is public from T-170 (Nov 29). */
export const REPO_URL = 'https://github.com/PRIEST099/strangers-eyes';
const E11_URL = 'https://doi.org/10.1145/3706598.3714074';
/** Served by the app: copy-assets.mjs copies THIRD_PARTY_NOTICES.md; Vite writes the bundled licences at build time. */
const NOTICES_URL = '/vendor/third-party-notices.md';
const LICENSES_URL = '/third-party-licenses.md';

/** The build's commit, when the build provides one (VITE_GIT_SHA); a short hex SHA, or null. */
export function commitOf(raw: unknown): string | null {
  return typeof raw === 'string' && /^[0-9a-f]{7,40}$/i.test(raw.trim()) ? raw.trim().slice(0, 12).toLowerCase() : null;
}

/** copy.about.howItWorks is one string with " · " between its points; About lists them. */
export const howItWorksPoints = (text: string): string[] =>
  text.split(' · ').map((s) => s.trim()).filter((s) => s.length > 0);

const LIBRARIES: readonly StringId[] = [
  'ui.about.lib.mediapipe',
  'ui.about.lib.tesseract',
  'ui.about.lib.traineddata',
  'ui.about.lib.exifr',
  'ui.about.lib.idbKeyval',
  'ui.about.lib.firebase',
  'ui.about.lib.react',
];

/**
 * Every route each class can take by design (SPEC §5.3; the ui.about.leaves.* text says when), so the table never
 * claims one route where two are possible. Display only: the Egress Gate decides every real call afresh, and the
 * Router HUD shows the route each call actually took.
 */
const CLASS_ROUTES: Readonly<Record<PayloadClass, readonly Route[]>> = {
  S0: ['ON_DEVICE', 'RULES_ONLY'],
  S1: ['ON_DEVICE', 'RULES_ONLY'],
  S2: ['ON_DEVICE', 'IN_CLOUD'],
  S3: ['IN_CLOUD'],
  S4: ['ON_DEVICE', 'IN_CLOUD'],
};

/** "How we know": benchmark/spike/day1-adversary.md (Nov 23). Re-check every figure when the T-150 benchmark lands. */
const RECEIPTS: readonly StringId[] = ['ui.story.how.r1', 'ui.story.how.r2', 'ui.story.how.r3', 'ui.story.how.r4'];

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;
const LINK = 'inline-flex min-h-11 items-center underline underline-offset-4';
/** Bulleted lists: the <li> stay bare (the how-it-works test reads `<li>{point}</li>`), so the parent styles them. */
const LIST = 'max-w-[68ch] list-disc space-y-1.5 pl-5 text-body marker:text-muted [&>li]:pl-1';

function Section({ id, titleId, children }: { id: string; titleId: StringId; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t border-line pt-6">
      <h2 id={id} className={H2}>
        {t(titleId)}
      </h2>
      {children}
    </section>
  );
}

export function About() {
  const commit = commitOf(import.meta.env.VITE_GIT_SHA);
  // The S0–S4 codes beside each row only with Settings › Technical details (the rows say it in words either way).
  const tech = useTechDetails();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className={H1}>{t('ui.screen.about')}</h1>
        <p data-about="version" className="font-mono text-small text-muted tabular-nums">
          {commit
            ? t('ui.about.version', { version: pkg.version, commit })
            : t('ui.about.versionNoCommit', { version: pkg.version })}
        </p>
      </div>

      <StoryReel variant="strip" className="w-full" />

      {/* D-170: decorative; the card below says it in words. */}
      <Art name="gate" className="aspect-[2/1] w-full max-w-[68ch]" />

      <section aria-labelledby="about-know" data-about="howWeKnow" className={`${CARD} flex max-w-[68ch] flex-col gap-3`}>
        <h2 id="about-know" className="text-title font-semibold">
          {t('ui.story.how')}
        </h2>
        <p className="text-body font-medium">{t('ui.story.how.lead')}</p>
        <ul className={LIST}>
          {RECEIPTS.map((id) => (
            <li key={id}>{t(id)}</li>
          ))}
        </ul>
        <p className="text-small text-muted">{t('ui.story.how.caveat')}</p>
      </section>

      <HybridLanes mode="explainer" className="w-full" />

      <p
        data-about="notGuarantee"
        className={`${CARD} max-w-[68ch] border-l-4 border-l-line-strong text-body font-medium`}
      >
        {t('copy.about.notGuarantee')}
      </p>

      <Section id="about-how" titleId="ui.about.how">
        <ul data-about="howItWorks" className={LIST}>
          {howItWorksPoints(t('copy.about.howItWorks')).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Section>

      <Section id="about-leaves" titleId="ui.about.leaves">
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <table data-about="leaves" className="w-full border-collapse text-left text-small">
            <thead className="bg-surface-2">
              <tr className="text-muted">
                <th scope="col" className="px-3 py-2 font-medium sm:px-4">{t('ui.about.leaves.colData')}</th>
                <th scope="col" className="px-3 py-2 font-medium sm:px-4">{t('ui.about.leaves.colLeaves')}</th>
              </tr>
            </thead>
            <tbody>
              {PAYLOAD_CLASSES.map((k) => (
                <tr key={k} data-class={k} className="border-t border-line align-top">
                  <th scope="row" className="w-[42%] px-3 py-3 font-normal sm:px-4">
                    {tech && <span className="mr-1.5 font-mono text-caption font-bold text-muted">{k}</span>}
                    {t(`ui.cap.policy.${k}`)}
                  </th>
                  <td className="px-3 py-3 sm:px-4">
                    <span className="mb-1.5 flex flex-wrap gap-1.5">
                      {CLASS_ROUTES[k].map((r) => (
                        <Badge key={r} route={r} />
                      ))}
                    </span>
                    {t(`ui.about.leaves.${k}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="max-w-[68ch] text-small text-muted">{t('copy.ledger.otherTraffic')}</p>
        <p data-about="reattack" className="max-w-[68ch] text-body">{t('copy.about.reattackDisclosure')}</p>
      </Section>

      <Section id="about-third" titleId="ui.about.third">
        <p className="max-w-[68ch] text-body">{t('ui.about.gemini')}</p>
        <p data-about="recaptcha" className="max-w-[68ch] text-body">{t('ui.about.recaptcha')}</p>
        <ul data-about="libraries" className={LIST}>
          {LIBRARIES.map((id) => (
            <li key={id}>{t(id)}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-x-4">
          <a href={NOTICES_URL} className={LINK} {...EXTERNAL}>{t('ui.about.notices')}</a>
          <a href={LICENSES_URL} className={LINK} {...EXTERNAL}>{t('ui.about.licenses')}</a>
        </div>
      </Section>

      <Section id="about-prior" titleId="ui.about.prior">
        <ul data-about="priorArt" className={LIST}>
          <li>
            <a href={E11_URL} className="underline underline-offset-4" {...EXTERNAL}>{t('ui.about.prior.e11')}</a>
          </li>
          <li>{t('ui.about.prior.e12')}</li>
        </ul>
        <p className="max-w-[68ch] text-small text-muted">{t('ui.about.prior.diff')}</p>
      </Section>

      <Section id="about-use" titleId="ui.about.use">
        <p data-about="adults" className="max-w-[68ch] text-body">{t('ui.about.adults')}</p>
        <p data-about="support" className="max-w-[68ch] text-body">{t('copy.about.support')}</p>
      </Section>

      <a data-about="repo" href={REPO_URL} className={`${LINK} self-start text-body font-medium`} {...EXTERNAL}>
        {t('ui.about.repo')}
      </a>
    </div>
  );
}
