// web/src/ui/simulate.ts: Settings › Developer › "Simulate: no Nano" (AC-006, P1) shown as the real state (c) of a
// browser without the Prompt API: copy.cap.nanoNone, the Chrome how-to, the Rules-only chip and no Download button, so
// AC-072's simulation check sees (c)'s own copy (D-117). It only ever removes capability: the real view is replaced,
// never upgraded. The "Use Gemini Nano" setting keeps its precedence (off → its own 'disabled' line), as in
// capabilityOf. The gate reads the same simulation through core/localPrefs prefs.nanoEnabled().
import { capabilityOf } from '../ai/capabilities';
import { chipStateOf, type CapabilitiesView } from './hooks/useCapabilities';

const IDLE = { kind: 'idle' } as const;
const noop = () => undefined;

export function simulateNoNano(view: CapabilitiesView, s: { nanoEnabled: boolean; online: boolean }): CapabilitiesView {
  const capability = capabilityOf({ text: 'no-api', image: 'no-api', nanoEnabled: s.nanoEnabled, online: s.online });
  return { ...view, capability, chip: chipStateOf(capability, IDLE), download: IDLE, startDownload: noop };
}
