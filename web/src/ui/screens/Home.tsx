// web/src/ui/screens/Home.tsx: SCR-03 Home (shell). Real content only, no fake data:
// - the check card stands where the drop zone goes (SCR-05 ImportDropzone replaces it);
// - the Try Judge Mode card;
// - the vault chip, without a count until the Vault screen reads the vault ("Vault: 4 items" needs real data).
// The Waiting-for-connection list (SCR-18) appears only when non-empty, and Recent checks and the Leak Atlas
// card are P1, so none of them render yet.
import { t } from '../../core/strings';
import { ButtonLink } from '../components/Button';
import { Icon } from '../components/Icon';

export function Home() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="home-title">
        <h1 id="home-title" className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {t('copy.app.tagline')}
        </h1>
        <p className="mt-2 text-muted">{t('copy.app.oneLiner')}</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section aria-labelledby="home-check" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <h2 id="home-check" className="text-lg font-semibold">
            {t('ui.home.check.title')}
          </h2>
          <p className="text-sm text-muted">{t('copy.welcome.b3')}</p>
          <ButtonLink href="#/check" variant="primary" className="mt-auto self-start">
            {t('ui.home.check.cta')}
          </ButtonLink>
        </section>

        <section aria-labelledby="home-judge" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <h2 id="home-judge" className="text-lg font-semibold">
            {t('ui.home.judge.title')}
          </h2>
          <p className="text-sm text-muted">{t('ui.home.judge.body')}</p>
          <ButtonLink href="#/judge" className="mt-auto self-start">
            {t('ui.home.judge.cta')}
          </ButtonLink>
        </section>
      </div>

      <a
        href="#/vault"
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-full border border-line-strong px-4 text-sm font-medium hover:bg-surface-2"
      >
        <Icon name="lock" className="size-4 text-verdict-teal" />
        {t('ui.home.vaultChip')}
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
