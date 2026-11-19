// web/src/ai/tripwire.ts — a fetch wrapper that is the last line of defence for invariant 1.
// firebase/ai 3.1.0 calls the global `fetch(url, {method:'POST', headers, signal, body})` at request time
// (index.esm.js makeRequest), so wrapping globalThis.fetch sees every AI request. The SDK also does
// fetch('data:<mime>;base64,…') to decode images for the DEVICE path — non-AI URLs pass untouched.
// Installed by ./tripwire-install.ts, which MUST be the first import of main.tsx.
export const AI_HOST = 'firebasevertexai.googleapis.com';

export type TripReason = 'LOCAL_LOCK' | 'NO_PERMIT' | 'NO_SCANNER' | 'VAULT_TEXT' | 'UNSCANNABLE_BODY';
export interface Permit { id: string; scanText: boolean }   // false for S4: the sample allowlist replaces the text scan (SPEC §7.3 (c), R-14)
export interface TripwireObservation { permitId: string; url: string; bytes: number; textParts: string[]; at: number }
export interface TripRecord { reason: TripReason; at: number; localDepth: number; vaultId?: string }
/** Returns the first item of the ACTIVE vault (the real vault, or JUDGE_VAULT in Judge Mode) whose term appears in any text part. */
export type VaultScanner = (texts: string[]) => { vaultId: string } | null;

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
    if (!isAiHost(url)) return orig(input, init);
    if (localLockDepth > 0) trip('LOCAL_LOCK');           // an S0/S1 call tried to reach the cloud
    const permit = permits.shift();
    if (!permit) trip('NO_PERMIT');                       // nobody authorised a cloud call
    if (!scanVault) trip('NO_SCANNER');                   // vault index not built yet: fail closed
    // firebase/ai 3.1.0 always sends a JSON string body in init. Anything else cannot be scanned: fail closed.
    const requestHasBody = typeof Request !== 'undefined' && input instanceof Request && input.body !== null;
    if ((init?.body != null && typeof init.body !== 'string') || (init?.body == null && requestHasBody)) trip('UNSCANNABLE_BODY');
    const body = typeof init?.body === 'string' ? init.body : '';
    const textParts = extractTextParts(body);
    const hit = permit.scanText ? scanVault(textParts) : null;   // S4 permits are not text-scanned (allowlist)
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
  observe(fn: (o: TripwireObservation) => void) {
    observers.push(fn);
    return () => { const i = observers.indexOf(fn); if (i >= 0) observers.splice(i, 1); }; // idempotent
  },
  lastTrip: () => lastTrip,
};
/** True for the Firebase AI Logic host (case-insensitive, any regional prefix). Relative or unparsable URLs are not. */
export function isAiHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false; // relative URL: same origin, never the AI host
  }
  return host === AI_HOST || host.endsWith(`.${AI_HOST}`) || host.endsWith(`-${AI_HOST}`);
}

/**
 * Every string VALUE in the request body, wherever it sits (contents, systemInstruction, the countTokens
 * wrapper `generateContentRequest`, tools, schemas, template inputs). Only base64 image bytes
 * (`inlineData.data`) are skipped: string-scanning them gives false hits. Invalid JSON: the whole body (fail closed).
 */
export function extractTextParts(body: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [body];
  }
  const out: string[] = [];
  const walk = (v: unknown, parentKey: string | null): void => {
    if (typeof v === 'string') { out.push(v); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, parentKey); return; }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (parentKey === 'inlineData' && k === 'data') continue; // base64 image bytes
        walk(x, k);
      }
    }
  };
  walk(parsed, null);
  return out;
}
