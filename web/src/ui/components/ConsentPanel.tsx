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
import { EYEBROW } from './surface';

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
    <figure className="flex flex-col gap-2">
      {/* The exact outgoing bytes, as wide as the panel allows (up to 60vh tall), framed in the cloud's blue: this is
          what crosses the Wall. The ring hugs the image (w-fit) with no letterbox, so nothing inside the frame is a
          pixel that is not sent (a solid-black bar would read as an extra mask). */}
      {url && (
        <div className="mx-auto w-fit max-w-full overflow-hidden rounded-card ring-2 ring-route-cloud-fill">
          <img src={url} alt={t('ui.consent.imageAlt')} width={width} height={height} className="block h-auto max-h-[60vh] w-auto max-w-full" />
        </div>
      )}
      <figcaption className="font-mono text-small break-all text-muted tabular-nums" data-testid="consent-meta">
        {t('ui.consent.meta', { w: width, h: height, kb: kilobytes(dry.bytes), sha: dry.image.sha256.slice(0, 8) })}
      </figcaption>
    </figure>
  );
}

/** A tick row: teal check (these bytes carry nothing private: "never sent", the one tick allowed to be teal) or a red alert. */
function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden="true" className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-verdict-teal-bg text-verdict-teal' : 'bg-verdict-red-bg text-verdict-red'}`}>
        <Icon name={ok ? 'check' : 'alert'} className="size-3.5" />
      </span>
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
        <p role="status" className="flex items-start gap-2 rounded-card border border-line bg-surface-2 p-4 text-body"><Icon name="info" className="mt-0.5 size-5 text-muted" />{t(blocked)}</p>
        <Button onClick={onCancel}>{t('copy.consent.cancel')}</Button>
      </div>
    );
  }
  if (send.kind !== 'ready' || !candidate) {
    return <p role="status" className="mt-3 text-body text-muted">{t('ui.consent.checking')}</p>;
  }
  const dry = send.dry;
  const counts = consentCounts(candidate, dry);
  const unmasked = Math.max(dry.userHits, candidate.unmaskedPrivate.vault + candidate.unmaskedPrivate.faces);
  const canSend = dry.failed.length === 0 && candidate.blockedBy.length === 0;
  return (
    <div className="mt-3 flex flex-col gap-4" data-testid="consent-sheet">
      <p className="text-title font-semibold">{t('copy.consent.title')}</p>
      {sent && <p className="text-small text-muted">{t('ui.consent.sent')}</p>}
      <OutgoingImage dry={dry} />
      <div className="rounded-card border border-line bg-surface-2 p-4">
        <p className={EYEBROW}>{t('ui.consent.checklist')}</p>
        <ul className="mt-3 flex flex-col gap-2 text-body">
          <Check ok={!dry.failed.includes('metadata')} text={t('ui.consent.checkMetadata')} />
          <Check ok={dry.facesVisible === 0} text={t('ui.consent.checkFaces', { n: dry.facesVisible })} />
          <Check ok={dry.vaultVisible === 0} text={t('ui.consent.checkVault', { n: dry.vaultVisible })} />
          <Check ok text={t('ui.consent.checkMasked', counts)} />
        </ul>
      </div>
      {dry.autoMasked > 0 && <p className="text-body">{t('copy.consent.autoMasked', { n: dry.autoMasked })}</p>}
      {unmasked > 0 && (
        <p role="alert" className="flex items-start gap-2 rounded-card border border-verdict-red bg-verdict-red-bg p-4 text-body"><Icon name="alert" className="mt-0.5 size-5 text-verdict-red" />{t('copy.consent.unmasked', { n: unmasked })}</p>
      )}
      {dry.failed.length > 0 && (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-card border border-verdict-red bg-verdict-red-bg p-4 text-body">
          {dry.failed.map((f) => <p key={f}>{t(FAILURE_COPY[f])}</p>)}
          {!sent && <Button onClick={onCancel}>{t('ui.consent.fixInEditor')}</Button>}
        </div>
      )}
      <div className="flex max-w-[68ch] flex-col gap-2 text-small">
        <p className="flex items-start gap-2 break-words"><Icon name="cloud" className="mt-0.5 size-4 text-route-cloud" /><span className="min-w-0">{t('ui.consent.whatsSent', { prompt: 'advB.v1', model })}</span></p>
        <p data-testid="consent-tier" className="pl-6 text-muted">{t(tierCopy)}</p>
        <p className="flex items-start gap-2"><Icon name="lock" className="mt-0.5 size-4 text-verdict-teal" /><span>{t('copy.consent.never')}</span></p>
      </div>
      {!sent && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button variant="primary" size="lg" disabled={!canSend} onClick={onSend} data-action="send">{t('copy.consent.send')}</Button>
          <Button onClick={onCancel} data-action="cancel">{t('copy.consent.cancel')}</Button>
        </div>
      )}
    </div>
  );
}
