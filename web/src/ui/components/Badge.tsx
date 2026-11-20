// web/src/ui/components/Badge.tsx: the route badge (SPEC §8.3, §17.1 ROUTE). Colour plus a text label, never
// colour alone (AC-062): ON-DEVICE violet, IN CLOUD blue, RULES-ONLY grey, BLOCKED red, QUEUED amber outline,
// CACHED SAMPLE dashed outline.
import type { Route } from '../../core/types';
import { t, type StringId } from '../../core/strings';

const STYLE: Record<Route, string> = {
  ON_DEVICE: 'border-transparent bg-route-device-bg text-route-device',
  IN_CLOUD: 'border-transparent bg-route-cloud-bg text-route-cloud',
  RULES_ONLY: 'border-transparent bg-route-rules-bg text-route-rules',
  BLOCKED: 'border-transparent bg-route-blocked-bg text-route-blocked',
  QUEUED: 'border-route-queued-line bg-transparent text-route-queued',
  CACHED: 'border-dashed border-route-cached-line bg-transparent text-route-cached',
};

const LABEL: Record<Route, StringId> = {
  ON_DEVICE: 'ui.route.ON_DEVICE',
  IN_CLOUD: 'ui.route.IN_CLOUD',
  RULES_ONLY: 'ui.route.RULES_ONLY',
  BLOCKED: 'ui.route.BLOCKED',
  QUEUED: 'ui.route.QUEUED',
  CACHED: 'ui.route.CACHED',
};

export function Badge({ route, className }: { route: Route; className?: string }) {
  return (
    <span
      data-route={route}
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-xs leading-4 font-semibold tracking-wide whitespace-nowrap ${STYLE[route]}${className ? ` ${className}` : ''}`}
    >
      {t(LABEL[route])}
    </span>
  );
}
