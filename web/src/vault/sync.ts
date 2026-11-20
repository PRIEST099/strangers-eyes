// web/src/vault/sync.ts: the "vault changed" signal, in this tab and across tabs (ARCH §8.4: the index is "rebuilt on
// every vault edit, emptied by burn"; §16.4 step 4). vaultStore announces after every committed add/update/remove,
// after every Burn vault (finished or not), when a load or boot FINISHES an interrupted burn, and once all of this
// tab's deletions that a failed burn (the user's Burn vault or a retry) left queued have completed successfully (at
// most once per queued deletion).
// Never when a retry fails, nor when a queued deletion fails: each announcement makes every index reload, and that
// reload retries the burn, so announcing failures loops.
// ai/vaultScan.ts listens and re-reads the vault under the vault lock, coalescing a burst into at most one more load.
// The message carries NO vault data, only that something changed. BroadcastChannel is same-origin and stays on this
// device. No logging in this folder (SR-15).
export const VAULT_CHANNEL = 'se-vault';
const MESSAGE = 'vault-changed';

type Listener = () => void;
const listeners = new Set<Listener>();
let channel: BroadcastChannel | null | undefined;
let pageshowHooked = false;

function notify(): void {
  for (const l of [...listeners]) {
    try { l(); } catch { /* one listener's failure never stops the others */ }
  }
}

function ensureChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  try {
    channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(VAULT_CHANNEL) : null;
  } catch {
    channel = null;
  }
  if (channel) {
    channel.onmessage = (e: MessageEvent) => { if (e.data === MESSAGE) notify(); };
    (channel as unknown as { unref?: () => void }).unref?.();   // Node (unit tests) only: never keep the process alive
  }
  return channel;
}

/** A page restored from the back/forward cache missed every message sent while it was frozen: treat it as a change. */
function hookPageshow(): void {
  if (pageshowHooked) return;
  pageshowHooked = true;
  const g = globalThis as { addEventListener?: (type: string, fn: (e: { persisted?: boolean }) => void) => void };
  try {
    g.addEventListener?.('pageshow', (e) => { if (e.persisted) notify(); });
  } catch { /* no window (unit tests, workers) */ }
}

/** The vault changed: tell this tab's listeners now, and every other tab. Never throws. */
export function announceVaultChange(): void {
  notify();
  try {
    ensureChannel()?.postMessage(MESSAGE);
  } catch { /* closed or unsupported: other tabs catch up on their next load */ }
}

/** Call `listener` whenever the vault changes, in this tab or another one. Returns an unsubscribe function. */
export function onVaultChange(listener: Listener): () => void {
  listeners.add(listener);
  ensureChannel();
  hookPageshow();
  return () => { listeners.delete(listener); };
}
