// web/src/ui/judge/judgeRun.ts: the browser glue of a Judge Mode check (T-105). Check calls these when it runs on a
// sample instead of the user's photo; the decisions are pure, in judgeFlow.ts.
//   - loadSamplePhoto: the bundled sample through the normal import (tier0/importPhoto: decode, metadata check, master).
//   - judgeNanoStep: the pre-screen's model step as S4 (ai/jobs/prescreen with `judge`): the image is the sample's
//     pre-rendered nano768 file, sent as fetched, so its sha256 is the manifest's (the gate's S4 proof, AC-023).
//   - recordedAttack: the CACHED replay (copy.judge.cached) of the recorded pass B for this sample.
// Sample files come from this origin's /samples/ only (vault/judgeVault.sampleUrl). Nothing here touches the real vault.
import type { AttackOutcome } from '../../ai/jobs/adversaryB';
import type { OutgoingImage } from '../../ai/egressGate';
import { parseAdvB } from '../../ai/parse';
import { vaultScan } from '../../ai/vaultScan';
import { deriveFrame } from '../../core/frames';
import type { OcrWord, PxRect, VaultItem } from '../../core/types';
import type { ImportedPhoto } from '../../tier0/importPhoto';
import type { Tier0Finding } from '../../tier0/tier0';
import type { PrescreenNanoLine } from '../checkState';
import { sampleUrl, type JudgeSample } from '../../vault/judgeVault';
import { fixedRecordingApplies, recordedOutcome } from './judgeFlow';

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}
function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The sample as Check's master (null when it cannot be fetched or imported). */
export async function loadSamplePhoto(sample: JudgeSample): Promise<ImportedPhoto | null> {
  try {
    const res = await fetch(sampleUrl(sample.image), { cache: 'no-cache' });
    if (!res.ok) return null;
    const { importPhoto } = await import('../../tier0/importPhoto');
    const r = await importPhoto(await res.blob());
    return r.ok ? r : null;
  } catch {
    return null;
  }
}

type NanoStep = (master: HTMLCanvasElement, words: readonly OcrWord[], c: { sessionId: string; maxPx: number }) => Promise<{ findings: Tier0Finding[]; line: PrescreenNanoLine }>;

/** runPrescreen's model step for a sample: S4 on the pre-rendered nano768 file (ON_DEVICE with Nano, else IN_CLOUD). */
export function judgeNanoStep(sample: JudgeSample, vault: readonly VaultItem[]): NanoStep {
  return async (master, words, c) => {
    const t0 = performance.now();
    try {
      const res = await fetch(sampleUrl(sample.nano768), { cache: 'no-cache' });
      if (!res.ok) throw new Error('nano768 sample missing');
      const bytes = new Uint8Array(await res.arrayBuffer());
      const jpeg = new Blob([bytes], { type: 'image/jpeg' });
      const image: OutgoingImage = {
        jpeg, base64: toBase64(bytes), sha256: await sha256Hex(bytes), mime: 'image/jpeg',
        frame: deriveFrame('nano768', master.width, master.height, { maxPx: c.maxPx }),
      };
      const job = await import('../../ai/jobs/prescreen');
      const o = await job.nanoPrescreen({ sessionId: c.sessionId, image, judge: { sampleId: sample.id, vault } });
      const findings = job.localiseNanoClues(o.clues, words, master.width, master.height);
      return { findings, line: { route: o.route, latencyMs: o.latencyMs, count: findings.length, fallback: o.fallback } };
    } catch {
      return { findings: [], line: { route: 'RULES_ONLY', latencyMs: Math.round(performance.now() - t0), count: 0, fallback: 'device_failed' } };
    }
  };
}

async function fetchJson(file: string): Promise<unknown> {
  const res = await fetch(sampleUrl(file), { cache: 'no-cache' });
  if (!res.ok) throw new Error('recorded pass B missing');
  return res.json();
}

export interface RecordedAttackInput {
  sample: JudgeSample;
  image: OutgoingImage;
  runId: string;
  /** Re-attack: the masks and crop actually sent (master px); null for the first attack. */
  fix: { masks: readonly PxRect[]; crop: PxRect | null } | null;
  master: { width: number; height: number };
}

/** The CACHED replay for this attack, or null when the recording cannot be read (the live outcome then stands). */
export async function recordedAttack(i: RecordedAttackInput): Promise<AttackOutcome | null> {
  try {
    const first = await fetchJson(i.sample.cachedAdvB);
    let use = first;
    if (i.fix) {
      const fixed = await fetchJson(i.sample.cachedAdvBFixed);
      if (fixedRecordingApplies(parseAdvB(first), parseAdvB(fixed), i.fix.masks, i.fix.crop, i.master.width, i.master.height)) use = fixed;
    }
    return recordedOutcome(use, {
      runId: i.runId, sentImageSha256: i.image.sha256, sentFrame: i.image.frame, recordedAt: i.sample.recordedAt, model: i.sample.model,
      echo: (p) => vaultScan.echoScan(p),
    }, i.master.width, i.master.height);
  } catch {
    return null;
  }
}
