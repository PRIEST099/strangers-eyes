// web/src/ui/shellContext.ts: what AppShell offers the screens inside it. Settings › On-device AI shows the same
// capability view as the header chip and SCR-02 (one useCapabilities instance, T-061) and opens the SCR-02 sheet.
// Null outside AppShell (a screen rendered alone in a test).
import { createContext, useContext } from 'react';
import type { CapabilitiesView } from './hooks/useCapabilities';

export interface ShellApi {
  caps: CapabilitiesView;
  /** Open SCR-02 ("What runs where on this browser") on the current route. */
  openCapability: () => void;
}

export const ShellContext = createContext<ShellApi | null>(null);

export const useShell = (): ShellApi | null => useContext(ShellContext);
