// web/src/ai/jobs/prescreen.ts: the on-device pre-screen (S1, nanoPre.v1; SPEC SCR-06 W3a; ARCH §10.7, §11.4; T-066).
// Gemini Nano looks at the ORIGINAL (unmasked) photo as a 768 px JPEG and lists visible clues {type, text, region,
// severity}. The image is class S1: the Egress Gate runs it ONLY_ON_DEVICE after a fresh availability() check and
// fails closed to its deterministic path (no Nano clues; Tier-0 still runs) whenever Nano is absent, off, slow or
// unreadable. It never reaches the cloud (invariant 3), and nothing here calls the SDK (invariant 4).
// The answer is validated by prescreenClues.parseNanoPreText (AC-114); localising and merging are there too.
// T-067 seam: the Nano vault-text match (nanoVaultText.v1, S0) will take the OCR words and these clues' texts (p1..).
// LOCAL ONLY: the photo, the OCR words and the clue texts stay in memory on this device; nothing is logged or sent.
import { gate as appGate, type GateRequest, type GateResult, type OutgoingImage } from '../egressGate';
import { GateError } from '../errors';
import { render } from '../prompts';
import { NANO_PRE_SCHEMA } from '../schemas';
import { parseNanoPreText, type NanoPreClue } from './prescreenClues';

export const NANO_PRE_PROMPT = 'nanoPre.v1';
export { localiseNanoClues, mergeNanoFindings, parseNanoPreText, type NanoPreClue } from './prescreenClues';

/** Why Nano added nothing: not usable here (absent, off, a tripwire), or it failed this time (timeout, bad output). */
export type PrescreenFallback = 'no_device' | 'device_failed';
export interface NanoPrescreenOutcome {
  clues: NanoPreClue[];
  route: 'ON_DEVICE' | 'RULES_ONLY';
  latencyMs: number;
  ledgerId: string | null;
  notes: string[];
  fallback: PrescreenFallback | null;
}

export interface PrescreenJobInput { sessionId: string; image: OutgoingImage; signal?: AbortSignal; timeoutMs?: number }
export interface PrescreenJobDeps { run?: <T>(req: GateRequest<T>) => Promise<GateResult<T>>; clock?: () => number }

/** The one request shape the gate accepts for the pre-screen (S1, deviceJson image, the static schema, no clues as the floor). */
export function prescreenRequest(i: PrescreenJobInput): GateRequest<NanoPreClue[]> {
  return {
    job: 'preScreen', payloadClass: 'S1', sessionId: i.sessionId, judge: null,
    modelSpec: { kind: 'deviceJson', io: 'image', schema: NANO_PRE_SCHEMA }, promptId: NANO_PRE_PROMPT, text: render(NANO_PRE_PROMPT),
    images: [i.image], parse: (raw) => parseNanoPreText(raw), deterministic: () => [],
    ...(i.signal ? { signal: i.signal } : {}), ...(i.timeoutMs !== undefined ? { timeoutMs: i.timeoutMs } : {}),
  };
}

const NO_DEVICE_NOTES: ReadonlySet<string> = new Set(['fallback: no on-device model', 'fallback: model downloading']);
const deviceFailed = (notes: readonly string[]) => notes.some((n) => n.startsWith('fallback:') && !NO_DEVICE_NOTES.has(n));

/** Run the Nano pre-screen. Never throws: a failure is no Nano clues, RULES_ONLY, with `fallback` set. */
export async function nanoPrescreen(i: PrescreenJobInput, deps: PrescreenJobDeps = {}): Promise<NanoPrescreenOutcome> {
  const run = deps.run ?? appGate;
  const clock = deps.clock ?? (() => performance.now());
  const t0 = clock();
  const none = (fallback: PrescreenFallback, notes: string[], ledgerId: string | null): NanoPrescreenOutcome => ({
    clues: [], route: 'RULES_ONLY', latencyMs: Math.max(0, Math.round(clock() - t0)), ledgerId, notes, fallback,
  });
  try {
    const r = await run(prescreenRequest(i));
    if (r.route !== 'ON_DEVICE') return none(deviceFailed(r.notes) ? 'device_failed' : 'no_device', [...r.notes], r.ledgerId);
    return { clues: r.value, route: 'ON_DEVICE', latencyMs: r.latencyMs, ledgerId: r.ledgerId, notes: [...r.notes], fallback: null };
  } catch (e) {
    return none('device_failed', [e instanceof GateError ? `fallback: ${e.code}` : 'fallback: INTERNAL'], e instanceof GateError ? e.ledgerId ?? null : null);
  }
}
