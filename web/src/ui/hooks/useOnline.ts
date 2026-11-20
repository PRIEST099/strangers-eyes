// web/src/ui/hooks/useOnline.ts: navigator.onLine plus the online/offline events (SPEC §5.1 `online`).
// The "last cloud request failed with a network error" half of the signal joins in T-061/T-062.
import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};
const readOnline = () => navigator.onLine;
const serverOnline = () => true; // no navigator (static render in tests): the chip stays hidden

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, readOnline, serverOnline);
}
