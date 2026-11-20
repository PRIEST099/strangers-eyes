// web/src/vault/burn.ts: the whole Burn vault sequence (SPEC SCR-19, ARCH §16.4, D-31). The UI calls performBurn(),
// never vaultStore.burnVault() on its own, so the in-memory vault terms can never outlive the stored vault.
// Lives here (not in vaultStore.ts) because ai/vaultScan.ts imports vaultStore: this module sits above both, no cycle.
// No logging in this folder (SR-15).
import { burnVault } from './vaultStore';
import { vaultScan } from '../ai/vaultScan';

export interface BurnDeps {
  /** ARCH §16.4 steps 0–3, under the vault lock: the key FIRST (AC-271), then se-vault-data, se-sessions, se-ledger. */
  burnStorage: () => Promise<void>;
  /**
   * Step 4 after a complete burn: drop the real vault's terms and pins at once and register tripwireScanner([], [])
   * (no vault terms or pins; the template canary still trips). Judge Mode: nothing to clear.
   */
  clearIndex: () => void;
  /**
   * After a failed burn: rebuild the index from what is really stored. performBurn starts it and does not wait for it,
   * so it must block the real index BEFORE it returns: vaultScan.refresh() registers the block-all scanner synchronously
   * in real mode (also while a reload is already running: it is blocked then). Before boot nothing is registered yet
   * (the tripwire fails closed, NO_SCANNER); in Judge Mode the real vault is not in memory.
   */
  reloadIndex: () => Promise<void>;
}

// Late-bound, so the app's single vaultScan instance is always the one cleared.
const APP_DEPS: BurnDeps = {
  burnStorage: burnVault,
  clearIndex: () => vaultScan.clearReal(),
  reloadIndex: () => vaultScan.refresh(),
};

/**
 * Burn vault: storage first, then memory. Rejects if the storage step failed; the UI then shows an error instead of
 * `copy.burn.done`, and the user can burn again. BurnPendingError means a vault database was not deleted in time:
 * another tab or connection may still hold it open, the deletion may just be slow, or this tab's earlier deletion of it
 * is still pending. Either way the deletion stays queued; when it completes, a vault change is announced, and the
 * reload it triggers (or the next load or boot) finishes the burn (BURN_PENDING marker).
 * burnVault() itself tells every tab's index (vault/sync.ts); this function also empties THIS tab's index at once.
 * - Complete: the index is emptied synchronously (vaultScan.clearReal(): empty terms and pins, the tripwire scanner is
 *   replaced; the template canary keeps working).
 * - Failed part-way: the index is NOT simply emptied, because the key may still be there and the vault still readable.
 *   It is blocked at once and reloaded instead (performBurn rejects without waiting for the reload): with the key
 *   gone the vault reads empty; with the key intact the terms come back in force.
 * The Tesseract cache ('keyval-store') is never touched, and no key is created here: only the next add does (AC-270).
 * SCR-19 step 3 (in-memory recent and queued sessions) joins this sequence when those stores exist.
 */
export async function performBurn(deps: BurnDeps = APP_DEPS): Promise<void> {
  try {
    await deps.burnStorage();
  } catch (e) {
    // Started, NOT awaited (T-054 review round 3): the reload queues for the cross-tab vault lock behind every other
    // tab's burn retry, so waiting for it delayed this error by each open tab's retry. The index is already blocked
    // (reloadIndex blocks it synchronously); a reload that then fails leaves it blocked: fail closed.
    void deps.reloadIndex().catch(() => undefined);
    throw e;
  }
  deps.clearIndex();
}
