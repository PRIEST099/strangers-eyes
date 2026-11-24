// web/src/ui/components/CapabilityPanel.tsx: SCR-02 "What runs where on this browser" (SPEC SCR-02, §5.2–5.3).
// The body of the capability sheet (its title, copy.cap.title, is the sheet's heading). Shows honestly what runs on
// the device, in the cloud or as rules on THIS browser:
//   the invariant line (always) · four rows (on-device AI, Tier-0 guard, cloud attacker, works offline), each with a
//   status icon, a one-line status and a "What this means" disclosure · the S0–S4 policy mini-table · three links.
// State (b) shows "Download Gemini Nano"; its click handler starts the download synchronously (user activation,
// AC-073). State (c) is presented as fully supported, never as an error (AC-074), with the Chrome how-to on Chrome.
// When the panel becomes visible (the sheet opens), it asks for a re-check of a snapshot older than 30 s (D-100).
// Accessibility: native <details> disclosures, a labelled progressbar, a polite live region that announces the
// download in 10 % steps and its end (once), and focus kept on the Download button (aria-disabled while running), then
// moved to the row's heading when the button goes away (the heading, not the status, so the end is not read twice).
import { useEffect, useRef, type ReactNode, type Ref } from 'react';
import { PAYLOAD_CLASSES, expectedRoutes } from '../../ai/capabilities';
import { t, type StringId } from '../../core/strings';
import type { Route } from '../../core/types';
import type { CapabilitiesView } from '../hooks/useCapabilities';
import { useTechDetails } from '../hooks/usePrefs';
import { Badge } from './Badge';
import { Button, ButtonLink } from './Button';
import { Icon, type IconName } from './Icon';
import { CARD } from './surface';

/** Row 3 when online (offline, the (d) flag, always wins). */
export type CloudRowState = 'ready' | 'paused' | 'cap' | 'appCheckFail';
/** Row 2: the face and text readers' assets. */
export type Tier0RowState = { kind: 'ready' } | { kind: 'loading'; pct: number };

export interface CapabilityPanelProps {
  caps: CapabilitiesView;
  cloud?: CloudRowState;
  tier0?: Tier0RowState;
  /** Tests only: override Settings › Technical details. */
  tech?: boolean;
}

type Tone = 'ok' | 'neutral' | 'busy';
// Ready is fg, not teal: teal means "protected / never sent" (DESIGN §6.1), and a ready row is neither.
const TONE: Record<Tone, string> = {
  ok: 'text-fg',
  neutral: 'text-muted',
  busy: 'text-route-device',
};

const CLOUD_COPY: Record<CloudRowState, StringId> = {
  ready: 'copy.cap.cloudReady',
  paused: 'copy.cap.cloudPaused',
  cap: 'copy.cap.cloudCap',
  appCheckFail: 'copy.cap.appCheckFail',
};

const clampPct = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0);

/** Row 1's status line and icon, per SPEC SCR-02 States. */
function nanoStatus(caps: CapabilitiesView): { text: string; icon: IconName; tone: Tone } {
  const { capability: c, download: d } = caps;
  if (!caps.checked) return { text: t('ui.cap.checking'), icon: 'chip', tone: 'neutral' };
  switch (c.state) {
    case 'a':
      return { text: t('copy.cap.nanoReady'), icon: 'check', tone: 'ok' };
    case 'a-prime':
      return { text: t('copy.cap.nanoTextOnly'), icon: 'check', tone: 'ok' };
    case 'b':
      if (d.kind === 'running') return { text: t('copy.cap.nanoDownloading', { pct: d.pct }), icon: 'chevronDown', tone: 'busy' };
      if (c.downloading) return { text: t('copy.cap.nanoDownloading', { pct: d.kind === 'done' ? 100 : 0 }), icon: 'chevronDown', tone: 'busy' };
      return { text: t('copy.cap.nanoDownloadable'), icon: 'chevronDown', tone: 'neutral' };
    case 'c':
      // Rules-only is a supported way to run, not a failure (AC-074): a lock (private stays here), muted, no alert.
      return { text: t(c.noNano === 'disabled' ? 'ui.cap.nanoOff' : 'copy.cap.nanoNone'), icon: 'lock', tone: 'neutral' };
  }
}

/**
 * The polite announcement: download progress in 10 % steps, then the outcome. Empty otherwise. In (a′) only image
 * support downloads, so it uses a neutral line (copy.cap.nanoDownloading says private checks wait for it, which is
 * false there). A failure that left state (c) announces the (c) status instead: (c) never reads as an error (AC-074).
 */
function downloadAnnouncement(caps: CapabilitiesView): string {
  const d = caps.download;
  const s = caps.capability.state;
  if (d.kind === 'running') {
    const pct = Math.floor(d.pct / 10) * 10;
    return s === 'a-prime' ? t('ui.cap.imageDownloading', { pct }) : t('copy.cap.nanoDownloading', { pct });
  }
  if (d.kind === 'failed') return s === 'c' ? nanoStatus(caps).text : t('ui.cap.downloadFailed');
  if (d.kind === 'done' && (s === 'a' || s === 'a-prime')) return nanoStatus(caps).text;
  return '';
}

/**
 * Focus handoff when the Download button disappears (the model is ready): if focus was lost with it (it falls back to
 * <body>), move it to `target`. Returns whether it moved. Pure apart from target.focus(), so it is unit-tested.
 */
export function handOffFocus(
  hadButton: boolean,
  hasButton: boolean,
  doc: { readonly activeElement: unknown; readonly body: unknown } | undefined,
  target: { focus(): void } | null,
): boolean {
  if (!hadButton || hasButton || !doc || !target) return false;
  if (doc.activeElement !== null && doc.activeElement !== doc.body) return false;
  target.focus();
  return true;
}

type ObserverCtor = new (cb: (entries: readonly { isIntersecting: boolean }[]) => void) => {
  observe(el: Element): void;
  disconnect(): void;
};

/**
 * Calls `onShown` each time `el` goes from hidden to visible (a closed <dialog>'s content has no box; an open one
 * intersects the viewport). Without IntersectionObserver it calls once. Returns the cleanup.
 */
export function watchShown(el: Element, onShown: () => void, Observer: ObserverCtor | undefined): () => void {
  if (!Observer) {
    onShown();
    return () => undefined;
  }
  let shown = false;
  const io = new Observer((entries) => {
    const now = entries.some((e) => e.isIntersecting);
    if (now && !shown) onShown();
    shown = now;
  });
  io.observe(el);
  return () => io.disconnect();
}

function Row({ headingRef, ...p }: {
  icon: IconName;
  tone: Tone;
  title: string;
  status: string;
  means: string;
  /** The heading takes focus when the Download button goes away. */
  headingRef?: Ref<HTMLHeadingElement>;
  focusable?: boolean;
  /** The route this row's work takes on this browser (the same expectedRoutes value as the policy table). */
  route?: Route;
  children?: ReactNode;
}) {
  return (
    <li className={`${CARD} flex gap-3`}>
      <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 ${TONE[p.tone]}`}>
        <Icon name={p.icon} className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <h3 ref={headingRef} tabIndex={p.focusable ? -1 : undefined} className="font-medium outline-offset-2">
            {p.title}
          </h3>
          {p.route && <Badge route={p.route} />}
        </div>
        <p className="mt-0.5 text-muted">{p.status}</p>
        {p.children}
        <details className="mt-1">
          <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md font-medium underline-offset-4 hover:underline">
            {t('ui.cap.means')}
            <span className="sr-only">: {p.title}</span>
          </summary>
          <p className="text-muted">{p.means}</p>
        </details>
      </div>
    </li>
  );
}

export function CapabilityPanel({ caps, cloud = 'ready', tier0 = { kind: 'ready' }, tech: givenTech }: CapabilityPanelProps) {
  const prefTech = useTechDetails();
  // Settings › Technical details: the S0–S4 codes and "Tier-0". Off, the same rows in plain words; badges always show.
  const tech = givenTech ?? prefTech;
  const c = caps.capability;
  const d = caps.download;
  const nano = nanoStatus(caps);
  const showDownload = caps.checked && (c.downloadIo !== null || d.kind === 'running');
  const showHowTo = caps.checked && c.state === 'c' && c.noNano !== 'disabled' && caps.chromeDesktop;
  const routes = expectedRoutes(c);

  // The Download button goes away when the model is ready: hand focus to the row heading instead of losing it.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hadButton = useRef(showDownload);
  useEffect(() => {
    handOffFocus(hadButton.current, showDownload, document, headingRef.current);
    hadButton.current = showDownload;
  }, [showDownload]);

  // Opening the sheet re-checks a snapshot older than 30 s (SPEC §5.1; D-100).
  const rootRef = useRef<HTMLDivElement>(null);
  const { onPanelShown } = caps;
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    return watchShown(el, onPanelShown, typeof IntersectionObserver === 'undefined' ? undefined : IntersectionObserver);
  }, [onPanelShown]);

  const pct = d.kind === 'running' ? clampPct(d.pct) : 0;

  return (
    <div ref={rootRef} className="flex flex-col gap-5 text-sm">
      <p className="font-medium text-fg">{t('copy.cap.invariant')}</p>

      <ul className="flex flex-col gap-2">
        <Row
          icon={nano.icon}
          tone={nano.tone}
          title={t('ui.cap.row.nano')}
          status={nano.text}
          headingRef={headingRef}
          focusable
          route={caps.checked ? routes.S0 : undefined}
          means={t('ui.cap.row.nano.means')}
        >
          {d.kind === 'failed' && c.state !== 'c' && <p className="mt-1 text-muted">{t('ui.cap.downloadFailed')}</p>}
          {d.kind === 'running' && (
            <div
              role="progressbar"
              aria-label={t('ui.cap.downloadProgress')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-valuetext={`${pct}%`}
              className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2"
            >
              <div className="h-full rounded-full bg-route-device motion-safe:transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          )}
          {showDownload && (
            <Button
              variant="primary"
              className="mt-2"
              aria-disabled={d.kind === 'running' ? true : undefined}
              onClick={d.kind === 'running' ? undefined : caps.startDownload}
            >
              {t('ui.cap.download')}
            </Button>
          )}
          {showHowTo && (
            <details className="mt-2 rounded-lg border border-line-strong bg-surface-2 px-3">
              <summary className="flex min-h-11 cursor-pointer items-center font-medium">{t('ui.cap.howto.title')}</summary>
              <ol className="list-decimal space-y-1 pb-2 pl-5">
                <li className="break-words">{t('ui.cap.howto.step1')}</li>
                <li className="break-words">{t('ui.cap.howto.step2')}</li>
                <li>{t('ui.cap.howto.step3')}</li>
              </ol>
              <p className="pb-3 text-muted">{t('ui.cap.howto.hardware')}</p>
            </details>
          )}
          <p role="status" aria-live="polite" className="sr-only">
            {downloadAnnouncement(caps)}
          </p>
        </Row>

        <Row
          icon={tier0.kind === 'ready' ? 'check' : 'chevronDown'}
          tone={tier0.kind === 'ready' ? 'ok' : 'busy'}
          title={t(tech ? 'ui.cap.row.tier0' : 'ui.cap.row.tier0Plain')}
          status={tier0.kind === 'ready' ? t('ui.cap.row.tier0.ready') : t('copy.cap.assetsLoading', { pct: clampPct(tier0.pct) })}
          means={t('ui.cap.row.tier0.means')}
        />

        <Row
          icon={c.offline || cloud !== 'ready' ? 'offline' : 'check'}
          tone={c.offline || cloud !== 'ready' ? 'neutral' : 'ok'}
          title={t('ui.cap.row.cloud')}
          route={caps.checked ? routes.S3 : undefined}
          status={t(c.offline ? 'copy.cap.offline' : CLOUD_COPY[cloud])}
          means={t('ui.cap.row.cloud.means')}
        />

        <Row
          icon={caps.swReady ? 'check' : 'offline'}
          tone={caps.swReady ? 'ok' : 'neutral'}
          title={t('ui.cap.row.offline')}
          status={t(caps.swReady ? 'copy.cap.offlineReady' : 'ui.cap.row.offline.pending')}
          means={t('ui.cap.row.offline.means')}
        />
      </ul>

      <div className={CARD}>
      <table className="w-full border-collapse text-left">
        <caption className="mb-2 text-left font-semibold">{t('ui.cap.policy.caption')}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">{t('ui.cap.policy.colData')}</th>
            <th scope="col">{t('ui.cap.policy.colRoute')}</th>
          </tr>
        </thead>
        <tbody>
          {PAYLOAD_CLASSES.map((k) => (
            <tr key={k} data-class={k} className="border-t border-line first:border-t-0">
              <th scope="row" className="py-2.5 pr-3 align-middle font-normal">
                {tech && <span className="mr-1.5 font-mono text-caption font-bold text-muted">{k}</span>}
                {t(`ui.cap.policy.${k}`)}
              </th>
              <td className="py-2.5 text-right align-middle">
                <Badge route={routes[k]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <ButtonLink href="#/vault">{t('ui.cap.cta.vault')}</ButtonLink>
        <ButtonLink href="#/judge">{t('ui.cap.cta.judge')}</ButtonLink>
        <ButtonLink href="#/check" variant="primary">
          {t('ui.cap.cta.check')}
        </ButtonLink>
      </div>
    </div>
  );
}
