// web/src/ui/screens/About.tsx: #/about (SPEC SCR-20 About, P0; AC-276). Every listed item, in SPEC order:
//   the version and commit · copy.about.notGuarantee · copy.about.howItWorks · a "What leaves this device" table (S0–S4
//   in plain words, plus the other network traffic) · the re-attack disclosure (D-24, SR-19) · third parties (Gemini via
//   Firebase AI Logic, App Check's reCAPTCHA Enterprise, the libraries and licences of THIRD_PARTY_NOTICES) · prior art
//   (E11, E12) · the 18+ notice · copy.about.support · the repo link.
// Honest limits: it says "reduces risk", never "safe" (CLAUDE.md invariant 6). Static: no AI call, works offline.
import pkg from '../../../package.json';
import { PAYLOAD_CLASSES } from '../../ai/capabilities';
import { t, type StringId } from '../../core/strings';
import type { ReactNode } from 'react';

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

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;
const LINK = 'inline-flex min-h-11 items-center underline underline-offset-4';

function Section({ id, titleId, children }: { id: string; titleId: StringId; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-lg font-semibold">
        {t(titleId)}
      </h2>
      {children}
    </section>
  );
}

export function About() {
  const commit = commitOf(import.meta.env.VITE_GIT_SHA);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('ui.screen.about')}</h1>
        <p data-about="version" className="font-mono text-sm text-muted">
          {commit
            ? t('ui.about.version', { version: pkg.version, commit })
            : t('ui.about.versionNoCommit', { version: pkg.version })}
        </p>
      </div>

      <p data-about="notGuarantee" className="rounded-xl border border-line bg-surface p-4 font-medium">
        {t('copy.about.notGuarantee')}
      </p>

      <Section id="about-how" titleId="ui.about.how">
        <ul data-about="howItWorks" className="list-disc space-y-1 pl-5">
          {howItWorksPoints(t('copy.about.howItWorks')).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Section>

      <Section id="about-leaves" titleId="ui.about.leaves">
        <table data-about="leaves" className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">{t('ui.about.leaves.colData')}</th>
              <th scope="col" className="py-2 font-medium">{t('ui.about.leaves.colLeaves')}</th>
            </tr>
          </thead>
          <tbody>
            {PAYLOAD_CLASSES.map((k) => (
              <tr key={k} className="border-t border-line align-top">
                <th scope="row" className="py-2 pr-3 font-normal">
                  <span className="mr-1.5 font-mono text-xs text-muted">{k}</span>
                  {t(`ui.cap.policy.${k}`)}
                </th>
                <td className="py-2">{t(`ui.about.leaves.${k}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm text-muted">{t('copy.ledger.otherTraffic')}</p>
        <p data-about="reattack">{t('copy.about.reattackDisclosure')}</p>
      </Section>

      <Section id="about-third" titleId="ui.about.third">
        <p>{t('ui.about.gemini')}</p>
        <p data-about="recaptcha">{t('ui.about.recaptcha')}</p>
        <ul data-about="libraries" className="list-disc space-y-1 pl-5">
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
        <ul data-about="priorArt" className="list-disc space-y-1 pl-5">
          <li>
            <a href={E11_URL} className="underline underline-offset-4" {...EXTERNAL}>{t('ui.about.prior.e11')}</a>
          </li>
          <li>{t('ui.about.prior.e12')}</li>
        </ul>
        <p className="text-sm text-muted">{t('ui.about.prior.diff')}</p>
      </Section>

      <Section id="about-use" titleId="ui.about.use">
        <p data-about="adults">{t('ui.about.adults')}</p>
        <p data-about="support">{t('copy.about.support')}</p>
      </Section>

      <a data-about="repo" href={REPO_URL} className={`${LINK} self-start font-medium`} {...EXTERNAL}>
        {t('ui.about.repo')}
      </a>
    </div>
  );
}
