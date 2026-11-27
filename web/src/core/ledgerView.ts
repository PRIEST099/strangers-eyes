// web/src/core/ledgerView.ts: pure read-side views over the Cloud Ledger (T-063 counters, T-064 HUD lines; ARCH §8.6,
// SPEC SCR-13/SCR-14). Everything here is derived from LedgerEntry fields only (IDs, kinds, hashes, numbers, notes):
// no vault string, coordinate or pixel can appear, because no entry holds one (AC-045).
import type { JobName, LedgerCounters, LedgerEntry, PayloadClass, Route } from './types';
import { t } from './strings';

/**
 * SCR-13 counters (ARCH §8.6). Requests count entries with `bytesOut > 0`, not routes (a failed or aborted entry keeps
 * the route it tried). Blocked counts gate refusals only (a done entry with a `blocked` reason), never a pending entry
 * (which reads BLOCKED until its call commits). Faces and vault items come from the gate's re-checks on payloads that
 * were actually sent, so they stay 0 by construction.
 */
export function ledgerCounters(entries: readonly LedgerEntry[]): LedgerCounters {
  const images = new Set<string>();
  const c: LedgerCounters = { facesSent: 0, vaultItemsSent: 0, uniqueImages: 0, cloudRequests: 0, bytesSent: 0, onDeviceCalls: 0, rulesChecks: 0, blocked: 0 };
  for (const e of entries) {
    if (e.status !== 'done') continue;
    if (e.bytesOut > 0) {
      c.cloudRequests++;
      c.bytesSent += e.bytesOut;
      c.facesSent += e.facesInOutgoing;
      c.vaultItemsSent += e.vaultItemsInOutgoing;
      if (e.imagesOut > 0) for (const h of e.imageSha256) images.add(h);
    }
    const r = hudRoute(e);
    if (r === 'ON_DEVICE') c.onDeviceCalls++;
    else if (r === 'RULES_ONLY') c.rulesChecks++;
    if (e.blocked !== undefined) c.blocked++;
  }
  c.uniqueImages = images.size;
  return c;
}

/** AC-220: for S2 and S4 the route comes from the SDK's `inferenceSource`, not from the requested mode. */
export function hudRoute(e: LedgerEntry): Route {
  if ((e.payloadClass === 'S2' || e.payloadClass === 'S4') && e.inferenceSource && (e.route === 'ON_DEVICE' || e.route === 'IN_CLOUD')) {
    return e.inferenceSource === 'on_device' ? 'ON_DEVICE' : 'IN_CLOUD';
  }
  return e.route;
}

const JOB_NAME: Record<JobName, Parameters<typeof t>[0]> = {
  preScreen: 'ui.job.preScreen',
  vaultTextMatch: 'ui.job.vaultTextMatch',
  referee: 'ui.job.referee',
  fixPlan: 'ui.job.fixPlan',
  explain: 'ui.job.explain',
  adversaryA: 'ui.job.adversaryA',
  adversaryB: 'ui.job.adversaryB',
};
/** Plain job names (Settings › Technical details off): no "pass B", no "referee". */
const JOB_NAME_PLAIN: Record<JobName, Parameters<typeof t>[0]> = {
  preScreen: 'ui.jobPlain.preScreen',
  vaultTextMatch: 'ui.jobPlain.vaultTextMatch',
  referee: 'ui.jobPlain.referee',
  fixPlan: 'ui.jobPlain.fixPlan',
  explain: 'ui.jobPlain.explain',
  adversaryA: 'ui.jobPlain.adversaryA',
  adversaryB: 'ui.jobPlain.adversaryB',
};
/** The job's name: the technical one (`attacker pass B`) with `tech`, else the plain one (`Attacker`). */
export const jobName = (job: JobName, tech = true): string => t((tech ? JOB_NAME : JOB_NAME_PLAIN)[job]);

/**
 * The engine as SCR-14 shows it: `Gemini Nano`, `rules`, or the exact cloud model id. Without `tech` a cloud model id
 * reads `Gemini` and rules read `simple rules` (the route badge beside it still says where it ran).
 */
export function engineName(model: string, tech = true): string {
  if (model === 'gemini-nano') return t('ui.hud.engine.nano');
  if (model === 'rules' || model === 'none') return t(tech ? 'ui.hud.engine.rules' : 'ui.hud.engine.rulesPlain');
  return tech ? model : t('ui.hud.engine.cloudPlain');
}

/** `850 ms`, `1.3 s`. */
export function latencyText(ms: number): string {
  const v = Number.isFinite(ms) && ms > 0 ? ms : 0;
  return v < 1000 ? t('ui.unit.ms', { n: Math.round(v) }) : t('ui.unit.seconds', { n: (v / 1000).toFixed(1) });
}

/** `0 B`, `312 B`, `48 KB`. */
export function bytesText(bytes: number): string {
  const v = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (v < 1024) return t('ui.unit.bytes', { n: Math.round(v) });
  const kb = v / 1024;
  return t('ui.unit.kb', { n: kb < 10 ? kb.toFixed(1) : String(Math.round(kb)) });
}

/** One HUD line (SCR-14 `{time} {job} [{class}] › {ROUTE} ({engine}) {latency} {bytes}` plus its event tags). */
export interface HudLine {
  id: string;
  ts: number;
  job: string;
  cls: PayloadClass;
  /** null while the call is still running (a pending entry is never shown as BLOCKED). */
  route: Route | null;
  engine: string;
  latency: string;
  bytes: string;
  /** Event tags: the gate's notes (`fallback: no on-device model`, `RECLASSIFIED S2→S0`, `simulated`, `Nano off`…),
   *  the block reason, the error code, `S4 sample`. */
  tags: string[];
}

/**
 * Plain event tags (Technical details off): no payload class, gate code or error code; only what happened, in words.
 * A fallback note (`fallback: …`) becomes `fallback`; other notes (RECLASSIFIED S2→S0, simulated, Nano off) are dropped.
 */
function plainTags(e: LedgerEntry): string[] {
  const tags: string[] = [];
  if (e.notes.some((n) => n.startsWith('fallback'))) tags.push(t('ui.hud.tagPlain.fallback'));
  if (e.blocked) tags.push(t('ui.hud.tagPlain.blocked'));
  if (e.error) tags.push(t('ui.hud.tagPlain.error'));
  if (e.judge) tags.push(t('ui.hud.tagPlain.sample'));
  return tags;
}

/** One HUD line. `tech` (Settings › Technical details) keeps the raw notes and codes; route and latency show either way. */
export function hudLine(e: LedgerEntry, tech = true): HudLine {
  const pending = e.status !== 'done';
  const tags = tech ? [...e.notes] : plainTags(e);
  if (tech && e.blocked) tags.push(e.blocked.reason);
  if (tech && e.error) tags.push(e.error);
  if (tech && e.judge) tags.push(t('ui.hud.tag.sample'));
  return {
    id: e.id,
    ts: e.ts,
    job: jobName(e.job, tech),
    cls: e.payloadClass,
    route: pending ? null : hudRoute(e),
    engine: pending ? '' : engineName(e.model, tech),
    latency: pending ? '' : latencyText(e.latencyMs),
    bytes: pending ? '' : bytesText(e.bytesOut),
    tags: pending ? [] : tags,
  };
}

/** The collapsed pill: `referee › ON-DEVICE (Gemini Nano) 1.3 s`, or `… running`, or idle. */
export function hudPill(entries: readonly LedgerEntry[], tech = true): string {
  const last = entries[entries.length - 1];
  if (!last) return t('ui.hud.idleShort');
  const l = hudLine(last, tech);
  if (l.route === null) return t('ui.hud.pillRunning', { job: l.job });
  // Plain: no engine, so the route and the latency fit a 390 px phone without truncation (the log lists the engine).
  return tech
    ? t('ui.hud.pill', { job: l.job, route: t(`ui.route.${l.route}`), engine: l.engine, latency: l.latency })
    : t('ui.hud.pillPlain', { job: l.job, route: t(`ui.route.${l.route}`), latency: l.latency });
}

/**
 * SCR-15: the most recent send that carried an image to the cloud (newest last in `entries`). An entry qualifies when
 * it has images out with their checked hashes AND either finished IN_CLOUD (D-148: incl. the DEV fake adversary, which
 * sends 0 bytes) or saw bytes leave whatever its final route (F-297: a timeout, 5xx, block or BREACH on a retry after
 * the copy had already left). An on-device S1 call (which hashes the nano768 copy of the ORIGINAL) never qualifies: it
 * is never IN_CLOUD and sends 0 bytes, and the gate records no image for a call that sent nothing.
 * `sessionId` narrows it to one check.
 */
export function lastCloudImageSend(entries: readonly LedgerEntry[], sessionId?: string): LedgerEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.status !== 'done' || e.imagesOut <= 0 || e.imageSha256.length === 0) continue;
    if (e.route !== 'IN_CLOUD' && e.bytesOut <= 0) continue;
    if (sessionId !== undefined && e.sessionId !== sessionId) continue;
    return e;
  }
  return null;
}

/**
 * Is the result on screen a recording? True when the newest FINISHED attacker entry (pass A or B; of `sessionId` when
 * given) was a CACHED replay. Then "What the cloud saw" says the result was replayed on this device and nothing was sent
 * for it, instead of a bare "Nothing has left this device" beside a result (or an older photo's copy).
 */
export function lastAttackReplayed(entries: readonly LedgerEntry[], sessionId?: string): boolean {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.status !== 'done' || (e.job !== 'adversaryB' && e.job !== 'adversaryA')) continue;
    if (sessionId !== undefined && e.sessionId !== sessionId) continue;
    return e.route === 'CACHED';
  }
  return false;
}

/** SCR-13 "Copy receipt" (P0): `copy.receipt.line` from the counters only (hashes and numbers; AC-212). */
export function receiptText(c: LedgerCounters): string {
  return t('copy.receipt.line', { images: c.uniqueImages, requests: c.cloudRequests, k: c.onDeviceCalls, r: c.rulesChecks });
}
