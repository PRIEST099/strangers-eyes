// DEV-only page (__SE_DEV_ONLY__): #/dev/verdicts, the T-077 verdict card over shared/testvectors/verdict.json cases,
// so the card can be seen before the attack step exists. Absent from production builds (App.tsx imports it under
// import.meta.env.DEV). Synthetic open-ocean vault only (the vectors' own fake items); no network, no AI calls.
import { useState } from 'react';
import vectors from '@vectors/verdict.json';
import { buildVerdict, compareVerdicts, type VerdictInput } from '../../core/verdict';
import { t } from '../../core/strings';
import type { VaultItem, Verdict, VerdictComparison } from '../../core/types';
import { Button } from '../../ui/components/Button';
import { VerdictCard } from '../../ui/components/VerdictCard';

type VInput = Omit<VerdictInput, 'vault'> & { vault: string[] };
type Case = { fn: 'build' | 'compare'; name: string; input?: VInput; before?: VInput; after?: VInput };
const V = vectors as unknown as { vault: Record<string, VaultItem>; cases: Case[] };

const vaultOf = (keys: readonly string[]): VaultItem[] => keys.map((k) => V.vault[k]).filter((v): v is VaultItem => !!v);
const find = (fn: Case['fn'], prefix: string): Case => {
  const c = V.cases.find((x) => x.fn === fn && x.name.startsWith(prefix));
  if (!c) throw new Error(`verdict.json: no ${fn} case "${prefix}"`);
  return c;
};

interface Sample { title: string; verdict: Verdict; vault: VaultItem[]; comparison: VerdictComparison | null; openFirst?: boolean }

function build(prefix: string, title: string, openFirst = false): Sample {
  const c = find('build', prefix);
  const i = c.input as VInput;
  const vault = vaultOf(i.vault);
  return { title, verdict: buildVerdict({ ...i, vault }), vault, comparison: null, openFirst };
}
function compare(prefix: string, title: string): Sample {
  const c = find('compare', prefix);
  const b = c.before as VInput;
  const a = c.after as VInput;
  const bv = vaultOf(b.vault);
  const av = vaultOf(a.vault);
  const cmp = compareVerdicts(buildVerdict({ ...b, vault: bv }), buildVerdict({ ...a, vault: av }));
  return { title, verdict: cmp.after, vault: av, comparison: cmp };
}

const SAMPLES: Sample[] = [
  build('SCR-09 demo scene', 'RED: SCR-09 demo scene (pin, pin_match, caught, not linked)', true),
  build('pin_match: one combined line', 'RED: pin_match with a separate band confidence'),
  build('echo next to a match', 'RED: exact match + echo'),
  build('strength possible', 'AMBER: possible match'),
  build('band city', 'LOW: city band only'),
  build('refused (declined)', 'PARTIAL: refused, on-device findings only'),
  build('empty vault: neighbourhood', 'Empty vault: best guess + Add places'),
  compare('level drop RED to AMBER', 'Compare: Risk reduced (green header)'),
  compare('no improvement', 'Compare: Still exposed'),
  compare('PARTIAL after', 'Compare: PARTIAL after (no compare header)'),
];

export default function VerdictGallery() {
  const [labels, setLabels] = useState(true);
  // Only the selected card announces (its live region); the others stay quiet, so ten cards never speak at once.
  const [selected, setSelected] = useState(0);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 bg-canvas p-4 text-fg sm:p-6" data-dev-only="__SE_DEV_ONLY__">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Verdict card gallery (DEV)</h1>
        <Button aria-pressed={labels} onClick={() => setLabels((x) => !x)}>
          Vault labels: {labels ? 'on' : 'off'}
        </Button>
      </div>
      {SAMPLES.map((s, i) => (
        <section
          key={s.title}
          className="flex flex-col gap-2"
          aria-label={s.title}
          data-selected={i === selected}
          onFocusCapture={() => setSelected(i)}
          onPointerDown={() => setSelected(i)}
        >
          <h2 className="font-mono text-xs text-muted">{s.title}</h2>
          <VerdictCard
            announce={i === selected}
            verdict={s.verdict}
            vault={s.vault}
            comparison={s.comparison}
            showVaultLabels={labels}
            referee={{ route: s.verdict.level === 'PARTIAL' ? 'RULES_ONLY' : 'ON_DEVICE', latencyMs: 1300 }}
            defaultOpenLineId={s.openFirst ? (s.verdict.lines.find((l) => l.kind !== 'caught')?.id ?? null) : null}
            actions={
              <>
                <Button variant="primary">{t('copy.fix.button')}</Button>
                <Button>Export as is</Button>
              </>
            }
          />
        </section>
      ))}
    </main>
  );
}
