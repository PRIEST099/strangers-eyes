// web/src/ui/hud/lanes.ts: which lane of the HybridLanes diagram a finished call belongs to (docs/DESIGN.md §4, §6.1).
// Route honesty: the lane comes ONLY from the call's final route, `laneOf(hudRoute(e))`, never from its payload class,
// step or intent, so a cloud fallback (S2/S4 with inferenceSource 'in_cloud') always lands in the cloud lane.
// QUEUED has not been sent yet and BLOCKED never was, so both stay on this device; CACHED is a recorded cloud answer.
import type { Route } from '../../core/types';

export type Lane = 'device' | 'cloud';

const LANE: Record<Route, Lane> = {
  ON_DEVICE: 'device',
  RULES_ONLY: 'device',
  BLOCKED: 'device',
  QUEUED: 'device',
  IN_CLOUD: 'cloud',
  CACHED: 'cloud',
};

export function laneOf(r: Route): Lane {
  return LANE[r];
}
