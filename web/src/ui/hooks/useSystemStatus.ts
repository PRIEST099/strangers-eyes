// web/src/ui/hooks/useSystemStatus.ts: the SCR-22 system conditions (ui/systemStatus.ts) as React state.
import { useSyncExternalStore } from 'react';
import { systemStatus, type SystemStatus } from '../systemStatus';

const subscribe = (listener: () => void) => systemStatus.subscribe(listener);

export function useSystemStatus(): SystemStatus {
  return useSyncExternalStore(subscribe, systemStatus.get, systemStatus.get);
}
