// web/src/ui/screens/Vault.tsx: #/vault (SCR-04). Placeholder until the Vault task; the two lines below are SPEC
// statements about how the vault is handled, true whatever the build state.
import { t } from '../../core/strings';
import { Icon } from '../components/Icon';
import { PlaceholderScreen } from './Placeholder';

export function Vault() {
  return (
    <PlaceholderScreen titleId="ui.screen.vault">
      <p className="flex items-start gap-2 font-medium">
        <Icon name="lock" className="mt-0.5 size-5 text-verdict-teal" />
        {t('copy.vault.lock')}
      </p>
      <p className="text-muted">{t('copy.vault.howUsed')}</p>
    </PlaceholderScreen>
  );
}
