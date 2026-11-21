// web/src/ui/hooks/usePrefs.ts: React views of core/localPrefs (ARCH §3.1 hooks). Each re-renders on a change from this
// tab or another one. Server snapshots (static renders in tests, no DOM): the defaults, and the 18+ acknowledgement
// counts as given so a static render shows the app; the real gate is decided on the client (ui/gate.ts).
import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, SIMS_NONE, localPrefs, type Settings, type Simulations } from '../../core/localPrefs';

const subscribe = (listener: () => void) => localPrefs.subscribe(listener);
const serverAck = () => true;
const serverSettings = () => DEFAULT_SETTINGS;
const serverSims = () => SIMS_NONE;
const serverCap = () => 0;

/** SCR-01: has the 18+ and "own photos only" box been ticked on this device? */
export function useAck18(): boolean {
  return useSyncExternalStore(subscribe, localPrefs.ack18, serverAck);
}

/** SCR-20 settings (a stable object while nothing changed). */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, localPrefs.settings, serverSettings);
}

/** Settings › Developer simulations (AC-006): downgrade only. */
export function useSimulations(): Simulations {
  return useSyncExternalStore(subscribe, localPrefs.simulations, serverSims);
}

/** Cloud attack runs used today on this device (the daily cap counter). */
export function useCapUsed(): number {
  return useSyncExternalStore(subscribe, localPrefs.capUsedToday, serverCap);
}
