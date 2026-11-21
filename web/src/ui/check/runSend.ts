// web/src/ui/check/runSend.ts: binds the consent dry run (ai/preflight.ts) and pass B (ai/jobs/adversaryB.ts) to the app
// (T-069, T-071). The dry run reads the EXACT outgoing bytes with the same readers the gate uses (strict JPEG + metadata
// check, faces at RC face_min_confidence, OCR of the JPEG at its own size, the ACTIVE vault index), so the sheet never
// approves bytes the gate would refuse for a reason the user did not choose (D-30, D-130). The heavy readers load by
// dynamic import, as in runPrescreen; so do the gate and the pass-B job (they pull in Firebase, which the Check screen's
// first render and its Node tests must not load). Nothing here sends anything: pass B goes through the gate (invariant 4).
import type { AdvBCache, AttackOutcome } from '../../ai/jobs/adversaryB';
import type { RefereeOutcome } from '../../ai/jobs/referee';
import { runPreflight, type DryRun } from '../../ai/preflight';
import { vaultScan } from '../../ai/vaultScan';
import type { OutgoingImage } from '../../ai/egressGate';
import { buildFrameJpeg } from '../../core/frames';
import { sentImages } from '../../core/ledgerImages';
import { refereeClaims, refereeVaultItems, rulesReferee } from '../../core/referee';
import type { AdversaryResult, ConsentToken, PxRect, VaultItem } from '../../core/types';
import { FACE_DETECT_TIMEOUT_MS, FACE_LOAD_TIMEOUT_MS, vaultIndexReady, withTimeout } from './runPrescreen';

async function rc() {
  try {
    return (await import('../../firebase/remoteConfig')).cfg();
  } catch {
    return null;
  }
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The dry run on Check's master with the candidate's masks (plus, for a re-attack, the fix masks and its crop: T-080,
 * the same dry run, consent and gate as the first send). Never rejects: a failure is `failed: ['check']`.
 */
export async function runConsentDryRun(master: HTMLCanvasElement, masks: readonly PxRect[], userUnmasked: readonly PxRect[], crop: PxRect | null = null): Promise<DryRun> {
  const c = await rc();
  const decode = await import('../../tier0/decode');
  return runPreflight(
    { masks, width: master.width, height: master.height, userUnmasked, faceMinConfidence: c?.faceMinConfidence ?? 0.3, padRatio: c?.maskPadRatio ?? 0.15 },
    {
      build: (m) => buildFrameJpeg('cloud', master, { masks: m, ...(crop ? { crop } : {}), ...(c ? { maxPx: c.cloudImageMaxPx } : {}) }),
      checkClean: async (jpeg) => (await import('../../tier0/exif')).checkCleanJpeg(jpeg),
      decode: async (bytes) => {
        const bmp = await decode.decodeOriented(new Blob([bytes], { type: 'image/jpeg' }));
        try { return decode.toCanvas(bmp, Number.POSITIVE_INFINITY); } finally { bmp.close(); }
      },
      faces: async (b, minConf) => {
        const f = await import('../../tier0/faces');
        await withTimeout(f.getFaceDetector(), FACE_LOAD_TIMEOUT_MS, 'face model');
        return withTimeout(f.detectFaces(b as HTMLCanvasElement, minConf), FACE_DETECT_TIMEOUT_MS, 'face detection');
      },
      ocr: async (b) => (await import('../../tier0/ocr')).ocrCanvas(b as HTMLCanvasElement, { union: true }),
      matchVault: async (words) => ((await vaultIndexReady(vaultScan)) ? vaultScan.matchWords(words, 'image') : null),
      release: (b) => { const cv = b as HTMLCanvasElement; cv.width = 0; cv.height = 0; },
      sha256Hex,
    },
  );
}

/** What Send hands the attack: the consented image and its token (minted HERE, by the consent sheet only). */
export interface SentImage { image: OutgoingImage; consent: ConsentToken; model: string; sessionId: string; judge?: { sampleId: string } }

export async function consentTo(dry: DryRun, sessionId: string, judge?: { sampleId: string }): Promise<SentImage> {
  const c = await rc();
  const { mintConsent } = await import('../../ai/egressGate');
  return {
    image: dry.image, consent: mintConsent({ sha256: dry.image.sha256, sessionId }), model: c?.adversaryModel ?? 'unknown', sessionId,
    ...(judge ? { judge: { sampleId: judge.sampleId } } : {}),
  };
}

/** Pass B on the consented image; `runId` is 'r1' for the first attack, 'r2'… for re-attacks (T-080). */
export async function runAttack(sent: SentImage, cache: AdvBCache, runId = 'r1'): Promise<AttackOutcome> {
  // SCR-15 (D-148): keep the consented JPEG in memory, keyed by its own sha256, for the Ledger rail. The rail shows it
  // only once the gate commits an IN_CLOUD entry with that same hash (the bytes it checked and sent).
  void sentImages.remember(sent.image.jpeg).catch(() => undefined);
  const { adversaryB } = await import('../../ai/jobs/adversaryB');
  return adversaryB({ sessionId: sent.sessionId, image: sent.image, consent: sent.consent, model: sent.model, runId, ...(sent.judge ? { judge: sent.judge } : {}) }, { cache });
}

/** A per-session pass-B cache (AC-147): final outcomes keyed by session + sha256 + model + prompt version. */
export function newAttackCache(): AdvBCache {
  const m = new Map<string, AttackOutcome>();
  return { get: (k) => m.get(k), set: (k, v) => { m.set(k, v); } };
}

/**
 * The referee for one pass-B result (T-074): the on-device referee through the gate (S0, ONLY_ON_DEVICE; RULES-ONLY
 * when Nano is absent, off or fails), unioned with the rules referee. Never rejects.
 */
export async function runReferee(adv: AdversaryResult, vault: readonly VaultItem[], sessionId: string, theta?: number, judge?: { sampleId: string }): Promise<RefereeOutcome> {
  const t0 = performance.now();
  try {
    const { referee } = await import('../../ai/jobs/referee');
    // Judge Mode (T-105): S4 with the fake vault object itself as the proof (`vault` IS JUDGE_VAULT there).
    return await referee({ sessionId, adv, vault, ...(theta !== undefined ? { theta } : {}), ...(judge ? { judge: { sampleId: judge.sampleId, vault } } : {}) });
  } catch {
    // The job's chunk did not load: no device call was made; the rules referee decides, labelled as a failure.
    const matches = rulesReferee(refereeClaims(adv), refereeVaultItems(vault), theta);
    return { matches, route: 'RULES_ONLY', latencyMs: Math.round(performance.now() - t0), ledgerId: null, notes: ['fallback: INTERNAL'], fallback: 'device_failed' };
  }
}
