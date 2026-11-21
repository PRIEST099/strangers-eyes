// DEV-only Nano check (__SE_DEV_ONLY__). Route #/dev/nano. Never in production builds (App.tsx loads it inside
// import.meta.env.DEV; scripts/check-dist.mjs fails the build if the marker ships).
// Why: Claude cannot drive the user's Chrome (no extension), so this page runs the REAL on-device jobs in whatever
// Chrome opens it and POSTs a small report to the Vite dev server (/__se_dev/nano-report), which writes it OUTSIDE the
// repo. Synthetic data only: a made-up vault (never the user's vault store) and a drawn canvas. The report carries
// routes, latencies, gate notes, counts and clue TYPES; no vault labels and no image bytes.
import { useEffect, useState } from 'react';
import type { AdversaryResult, VaultItem } from '../../core/types';
import { availabilityNow, type NanoIo } from '../../ai/capabilities';
import { referee } from '../../ai/jobs/referee';
import { nanoStep } from '../../ui/check/runPrescreen';

export const DEV_ONLY_MARKER = '__SE_DEV_ONLY__';

interface Report {
  at: string;
  userAgent: string;
  availabilityText: string;
  availabilityImage: string;
  referee?: { route: string; latencyMs: number; matches: number; matchedKinds: string[]; notes: string[]; fallback: string | null };
  prescreen?: { route: string; latencyMs: number; count: number; fallback: string | null };
  error?: string;
}

async function avail(io: NanoIo): Promise<string> {
  try { return await availabilityNow(io); } catch (e) { return `error: ${e instanceof Error ? e.message : String(e)}`; }
}

const NOW = 0;
const VAULT: VaultItem[] = [
  { id: 'dev_v_emp', kind: 'employer', label: 'City General Hospital', aliases: ['CGH'], createdAt: NOW },
  { id: 'dev_v_kid', kind: 'child_name', label: 'Lucas', aliases: [], createdAt: NOW },
];
const ADV: Pick<AdversaryResult, 'inferences' | 'hypotheses'> = {
  inferences: [
    { id: 'i1', kind: 'workplace', value: 'Staff badge suggests the person works at City General', confidence: 'medium', clueIds: [] },
    { id: 'i2', kind: 'venue', value: 'A riverside cafe terrace', confidence: 'low', clueIds: [] },
  ],
  hypotheses: [],
};

function canvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 768;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7aa0c4'; g.fillRect(0, 0, 1024, 420);
  g.fillStyle = '#5b5b5b'; g.fillRect(0, 420, 1024, 348);
  g.fillStyle = '#ffffff'; g.fillRect(140, 120, 740, 150);
  g.fillStyle = '#0a3d91'; g.font = 'bold 64px sans-serif'; g.fillText('CITY GENERAL HOSPITAL', 160, 220);
  g.fillStyle = '#f2d200'; g.fillRect(380, 560, 260, 90);
  g.fillStyle = '#000000'; g.font = 'bold 60px sans-serif'; g.fillText('SE 1234', 400, 625);
  return c;
}

async function runAll(): Promise<Report> {
  const r: Report = {
    at: new Date().toISOString(), userAgent: navigator.userAgent,
    availabilityText: await avail('text'),
    availabilityImage: await avail('image'),
  };
  try {
    const ref = await referee({ sessionId: 'dev-nano-check', adv: ADV, vault: VAULT });
    const kindOf = new Map(VAULT.map((v) => [v.id, v.kind]));
    r.referee = {
      route: ref.route, latencyMs: ref.latencyMs, matches: ref.matches.length,
      matchedKinds: ref.matches.map((m) => `${kindOf.get(m.vaultId) ?? 'other'}:${m.strength}:${m.route}`),
      notes: ref.notes, fallback: ref.fallback,
    };
    const pre = await nanoStep(canvas(), [], { sessionId: 'dev-nano-check', maxPx: 768 });
    r.prescreen = { route: pre.line.route, latencyMs: pre.line.latencyMs, count: pre.line.count, fallback: pre.line.fallback ?? null };
  } catch (e) {
    r.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
  try {
    await fetch('/__se_dev/nano-report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) });
  } catch { /* the page still shows the report */ }
  return r;
}

export default function NanoCheckPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(true);
  const go = () => { setBusy(true); void runAll().then((r) => { setReport(r); setBusy(false); }); };
  useEffect(go, []);
  return (
    <main className="mx-auto max-w-2xl p-6 font-mono text-sm">
      <h1 className="mb-2 text-lg font-bold">Gemini Nano check (DEV)</h1>
      <p className="mb-4">Synthetic vault and image only. The result is also written to a local file for Claude.</p>
      <button type="button" className="mb-4 rounded border px-3 py-1" disabled={busy} onClick={go}>{busy ? 'Running…' : 'Run again'}</button>
      <pre className="whitespace-pre-wrap rounded border p-3" data-testid="nano-report">{report ? JSON.stringify(report, null, 2) : 'running…'}</pre>
    </main>
  );
}
