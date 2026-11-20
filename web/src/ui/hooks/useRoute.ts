// web/src/ui/hooks/useRoute.ts: the current hash route (SPEC §8.1). Re-renders on hashchange.
import { useMemo, useSyncExternalStore } from 'react';
import { parseHash, type AppRoute } from '../router';

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};
const readHash = () => window.location.hash;
const serverHash = () => ''; // no window (static render in tests): Home

export function useRoute(): AppRoute {
  const hash = useSyncExternalStore(subscribe, readHash, serverHash);
  return useMemo(() => parseHash(hash, { dev: import.meta.env.DEV }), [hash]);
}
