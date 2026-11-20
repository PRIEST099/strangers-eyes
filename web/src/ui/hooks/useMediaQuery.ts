// web/src/ui/hooks/useMediaQuery.ts: subscribe to a CSS media query (e.g. the ≥1024 px Ledger rail, SPEC §8.2).
import { useCallback, useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  // No window (static render in tests): the narrow layout, i.e. mobile first.
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
