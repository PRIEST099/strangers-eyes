// web/src/ui/components/HybridLanes.tsx: the two lanes (THIS DEVICE | THE CLOUD) and the Wall between them, with one
// gate that only the redacted copy passes (docs/DESIGN.md §1, §5.6).
// - `live` (Check): each FINISHED Ledger entry of `sessionId` is a chip in the lane of its FINAL route,
//   `laneOf(hudRoute(e))`, never its payload class, step or intent, so a cloud fallback always lands in the cloud lane
//   (route honesty). Pending entries are not placed (the HUD shows "running…"). When a new S3 IN_CLOUD send with an
//   image appears, a packet holding the real sent thumbnail crosses the gate once (CACHED never animates: nothing was
//   sent). The gate counter is the Ledger's own faces/vault counters. Below md it collapses to one 72 px row.
// - `explainer` (Home, Welcome, About): the same picture with static ghost chips and NO route badges.
// Not a live region (the HUD already is). It reads no vault values and imports nothing from vault/.
import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { hudRoute, jobName, latencyText, ledgerCounters } from '../../core/ledgerView';
import { t, type StringId } from '../../core/strings';
import type { LedgerCounters, LedgerEntry } from '../../core/types';
import { laneOf, type Lane } from '../hud/lanes';
import { useLedgerCounters, useLedgerEntries } from '../hud/useLedger';
import { Badge } from './Badge';
import { CloudCopy, RedactedGlyph } from './CloudCopy';
import { Icon } from './Icon';
import { EYEBROW } from './surface';

export interface HybridLanesProps {
  mode: 'live' | 'explainer';
  sessionId?: string;
  className?: string;
  /** Tests only: use these entries (newest last) instead of the app's live Ledger. */
  entries?: readonly LedgerEntry[];
}

/** Chips shown per lane in live mode (older ones collapse into "+n earlier"). */
const LANE_MAX = 4;
const PACKET_MS = 700;

const LANE_GRID = 'grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)]';
const LANE_BG: Record<Lane, string> = {
  device: 'bg-lane-device-bg border-t-4 border-t-route-device-fill',
  cloud: 'bg-lane-cloud-bg border-t-4 border-t-route-cloud-fill',
};
const LANE_TEXT: Record<Lane, string> = { device: 'text-route-device', cloud: 'text-route-cloud' };
const LANE_NAME: Record<Lane, StringId> = { device: 'ui.lanes.device', cloud: 'ui.lanes.cloud' };
const LANE_LABEL = 'font-mono text-caption font-bold uppercase tracking-[0.12em]';

const stroke = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' } as const;

// ---------- the Wall (inline SVG, fixed geometry, no DOM measurement) ----------

/** The vertical Wall: a 2 px boundary bar with a gate notch spanning the out and back arrows (25 % and 50 %). */
export function WallBar({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 56 200" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 size-full">
      <path d="M28 0V30 M28 120V200" stroke="var(--se-boundary)" strokeWidth="2" {...stroke} />
      <rect x="21" y="30" width="14" height="90" rx="5" stroke={open ? 'var(--se-gate-open)' : 'var(--se-boundary)'} strokeWidth={open ? 2.5 : 2} {...stroke} />
    </svg>
  );
}

export type ArrowKind = 'out' | 'back' | 'never';
const ARROW_AT: Record<ArrowKind, string> = { out: '25%', back: '50%', never: '75%' };

/** One horizontal arrow across the 56 px Wall column (device → cloud is left → right). */
export function ArrowGlyph({ kind, className, style }: { kind: ArrowKind; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 56 12" aria-hidden="true" className={className} style={style}>
      {kind === 'out' && <path d="M4 6H50 M45 2l5 4-5 4" stroke="var(--se-fg)" strokeWidth="1.75" {...stroke} />}
      {kind === 'back' && (
        <>
          <path d="M52 6H8" stroke="var(--se-muted)" strokeWidth="1.75" strokeDasharray="3 3" {...stroke} />
          <path d="M11 2 6 6l5 4" stroke="var(--se-muted)" strokeWidth="1.75" {...stroke} />
        </>
      )}
      {kind === 'never' && (
        <>
          <path d="M4 6H50 M45 2l5 4-5 4" stroke="var(--se-line-strong)" strokeWidth="1.5" {...stroke} />
          <path d="M23.5 1.5l9 9 M32.5 1.5l-9 9" stroke="var(--se-verdict-teal)" strokeWidth="2.25" {...stroke} />
        </>
      )}
    </svg>
  );
}

/** The same three arrows, vertical (device above, cloud below), for the stacked explainer below md. */
function ArrowGlyphV({ kind, style }: { kind: ArrowKind; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 12 56" aria-hidden="true" className="absolute top-0 h-14 w-3 -translate-x-1/2" style={style}>
      {kind === 'out' && <path d="M6 4V50 M2 45l4 5 4-5" stroke="var(--se-fg)" strokeWidth="1.75" {...stroke} />}
      {kind === 'back' && (
        <>
          <path d="M6 52V8" stroke="var(--se-muted)" strokeWidth="1.75" strokeDasharray="3 3" {...stroke} />
          <path d="M2 11l4-5 4 5" stroke="var(--se-muted)" strokeWidth="1.75" {...stroke} />
        </>
      )}
      {kind === 'never' && (
        <>
          <path d="M6 4V50 M2 45l4 5 4-5" stroke="var(--se-line-strong)" strokeWidth="1.5" {...stroke} />
          <path d="M1.5 23.5l9 9 M10.5 23.5l-9 9" stroke="var(--se-verdict-teal)" strokeWidth="2.25" {...stroke} />
        </>
      )}
    </svg>
  );
}

/** The vertical Wall column (md and up), with the three fixed arrows; `children` is the packet. */
function WallColumn({ open, className = '', children }: { open: boolean; className?: string; children?: ReactNode }) {
  return (
    <div className={`relative min-h-48 border-t-4 border-t-line bg-surface ${className}`}>
      <WallBar open={open} />
      {(['out', 'back', 'never'] as const).map((k) => (
        <ArrowGlyph key={k} kind={k} className="absolute left-0 h-3 w-14 -translate-y-1/2" style={{ top: ARROW_AT[k] }} />
      ))}
      {children}
    </div>
  );
}

/** The horizontal Wall for the stacked explainer (its own SVG; no CSS rotate). */
function WallRow() {
  return (
    <div aria-hidden="true" className="relative h-14 bg-surface md:hidden">
      <svg viewBox="0 0 200 56" preserveAspectRatio="none" className="absolute inset-0 size-full">
        <path d="M0 28H30 M120 28H200" stroke="var(--se-boundary)" strokeWidth="2" {...stroke} />
        <rect x="30" y="21" width="90" height="14" rx="5" stroke="var(--se-boundary)" strokeWidth="2" {...stroke} />
      </svg>
      {(['out', 'back', 'never'] as const).map((k) => (
        <ArrowGlyphV key={k} kind={k} style={{ left: ARROW_AT[k] }} />
      ))}
    </div>
  );
}

// ---------- shared pieces ----------

function LaneHead({ lane, count }: { lane: Lane; count?: number }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className={`inline-flex min-w-0 items-center gap-1.5 ${LANE_LABEL} ${LANE_TEXT[lane]}`}>
        <Icon name={lane === 'device' ? 'chip' : 'cloud'} className="size-4 shrink-0" />
        <span className="truncate">{t(LANE_NAME[lane])}</span>
      </span>
      {count !== undefined && (
        <span className="shrink-0 font-mono text-caption text-muted tabular-nums">{t('ui.lanes.calls', { n: count })}</span>
      )}
    </div>
  );
}

function VaultTile() {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-chip border border-line bg-surface px-2.5 py-2 text-small font-medium">
      <Icon name="lock" className="size-4 shrink-0 text-verdict-teal" />
      <span className="min-w-0">{t('ui.lanes.vaultTile')}</span>
    </div>
  );
}

function CloudTile({ live, sessionId, entries }: { live: boolean; sessionId?: string; entries?: readonly LedgerEntry[] }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-chip border border-line bg-surface px-2 py-1.5 text-small font-medium">
      {live ? <CloudCopy variant="thumb" sessionId={sessionId} entries={entries} /> : <RedactedGlyph />}
      <span className="min-w-0">{t('ui.lanes.cloudTile')}</span>
    </div>
  );
}

/** The gate row under the Wall: the Ledger's faces/vault counters (teal lock at 0, red alert above). */
function GateRow({ counters: c, className = '' }: { counters: LedgerCounters; className?: string }) {
  const leaked = c.facesSent > 0 || c.vaultItemsSent > 0;
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-line bg-surface px-3 py-2 ${className}`}>
      <span className={EYEBROW}>{t('ui.lanes.gate')}</span>
      <Icon name={leaked ? 'alert' : 'lock'} className={`size-4 shrink-0 ${leaked ? 'text-verdict-red' : 'text-verdict-teal'}`} />
      <span className="font-mono text-hud text-fg tabular-nums">{t('ui.lanes.gateCount', { f: c.facesSent, v: c.vaultItemsSent })}</span>
    </div>
  );
}

/** The real-text legend for the three arrows (the arrows themselves are aria-hidden). */
function Legend({ className = '' }: { className?: string }) {
  const item = 'inline-flex items-center gap-1.5';
  return (
    <ul className={`flex-wrap gap-x-5 gap-y-1 text-small text-muted ${className}`}>
      <li className={item}>
        <ArrowGlyph kind="out" className="h-3 w-8 shrink-0" />
        {t('ui.lanes.out')}
      </li>
      <li className={item}>
        <ArrowGlyph kind="back" className="h-3 w-8 shrink-0" />
        {t('ui.lanes.back')}
      </li>
      <li className={item}>
        <ArrowGlyph kind="never" className="h-3 w-8 shrink-0" />
        <Icon name="lock" className="size-4 shrink-0 text-verdict-teal" />
        <span className="text-fg">{t('ui.lanes.never')}</span>
      </li>
    </ul>
  );
}

// ---------- live ----------

function Chip({ e }: { e: LedgerEntry }) {
  const r = hudRoute(e);
  return (
    <li
      className={`flex min-w-0 animate-chip-in flex-wrap items-center gap-x-2 gap-y-1 rounded-chip border bg-surface-3 px-2 py-1 font-mono text-hud ${
        r === 'CACHED' ? 'border-dashed border-route-cached-line' : 'border-transparent'
      }`}
    >
      <span className="min-w-0 truncate font-semibold">{jobName(e.job)}</span>
      <Badge route={r} />
      <span className="ml-auto text-muted tabular-nums">{latencyText(e.latencyMs)}</span>
    </li>
  );
}

function ChipList({ lane, list }: { lane: Lane; list: readonly LedgerEntry[] }) {
  const shown = list.slice(-LANE_MAX);
  const more = list.length - shown.length;
  return (
    <>
      {more > 0 && <p className="font-mono text-caption text-muted tabular-nums">{t('ui.lanes.more', { n: more })}</p>}
      {shown.length > 0 && (
        <ol aria-label={t(LANE_NAME[lane])} className="flex min-w-0 flex-col gap-1.5">
          {shown.map((e) => (
            <Chip key={e.id} e={e} />
          ))}
        </ol>
      )}
    </>
  );
}

/** Below md: one 72 px row per lane (label, call count, latest badge); the HUD keeps the full list. */
function MiniLane({ lane, list }: { lane: Lane; list: readonly LedgerEntry[] }) {
  const last = list[list.length - 1];
  return (
    <div className={`flex min-w-0 flex-col justify-center gap-0.5 overflow-hidden px-2.5 py-1 ${LANE_BG[lane]}`}>
      <span className={`truncate ${LANE_LABEL} ${LANE_TEXT[lane]}`}>{t(LANE_NAME[lane])}</span>
      <span className="truncate font-mono text-caption text-muted tabular-nums">{t('ui.lanes.calls', { n: list.length })}</span>
      <span className="flex h-[22px] min-w-0">{last && <Badge route={hudRoute(last)} />}</span>
    </div>
  );
}

function LiveLanes({ sessionId, className = '', entries: given }: HybridLanesProps) {
  const liveEntries = useLedgerEntries();
  const liveCounters = useLedgerCounters();
  const all = given ?? liveEntries;
  const counters = useMemo(() => (given ? ledgerCounters(given) : liveCounters), [given, liveCounters]);
  const titleId = useId();

  const done = useMemo(
    () => all.filter((e) => (sessionId === undefined || e.sessionId === sessionId) && e.status === 'done'),
    [all, sessionId],
  );
  const lanes = useMemo(() => {
    const out: Record<Lane, LedgerEntry[]> = { device: [], cloud: [] };
    for (const e of done) out[laneOf(hudRoute(e))].push(e);
    return out;
  }, [done]);

  // The newest real image send (S3, final route IN_CLOUD, image out). CACHED never qualifies: nothing was sent.
  const send = useMemo(() => {
    for (let i = done.length - 1; i >= 0; i--) {
      const e = done[i];
      if (e.payloadClass === 'S3' && hudRoute(e) === 'IN_CLOUD' && e.imagesOut > 0) return e;
    }
    return null;
  }, [done]);
  // A send that already existed when the lanes mounted does not animate again (once per send).
  const [seenAtMount] = useState(() => send?.id ?? null);
  const packet = send && send.id !== seenAtMount ? send : null;
  const [crossing, setCrossing] = useState(false);
  useEffect(() => {
    if (!packet) return;
    setCrossing(true);
    const h = setTimeout(() => setCrossing(false), PACKET_MS);
    return () => clearTimeout(h);
  }, [packet]);

  return (
    <figure aria-labelledby={titleId} className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <figcaption id={titleId} className="text-title font-semibold">
        {t('ui.lanes.title')}
      </figcaption>

      {/* md and up: the two lanes, the Wall and the gate row. */}
      <div className={`hidden overflow-hidden rounded-stage border border-line md:grid ${LANE_GRID}`}>
        <div data-lane="device" className={`flex min-w-0 flex-col gap-2.5 p-3 lg:p-4 ${LANE_BG.device}`}>
          <LaneHead lane="device" count={lanes.device.length} />
          <VaultTile />
          <ChipList lane="device" list={lanes.device} />
        </div>
        <WallColumn open={crossing}>
          {packet && (
            <div
              key={packet.id}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/4 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 animate-cross items-center gap-1 rounded-chip border border-route-cloud-fill bg-surface p-1 font-mono text-caption whitespace-nowrap text-fg shadow-pop"
            >
              <CloudCopy variant="thumb" className="h-7 w-10" sessionId={sessionId} entries={given} />
              <span className="tabular-nums">
                {packet.facesInOutgoing} · {packet.vaultItemsInOutgoing}
              </span>
            </div>
          )}
        </WallColumn>
        <div data-lane="cloud" className={`flex min-w-0 flex-col gap-2.5 p-3 lg:p-4 ${LANE_BG.cloud}`}>
          <LaneHead lane="cloud" count={lanes.cloud.length} />
          <CloudTile live sessionId={sessionId} entries={given} />
          <ChipList lane="cloud" list={lanes.cloud} />
        </div>
        <GateRow counters={counters} className="col-span-3" />
      </div>

      {/* Below md: one 72 px row. */}
      <div className="grid h-[72px] grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] overflow-hidden rounded-stage border border-line md:hidden">
        <MiniLane lane="device" list={lanes.device} />
        <div className="relative flex items-center justify-center bg-surface">
          <svg viewBox="0 0 44 72" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 size-full">
            <path d="M22 0V18 M22 54V72" stroke="var(--se-boundary)" strokeWidth="2" {...stroke} />
            <rect x="15" y="18" width="14" height="36" rx="5" stroke={crossing ? 'var(--se-gate-open)' : 'var(--se-boundary)'} strokeWidth="2" {...stroke} />
          </svg>
          <span aria-hidden="true" className="relative rounded-chip bg-surface px-0.5 font-mono text-caption whitespace-nowrap text-fg tabular-nums">
            {counters.facesSent} · {counters.vaultItemsSent}
          </span>
          <span className="sr-only">{t('ui.lanes.gateCount', { f: counters.facesSent, v: counters.vaultItemsSent })}</span>
        </div>
        <MiniLane lane="cloud" list={lanes.cloud} />
      </div>

      <Legend className="hidden md:flex" />
    </figure>
  );
}

// ---------- explainer ----------

const GHOST: Record<Lane, StringId[]> = {
  device: ['ui.job.preScreen', 'ui.job.referee', 'ui.job.fixPlan'],
  cloud: ['ui.job.adversaryB'],
};

function GhostChips({ lane }: { lane: Lane }) {
  return (
    <ul aria-label={t(LANE_NAME[lane])} className="flex min-w-0 flex-col gap-1.5">
      {GHOST[lane].map((id) => (
        <li key={id} className="min-w-0 rounded-chip border border-dashed border-line-strong px-2 py-1 font-mono text-hud text-fg">
          {t(id)}
        </li>
      ))}
    </ul>
  );
}

function ExplainerLanes({ className = '' }: { className?: string }) {
  const counters = useLedgerCounters();
  const titleId = useId();
  return (
    <figure aria-labelledby={titleId} className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <figcaption id={titleId} className="text-title font-semibold">
        {t('ui.lanes.titleExplainer')}
      </figcaption>
      <div className="grid grid-cols-1 overflow-hidden rounded-stage border border-line md:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)]">
        <div className={`flex min-w-0 flex-col gap-2.5 p-3 lg:p-4 ${LANE_BG.device}`}>
          <LaneHead lane="device" />
          <VaultTile />
          <GhostChips lane="device" />
        </div>
        <WallColumn open={false} className="hidden md:block" />
        <WallRow />
        <div className={`flex min-w-0 flex-col gap-2.5 p-3 lg:p-4 ${LANE_BG.cloud}`}>
          <LaneHead lane="cloud" />
          <CloudTile live={false} />
          <GhostChips lane="cloud" />
        </div>
        <GateRow counters={counters} className="md:col-span-3" />
      </div>
      <Legend className="flex" />
      <p className="max-w-[68ch] text-small text-muted">{t('ui.lanes.caption')}</p>
    </figure>
  );
}

export function HybridLanes(p: HybridLanesProps) {
  return p.mode === 'live' ? <LiveLanes {...p} /> : <ExplainerLanes className={p.className} />;
}
