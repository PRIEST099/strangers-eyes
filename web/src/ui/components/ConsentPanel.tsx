// web/src/ui/components/ConsentPanel.tsx: the Send step, SPEC SCR-07's consent sheet (T-069; D-139). It shows the
// EXACT outgoing JPEG (an object URL of the very Blob that will be sent, ≤ cloud_image_max_px) with its size and the
// first 8 characters of its sha256, the dry-run checklist, what is sent and to whom, the tier line (`data_tier`, AC-131)
// and what is never sent. Send is disabled while the dry run names a failure (AC-133); a user-unmasked private item
// shows copy.consent.unmasked and Send stays enabled, so the gate's own block is what stops it (AC-135). "Keep it on
// this device" sends nothing and returns to the editor (AC-132). Shown inline as the step's panel (not a modal) so the
// stepper stays usable; pass A's grounding checkbox is not shown (pass A is not built, and live RC is the free tier).
// When the cloud is off (offline, kill switch, cap, App Check/Auth, a BREACH) the sheet does not open: only the reason.
import { useEffect, useState } from 'react';
import { t, type StringId } from '../../core/strings';
import type { DryRun } from '../../ai/preflight';
import type { MaskedFrameCandidate } from '../check/editor';
import { consentCounts, FAILURE_COPY, sendBlockedCopy } from '../check/sendFlow';
import { caps, prefs } from '../../core/localPrefs';
import { useOnline } from '../hooks/useOnline';
import { useSystemStatus } from '../hooks/useSystemStatus';
import type { SendState } from '../checkState';
import { kilobytes } from '../layout';
import { Button } from './Button';
import { Icon } from './Icon';

export interface ConsentPanelProps {
  send: SendState;
  candidate: MaskedFrameCandidate | null;
  tierCopy: StringId;
  model: string;
  /** The image has been sent (the attack started): the sheet is a record, its buttons are gone. */
  sent: boolean;
  onSend: () => void;
  onCancel: () => void;
}

function OutgoingImage({ dry }: { dry: DryRun }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(dry.image.jpeg);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [dry.image.jpeg]);
  const { width, height } = dry.image.frame;
  return (
    <figure className="flex flex-col gap-1">
      {url && <img src={url} alt={t('ui.consent.imageAlt')} width={width} height={height} className="h-auto max-h-[60vh] w-auto max-w-full rounded-lg border border-line" />}
      <figcaption className="font-mono text-xs text-muted" data-testid="consent-meta">
        {t('ui.consent.meta', { w: width, h: height, kb: kilobytes(dry.bytes), sha: dry.image.sha256.slice(0, 8) })}
      </figcaption>
    </figure>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-center gap-2">
      <Icon name={ok ? 'check' : 'close'} className={`size-4 ${ok ? 'text-muted' : 'text-verdict-red'}`} />
      <span>{text}</span>
    </li>
  );
}

export function ConsentPanel({ send, candidate, tierCopy, model, sent, onSend, onCancel }: ConsentPanelProps) {
  const online = useOnline();
  const status = useSystemStatus();
  const blocked = sendBlockedCopy({ online: online && !prefs.simulateOffline(), status, capUsed: caps.usedToday() });
  if (blocked && !sent) {
    return (
      <div className="mt-3 flex flex-col items-start gap-3">
        <p role="status" className="rounded-lg border border-line bg-surface-2 p-3 text-sm">{t(blocked)}</p>
        <Button onClick={onCancel}>{t('copy.consent.cancel')}</Button>
      </div>
    );
  }
  if (send.kind !== 'ready' || !candidate) {
    return <p role="status" className="mt-3 text-sm text-muted">{t('ui.consent.checking')}</p>;
  }
  const dry = send.dry;
  const counts = consentCounts(candidate, dry);
  const unmasked = Math.max(dry.userHits, candidate.unmaskedPrivate.vault + candidate.unmaskedPrivate.faces);
  const canSend = dry.failed.length === 0 && candidate.blockedBy.length === 0;
  return (
    <div className="mt-3 flex flex-col gap-4" data-testid="consent-sheet">
      <p className="text-base font-semibold">{t('copy.consent.title')}</p>
      {sent && <p className="text-sm text-muted">{t('ui.consent.sent')}</p>}
      <OutgoingImage dry={dry} />
      <div>
        <p className="text-sm font-medium">{t('ui.consent.checklist')}</p>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          <Check ok={!dry.failed.includes('metadata')} text={t('ui.consent.checkMetadata')} />
          <Check ok={dry.facesVisible === 0} text={t('ui.consent.checkFaces', { n: dry.facesVisible })} />
          <Check ok={dry.vaultVisible === 0} text={t('ui.consent.checkVault', { n: dry.vaultVisible })} />
          <Check ok text={t('ui.consent.checkMasked', counts)} />
        </ul>
      </div>
      {dry.autoMasked > 0 && <p className="text-sm">{t('copy.consent.autoMasked', { n: dry.autoMasked })}</p>}
      {unmasked > 0 && (
        <p role="alert" className="rounded-lg border border-verdict-red bg-verdict-red-bg p-3 text-sm">{t('copy.consent.unmasked', { n: unmasked })}</p>
      )}
      {dry.failed.length > 0 && (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-verdict-red bg-verdict-red-bg p-3 text-sm">
          {dry.failed.map((f) => <p key={f}>{t(FAILURE_COPY[f])}</p>)}
          {!sent && <Button onClick={onCancel}>{t('ui.consent.fixInEditor')}</Button>}
        </div>
      )}
      <div className="flex flex-col gap-1 text-sm">
        <p>{t('ui.consent.whatsSent', { prompt: 'advB.v1', model })}</p>
        <p data-testid="consent-tier">{t(tierCopy)}</p>
        <p className="text-muted">{t('copy.consent.never')}</p>
      </div>
      {!sent && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <Button variant="primary" disabled={!canSend} onClick={onSend} data-action="send">{t('copy.consent.send')}</Button>
          <Button onClick={onCancel} data-action="cancel">{t('copy.consent.cancel')}</Button>
        </div>
      )}
    </div>
  );
}
