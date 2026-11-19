// DEV-only page (__SE_DEV_ONLY__): #/dev/selftest. Absent from production builds (App.tsx imports it under import.meta.env.DEV).
import { useEffect, useState } from 'react';
import { runSelfTest, type SelfTestReport } from './selftest';

export default function SelftestPage() {
  const [report, setReport] = useState<SelfTestReport | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    runSelfTest()
      .then((r) => { if (live) setReport(r); })
      .catch((e) => { if (live) setFatal(String(e)); });
    return () => { live = false; };
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-6 font-mono text-sm" data-dev-only="__SE_DEV_ONLY__">
      <h1 className="mb-4 text-lg font-semibold">Tier-0 selftest (DEV)</h1>
      {fatal && <p id="selftest-status" data-ok="false" className="text-red-400">FATAL {fatal}</p>}
      {!report && !fatal && <p id="selftest-status" data-ok="pending">running…</p>}
      {report && (
        <>
          <p id="selftest-status" data-ok={String(report.ok)} className={report.ok ? 'text-emerald-400' : 'text-red-400'}>
            {report.ok ? 'ALL PASS' : 'FAIL'}
          </p>
          <ul className="my-4 space-y-1">
            {Object.entries(report.steps).map(([name, s]) => (
              <li key={name}>
                <span className={s.ok ? 'text-emerald-400' : 'text-red-400'}>{s.ok ? 'PASS' : 'FAIL'}</span> {name} ({s.ms} ms)
                {s.error && <span className="text-red-400"> {s.error}</span>}
              </li>
            ))}
          </ul>
          <pre id="selftest-json" className="overflow-x-auto whitespace-pre-wrap rounded bg-black/40 p-3 text-xs">
            {JSON.stringify(report, null, 1)}
          </pre>
        </>
      )}
    </main>
  );
}
