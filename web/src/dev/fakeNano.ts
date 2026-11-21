// DEV-only fake Gemini Nano (__SE_DEV_ONLY__; D-147). Loaded by App.tsx inside `if (import.meta.env.DEV)`, so it is
// absent from production builds (check-dist scans web/dist for the marker). With `?fakeNano=<mode>` in the page URL,
// the gate's fresh availability() says 'available' and the on-device jobs are answered here instead of by the SDK;
// without it, nothing changes. The mode is read on every call. Only availability and the MODEL are fake: the Egress
// Gate still runs its class rules, the interlock, the device queue, the on_device route check, the parse and the
// Ledger, so the ON_DEVICE path (and its fallbacks) can be shown in a browser without Nano (8 GB machines, T-007).
//   ok       referee: a crude word-overlap answer computed from the prompt the gate built (same ids, same enums);
//            pre-screen: two canned clues.
//   empty    nothing found ({"matches":[]}, {"clues":[]}).
//   invalid  prose instead of JSON → the gate's "fallback: invalid output" → RULES-ONLY.
//   timeout  never answers → the job's timeout → RULES-ONLY.
// The canned answers are synthetic (invented names): no real people, homes or schools (invariant 9).
import { devSetFakeNano, type DevNanoReply } from '../ai/egressGate';

interface PromptClaim { id: string; kind: string; value: string }
interface PromptItem { id: string; kind: string; label: string }

/** The JSON line after `NAME:` in the rendered nanoRef.v1 prompt (each list is one JSON.stringify line). */
function listAfter<T>(prompt: string, name: string): T[] {
  const lines = prompt.split('\n');
  const k = lines.indexOf(`${name}:`);
  try {
    const v: unknown = k >= 0 ? JSON.parse(lines[k + 1] ?? '[]') : [];
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

/** Place words too generic to link anything ("A coastal city" is not "City General Hospital"; T-105, F-225). */
const GENERIC_WORDS: ReadonlySet<string> = new Set(['city', 'town', 'area', 'district', 'street', 'road', 'near', 'coastal']);
const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w));

/** A deliberately simple referee: the whole label named → exact; a shared long word → likely. */
export function fakeRefereeAnswer(prompt: string): string {
  const claims = listAfter<PromptClaim>(prompt, 'CLAIMS');
  const vault = listAfter<PromptItem>(prompt, 'VAULT');
  const matches: { claim_id: string; vault_id: string; strength: string; reason: string }[] = [];
  for (const c of claims) {
    const cv = c.value.toLowerCase();
    const cw = new Set(words(c.value));
    for (const v of vault) {
      const names = v.label.split(' / ');
      if (names.some((n) => n.length >= 3 && cv.includes(n.toLowerCase()))) {
        matches.push({ claim_id: c.id, vault_id: v.id, strength: 'exact', reason: 'The claim names this item (fake Nano)' });
      } else if (names.some((n) => words(n).some((w) => cw.has(w)))) {
        matches.push({ claim_id: c.id, vault_id: v.id, strength: 'likely', reason: 'Shares a distinctive word (fake Nano)' });
      }
    }
  }
  return JSON.stringify({ matches: matches.slice(0, 12) });
}

export const PRESCREEN_OK = JSON.stringify({
  clues: [
    { type: 'street_sign', text: '', region: 'top_right', severity: 'medium' },
    { type: 'uniform_or_lanyard', text: '', region: 'bottom_center', severity: 'medium' },
  ],
});

const EMPTY: Readonly<Record<string, string>> = { referee: '{"matches":[]}', preScreen: '{"clues":[]}' };

export function fakeNanoReply(mode: string, job: string): DevNanoReply | null {
  switch (mode) {
    case 'ok':
      if (job === 'referee') return { textFor: fakeRefereeAnswer, delayMs: 700 };
      if (job === 'preScreen') return { text: PRESCREEN_OK, delayMs: 900 };
      return null; // other jobs: a device failure → the gate's deterministic path
    case 'empty': return EMPTY[job] !== undefined ? { text: EMPTY[job], delayMs: 400 } : null;
    case 'invalid': return { text: 'I think it is probably the hospital one.', delayMs: 400 };
    case 'timeout': return { hang: true };
    default: return null; // an unknown mode is a device failure, never the real model
  }
}

const modeNow = (): string | null => new URLSearchParams(self.location.search).get('fakeNano');

export function installFakeNano(): void {
  devSetFakeNano({
    active: () => modeNow() !== null,
    reply: (job) => fakeNanoReply(modeNow() ?? '', job),
  });
}
