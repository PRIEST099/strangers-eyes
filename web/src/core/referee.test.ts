import { describe, expect, it } from 'vitest';
import vectors from '@vectors/referee.json';
import enums from '@prompts/enums.v1.json';
import {
  acronym, claimReadings, geoPairs, isGenericLabel, KIND_COMPAT, mergeMatches, refereeClaims, refereeVaultItems, RULES_NOTE,
  RULES_REFEREE_COPY_ID, rulesReferee, rulesStrength, type GeoPairs, type RefereeClaim, type RefereeRule, type RefereeVaultItem,
} from './referee';
import { isGenericVaultString } from '../vault/vaultStore';
import { STRINGS } from './strings';
import { DEFAULT_FUZZY_THRESHOLD, tokens } from '../tier0/fuzzy';
import {
  INFERENCE_KINDS, STRENGTHS, VAULT_KINDS, type AdversaryResult, type MatchStrength, type RefereeMatch, type VaultItem,
} from './types';

// ---------- shared/testvectors/referee.json (SPEC §10.7, AC-168: the iOS XCTest port runs the same file) ----------

type VCase =
  | { fn: 'strength'; name: string; ac?: string; claim: Omit<RefereeClaim, 'id' | 'clueIds'>; vault: string; threshold?: number;
      expect: { strength: MatchStrength | null; rule?: RefereeRule } }
  | { fn: 'vaultItems'; name: string; ac?: string; items: VaultItem[]; expect: RefereeVaultItem[] }
  | { fn: 'referee'; name: string; ac?: string; claims: RefereeClaim[]; vault: string[]; expect: { matches: RefereeMatch[] } }
  | { fn: 'merge'; name: string; device: RefereeMatch[]; rules: RefereeMatch[]; geo?: GeoPairs; expect: { matches: RefereeMatch[]; notes: string[] } };
type Fn = VCase['fn'];

const V = vectors as unknown as {
  description: string; conventions: string[]; threshold: number; vault: Record<string, RefereeVaultItem>; cases: VCase[];
};
const FNS: readonly Fn[] = ['strength', 'referee', 'merge', 'vaultItems'];
const casesOf = <F extends Fn>(fn: F) => V.cases.filter((c): c is Extract<VCase, { fn: F }> => c.fn === fn);
const item = (key: string): RefereeVaultItem => {
  const v = V.vault[key];
  if (!v) throw new Error(`referee.json: unknown vault item ${key}`);
  return v;
};
const RULES: readonly RefereeRule[] = ['exact_a', 'exact_b', 'likely_a', 'likely_b', 'likely_c', 'possible_a', 'possible_b'];

describe('referee.json is well formed', () => {
  it('is self-describing, uses only known functions, and covers each of them', () => {
    expect(V.description.length).toBeGreaterThan(0);
    expect(V.conventions.length).toBeGreaterThan(0);
    for (const c of V.cases) expect(FNS).toContain(c.fn);
    for (const fn of FNS) expect(casesOf(fn).length, fn).toBeGreaterThan(0);
  });
  it('names every case uniquely within its function', () => {
    for (const fn of FNS) {
      const names = casesOf(fn).map((c) => c.name);
      expect(new Set(names).size, fn).toBe(names.length);
    }
  });
  it('uses the RC default threshold, known kinds, no coordinates and only defined items', () => {
    expect(V.threshold).toBe(DEFAULT_FUZZY_THRESHOLD);
    for (const v of Object.values(V.vault)) {
      expect(VAULT_KINDS).toContain(v.kind);
      expect(Object.keys(v).sort()).toEqual(['aliases', 'id', 'kind', 'label']);
    }
    for (const c of casesOf('strength')) expect(V.vault[c.vault], c.name).toBeDefined();
    for (const c of casesOf('referee')) for (const k of c.vault) expect(V.vault[k], c.name).toBeDefined();
  });
  it('covers every §10.3 rule, every strength and null, and the AC-165 / AC-167 rows', () => {
    const s = casesOf('strength');
    for (const r of RULES) expect(s.some((c) => c.expect.rule === r), r).toBe(true);
    for (const st of [...STRENGTHS, null]) expect(s.some((c) => c.expect.strength === st), String(st)).toBe(true);
    expect(s.filter((c) => c.ac === 'AC-165').length).toBeGreaterThanOrEqual(4);
    expect(V.cases.some((c) => 'ac' in c && c.ac === 'AC-167')).toBe(true);
  });
});

describe('rulesStrength (referee.json)', () => {
  for (const c of casesOf('strength')) {
    it(c.name, () => {
      const got = rulesStrength({ id: 'x', clueIds: [], ...c.claim }, item(c.vault), c.threshold ?? V.threshold);
      expect(got?.strength ?? null).toBe(c.expect.strength);
      if (c.expect.rule) expect(got?.rule).toBe(c.expect.rule);
    });
  }
});

describe('rulesReferee (referee.json)', () => {
  for (const c of casesOf('referee')) {
    it(c.name, () => {
      expect(rulesReferee(c.claims, c.vault.map(item), V.threshold)).toEqual(c.expect.matches);
    });
  }
});

describe('refereeVaultItems (referee.json)', () => {
  for (const c of casesOf('vaultItems')) {
    it(c.name, () => {
      const out = refereeVaultItems(c.items);
      expect(out).toEqual(c.expect);
      expect(JSON.stringify(out)).not.toMatch(/"pin"|lat|lng|accuracyM/);
    });
  }
});

describe('mergeMatches (referee.json)', () => {
  for (const c of casesOf('merge')) {
    it(c.name, () => {
      expect(mergeMatches(c.device, c.rules, c.geo)).toEqual(c.expect);
    });
  }
});

// ---------- code-level properties ----------

describe('KIND_COMPAT (SPEC §17.4)', () => {
  it('is enums.v1.json, covers every claim kind and names only vault kinds', () => {
    expect(KIND_COMPAT).toBe(enums.KIND_COMPAT);
    expect(Object.keys(KIND_COMPAT).sort()).toEqual([...INFERENCE_KINDS, 'area'].sort());
    for (const ks of Object.values(KIND_COMPAT)) for (const k of ks) expect(VAULT_KINDS).toContain(k);
  });
  it('pins the SPEC §17.4 rows', () => {
    expect(KIND_COMPAT.workplace).toEqual(['work_pin', 'employer', 'descriptor']);
    expect(KIND_COMPAT.school).toEqual(['school_pin', 'school_name', 'descriptor']);
    expect(KIND_COMPAT.home_area).toEqual(['home_pin', 'area_name', 'street_name', 'house_number']);
    expect([...KIND_COMPAT.area].sort()).toEqual(['area_name', 'home_pin', 'place_pin', 'school_pin', 'street_name', 'work_pin']);
    // "other" = all text kinds (§17.2): never a pin
    expect([...KIND_COMPAT.other].sort()).toEqual(VAULT_KINDS.filter((k) => !k.endsWith('_pin')).sort());
  });
  it('an unknown claim kind (a bad cast, or a prototype key) links nothing', () => {
    const v = item('work');
    for (const kind of ['constructor', 'toString', 'bogus']) {
      expect(rulesStrength({ id: 'x', kind: kind as never, value: 'City General Hospital', confidence: 'high', clueIds: [] }, v)).toBeNull();
    }
  });
});

describe('referee inputs', () => {
  const adv: Pick<AdversaryResult, 'inferences' | 'hypotheses'> = {
    inferences: [
      { id: 'i1', kind: 'workplace', value: 'hospital staff lanyard logo', confidence: 'medium', clueIds: ['c1', 'c2'] },
      { id: 'i2', kind: 'transit_line', value: 'Route 9 bus', confidence: 'low', clueIds: [] },
    ],
    hypotheses: [{ id: 'h1', label: 'Northside', level: 'district', lat: 10.5, lng: -30.25, radiusKm: 2, confidence: 'high', clueIds: ['c3'] }],
  };
  it('CLAIMS = inferences, then hypotheses as kind area with their label (no coordinates)', () => {
    const claims = refereeClaims(adv);
    expect(claims).toEqual([
      { id: 'i1', kind: 'workplace', value: 'hospital staff lanyard logo', confidence: 'medium', clueIds: ['c1', 'c2'] },
      { id: 'i2', kind: 'transit_line', value: 'Route 9 bus', confidence: 'low', clueIds: [] },
      { id: 'h1', kind: 'area', value: 'Northside', confidence: 'high', clueIds: ['c3'] },
    ]);
    expect(JSON.stringify(claims)).not.toMatch(/10\.5|30\.25|radius|lat|lng/);
    claims[0].clueIds = [];
    expect(adv.inferences[0].clueIds).toEqual(['c1', 'c2']);   // copies, not aliases
  });

  const pin = { lat: 10.123456, lng: -30.654321, accuracyM: 5, capturedAt: 0, source: 'synthetic' as const };
  const vault: VaultItem[] = [
    { id: 'v-home', kind: 'home_pin', label: 'Home', aliases: ['Maple Cottage'], pin, createdAt: 0 },
    { id: 'v-flat', kind: 'home_pin', label: '  ', aliases: [], pin, createdAt: 0 },
    { id: 'v-work', kind: 'work_pin', label: 'City General Hospital', aliases: ['CGH', 'Work'], pin, createdAt: 0 },
    { id: 'v-kid', kind: 'child_name', label: 'Lucas', aliases: [], createdAt: 0 },
  ];
  it('AC-167: a labelled work pin is a referee item (kind + label, no coordinates); a "Home" pin is not', () => {
    const items = refereeVaultItems(vault);
    expect(items).toEqual([
      { id: 'v-work', kind: 'work_pin', label: 'City General Hospital', aliases: ['CGH'] },
      { id: 'v-kid', kind: 'child_name', label: 'Lucas', aliases: [] },
    ]);
    expect(JSON.stringify(items)).not.toMatch(/10\.12|30\.65|"pin"|lat|lng/);
  });
  it('rulesReferee skips generic pins even when given raw vault items', () => {
    const claims: RefereeClaim[] = [{ id: 'i1', kind: 'home_area', value: 'Maple Cottage', confidence: 'high', clueIds: [] }];
    expect(rulesReferee(claims, vault)).toEqual([]);
    expect(rulesReferee(claims, refereeVaultItems(vault))).toEqual([]);
  });
  it('empty claims or an empty vault give no matches', () => {
    expect(rulesReferee([], refereeVaultItems(vault))).toEqual([]);
    expect(rulesReferee(refereeClaims(adv), [])).toEqual([]);
  });
  it('does not mutate its inputs and copies clue ids', () => {
    const claims = refereeClaims(adv);
    const items = refereeVaultItems(vault);
    const before = JSON.stringify([claims, items]);
    const out = rulesReferee(claims, items);
    expect(JSON.stringify([claims, items])).toBe(before);
    expect(out.length).toBeGreaterThan(0);
    out[0].clueIds.push('zz');
    expect(claims[0].clueIds).toEqual(['c1', 'c2']);
  });
});

describe('rules details', () => {
  const work = item('work');
  const claim = (value: string, over: Partial<RefereeClaim> = {}): RefereeClaim =>
    ({ id: 'i1', kind: 'workplace', value, confidence: 'medium', clueIds: [], ...over });

  it('acronym skips function words and needs 3 letters', () => {
    expect(acronym(tokens('City General Hospital'))).toBe('cgh');
    expect(acronym(tokens('Bank of the West'))).toBe('bw');
    expect(acronym(tokens("St. Mary's Primary"))).toBe('smp');
    expect(rulesStrength(claim('BW staff'), { id: 'v', kind: 'employer', label: 'Bank of the West', aliases: [] })).toBeNull();
  });
  it('a pair of function words is never a 2-token run', () => {
    const bank = { id: 'v', kind: 'employer' as const, label: 'Bank of the West', aliases: [] };
    expect(rulesStrength(claim('north of the river'), bank)).toBeNull();
    expect(rulesStrength(claim('bank of'), bank)?.rule).toBe('exact_b');
  });
  it('the threshold is the RC fuzzy threshold: a stricter one rejects a misspelling', () => {
    const bakery = item('bakery');
    expect(rulesStrength(claim('Lanturn Bakery'), bakery, 0.8)?.strength).toBe('exact');
    expect(rulesStrength(claim('Lanturn Bakers'), bakery, 0.9)).toBeNull();
  });
  it('the multi-token artefact "name tag" counts only as a run', () => {
    expect(rulesStrength(claim('hospital name tag'), work)?.rule).toBe('likely_c');
    expect(rulesStrength(claim('hospital tag with a name'), work)?.rule).toBe('possible_a');
  });
  it('the strongest string wins across label and aliases; 3(b) only when nothing else holds', () => {
    const cgh = item('employerCgh');
    expect(rulesStrength(claim('CGH badge', { confidence: 'high' }), cgh)?.rule).toBe('exact_a');
    expect(rulesStrength(claim('hospital lanyard', { confidence: 'high' }), cgh)?.rule).toBe('likely_c');
    expect(rulesStrength(claim('a nurse', { confidence: 'high' }), cgh)?.rule).toBe('possible_a');
  });
  it('digit kinds never match a substring or share tokens with the text rules', () => {
    const phone = { id: 'v', kind: 'phone' as const, label: '+44 20 7946 0958', aliases: [] };
    const other = (value: string) => claim(value, { kind: 'other' });
    expect(rulesStrength(other('call +44 20 7946 0958 now'), phone)?.rule).toBe('exact_a');
    expect(rulesStrength(other('call +44 20 7946 0959 now'), phone)).toBeNull();   // not a 2-token run "44 20"
    expect(rulesStrength(other('number 7946 on a van'), phone)).toBeNull();        // not a distinctive token
  });
  it('D-94: a shared non-generic alias token also qualifies for 3(b), only at high confidence', () => {
    const v = { id: 'v', kind: 'employer' as const, label: 'Lantern Bakery', aliases: ['Elm Co'] };
    expect(rulesStrength(claim('Elm Avenue depot', { confidence: 'high' }), v)?.rule).toBe('possible_b');
    expect(rulesStrength(claim('Elm Avenue depot', { confidence: 'medium' }), v)).toBeNull();
  });
  it('every reason is at most 12 words (RefereeMatch.reason)', () => {
    for (const c of casesOf('referee')) for (const m of c.expect.matches) expect(m.reason.split(/\s+/).length).toBeLessThanOrEqual(12);
  });
});

describe('claim readings (F-121) and the generic test', () => {
  it('scores every matcher reading: possessive removed, format characters as spaces, spaced letters joined', () => {
    expect(claimReadings("works at Max's")).toContainEqual(['works', 'at', 'max']);
    expect(claimReadings('Max\u02BCs van')).toContainEqual(['max', 'van']);   // U+02BC apostrophe, as in the matcher
    expect(claimReadings('Lucas\u200Bschool')).toEqual(expect.arrayContaining([['lucasschool'], ['lucas', 'school']]));
    expect(claimReadings('L U C A S')).toContainEqual(['lucas']);
    expect(claimReadings('Saint Road')).toEqual([['st', 'rd']]);   // folded, no duplicate readings
    expect(claimReadings('Lucas\u200B')).toEqual([['lucas']]);   // a trailing ZWSP reads the same both ways: one reading
  });
  it('isGenericLabel is the vault store\'s isGenericVaultString (one judgement, U+02BC included)', () => {
    for (const s of ['', '  ', 'Home', 'my home', 'WORK', 'Work.', '\u02BC', '\u2019', '&', '#', 'Lucas', 'St.', 'Hospital', 'Maple Cottage']) {
      expect(isGenericLabel(s), JSON.stringify(s)).toBe(isGenericVaultString(s));
    }
  });
});

describe('labels and notes', () => {
  it('the rules referee is labelled copy.ref.rules (SCR-09), which exists in the strings file', () => {
    expect(RULES_REFEREE_COPY_ID).toBe('copy.ref.rules');
    expect(STRINGS[RULES_REFEREE_COPY_ID]).toBeTruthy();
  });
  it('the union note is +rules (SPEC SCR-14)', () => {
    expect(RULES_NOTE).toBe('+rules');
  });
  it('mergeMatches does not mutate or alias its inputs', () => {
    const device: RefereeMatch[] = [{ claimId: 'i1', vaultId: 'v', strength: 'possible', reason: 'r', clueIds: ['c1'], route: 'ON_DEVICE' }];
    const rules: RefereeMatch[] = [{ claimId: 'i1', vaultId: 'v', strength: 'exact', reason: 'named in the claim', clueIds: ['c1'], route: 'RULES_ONLY' }];
    const before = JSON.stringify([device, rules]);
    const { matches } = mergeMatches(device, rules);
    expect(JSON.stringify([device, rules])).toBe(before);
    matches[0].clueIds.push('zz');
    expect(rules[0].clueIds).toEqual(['c1']);
  });
});

describe('geoPairs (D-168)', () => {
  it('names the area claims and the pin items by id, nothing else', () => {
    const claims: RefereeClaim[] = [
      { id: 'i1', kind: 'workplace', value: 'a hospital', confidence: 'high', clueIds: [] },
      { id: 'h1', kind: 'area', value: 'Berlin, Germany', confidence: 'medium', clueIds: [] },
    ];
    const items: RefereeVaultItem[] = [
      { id: 'w', kind: 'work_pin', label: 'City General Hospital', aliases: [] },
      { id: 'e', kind: 'employer', label: 'City General Hospital', aliases: [] },
      { id: 'h', kind: 'home_pin', label: 'Home', aliases: [] },
    ];
    expect(geoPairs(claims, items)).toEqual({ areaClaimIds: ['h1'], pinVaultIds: ['w', 'h'] });
  });
  it('leaves out an area id that also names a non-area claim (a collision caps, never drops)', () => {
    const claims: RefereeClaim[] = [
      { id: 'h1', kind: 'home_area', value: 'Elm Park area', confidence: 'high', clueIds: [] },
      { id: 'h1', kind: 'area', value: 'Berlin, Germany', confidence: 'medium', clueIds: [] },
      { id: 'h2', kind: 'area', value: 'Potsdam', confidence: 'low', clueIds: [] },
    ];
    expect(geoPairs(claims, []).areaClaimIds).toEqual(['h2']);
  });
});
