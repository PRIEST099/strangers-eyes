// web/src/ui/screens/About.tsx: #/about (SCR-20). Placeholder with two of the P0 About lines.
import { t } from '../../core/strings';
import { PlaceholderScreen } from './Placeholder';

export function About() {
  return (
    <PlaceholderScreen titleId="ui.screen.about">
      <p>{t('copy.about.notGuarantee')}</p>
      <p className="text-muted">{t('copy.about.support')}</p>
    </PlaceholderScreen>
  );
}
