// The hash router (SPEC §8.1, D-27; ARCH §3.4). Route parsing lives in ui/router.ts (unit-tested).
// DEV-only routes are loaded with a dynamic import inside `import.meta.env.DEV`, so they are absent from production (AC-065).
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { AppShell } from './ui/components/AppShell';
import { useRoute } from './ui/hooks/useRoute';
import type { AppRoute } from './ui/router';
import { About } from './ui/screens/About';
import { Atlas } from './ui/screens/Atlas';
import { Check } from './ui/screens/Check';
import { Home } from './ui/screens/Home';
import { Judge } from './ui/screens/Judge';
import { Settings } from './ui/screens/Settings';
import { Vault } from './ui/screens/Vault';

const DevSelftest: LazyExoticComponent<ComponentType> | null = import.meta.env.DEV
  ? lazy(() => import('./dev/selftest/SelftestPage'))
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

  if (DevSelftest && route.name === 'dev' && route.page === 'selftest') {
    return (
      <Suspense fallback={<p className="p-6 font-mono text-sm">loading selftest…</p>}>
        <DevSelftest />
      </Suspense>
    );
  }

  return (
    <AppShell route={route}>
      <Screen route={route} />
    </AppShell>
  );
}
