// web/src/ai/tripwire.ts — a fetch wrapper that is the last line of defence for invariant 1.
// firebase/ai 3.1.0 calls the global `fetch(url, {method:'POST', headers, signal, body})` at request time
// (index.esm.js makeRequest), so wrapping globalThis.fetch sees every AI request. The SDK also does
// fetch('data:<mime>;base64,…') to decode images for the DEVICE path — non-AI URLs pass untouched.
// Installed by ./tripwire-install.ts, which MUST be the first import of main.tsx.
export const AI_HOST = 'firebasevertexai.googleapis.com';

export type TripReason = 'LOCAL_LOCK' | 'NO_PERMIT' | 'NO_SCANNER' | 'VAULT_TEXT';
export interface Permit { id: string; exemptTerms: ReadonlySet<string> }   // S4 permits exempt JUDGE_VAULT-equal terms
export interface TripwireObservation { permitId: string; url: string; bytes: number; textParts: string[]; at: number }
export interface TripRecord { reason: TripReason; at: number; localDepth: number; vaultId?: string }
/** Returns the first vault item whose term appears in any text part, ignoring `exempt` normalised terms. */
export type VaultScanner = (texts: string[], exempt: ReadonlySet<string>) => { vaultId: string } | null;

let installed = false;
let localLockDepth = 0;                 // > 0 while an S0/S1 call is in flight
const permits: Permit[] = [];           // FIFO of gate-authorised cloud-capable calls not yet fetched
let scanVault: VaultScanner | null = null;   // null until vaultScan is ready → fail closed
const observers: ((o: TripwireObservation) => void)[] = [];
let lastTrip: TripRecord | null = null;

export class TripwireError extends Error {
  readonly reason: TripReason;
  readonly vaultId?: string;
  constructor(reason: TripReason, vaultId?: string) { super(`tripwire:${reason}`); this.reason = reason; this.vaultId = vaultId; }
}
function trip(reason: TripReason, vaultId?: string): never {
  lastTrip = { reason, at: performance.now(), localDepth: localLockDepth, vaultId };
  throw new TripwireError(reason, vaultId);
}

export function installTripwire(): void {
  if (installed) return;
  installed = true;
  const orig = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(`https://${AI_HOST}`)) return orig(input, init);
    if (localLockDepth > 0) trip('LOCAL_LOCK');           // an S0/S1 call tried to reach the cloud
    const permit = permits.shift();
    if (!permit) trip('NO_PERMIT');                       // nobody authorised a cloud call
    if (!scanVault) trip('NO_SCANNER');                   // vault index not built yet: fail closed
    const body = typeof init?.body === 'string' ? init.body : '';
    const textParts = extractTextParts(body);
    const hit = scanVault(textParts, permit.exemptTerms);
    if (hit) trip('VAULT_TEXT', hit.vaultId);
    const obs: TripwireObservation = { permitId: permit.id, url, bytes: new TextEncoder().encode(body).length, textParts, at: performance.now() };
    observers.forEach(o => o(obs));
    return orig(input, init);
  };
}
export function setVaultScanner(fn: VaultScanner): void { scanVault = fn; }
export const tripwire = {
  enterLocal() { localLockDepth++; },
  exitLocal() { localLockDepth = Math.max(0, localLockDepth - 1); },
  isLocalHeld: () => localLockDepth > 0,
  grantCloud(p: Permit) { permits.push(p); },
  /** Called when a permitted call finishes without fetching (e.g. S2 answered on device). */
  revokeCloud(id: string) { const i = permits.findIndex(p => p.id === id); if (i >= 0) permits.splice(i, 1); },
  observe(fn: (o: TripwireObservation) => void) { observers.push(fn); return () => { observers.splice(observers.indexOf(fn), 1); }; },
  lastTrip: () => lastTrip,
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
