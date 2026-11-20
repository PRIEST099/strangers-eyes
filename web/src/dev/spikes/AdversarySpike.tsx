// DEV-only Spike B page (T-031), route #/dev/adversary. __SE_DEV_ONLY__ Never in production builds.
// Unattended use: benchmark/spike/run-spike.mjs opens `/?autorun=dry|live[&photos=01,02][&models=flash,hydrogen][&probe=u12]#/dev/adversary`
// in headless Chrome and polls window.__advSpike. The page shows counts only, never coordinates or place names.
import { useEffect, useState } from 'react';
import { parseOptions, runSpike, type SpikeState } from './adversaryRun';

export const DEV_ONLY_MARKER = '__SE_DEV_ONLY__';

export default function AdversarySpike() {
  const [snap, setSnap] = useState<SpikeState | null>(null);

  useEffect(() => {
    const opts = parseOptions(self.location.search);
    if (opts) {
      // Strip the trigger first: a reload or a remount must never start the run again (review blocker). No navigation fires.
      self.history.replaceState(null, '', self.location.pathname + self.location.hash);
      void runSpike(opts);
    }
    const t = setInterval(() => setSnap(globalThis.__advSpike ? { ...globalThis.__advSpike } : null), 1000);
    return () => clearInterval(t);
  }, []);

  const photos = snap?.result?.photos ?? [];
  const primary = snap?.result?.primary ?? '';
  return (
    <main className="mx-auto max-w-4xl p-6 font-mono text-sm" data-dev-only={DEV_ONLY_MARKER}>
      <h1 className="mb-2 text-lg font-semibold">Spike B: adversary pass B (G1 / G1b) (DEV)</h1>
      <p className="mb-4 text-zinc-400">
        Calls sent: {snap?.result?.callsSent ?? 0}. Start with <code>?autorun=dry</code> or <code>?autorun=live</code> before the hash. State: {snap?.state ?? 'idle'}
      </p>
      <table className="mb-4 w-full text-xs">
        <thead><tr><th className="text-left">photo</th><th>type</th><th>faces</th><th>primary runs (status / band)</th><th>other</th><th>fix</th></tr></thead>
        <tbody>
          {photos.map((p) => (
            <tr key={p.id}>
              <td>{p.id}</td>
              <td>{p.placeType}</td>
              <td>{p.faces.found}</td>
              <td>{p.runs.filter((r) => r.model === primary && r.kind === 'before').map((r) => `${r.status}/${r.band ?? '-'}`).join('  ')}</td>
              <td>{p.runs.filter((r) => r.model !== primary).map((r) => `${r.status}/${r.band ?? '-'}`).join('  ')}</td>
              <td>{p.fix ? (p.fix.skipped ? 'skipped' : `${p.fix.medianBeforeBand} → ${p.runs.find((r) => r.kind === 'fix')?.status ?? '…'}/${p.runs.find((r) => r.kind === 'fix')?.band ?? '-'}`) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <pre id="spike-log" className="whitespace-pre-wrap rounded bg-black/40 p-3 text-xs">{snap?.log.join('\n')}</pre>
    </main>
  );
}
