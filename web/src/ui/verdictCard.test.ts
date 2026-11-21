// T-077: the verdict card (SPEC SCR-09, §10; AC-062, AC-163, AC-164; SR-07; D-124, D-125) over every case of
// shared/testvectors/verdict.json. No DOM in Vitest: the view model is tested directly and the card is rendered to
// static markup (react-dom/server), then read as text and attributes.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import vectors from '@vectors/verdict.json';
import { createT, STRINGS } from '../core/strings';
import { buildVerdict, compareVerdicts, comparisonHeadline, lineText, type VerdictInput } from '../core/verdict';
import type { VaultItem, Verdict, VerdictComparison } from '../core/types';
import { VerdictCard, type VerdictCardProps } from './components/VerdictCard';
import {
  compareView, LEVEL_ICON, LEVEL_TONE, lineConfidence, lineView, mutedLabel, verdictCardView, type VerdictIconName,
} from './components/verdict/model';
import { VerdictIcon } from './components/verdict/VerdictIcon';
import { SCRUBBED } from '../core/verdict';

type VInput = Omit<VerdictInput, 'vault'> & { vault: string[] };
type BuildCase = { fn: 'build'; name: string; input: VInput };
type CompareCase = { fn: 'compare'; name: string; before: VInput; after: VInput; expect: { riskReduced: boolean } };
const V = vectors as unknown as { vault: Record<string, VaultItem>; cases: (BuildCase | CompareCase)[] };
const builds = V.cases.filter((c): c is BuildCase => c.fn === 'build');
const compares = V.cases.filter((c): c is CompareCase => c.fn === 'compare');
const tr = createT(STRINGS, { strict: true });
const vaultOf = (keys: string[]) => keys.map((k) => V.vault[k] as VaultItem);
const run = (i: VInput): { verdict: Verdict; vault: VaultItem[] } => {
  const vault = vaultOf(i.vault);
  return { verdict: buildVerdict({ ...i, vault }), vault };
};
const cmpOf = (c: CompareCase): { cmp: VerdictComparison; vault: VaultItem[] } => {
  const b = run(c.before);
  const a = run(c.after);
  return { cmp: compareVerdicts(b.verdict, a.verdict), vault: a.vault };
};
const byName = (prefix: string) => {
  const c = builds.find((x) => x.name.startsWith(prefix));
  if (!c) throw new Error(prefix);
  return c;
};

const html = (p: VerdictCardProps) => renderToStaticMarkup(createElement(VerdictCard, p));
const decode = (s: string) => s
  .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// Inline tags join their text; block tags separate it.
const BLOCK = /<\/?(?:p|div|li|ul|h[1-6]|section|button|a|svg|path)\b[^>]*>/g;
const text = (markup: string) => decode(markup.replace(BLOCK, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ');
const S = (id: string, params?: Record<string, string>) => tr(id, params);

const BAND_WORDS = Object.entries(STRINGS).filter(([k]) => k.startsWith('ui.band.')).map(([, v]) => v);
/** A measured distance: digits followed by a length unit. The fixed thresholds in the band words are allowed (SPEC §10.1). */
const DISTANCE = /\d[\d.,]*\s*(?:m|km|metres?|meters?|kilomet(?:re|er)s?|mi|miles?|ft|feet|yards?)\b/i;
const withoutBandWords = (s: string) => BAND_WORDS.reduce((acc, w) => acc.split(w).join(' '), s);

describe('the card over every verdict.json build case', () => {
  for (const c of builds) {
    describe(c.name, () => {
      const { verdict, vault } = run(c.input);
      for (const labels of [true, false]) {
        const markup = html({ verdict, vault, showVaultLabels: labels });
        const body = text(markup);

        it(`labels ${labels ? 'on' : 'off'}: never "safe", never a measured distance, never a pin coordinate (SR-07)`, () => {
          expect(body).not.toMatch(/\bsafe\b/i);
          expect(withoutBandWords(body)).not.toMatch(DISTANCE);
          for (const v of vault) {
            if (!v.pin) continue;
            for (const n of [v.pin.lat, v.pin.lng]) if (!Number.isInteger(n)) expect(body).not.toContain(String(n));
          }
        });

        it(`labels ${labels ? 'on' : 'off'}: headline as a heading, neverLearns always, a live region, GREEN never (AC-163)`, () => {
          const headline = S(`copy.verdict.${verdict.level.toLowerCase()}`);
          expect(markup).toMatch(new RegExp(`<h3[^>]*>${headline.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, '&#x27;')}</h3>`));
          expect(body).toContain(S('copy.verdict.neverLearns'));
          expect(markup).toMatch(/role="status"[^>]*aria-live="polite"/);
          expect(markup).not.toContain('verdict-green');
          expect(markup).toContain(`data-level="${verdict.level}"`);
        });
      }

      it('renders each line as a list item with an icon, its engine text and a confidence (AC-062, AC-164)', () => {
        const markup = html({ verdict, vault, showVaultLabels: false });
        const items = markup.match(/<li[\s\S]*?<\/li>/g) ?? [];
        expect(items.length).toBe(verdict.lines.length);
        if (verdict.lines.length) expect(markup).toContain('<ul');
        items.forEach((li, i) => {
          const line = verdict.lines[i];
          expect(li).toMatch(/<svg[^>]*aria-hidden="true"[^>]*data-icon="\w+"/);
          const t = text(li);
          expect(t).toContain(lineText(line, tr));
          expect(t).toContain(lineConfidence(line, tr));
        });
      });

      it('the model: text = engine text, segments rejoin to it, confidence per the rules', () => {
        const view = verdictCardView(verdict, vault, { showVaultLabels: true, tr });
        expect(view.lines.map((l) => l.text)).toEqual(verdict.lines.map((l) => lineText(l, tr)));
        view.lines.forEach((l, i) => {
          const line = verdict.lines[i];
          expect(l.segments.before + l.segments.kind + l.segments.after).toBe(lineText(line, tr));
          if (line.kind === 'found_on_device') {
            expect(l.confidence).toBeNull();
            expect(l.text.startsWith(S('ui.verdict.onDevice'))).toBe(true);
            return;
          }
          expect(l.confidence?.length).toBeGreaterThan(0);
          if (line.kind === 'match' || line.kind === 'pin_match') {
            expect(l.confidence).toContain(`${line.strength} · attacker confidence ${line.confidence}`);
            if (line.kind === 'pin_match') {
              // amended AC-164 (D-127, D-134): strength, claim confidence AND band confidence, even when equal
              expect(line.bandConfidence).toBeDefined();
              expect(l.confidence).toBe(`${line.strength} · attacker confidence ${line.confidence} · distance: attacker confidence ${line.bandConfidence}`);
            }
          } else if (line.kind === 'pin') {
            expect(l.confidence).toBe(`attacker confidence ${line.confidence}`);
          } else {
            expect(l.confidence).toBe(S('ui.verdict.onDevice'));
            expect(l.confidence).not.toMatch(/confidence/);
          }
          // Colour is never alone: each tone has its own icon.
          expect(l.icon).toBe(({ red: l.kind === 'echo' ? 'eye' : 'alert', amber: 'warn', grey: l.kind === 'found_on_device' ? 'chip' : 'info', teal: 'lock', green: 'check' } as const)[l.tone]);
        });
      });

      if (verdict.level === 'PARTIAL') {
        it('PARTIAL reads as on-device findings only, never as LOW', () => {
          const body = text(html({ verdict, vault }));
          expect(body).toContain(S('copy.verdict.partial'));
          expect(body).not.toContain(S('copy.verdict.low'));
          expect(body).not.toContain('Attacker\'s best guess');
          expect(body).not.toContain('Not linked');
          expect(body).not.toMatch(/attacker confidence/);
        });
      }
      if (verdict.level === 'LOW') {
        it('LOW says it is not a guarantee (SR-07)', () => {
          expect(text(html({ verdict, vault }))).toContain("This isn't a guarantee.");
        });
      }
      if (verdict.noVault) {
        it('empty vault: noVault copy and an Add places link to the vault (AC-166)', () => {
          const markup = html({ verdict, vault });
          expect(text(markup)).toContain(S('copy.verdict.noVault'));
          expect(markup).toMatch(/<a[^>]*href="#\/vault"[^>]*>Add places<\/a>/);
        });
      }
    });
  }
});

describe('the compare header over every verdict.json compare case (SPEC §10.6)', () => {
  for (const c of compares) {
    it(c.name, () => {
      const { cmp, vault } = cmpOf(c);
      const markup = html({ verdict: cmp.after, vault, comparison: cmp });
      const body = text(markup);
      expect(body).not.toMatch(/\bsafe\b/i);
      expect(withoutBandWords(body)).not.toMatch(DISTANCE);
      expect(body).toContain(S('copy.verdict.neverLearns'));
      // one heading, and the after headline is printed exactly once (D-134: no "→ X X")
      const headline = S(`copy.verdict.${cmp.after.level.toLowerCase()}`);
      expect(body.split(headline).length - 1).toBe(1);
      expect((markup.match(/<h3\b/g) ?? []).length).toBe(1);
      if (cmp.after.level === 'PARTIAL') {
        expect(markup).not.toContain('data-compare');
        expect(body).toContain(S('copy.verdict.partial'));
      } else if (c.expect.riskReduced) {
        expect(markup).toContain('data-compare="reduced"');
        expect(markup).toContain('verdict-green');
        expect(body).toContain('Risk reduced:');
      } else if (comparisonHeadline(cmp, tr).copyId === 'copy.verdict.still') {
        expect(markup).toContain('data-compare="still"');
        expect(markup).not.toContain('verdict-green');
        expect(body).toContain('Still exposed:');
      } else {
        // a level headline (e.g. LOW with no risk line left) would repeat the card's own headline: no header
        expect(markup).not.toContain('data-compare');
        expect(markup).not.toContain('verdict-green');
      }
    });
  }

  it('drops the header when the engine gives no headline or the partial copy (verdict.ts review round, D-125)', () => {
    const { cmp } = cmpOf(compares.find((c) => c.expect.riskReduced) as CompareCase);
    expect(compareView(cmp, tr)?.reduced).toBe(true);
    const partialAfter = { ...cmp, riskReduced: false, after: { ...cmp.after, level: 'PARTIAL' as const } };
    expect(compareView(partialAfter, tr)).toBeNull();
    // even an (impossible) riskReduced over a PARTIAL after-verdict gets no green header
    expect(compareView({ ...partialAfter, riskReduced: true }, tr)).toBeNull();
  });
});

describe('vault labels, "Why?", referee row, announcement', () => {
  const demo = run(byName('SCR-09 demo scene').input);

  it('shows the muted label after the KIND when on, hides it when off; a label equal to the KIND is never repeated', () => {
    const on = text(html({ ...demo, showVaultLabels: true }));
    expect(on).toContain('WORKPLACE (City General Hospital)');
    expect(on).toContain("CHILD'S NAME (Lucas): caught and masked on this device (never sent)");
    expect(on).not.toContain('(Home)');
    const off = text(html({ ...demo, showVaultLabels: false }));
    expect(off).not.toContain('City General Hospital');
    expect(off).not.toContain('Lucas');
    // place pins: the KIND is already the label
    const place = byName('place pins');
    const p = run(place.input);
    for (const l of p.verdict.lines) expect(mutedLabel(l, p.vault, true)).toBeNull();
  });

  it('"Why?" is a disclosure: aria-expanded/aria-controls, closed panels hidden, the open one shows reason, clues and route', () => {
    const withWhy = demo.verdict.lines.filter((l) => l.kind !== 'caught');
    const open = withWhy[0];
    const markup = html({ ...demo, defaultOpenLineId: open.id });
    const buttons = markup.match(/<button[^>]*aria-expanded="(true|false)"[^>]*>Why\?<\/button>/g) ?? [];
    expect(buttons.length).toBe(withWhy.length);
    expect(buttons.filter((b) => b.includes('aria-expanded="true"')).length).toBe(1);
    for (const b of buttons) {
      const id = /aria-controls="([^"]+)"/.exec(b)?.[1];
      expect(id).toBeTruthy();
      const panel = new RegExp(`<div id="${id}"([^>]*)>`).exec(markup);
      expect(panel).not.toBeNull();
      expect((panel?.[1] ?? '').includes('hidden')).toBe(!b.includes('aria-expanded="true"'));
    }
    const li = (markup.match(/<li[\s\S]*?<\/li>/g) ?? []).find((x) => x.includes(`data-line-id="${open.id}"`)) ?? '';
    if (open.reason) expect(text(li)).toContain(open.reason);
    if (open.clueIds.length) expect(text(li)).toContain(`Clues: ${open.clueIds.join(', ')}`);
    expect(li).toContain(`data-route="${open.route}"`);
  });

  it('caught, echo and found-on-device lines have no "Why?"', () => {
    const markup = html({ ...run(byName('refused (declined)').input) });
    expect(markup).not.toContain('Why?');
  });

  it('shows "Distances: code" always and the referee route and seconds when given', () => {
    expect(text(html({ ...demo }))).toContain('Distances: code');
    const body = text(html({ ...demo, referee: { route: 'ON_DEVICE', latencyMs: 1300 } }));
    expect(body).toContain('Referee: ON-DEVICE 1.3 s · Distances: code');
  });

  it('announces the headline, after the compare header when there is one', () => {
    expect(verdictCardView(demo.verdict, demo.vault, { showVaultLabels: true, tr }).announcement).toBe(S('copy.verdict.red'));
    const { cmp, vault } = cmpOf(compares.find((c) => c.expect.riskReduced) as CompareCase);
    const view = verdictCardView(cmp.before, vault, { showVaultLabels: true, comparison: cmp, tr });
    const headline = S(`copy.verdict.${cmp.after.level.toLowerCase()}`);
    expect(view.announcement.startsWith('Risk reduced:')).toBe(true);
    expect(view.announcement.endsWith(headline)).toBe(true);
    expect(view.announcement.split(headline).length - 1).toBe(1);
    expect(view.announcement).toBe(view.compare?.isHeadline ? view.compare.text : `${view.compare?.text} ${headline}`);
  });

  it('a vault with no pins (noPins, verdict.ts review round) also gets the Add places prompt', () => {
    const v = { ...run(byName('strength possible').input).verdict, noPins: true } as Verdict;
    expect(verdictCardView(v, [], { showVaultLabels: true, tr }).noVault).toBe(S('copy.verdict.noVault'));
  });

  it('renders the actions slot before neverLearns', () => {
    const markup = html({ ...demo, actions: createElement('button', { type: 'button' }, 'ACT') });
    expect(markup.indexOf('ACT')).toBeLessThan(markup.indexOf('data-never-learns'));
  });
});

describe('fix round (D-134): levels, labels, scrubbing, "Why?", icons, the level-terms header', () => {
  const ICONS: VerdictIconName[] = ['alert', 'warn', 'info', 'lock', 'eye', 'chip', 'check'];

  it('level tones and icons: RED red/alert, AMBER amber/warn, LOW grey/info, PARTIAL grey/chip (PARTIAL never looks like LOW)', () => {
    expect(LEVEL_TONE).toEqual({ RED: 'red', AMBER: 'amber', LOW: 'grey', PARTIAL: 'grey' });
    expect(LEVEL_ICON).toEqual({ RED: 'alert', AMBER: 'warn', LOW: 'info', PARTIAL: 'chip' });
    for (const prefix of ['refused (declined)', 'band city']) {
      const { verdict, vault } = run(byName(prefix).input);
      const markup = html({ verdict, vault });
      const head = /<div data-tone="(\w+)"[^>]*>\s*<span[^>]*>\s*<svg[^>]*data-icon="(\w+)"/.exec(markup);
      expect(head?.slice(1)).toEqual(verdict.level === 'PARTIAL' ? ['grey', 'chip'] : ['grey', 'info']);
      expect(markup).not.toMatch(/data-tone="red"/);
    }
  });

  it('every icon has its own shape, so tones never differ by colour alone (AC-062)', () => {
    const ds = ICONS.map((name) => /\sd="([^"]+)"/.exec(renderToStaticMarkup(createElement(VerdictIcon, { name })))?.[1]);
    expect(new Set(ds).size).toBe(ICONS.length);
  });

  it('labels off: no muted label on any line of any case, place pins included', () => {
    for (const c of builds) {
      const { verdict, vault } = run(c.input);
      for (const l of verdict.lines) expect(mutedLabel(l, vault, false)).toBeNull();
      expect(html({ verdict, vault, showVaultLabels: false })).not.toContain('data-vault-label');
    }
    const place = run(byName('place pins').input);
    expect(place.verdict.lines.length).toBeGreaterThan(0);
    for (const l of place.verdict.lines) expect(mutedLabel(l, place.vault, false)).toBeNull();
  });

  it('the muted label has coordinate-like numbers scrubbed', () => {
    const item: VaultItem = { id: 'v-x', kind: 'employer', label: 'Bay 4.5 Works', aliases: [], createdAt: 0 };
    const line = { ...run(byName('strength possible').input).verdict.lines[0], vaultId: 'v-x', params: { KIND: 'EMPLOYER' } };
    expect(mutedLabel(line, [item], true)).toBe(`Bay ${SCRUBBED} Works`);
  });

  it('"Why?" needs a reason or clues: a match line with neither has none', () => {
    const { verdict, vault } = run(byName('strength possible').input);
    const bare = { ...verdict.lines[0], reason: '', clueIds: [] };
    expect(lineView(bare, vault, true, tr).why).toBeNull();
    expect(html({ verdict: { ...verdict, lines: [bare] }, vault })).not.toContain('Why?');
    expect(lineView({ ...bare, reason: 'shared word' }, vault, true, tr).why).not.toBeNull();
    expect(lineView({ ...bare, clueIds: ['c1'] }, vault, true, tr).why).not.toBeNull();
  });

  it('a level-terms "Risk reduced" header is the heading; the headline is not printed again under it', () => {
    // the engine's own reading (D-128): a reduced header whose {after} is the after headline
    const found = compares.map(cmpOf).find(({ cmp }) => cmp.riskReduced
      && comparisonHeadline(cmp, tr).params.after === S(`copy.verdict.${cmp.after.level.toLowerCase()}`));
    expect(found).toBeDefined();
    const { cmp, vault } = found as { cmp: VerdictComparison; vault: VaultItem[] };
    const view = compareView(cmp, tr);
    expect(view?.isHeadline).toBe(true);
    const markup = html({ verdict: cmp.after, vault, comparison: cmp });
    expect(markup).toMatch(/data-compare="reduced"[\s\S]*?<h3[^>]*>Risk reduced:/);
    const headline = S(`copy.verdict.${cmp.after.level.toLowerCase()}`);
    expect(text(markup).split(headline).length - 1).toBe(1);
  });
});
