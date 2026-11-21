// web/src/ui/screens/Welcome.tsx: SCR-01 Welcome and 18+ (first run; not a route, ARCH §3.4). It sets expectations,
// meets the Gemini API terms (18+) and gets the "own photos only" commitment (SR-09):
//   the tagline · three bullets (copy.welcome.b1–b3) · one checkbox (copy.welcome.age) · Continue, disabled until
//   the box is ticked (AC-070).
// App stores the acknowledgement (core/localPrefs, inside try/catch) and never shows this screen again on this device;
// when storage is unavailable it still continues, for this session only. No network, so it works offline (state d).
import { useEffect, useState, type FormEvent } from 'react';
import { t, type StringId } from '../../core/strings';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';

const BULLETS: readonly StringId[] = ['copy.welcome.b1', 'copy.welcome.b2', 'copy.welcome.b3'];

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
    <main id="main" className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <div className="flex w-full max-w-lg flex-col gap-6">
        <p className="inline-flex items-center gap-2 font-semibold tracking-tight">
          <Icon name="eye" className="size-6" />
          {t('ui.app.name')}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{t('copy.app.tagline')}</h1>
        <ul className="flex flex-col gap-3">
          {BULLETS.map((id) => (
            <li key={id} className="flex gap-3">
              <Icon name="check" className="mt-0.5 size-5 text-verdict-teal" />
              <span>{t(id)}</span>
            </li>
          ))}
        </ul>
        <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="age"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 cursor-pointer accent-verdict-teal"
            />
            <span>{t('copy.welcome.age')}</span>
          </label>
          <Button type="submit" variant="primary" disabled={!agreed} className="self-start">
            {t('ui.welcome.continue')}
          </Button>
        </form>
      </div>
    </main>
  );
}
