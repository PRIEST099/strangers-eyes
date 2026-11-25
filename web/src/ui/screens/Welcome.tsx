// web/src/ui/screens/Welcome.tsx: SCR-01 Welcome and 18+ (first run; not a route, ARCH §3.4). It sets expectations,
// meets the Gemini API terms (18+) and gets the "own photos only" commitment (SR-09):
//   the tagline · three bullets (copy.welcome.b1–b3) · one checkbox (copy.welcome.age) · Continue, disabled until
//   the box is ticked (AC-070).
// App stores the acknowledgement (core/localPrefs, inside try/catch) and never shows this screen again on this device;
// when storage is unavailable it still continues, for this session only. No network, so it works offline (state d).
// Layout (docs/DESIGN.md §5.1, D-162): two columns at lg (the pitch on the left, the StoryReel on the right; the reel
// draws both lanes and the Wall, so it also does the explainer's job), stacked below with the reel AFTER the form, so
// the checkbox and Continue stay near the top on a phone and the eyebrow carries the hook there.
// Test hooks: the checkbox is its label's first child, and Continue holds text only.
import { useEffect, useState, type FormEvent } from 'react';
import { t, type StringId } from '../../core/strings';
import { Art } from '../components/Art';
import { Button } from '../components/Button';
import { BrandMark, Icon, type IconName } from '../components/Icon';
import { StoryReel } from '../components/StoryReel';
import { CARD, EYEBROW, LEAD } from '../components/surface';

/** Each bullet with its icon: b1 is context (info), b2 is the cloud attack (blue), b3 is what stays here (teal lock). */
const BULLETS: readonly { id: StringId; icon: IconName; tone: string }[] = [
  { id: 'copy.welcome.b1', icon: 'info', tone: 'text-muted' },
  { id: 'copy.welcome.b2', icon: 'cloud', tone: 'text-route-cloud' },
  { id: 'copy.welcome.b3', icon: 'lock', tone: 'text-verdict-teal' },
];

export interface WelcomeProps {
  /** Called once the box is ticked and Continue is pressed. */
  onContinue: () => void;
}

export function Welcome({ onContinue }: WelcomeProps) {
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (typeof document !== 'undefined') document.title = t('ui.app.name');
  }, []);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (agreed) onContinue(); // Enter in the form must not get round the disabled button
  };

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid w-full max-w-6xl items-center gap-10 lg:min-h-[80dvh] lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-6">
          <p className="inline-flex items-center gap-3">
            <BrandMark className="size-16" />
            <span className="text-[17px] font-bold tracking-[-0.02em]">{t('ui.app.name')}</span>
          </p>
          <div className="flex flex-col gap-3">
            <p className={EYEBROW}>{t('ui.welcome.eyebrow')}</p>
            <h1 className="text-display-sm font-extrabold tracking-[-0.035em] text-balance sm:text-display">
              {t('copy.app.tagline')}
            </h1>
            <p className={LEAD}>{t('ui.welcome.sub')}</p>
          </div>
          <ul className="flex max-w-[68ch] flex-col gap-4">
            {BULLETS.map(({ id, icon, tone }) => (
              <li key={id} className="flex items-start gap-3 text-body">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2">
                  <Icon name={icon} className={`size-5 ${tone}`} />
                </span>
                <span className="min-w-0 pt-1.5">{t(id)}</span>
              </li>
            ))}
          </ul>
          <form onSubmit={submit} className={`${CARD} flex flex-col gap-4`}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-body">
              <input
                type="checkbox"
                name="age"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 cursor-pointer accent-fg"
              />
              <span>{t('copy.welcome.age')}</span>
            </label>
            <Button type="submit" variant="primary" size="lg" disabled={!agreed} className="w-full sm:w-auto sm:self-start">
              {t('ui.welcome.continue')}
            </Button>
          </form>
        </div>
        {/* D-170: the hero illustration above the reel (decorative; the reel and the copy carry the meaning). */}
        <div className="flex w-full min-w-0 flex-col gap-4 lg:max-w-[560px] lg:justify-self-end">
          <Art name="hero" eager sizes="(min-width: 1024px) 560px, 100vw" className="aspect-[16/9] w-full" />
          <StoryReel variant="hero" className="w-full min-w-0" />
        </div>
      </div>
    </main>
  );
}
