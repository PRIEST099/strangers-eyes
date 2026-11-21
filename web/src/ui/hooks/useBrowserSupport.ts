// web/src/ui/hooks/useBrowserSupport.ts: WebAssembly and IndexedDB present (ui/gate.ts). A browser cannot gain or lose
// them while the page is open, so nothing to subscribe to. Server snapshot (static renders in tests): supported.
import { useSyncExternalStore } from 'react';
import { detectBrowserSupport } from '../gate';

const noSubscription = () => () => undefined;
const serverSupported = () => true;

export function useBrowserSupport(): boolean {
  return useSyncExternalStore(noSubscription, detectBrowserSupport, serverSupported);
}
