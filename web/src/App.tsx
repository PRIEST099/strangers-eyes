// The hash router (SPEC §8.1, D-27; ARCH §3.4). Route parsing lives in ui/router.ts (unit-tested).
// DEV-only routes are loaded with a dynamic import inside `import.meta.env.DEV`, so they are absent from production (AC-065).
// Before any product route (ui/gate.ts): the unsupported-browser page (SCR-22), then SCR-01 Welcome until the 18+
// acknowledgement is stored. A Welcome finished on #/judge opens SCR-02 over Judge Mode (AC-071, D-103).
import { lazy, Suspense, useState, type ComponentType, type LazyExoticComponent } from 'react';
import { localPrefs } from './core/localPrefs';
import { AppShell } from './ui/components/AppShell';
import { UnsupportedPage } from './ui/components/UnsupportedPage';
import { capabilityAfterWelcome, topScreen } from './ui/gate';
import { useBrowserSupport } from './ui/hooks/useBrowserSupport';
import { useAck18 } from './ui/hooks/usePrefs';
import { useRoute } from './ui/hooks/useRoute';
import type { AppRoute } from './ui/router';
import { About } from './ui/screens/About';
import { Atlas } from './ui/screens/Atlas';
import { Check } from './ui/screens/Check';
import { Home } from './ui/screens/Home';
import { Judge } from './ui/screens/Judge';
import { Settings } from './ui/screens/Settings';
import { Vault } from './ui/screens/Vault';
import { Welcome } from './ui/screens/Welcome';

const DevSelftest: LazyExoticComponent<ComponentType> | null = import.meta.env.DEV
  ? lazy(() => import('./dev/selftest/SelftestPage'))
  : null;
const DevPlumbingSpike: LazyExoticComponent<ComponentType> | null = import.meta.env.DEV
  ? lazy(() => import('./dev/spikes/PlumbingSpike'))
  : null;
const DevAdversarySpike: LazyExoticComponent<ComponentType> | null = import.meta.env.DEV
  ? lazy(() => import('./dev/spikes/AdversarySpike'))
  : null;

/** The route → screen map. Exported so ui/shell.test.ts asserts App's own mapping, not a copy of it. */
export function Screen({ route }: { route: AppRoute }) {
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'vault':
      return <Vault />;
    case 'check':
      return <Check key={route.sessionId ?? 'current'} />;
    case 'judge':
      return <Judge />;
    case 'settings':
      return <Settings />;
    case 'about':
      return <About />;
    case 'atlas':
      return <Atlas />;
    case 'dev':
      return <Home />; // an unknown #/dev/* page (DEV builds only; production never parses a dev route)
  }
}

export default function App() {
  const route = useRoute();
  const supported = useBrowserSupport();
  const acknowledged = useAck18();
  // Read once, when AppShell first mounts after Welcome (its initial state).
  const [capabilityOnStart, setCapabilityOnStart] = useState(false);

  if (DevSelftest && route.name === 'dev' && route.page === 'selftest') {
    return (
      <Suspense fallback={<p className="p-6 font-mono text-sm">loading selftest…</p>}>
        <DevSelftest />
      </Suspense>
    );
  }

  if (DevPlumbingSpike && route.name === 'dev' && route.page === 'spike') {
    return (
      <Suspense fallback={<p className="p-6 font-mono text-sm">loading spike…</p>}>
        <DevPlumbingSpike />
      </Suspense>
    );
  }

  if (DevAdversarySpike && route.name === 'dev' && route.page === 'adversary') {
    return (
      <Suspense fallback={<p className="p-6 font-mono text-sm">loading spike…</p>}>
        <DevAdversarySpike />
      </Suspense>
    );
  }

  const top = topScreen({ supported, acknowledged });
  if (top === 'unsupported') return <UnsupportedPage />;
  if (top === 'welcome') {
    return (
      <Welcome
        onContinue={() => {
          // The flag first, then the acknowledgement: AppShell must mount with it, even if React did not batch the two.
          setCapabilityOnStart(capabilityAfterWelcome(route));
          localPrefs.setAck18(); // false when storage is unavailable: this session continues, a reload asks again
        }}
      />
    );
  }

  return (
    <AppShell route={route} capabilityOnStart={capabilityOnStart}>
      <Screen route={route} />
    </AppShell>
  );
}
