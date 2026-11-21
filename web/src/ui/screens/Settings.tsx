// web/src/ui/screens/Settings.tsx: #/settings (SPEC SCR-20). P0 only, per D-33:
//   - On-device AI: the capability state (the same view as the header chip and SCR-02), the Download button when Chrome
//     offers the model, a button that opens SCR-02, and "Use Gemini Nano when available" (on; AC-277). Off: S0/S1 run
//     RULES-ONLY and S2/S4 run in the cloud (AD-33); the capability view shows (c) at once.
//   - Usage: "Cloud checks today: {used}/{cap}" (local counter, RC cap) with copy.settings.capNote, then this page's
//     Ledger counters (requests, on-device calls, rule checks, blocked; T-063, live from the in-memory Ledger).
//   - Data: Burn vault (the shared BurnVaultDialog), Clear history and Copy ledger receipt (T-063: copy.receipt.line from
//     the counters only, AC-212). Clear history appears once the sessions store exists (T-096): until then it is null.
//   - Developer (P1, AC-006): with `?debug=1`, or while a simulation is on (so it can always be turned off), "Simulate:
//     no Nano" and "Simulate: offline". Both only remove capability. RC values and a forced fetch join with T-102.
// Every setting is stored by core/localPrefs inside try/catch: when storage throws, the change still applies for this
// visit and a status line says it is not kept (AC-275). P1 toggles (privacy, display, Atlas) are not shown yet.
import { useState, type ReactNode } from 'react';
import { ledger } from '../../core/ledger';
import { ledgerCounters, receiptText } from '../../core/ledgerView';
import { localPrefs } from '../../core/localPrefs';
import { t, type StringId } from '../../core/strings';
import { BurnVaultDialog } from '../components/BurnVaultDialog';
import { Button, ButtonLink } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { Toggle } from '../components/Toggle';
import { debugFlag } from '../gate';
import { useCapUsed, useSettings, useSimulations } from '../hooks/usePrefs';
import { useSystemStatus } from '../hooks/useSystemStatus';
import { useLedgerCounters } from '../hud/useLedger';
import { capabilityChipCopy, kilobytes } from '../layout';
import { useShell } from '../shellContext';
import { burnNotice } from './Vault';

export interface SettingsDeps {
  /** Deletes recent checks, queued checks and the ledger, and keeps the vault (SPEC D-31, SCR-19). Null until it exists. */
  clearHistory: (() => Promise<void>) | null;
  /** The ledger receipt text (hashes and counts only; T-063). Null until the ledger exists. */
  receipt: (() => string) | null;
  /** Clipboard write. */
  copyText: (text: string) => Promise<void>;
}

const APP_DEPS: SettingsDeps = {
  clearHistory: null, // TODO(T-063/T-096): the ledger and sessions stores' clear (no vault lock needed for the ledger)
  receipt: () => receiptText(ledgerCounters(ledger.entries())),
  copyText: (text) => navigator.clipboard.writeText(text),
};

/** The status line after a settings write: nothing when it was stored, a "this visit only" note when it was not. */
export const writeNotice = (stored: boolean): StringId | null => (stored ? null : 'ui.settings.notSaved');

/** Settings › Developer shows with `?debug=1`, and whenever a simulation is on, so it can be turned off again. */
export const showDeveloper = (debug: boolean, sims: { noNano: boolean; offline: boolean }): boolean =>
  debug || sims.noNano || sims.offline;

function Section({ id, titleId, children }: { id: string; titleId: StringId; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <h2 id={id} className="text-lg font-semibold">
        {t(titleId)}
      </h2>
      {children}
    </section>
  );
}

export interface SettingsProps {
  deps?: SettingsDeps;
  /** `?debug=1` (read once at boot). */
  debug?: boolean;
}

export function Settings({ deps = APP_DEPS, debug = debugFlag() }: SettingsProps) {
  const settings = useSettings();
  const sims = useSimulations();
  const capUsed = useCapUsed();
  const lc = useLedgerCounters();
  const { dailyCap } = useSystemStatus();
  const shell = useShell();
  const [notice, setNotice] = useState<StringId | null>(null);
  const [burnOpen, setBurnOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const save = (stored: boolean) => setNotice(writeNotice(stored));

  const caps = shell?.caps;
  const chip = caps ? capabilityChipCopy(caps.chip) : null;
  const download = caps?.download;
  const showDownload = !!caps && caps.checked && (caps.capability.downloadIo !== null || download?.kind === 'running');

  const clearHistory = deps.clearHistory;
  const confirmClear = async () => {
    if (!clearHistory || clearing) return;
    setClearing(true);
    try {
      await clearHistory();
      setNotice('ui.settings.clearHistory.done');
    } catch {
      setNotice('ui.settings.clearHistory.failed');
    } finally {
      setClearing(false);
      setClearOpen(false);
    }
  };

  const receipt = deps.receipt;
  const copyReceipt = async () => {
    if (!receipt) return;
    try {
      await deps.copyText(receipt());
      setNotice('ui.settings.receipt.copied');
    } catch {
      setNotice('ui.settings.receipt.failed');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('ui.screen.settings')}</h1>

      <p role="status" aria-live="polite" className={notice ? 'text-sm font-medium' : 'sr-only'}>
        {notice ? t(notice) : ''}
      </p>

      <Section id="settings-device" titleId="ui.settings.device">
        {chip && <p className="text-sm text-muted">{t('ui.settings.device.now', { state: t(chip.id, chip.params) })}</p>}
        {showDownload && caps && (
          <Button
            variant="primary"
            className="self-start"
            aria-disabled={download?.kind === 'running' ? true : undefined}
            onClick={download?.kind === 'running' ? undefined : caps.startDownload}
          >
            {t('ui.cap.download')}
          </Button>
        )}
        {shell && (
          <Button className="self-start" aria-haspopup="dialog" onClick={shell.openCapability}>
            {t('ui.settings.device.details')}
          </Button>
        )}
        <Toggle
          label={t('ui.settings.useNano')}
          hint={t('ui.settings.useNanoHint')}
          checked={settings.useNano}
          onChange={(on) => save(localPrefs.updateSettings({ useNano: on }))}
        />
      </Section>

      <Section id="settings-usage" titleId="ui.settings.usage">
        <p className="tabular-nums">{t('ui.settings.usage.today', { used: capUsed, cap: dailyCap })}</p>
        <p className="text-sm text-muted">{t('copy.settings.capNote')}</p>
        <p className="text-sm tabular-nums">
          {t('ui.ledger.traffic', { unique: lc.uniqueImages, n: lc.cloudRequests, kb: t('ui.unit.kb', { n: kilobytes(lc.bytesSent) }) })}
        </p>
        <p className="text-sm tabular-nums">{t('ui.ledger.local', { k: lc.onDeviceCalls, r: lc.rulesChecks, b: lc.blocked })}</p>
      </Section>

      <Section id="settings-data" titleId="ui.settings.data">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { setNotice(null); setBurnOpen(true); }}>{t('ui.burn.action')}</Button>
          {clearHistory && (
            <Button onClick={() => { setNotice(null); setClearOpen(true); }}>{t('ui.settings.clearHistory')}</Button>
          )}
          {receipt && <Button onClick={() => { void copyReceipt(); }}>{t('ui.settings.receipt')}</Button>}
        </div>
      </Section>

      {showDeveloper(debug, sims) && (
        <Section id="settings-dev" titleId="ui.settings.dev">
          <p className="text-sm text-muted">{t('ui.settings.dev.note')}</p>
          <Toggle
            label={t('ui.settings.dev.noNano')}
            checked={sims.noNano}
            onChange={(on) => save(localPrefs.setSimulation('noNano', on))}
          />
          <Toggle
            label={t('ui.settings.dev.offline')}
            checked={sims.offline}
            onChange={(on) => save(localPrefs.setSimulation('offline', on))}
          />
        </Section>
      )}

      <ButtonLink href="#/about" className="self-start">
        {t('ui.settings.aboutLink')}
      </ButtonLink>

      <BurnVaultDialog
        open={burnOpen}
        onClose={() => setBurnOpen(false)}
        onOutcome={(outcome, shown) => {
          const n = burnNotice(outcome, shown);
          if (n) setNotice(n);
        }}
      />

      {clearHistory && (
        <Sheet open={clearOpen} onClose={() => setClearOpen(false)} title={t('ui.settings.clearHistory')}>
          <div className="flex flex-col gap-4">
            <p>{t('ui.settings.clearHistory.confirm')}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setClearOpen(false)}>
                {t('ui.vault.cancel')}
              </Button>
              <Button variant="danger" aria-disabled={clearing || undefined} onClick={() => { void confirmClear(); }}>
                {t('ui.settings.clearHistory')}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
