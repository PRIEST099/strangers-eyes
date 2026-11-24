import { describe, expect, it } from 'vitest';
import vectors from '@vectors/verdict.json';
import en from '@strings/en.json';
import {
  BAND_SEVERITY, bestGuessCopy, buildVerdict, compareVerdicts, comparisonHeadline, headlineCopyId, highCount, lineText,
  notLinkedCopy, scrubAttackerText, scrubNumbers, SCRUBBED, worstPinBand, type VerdictAdv, type VerdictInput,
} from './verdict';
import { rulesReferee, refereeClaims, refereeVaultItems } from './referee';
import { bandRank, DEFAULT_BANDS_M } from './geo';
import { createT, STRINGS } from './strings';
import {
  CONF, DISTANCE_BANDS, LEVELS, STRENGTHS,
  type AdversaryHypothesis, type Confidence, type Inference, type MatchStrength, type RefereeMatch,
  type VaultItem, type Verdict, type VerdictLevel,
} from './types';

// ---------- shared/testvectors/verdict.json (SPEC §10.7, AC-160, AC-168: the iOS XCTest port runs the same file) ----------

type VInput = Omit<VerdictInput, 'vault'> & { vault: string[] };
type Copy = { copyId: string; params: Record<string, string> };
type BuildCase = {
  fn: 'build'; name: string; ac?: string; input: VInput;
  expect: Omit<Verdict, 'matches'> & { matches?: RefereeMatch[]; headlineId: string; texts: string[]; bestGuessText: string | null; notLinkedText: string | null };
};
type CompareCase = {
  fn: 'compare'; name: string; ac?: string; before: VInput; after: VInput;
  expect: { riskReduced: boolean; worstRemainingLineId: string | null; headline: Copy };
};
type ScrubCase = { fn: 'scrub'; name: string; mode: 'attacker' | 'label'; input: string; expect: string };
const V = vectors as unknown as { description: string; conventions: string[]; vault: Record<string, VaultItem>; cases: (BuildCase | CompareCase | ScrubCase)[] };
const builds = V.cases.filter((c): c is BuildCase => c.fn === 'build');
const compares = V.cases.filter((c): c is CompareCase => c.fn === 'compare');
const scrubs = V.cases.filter((c): c is ScrubCase => c.fn === 'scrub');
const tr = createT(STRINGS, { strict: true });
const vaultOf = (keys: string[]): VaultItem[] => keys.map((k) => {
  const v = V.vault[k];
  if (!v) throw new Error(`verdict.json: unknown vault key ${k}`);
  return v;
});
const run = (i: VInput): Verdict => buildVerdict({ ...i, vault: vaultOf(i.vault) });
const textOf = (c: Copy | null) => (c ? tr(c.copyId, c.params) : null);

describe('verdict.json is well formed', () => {
  it('is self-describing, names cases uniquely and uses only build and compare', () => {
    expect(V.description.length).toBeGreaterThan(0);
    expect(V.conventions.length).toBeGreaterThan(0);
    for (const c of V.cases) expect(['build', 'compare', 'scrub']).toContain(c.fn);
    const names = V.cases.map((c) => `${c.fn}:${c.name}`);
    expect(new Set(names).size).toBe(names.length);
  });
  it('covers every band, every strength, empty vault, refused, echo, caught and Risk reduced true and false (AC-160)', () => {
    const lines = builds.flatMap((c) => c.expect.lines);
    for (const b of DISTANCE_BANDS) expect(builds.some((c) => c.expect.pinBands.some((p) => p.band === b)), b).toBe(true);
    for (const s of STRENGTHS) expect(lines.some((l) => l.strength === s), s).toBe(true);
    for (const k of ['pin', 'match', 'pin_match', 'caught', 'echo', 'found_on_device']) expect(lines.some((l) => l.kind === k), k).toBe(true);
    for (const lv of ['RED', 'AMBER', 'LOW', 'PARTIAL']) expect(builds.some((c) => c.expect.level === lv), lv).toBe(true);
    expect(builds.some((c) => c.expect.noVault)).toBe(true);
    expect(builds.some((c) => c.expect.noPins && !c.expect.noVault)).toBe(true);
    expect(scrubs.some((c) => c.mode === 'attacker') && scrubs.some((c) => c.mode === 'label')).toBe(true);
    expect(compares.some((c) => c.expect.riskReduced)).toBe(true);
    expect(compares.some((c) => !c.expect.riskReduced)).toBe(true);
  });
  it('uses synthetic open-ocean pins only', () => {
    for (const v of Object.values(V.vault)) {
      if (!v.pin) continue;
      expect(Math.abs(v.pin.lat)).toBeLessThan(1);
      expect(v.pin.lng).toBe(-30.5);
      expect(v.pin.source).toBe('synthetic');
    }
  });
});

describe('buildVerdict passes verdict.json (AC-160, AC-164, AC-166)', () => {
  for (const c of builds) {
    it(c.name, () => {
      const v = run(c.input);
      const { headlineId, texts, bestGuessText, notLinkedText, matches, ...verdict } = c.expect;
      const { matches: gotMatches, ...got } = v;
      expect(got).toEqual(verdict);
      if (matches) expect(gotMatches).toEqual(matches);
      expect(headlineCopyId(v.level)).toBe(headlineId);
      expect(v.lines.map((l) => lineText(l, tr))).toEqual(texts);
      expect(textOf(bestGuessCopy(v))).toBe(bestGuessText);
      expect(textOf(notLinkedCopy(v, vaultOf(c.input.vault)))).toBe(notLinkedText);
    });
  }
});

describe('compareVerdicts passes verdict.json (AC-194, SPEC §10.6)', () => {
  for (const c of compares) {
    it(c.name, () => {
      const cmp = compareVerdicts(run(c.before), run(c.after));
      expect(cmp.riskReduced).toBe(c.expect.riskReduced);
      expect(cmp.worstRemainingLineId).toBe(c.expect.worstRemainingLineId);
      const h = comparisonHeadline(cmp, tr);
      expect(h).toEqual(c.expect.headline);
      expect(h.copyId === 'copy.verdict.reduced').toBe(cmp.riskReduced);
      expect(tr(h.copyId, h.params)).not.toMatch(/\bsafe\b/i);
    });
  }
});

// ---------- copy: no "safe", no metres, every attacker line carries a confidence ----------

/** The only numbers allowed in rendered verdict text: the fixed thresholds the band words name (D-77). */
const BAND_WORD_NUMBERS = /within (250 m|1 km|5 km)/g;
function assertCleanText(s: string) {
  expect(s).not.toMatch(/\bsafe\b/i);
  expect(s.replace(BAND_WORD_NUMBERS, '')).not.toMatch(/\d/);
}

describe('verdict copy', () => {
  it('uses copy IDs that exist, and none of them says "safe" (SR-07)', () => {
    const ids = new Set<string>();
    for (const c of builds) {
      ids.add(c.expect.headlineId);
      for (const l of c.expect.lines) ids.add(l.copyId);
    }
    for (const c of compares) ids.add(c.expect.headline.copyId);
    for (const id of [...ids, 'copy.verdict.neverLearns', 'copy.verdict.noVault', 'copy.verdict.bestGuess', 'copy.verdict.notLinked']) {
      expect((en as Record<string, string>)[id], id).toBeDefined();
      expect(STRINGS[id]).not.toMatch(/\bsafe\b/i);
    }
  });
  it('renders vector lines with no measured distance and every attacker line with a confidence (AC-164)', () => {
    for (const c of builds) {
      const v = run(c.input);
      for (const l of v.lines) {
        // Vector labels are digit-free except the plate/house kinds, which never appear in a line.
        assertCleanText(lineText(l, tr));
        if (l.kind === 'pin' || l.kind === 'match' || l.kind === 'pin_match') expect(CONF, `${c.name} ${l.id}`).toContain(l.confidence);
        if (l.kind === 'match' || l.kind === 'pin_match') expect(STRENGTHS).toContain(l.strength);
        if (l.kind === 'pin_match') expect(CONF).toContain(l.bandConfidence);
        expect(l.severity).not.toBe('NONE');
      }
    }
  });
});

describe('scrub vectors (D-115, D-127)', () => {
  for (const c of scrubs) {
    it(c.name, () => {
      const out = (c.mode === 'attacker' ? scrubAttackerText : scrubNumbers)(c.input);
      expect(out).toBe(c.expect);
      if (c.mode === 'attacker') expect(out).not.toMatch(/[\p{Nd}\u00B2\u00B3\u00B9\u2070-\u2079]/u);
    });
  }
});

describe('scrubNumbers', () => {
  it('replaces decimals and degree expressions, keeps integers', () => {
    expect(scrubNumbers('at 0.512, -30.611 by the quay')).toBe(`at ${SCRUBBED}, ${SCRUBBED} by the quay`);
    expect(scrubNumbers('12,34 and 5°N')).toBe(`${SCRUBBED} and ${SCRUBBED}N`);
    expect(scrubNumbers('５１．５ north')).toBe(`${SCRUBBED} north`);
    expect(scrubNumbers('Platform 9, house 14')).toBe('Platform 9, house 14');
  });
});

// ---------- properties (seeded, deterministic) ----------

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const BASE_LAT = 0.5;
const BASE_LNG = -30.5;
const PROP_VAULT: VaultItem[] = [
  { id: 'p-home', kind: 'home_pin', label: 'Home', aliases: [], pin: { lat: BASE_LAT, lng: BASE_LNG, accuracyM: 0, capturedAt: 0, source: 'synthetic' }, createdAt: 0 },
  { id: 'p-work', kind: 'work_pin', label: 'City General Hospital', aliases: [], pin: { lat: BASE_LAT + 0.02, lng: BASE_LNG, accuracyM: 0, capturedAt: 0, source: 'synthetic' }, createdAt: 0 },
  { id: 'p-emp', kind: 'employer', label: 'Lantern Bakery', aliases: [], createdAt: 0 },
  { id: 'p-kid', kind: 'child_name', label: 'Lucas', aliases: [], createdAt: 0 },
  { id: 'p-elm', kind: 'street_name', label: 'Elm Street', aliases: [], createdAt: 0 },
];
const RADII = [0.1, 0.3, 0.8, 2, 4, 12, 40, 300, 900];

function randomInput(r: () => number): VerdictInput {
  const n = Math.floor(r() * 4);
  const hyps: AdversaryHypothesis[] = Array.from({ length: n }, (_, i) => ({
    id: `h${i + 1}`, label: pick(r, ['Quay area', 'North side', 'near 22 Acacia Avenue, within 300 m', 'about 1 234 m from 0.512, -30.611']), level: pick(r, LEVELS),
    lat: BASE_LAT + (r() - 0.5) * pick(r, [0.002, 0.02, 0.2, 2]), lng: BASE_LNG + (r() - 0.5) * pick(r, [0.002, 0.02, 0.2]),
    radiusKm: pick(r, RADII), confidence: pick(r, CONF), clueIds: [`c${i + 1}`],
  }));
  const infs: Inference[] = Array.from({ length: Math.floor(r() * 3) }, (_, i) => ({
    id: `i${i + 1}`, kind: 'workplace', value: 'x', confidence: pick(r, CONF), clueIds: [`c${i + 5}`],
  }));
  const claimIds = [...infs.map((x) => x.id), ...hyps.map((h) => h.id)];
  const matches: RefereeMatch[] = [];
  for (const c of claimIds) {
    for (const v of PROP_VAULT) {
      if (r() < 0.25) matches.push({ claimId: c, vaultId: v.id, strength: pick(r, STRENGTHS), reason: 'r', clueIds: [], route: 'RULES_ONLY' });
    }
  }
  const vault = PROP_VAULT.filter(() => r() < 0.8);
  return {
    adv: { status: pick(r, ['ok', 'ok', 'ok', 'no_location_signal']), hypotheses: hyps, inferences: infs },
    matches, vault,
    caught: vault.filter(() => r() < 0.2).map((v) => ({ vaultId: v.id, route: 'ON_DEVICE' as const })),
    echoedVaultIds: vault.filter(() => r() < 0.15).map((v) => v.id),
    refused: r() < 0.1,
  };
}
const LEVEL_RANK: Record<VerdictLevel, number> = { LOW: 0, AMBER: 1, RED: 2, PARTIAL: -1 };
const STRENGTH_UP: Record<MatchStrength, MatchStrength> = { possible: 'likely', likely: 'exact', exact: 'exact' };
const CASES = 400;

describe('properties', () => {
  it('no coordinate, radius or measured distance ever reaches the view model', () => {
    const r = rng(1);
    for (let k = 0; k < CASES; k++) {
      const input = randomInput(r);
      const v = buildVerdict(input);
      const json = JSON.stringify(v);
      const secret = [
        ...input.vault.flatMap((x) => (x.pin ? [x.pin.lat, x.pin.lng] : [])),
        ...(input.adv?.hypotheses ?? []).flatMap((h) => [h.lat, h.lng, h.radiusKm]),
      ];
      for (const n of secret) if (!Number.isInteger(n)) expect(json).not.toContain(String(n));
      expect(json).not.toMatch(/\d\.\d/);
      for (const p of v.pinBands) expect(p.effectiveKm).toBeNull();
      for (const l of v.lines) assertCleanText(lineText(l, tr));
      const bg = bestGuessCopy(v);
      if (bg) assertCleanText(tr(bg.copyId, bg.params));
    }
  });

  it('is deterministic and ignores the order of the matches', () => {
    const r = rng(2);
    for (let k = 0; k < CASES; k++) {
      const input = randomInput(r);
      const a = buildVerdict(input);
      expect(buildVerdict(input)).toEqual(a);
      expect(buildVerdict({ ...input, matches: [...input.matches].reverse() })).toEqual(a);
    }
  });

  it('monotonic: a closer band (smaller radius) never lowers the level or coarsens the worst band', () => {
    const r = rng(3);
    for (let k = 0; k < CASES; k++) {
      const input = randomInput(r);
      const adv = input.adv as VerdictAdv;
      if (adv.hypotheses.length === 0) continue;
      const j = Math.floor(r() * adv.hypotheses.length);
      const closer = { ...input, adv: { ...adv, hypotheses: adv.hypotheses.map((h, i) => (i === j ? { ...h, radiusKm: Math.max(0.1, h.radiusKm / 4) } : h)) } };
      const a = buildVerdict(input);
      const b = buildVerdict(closer);
      expect(LEVEL_RANK[b.level]).toBeGreaterThanOrEqual(LEVEL_RANK[a.level]);
      expect(bandRank(worstPinBand(b))).toBeLessThanOrEqual(bandRank(worstPinBand(a)));
      expect(highCount(b)).toBeGreaterThanOrEqual(highCount(a));
    }
  });

  it('monotonic: a stronger match, an echo or a new match never lowers the level; caught never changes it', () => {
    const r = rng(4);
    for (let k = 0; k < CASES; k++) {
      const input = randomInput(r);
      const a = buildVerdict(input);
      const stronger = buildVerdict({ ...input, matches: input.matches.map((m) => ({ ...m, strength: STRENGTH_UP[m.strength] })) });
      expect(LEVEL_RANK[stronger.level]).toBeGreaterThanOrEqual(LEVEL_RANK[a.level]);
      const echo = buildVerdict({ ...input, echoedVaultIds: input.vault.map((v) => v.id) });
      expect(LEVEL_RANK[echo.level]).toBeGreaterThanOrEqual(LEVEL_RANK[a.level]);
      const caught = buildVerdict({ ...input, caught: input.vault.map((v) => ({ vaultId: v.id, route: 'RULES_ONLY' as const })) });
      expect(caught.level).toBe(a.level);
    }
  });

  it('every vault item is on a line or Not linked, never both; lines sort by severity; ids are unique', () => {
    const r = rng(5);
    const ORDER = { HIGH: 0, MEDIUM: 1, INFO: 2, NONE: 3, CAUGHT: 4 } as const;
    for (let k = 0; k < CASES; k++) {
      const input = randomInput(r);
      const v = buildVerdict(input);
      const ids = v.lines.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (let i = 1; i < v.lines.length; i++) expect(ORDER[v.lines[i].severity]).toBeGreaterThanOrEqual(ORDER[v.lines[i - 1].severity]);
      if (v.level === 'PARTIAL') continue;
      const onLine = new Set(v.lines.map((l) => l.vaultId));
      for (const item of input.vault) expect(onLine.has(item.id) !== v.notLinkedVaultIds.includes(item.id), item.id).toBe(true);
      for (const l of v.lines) if (l.kind === 'pin' || l.kind === 'match' || l.kind === 'pin_match') expect(CONF).toContain(l.confidence);
    }
  });

  it('compareVerdicts: never reduced against itself, never both ways, never with PARTIAL or a level rise; headers never raw', () => {
    const r = rng(6);
    const rank = { RED: 2, AMBER: 1, LOW: 0, PARTIAL: -1 } as const;
    let reducedSeen = 0;
    for (let k = 0; k < CASES * 2; k++) {
      // Same vault on both sides (the re-attack of one photo), so reductions actually occur.
      const ia = randomInput(r);
      const ib = { ...randomInput(r), vault: ia.vault };
      const a = buildVerdict(ia);
      const b = buildVerdict(ib);
      expect(compareVerdicts(a, a).riskReduced).toBe(false);
      const ab = compareVerdicts(a, b);
      const ba = compareVerdicts(b, a);
      expect(ab.riskReduced && ba.riskReduced).toBe(false);
      if (a.level === 'PARTIAL' || b.level === 'PARTIAL') expect(ab.riskReduced).toBe(false);
      if (ab.riskReduced) {
        reducedSeen++;
        expect(rank[b.level]).toBeLessThanOrEqual(rank[a.level]);
        expect(bandRank(worstPinBand(b))).toBeGreaterThanOrEqual(bandRank(worstPinBand(a)));
        expect(highCount(b)).toBeLessThanOrEqual(highCount(a));
      }
      for (const c of [ab, ba]) {
        const h = comparisonHeadline(c, tr);
        const text = tr(h.copyId, h.params);
        expect(text).not.toMatch(/\bsafe\b/i);
        expect(text).not.toMatch(/\b(RED|AMBER|LOW|PARTIAL)\b/);
        if (c.after.level === 'PARTIAL') expect(h.copyId).toBe('copy.verdict.partial');
      }
    }
    expect(reducedSeen).toBeGreaterThan(0);
  });
});

// ---------- with the real rules referee ----------

describe('buildVerdict over rulesReferee (the rules-only path end to end)', () => {
  it('the AC-165 lanyard claim against a work pin gives "Linked to your WORKPLACE" with attacker confidence', () => {
    const vault: VaultItem[] = [PROP_VAULT[1]];
    const adv: VerdictAdv & { hypotheses: AdversaryHypothesis[]; inferences: Inference[] } = {
      status: 'ok', hypotheses: [],
      inferences: [{ id: 'i1', kind: 'workplace', value: 'hospital staff lanyard logo', confidence: 'high' as Confidence, clueIds: ['c2'] }],
    };
    const matches = rulesReferee(refereeClaims(adv), refereeVaultItems(vault));
    const v = buildVerdict({ adv, matches, vault });
    expect(v.level).toBe('RED');
    expect(v.lines.map((l) => lineText(l, tr))).toEqual(['Linked to your WORKPLACE']);
    expect(v.lines[0]).toMatchObject({ strength: 'likely', confidence: 'high', route: 'RULES_ONLY', clueIds: ['c2'] });
  });
  it('severity tables match SPEC §10.1', () => {
    expect(BAND_SEVERITY).toEqual({ street: 'HIGH', neighbourhood: 'HIGH', district: 'MEDIUM', city: 'INFO', country: 'NONE', none: 'NONE' });
    expect(DEFAULT_BANDS_M.street).toBe(250);
  });
  it('levels never include GREEN', () => {
    const all = new Set<string>();
    const r = rng(7);
    for (let k = 0; k < 100; k++) all.add(buildVerdict(randomInput(r)).level);
    for (const l of all) expect(['RED', 'AMBER', 'LOW', 'PARTIAL']).toContain(l);
  });
});

describe('bestGuessCopy: level and confidence, never the guessed place (misuse hardening, Nov 24)', () => {
  it('has no label parameter and its text never contains the hypothesis label', () => {
    const tr = createT(STRINGS, { strict: true });
    const v = buildVerdict({
      adv: {
        status: 'ok', inferences: [],
        hypotheses: [{ id: 'h1', label: 'Zanzibar Quay Plaza', level: 'street', lat: 1.5, lng: 2.5, radiusKm: 0.2, confidence: 'high', clueIds: [] }],
      },
      matches: [], vault: [],
    });
    expect(v.bestGuess?.label).toBe('Zanzibar Quay Plaza'); // kept for on-device code only
    const bg = bestGuessCopy(v);
    expect(bg).toEqual({ copyId: 'copy.verdict.bestGuess', params: { level: 'street', confidence: 'high' } });
    const text = bg ? tr(bg.copyId, bg.params) : '';
    expect(text).toBe("Attacker's best guess: street level · attacker confidence high");
    expect(text).not.toContain('Zanzibar');
    expect(STRINGS['copy.verdict.bestGuess']).not.toContain('{label}');
  });
});
