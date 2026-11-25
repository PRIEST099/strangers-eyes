// web/src/ui/screens/Home.tsx: SCR-03 Home (shell). Real content only, no fake data:
// - the check card stands where the drop zone goes (SCR-05 ImportDropzone replaces it);
// - the Try Judge Mode card, with the three shipped sample thumbnails (same-origin, openly licensed, masked);
// - the vault chip, without a count until the Vault screen reads the vault ("Vault: 4 items" needs real data).
// The Waiting-for-connection list (SCR-18) appears only when non-empty, and Recent checks and the Leak Atlas
// card are P1, so none of them render yet.
// Layout (docs/DESIGN.md §5.1, D-171): the eyebrow hook and the tagline hero (the <h1> holds text only), then the
// HeroLoop beside the two cards at xl (the device, the Wall and the cloud, animated, with its three captions).
// Below xl the order is Check card, loop, Judge card, so the Check CTA stays high on a phone.
import { t } from '../../core/strings';
import { ButtonLink } from '../components/Button';
import { Icon } from '../components/Icon';
import { HeroLoop } from '../components/HeroLoop';
import { CARD, EYEBROW, LEAD } from '../components/surface';

/** The Judge Mode samples shown as a strip (the same files the picker shows). */
const SAMPLE_THUMBS = ['judge-01', 'judge-02', 'judge-03'] as const;

export function Home() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="home-title" className="flex flex-col gap-3">
        <p className={EYEBROW}>{t('ui.welcome.eyebrow')}</p>
        <h1 id="home-title" className="text-display-sm font-extrabold tracking-[-0.035em] text-balance sm:text-display">
          {t('copy.app.tagline')}
        </h1>
        <p className={LEAD}>{t('copy.app.oneLiner')}</p>
      </section>

      {/* At xl the loop (left, spanning both rows) and the two cards (right) share a row, so the tagline, the loop and
          both CTAs fit above a 900 px fold (DESIGN §5.1 acceptance); below xl: Check card, loop, Judge card. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr] xl:items-start xl:gap-x-6 xl:gap-y-4">
        <section aria-labelledby="home-check" className={`${CARD} flex min-w-0 flex-col gap-3 border-l-4 border-l-route-device-fill xl:col-start-2 xl:row-start-1`}>
          <h2 id="home-check" className="text-title font-semibold">
            {t('ui.home.check.title')}
          </h2>
          <p className="text-lead font-semibold">{t('ui.story.ask')}</p>
          <p className="text-body text-muted">{t('copy.welcome.b3')}</p>
          <ButtonLink href="#/check" variant="primary" size="lg" className="mt-auto w-full sm:w-auto sm:self-start">
            {t('ui.home.check.cta')}
          </ButtonLink>
        </section>

        <HeroLoop className="w-full xl:col-start-1 xl:row-span-2 xl:row-start-1" />

        <section aria-labelledby="home-judge" className={`${CARD} flex min-w-0 flex-col gap-3 xl:col-start-2 xl:row-start-2`}>
          <h2 id="home-judge" className="text-title font-semibold">
            {t('ui.home.judge.title')}
          </h2>
          <div className="flex gap-2" aria-hidden="true">
            {SAMPLE_THUMBS.map((id) => (
              <img
                key={id}
                src={`/samples/${id}.nano768.jpg`}
                alt=""
                loading="lazy"
                decoding="async"
                className="aspect-[16/10] w-1/3 min-w-0 rounded-chip bg-surface-2 object-cover"
              />
            ))}
          </div>
          <p className="text-body text-muted">{t('ui.home.judge.body')}</p>
          <ButtonLink href="#/judge" size="lg" className="mt-auto w-full sm:w-auto sm:self-start">
            {t('ui.home.judge.cta')}
          </ButtonLink>
        </section>
      </div>

      <a
        href="#/vault"
        className="flex min-h-12 items-center gap-3 rounded-card border border-verdict-teal px-4 text-body font-medium text-fg transition-colors duration-150 hover:bg-verdict-teal-bg sm:self-start"
      >
        <Icon name="lock" className="size-5 text-verdict-teal" />
        <span className="min-w-0 flex-1">{t('ui.home.vaultChip')}</span>
        <Icon name="arrowRight" className="size-4 text-muted" />
      </a>

      {/* DEV builds only (stripped from production, so not product copy and not in en.json). */}
      {import.meta.env.DEV && (
        <a href="#/dev/selftest" className="inline-flex min-h-11 items-center self-start text-sm underline underline-offset-4">
          Run the Tier-0 selftest (DEV)
        </a>
      )}
    </div>
  );
}
