// Scaffold shell (T-023). The real hash router and screens arrive in M2 (ARCH §3.4).
// DEV-only routes are loaded with a dynamic import inside `import.meta.env.DEV`, so they are absent from production (AC-065).
import { lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent } from 'react';

const useHash = () => {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
};

const DevSelftest: LazyExoticComponent<ComponentType> | null = import.meta.env.DEV
  ? lazy(() => import('./dev/selftest/SelftestPage'))
  : null;

export default function App() {
  const hash = useHash();

  if (DevSelftest && hash.startsWith('#/dev/selftest')) {
    return (
      <Suspense fallback={<p className="p-6 font-mono text-sm">loading selftest…</p>}>
        <DevSelftest />
      </Suspense>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Strangers' Eyes</h1>
      <p className="text-zinc-300">See your photo the way a stalker's AI would, before you post it.</p>
      <p className="text-sm text-zinc-500">Work in progress: the check flow is being built.</p>
      {import.meta.env.DEV && (
        <a className="text-sm text-sky-400 underline" href="#/dev/selftest">Run the Tier-0 selftest (DEV)</a>
      )}
    </main>
  );
}
