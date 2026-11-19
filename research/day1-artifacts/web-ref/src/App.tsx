import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { runSelfTest } from './selftest';

export default function App() {
  const [out, setOut] = useState('running');
  const { offlineReady: [offlineReady] } = useRegisterSW({ immediate: true });
  useEffect(() => {
    runSelfTest().then((r) => setOut(JSON.stringify(r, null, 1))).catch((e) => setOut('FATAL ' + String(e)));
  }, []);
  return (
    <main>
      <p id="sw">offlineReady={String(offlineReady)}</p>
      <pre id="out">{out}</pre>
    </main>
  );
}
