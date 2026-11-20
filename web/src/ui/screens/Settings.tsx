// web/src/ui/screens/Settings.tsx: #/settings (SCR-20). Placeholder; About is reached from here.
import { t } from '../../core/strings';
import { ButtonLink } from '../components/Button';
import { PlaceholderScreen } from './Placeholder';

export function Settings() {
  return (
    <PlaceholderScreen titleId="ui.screen.settings">
      <ButtonLink href="#/about" className="self-start">
        {t('ui.settings.aboutLink')}
      </ButtonLink>
    </PlaceholderScreen>
  );
}
