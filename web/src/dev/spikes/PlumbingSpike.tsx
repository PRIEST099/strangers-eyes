// DEV-only Spike A (T-030): Firebase plumbing (__SE_DEV_ONLY__). Route #/dev/spike. Never in production builds.
// Day-1 spikes predate the Egress Gate, so check-boundaries allowlists direct SDK calls in web/src/dev/spikes/ only.
// It still goes through the fetch tripwire: each call is granted a permit, and the scanner is a no-op because this page
// sends no vault data (fixed test text only).
import { useState } from 'react';
import { getGenerativeModel, InferenceMode, InferenceSource } from 'firebase/ai';
import { getToken } from 'firebase/app-check';
import { ai, appCheck, appCheckDebugSkipped, authReady } from '../../firebase/init';
import { setVaultScanner, tripwire } from '../../ai/tripwire';

export const DEV_ONLY_MARKER = '__SE_DEV_ONLY__';
const MODELS = ['gemini-3.8-flash', 'gemini-4-hydrogen'] as const;
const PROMPT = 'Reply with exactly the word: pong';

interface Row { model: string; ok: boolean; source?: string; text?: string; ms: number; error?: string }
interface Report { uid: string | null; appCheckToken: 'obtained' | string; debugTokenSkipped: boolean; rows: Row[] }

setVaultScanner(() => null); // this spike sends only the fixed PROMPT above; no vault exists in this flow

async function callModel(model: string): Promise<Row> {
  const t0 = performance.now();
  const id = `spikeA-${model}-${Date.now()}`;
  tripwire.grantCloud({ id, scanText: true });
  try {
    const m = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { model } });
    const res = await m.generateContent(PROMPT);
    const r = res.response;
    return { model, ok: r.inferenceSource === InferenceSource.IN_CLOUD, source: r.inferenceSource, text: r.text().trim().slice(0, 80), ms: Math.round(performance.now() - t0) };
  } catch (e) {
    tripwire.revokeCloud(id);
    return { model, ok: false, ms: Math.round(performance.now() - t0), error: String((e as Error)?.message ?? e).slice(0, 300) };
  }
}

export default function PlumbingSpike() {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const uid = await authReady;
    let appCheckToken: Report['appCheckToken'];
    try {
      const t = await getToken(appCheck, false);
      appCheckToken = t.token ? 'obtained' : 'empty';
    } catch (e) {
      appCheckToken = `error: ${String((e as Error)?.message ?? e).slice(0, 200)}`;
    }
    const rows: Row[] = [];
    for (const model of MODELS) rows.push(await callModel(model));
    setReport({ uid: uid ? `${uid.slice(0, 4)}… (anonymous)` : null, appCheckToken, debugTokenSkipped: appCheckDebugSkipped, rows });
    setBusy(false);
  }

  return (
    <main className="mx-auto max-w-3xl p-6 font-mono text-sm" data-dev-only={DEV_ONLY_MARKER}>
      <h1 className="mb-2 text-lg font-semibold">Spike A: Firebase plumbing (DEV)</h1>
      <p className="mb-4 text-zinc-400">
        App Check debug token: {appCheckDebugSkipped ? 'SKIPPED (?appcheck-debug=off): calls should fail' : 'from .env.development.local'}
      </p>
      <button id="spike-run" className="rounded border px-3 py-2" disabled={busy} onClick={() => void run()}>
        {busy ? 'running…' : 'Run Spike A'}
      </button>
      {report && <pre id="spike-json" className="mt-4 whitespace-pre-wrap rounded bg-black/40 p-3 text-xs">{JSON.stringify(report, null, 1)}</pre>}
    </main>
  );
}
