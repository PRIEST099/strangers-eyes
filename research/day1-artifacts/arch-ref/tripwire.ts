// web/src/ai/tripwire.ts — installed as the FIRST statement of main.tsx, before any firebase import runs.
// firebase/ai 3.1.0 calls the global `fetch(url, {method:'POST', headers, signal, body})` at request time
// (index.esm.js makeRequest), so wrapping globalThis.fetch sees every AI request. The SDK also does
// fetch('data:<mime>;base64,…') to decode images for the DEVICE path — data: URLs must pass untouched.
export const AI_HOST = 'firebasevertexai.googleapis.com';

export interface TripwireObservation { url: string; bytes: number; textParts: string[]; at: number }
type Scan = (texts: string[]) => { vaultId: string } | null;

let localLockDepth = 0;            // > 0 while an S0/S1 call is in flight
let cloudPermits = 0;              // > 0 while a gate-authorised cloud-capable call (S2/S3/S4) is in flight
let scanVault: Scan = () => null;
const observers: ((o: TripwireObservation) => void)[] = [];
export class TripwireError extends Error {
  readonly reason: 'LOCAL_LOCK' | 'NO_PERMIT' | 'VAULT_TEXT';
  readonly vaultId?: string;
  constructor(reason: 'LOCAL_LOCK' | 'NO_PERMIT' | 'VAULT_TEXT', vaultId?: string) { super(`tripwire:${reason}`); this.reason = reason; this.vaultId = vaultId; }
}

export function installTripwire(scan: Scan): void {
  scanVault = scan;
  const orig = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(`https://${AI_HOST}`)) return orig(input, init);
    if (localLockDepth > 0) throw new TripwireError('LOCAL_LOCK');      // an S0/S1 call tried to reach the cloud
    if (cloudPermits <= 0) throw new TripwireError('NO_PERMIT');        // nobody authorised a cloud call
    const body = typeof init?.body === 'string' ? init.body : '';
    const textParts = extractTextParts(body);
    const hit = scanVault(textParts);
    if (hit) throw new TripwireError('VAULT_TEXT', hit.vaultId);
    const obs = { url, bytes: new TextEncoder().encode(body).length, textParts, at: performance.now() };
    observers.forEach(o => o(obs));
    return orig(input, init);
  };
}
export const tripwire = {
  enterLocal() { localLockDepth++; }, exitLocal() { localLockDepth = Math.max(0, localLockDepth - 1); },
  isLocalHeld: () => localLockDepth > 0,
  grantCloud() { cloudPermits++; }, revokeCloud() { cloudPermits = Math.max(0, cloudPermits - 1); },
  observe(fn: (o: TripwireObservation) => void) { observers.push(fn); return () => observers.splice(observers.indexOf(fn), 1); },
};
/** Only text parts and systemInstruction text are scanned; base64 image data is never string-scanned (false hits). */
export function extractTextParts(body: string): string[] {
  try {
    const j = JSON.parse(body) as { contents?: { parts?: { text?: string }[] }[]; systemInstruction?: { parts?: { text?: string }[] } };
    const out: string[] = [];
    for (const c of j.contents ?? []) for (const p of c.parts ?? []) if (typeof p.text === 'string') out.push(p.text);
    for (const p of j.systemInstruction?.parts ?? []) if (typeof p.text === 'string') out.push(p.text);
    return out;
  } catch { return [body]; }   // unknown body shape: scan all of it (fail closed)
}
