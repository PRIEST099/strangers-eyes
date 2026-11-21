// web/src/vault/generation.ts: the vault generation counter (D-80; ARCH §8.4; the gate's check before every permit).
// A monotonic number in localStorage, bumped by vaultStore INSIDE the vault lock on every committed save and at the
// start of every Burn vault, BEFORE the change is announced. localStorage is synchronous and shared by every tab of
// the origin, so a change committed in another tab is visible here at once, even before its BroadcastChannel message
// arrives. ai/vaultScan records the generation each real index was built from; the Egress Gate asks
// vaultScan.isFresh() before every permit and rebuilds the index when they differ.
// Carries NO vault data: only a counter. Storage goes through core/localPrefs (boundary rule R7). No logging here (SR-15).
import { generationStorage, PREF_KEYS } from '../core/localPrefs';

export const VAULT_GENERATION_KEY = PREF_KEYS.vaultGeneration;

export interface GenerationStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** The app's store: localPrefs' uncached counter accessors; null when storage is unavailable. */
function store(): GenerationStore | null {
  if (generationStorage.read() === undefined) return null; // no storage, or it throws: no cross-tab counter
  return { getItem: () => generationStorage.read() ?? null, setItem: (_k, v) => generationStorage.write(v) };
}

/** The current generation; 0 before the first change; null when storage is unavailable (no counter in this browser). */
export function readVaultGeneration(s: GenerationStore | null = store()): number | null {
  if (!s) return null;
  try {
    const v = Number(s.getItem(VAULT_GENERATION_KEY) ?? '0');
    return Number.isSafeInteger(v) && v >= 0 ? v : 0;
  } catch {
    return null;
  }
}

/** Bump the generation (call inside the vault lock, before announcing). Never throws. */
export function bumpVaultGeneration(s: GenerationStore | null = store()): void {
  if (!s) return;
  try {
    s.setItem(VAULT_GENERATION_KEY, String((readVaultGeneration(s) ?? 0) + 1));
  } catch { /* storage full or blocked: the BroadcastChannel announcement still rebuilds every index */ }
}
