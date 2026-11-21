// T-055: the Vault UI's pure parts and static markup (SPEC SCR-04, SCR-19; AC-082, AC-085, AC-270 at unit level).
// Behaviour through the components' own hooks (hold to confirm, pending burn, list refresh, manual coordinates) is in
// vaultBehaviour.test.ts.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { STRINGS, t } from '../core/strings';
import { VAULT_KINDS, type Pin, type VaultItem } from '../core/types';
import { BurnPendingError, VaultCorruptError, VaultLockedError } from '../vault/crypto';
import { VaultValidationError, type VaultValidationCode } from '../vault/vaultStore';
import {
  BurnVaultDialog, burnFailurePhase, HOLD_IDLE, HOLD_MS, holdProgress, holdStep, isOutside, phaseAfter, type HoldState,
} from './components/BurnVaultDialog';
import { PinButton } from './components/PinButton';
import {
  areaToSave, buildNewItems, buildPatch, DETAIL_KINDS, groupOf, KIND_HINT, KIND_LABEL, parseAliases, PLACE_KINDS,
  vaultError, vaultErrorForAdd, VaultItemForm, type VaultFormValues,
} from './components/VaultItemForm';
import { burnNotice, describeItem, groupItems, Vault } from './screens/Vault';
import { termsOf } from '../ai/vaultScan';
import { refereeVaultItems, rulesReferee } from '../core/referee';
import { DEFAULT_FUZZY_THRESHOLD, matchWords } from '../tier0/fuzzy';

const ALL_CODES: VaultValidationCode[] = [
  'full', 'label_too_long', 'alias_too_long', 'too_many_aliases', 'label_required', 'bad_kind', 'pin_required',
  'pin_not_allowed', 'bad_pin', 'bad_id', 'duplicate_id', 'bad_link', 'bad_timestamp', 'not_found', 'bad_item',
];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const gpsPin: Pin = { lat: 51.123456, lng: -0.987654, accuracyM: 35.4, capturedAt: 1, source: 'geolocation' };
const item = (over: Partial<VaultItem>): VaultItem => ({ id: 'vi_0123456789ab', kind: 'child_name', label: 'Lucas', aliases: [], createdAt: 1, ...over });
const values = (over: Partial<VaultFormValues>): VaultFormValues => ({ kind: 'home_pin', label: '', aliasesText: '', area: '', pin: gpsPin, ...over });

describe('vaultError: every store error has copy (T-054 "From T-054" list)', () => {
  it.each(ALL_CODES)('%s maps to an existing string', (code) => {
    const v = vaultError(new VaultValidationError(code));
    expect(Object.hasOwn(STRINGS, v.copy), v.copy).toBe(true);
  });

  it('maps the user-facing codes to their own copy and field', () => {
    const m = (code: VaultValidationCode) => vaultError(new VaultValidationError(code));
    expect(m('full')).toEqual({ copy: 'copy.vault.full', field: 'form' });   // AC-082
    expect(m('label_too_long')).toEqual({ copy: 'ui.vault.error.labelTooLong', field: 'label' });
    expect(m('label_required')).toEqual({ copy: 'ui.vault.error.labelRequired', field: 'label' });
    expect(m('alias_too_long')).toEqual({ copy: 'ui.vault.error.aliasTooLong', field: 'aliases' });
    expect(m('too_many_aliases')).toEqual({ copy: 'ui.vault.error.tooManyAliases', field: 'aliases' });
    expect(m('pin_required')).toEqual({ copy: 'ui.vault.error.pinRequired', field: 'pin' });
    expect(m('bad_pin')).toEqual({ copy: 'ui.vault.error.badPin', field: 'pin' });
    expect(m('not_found')).toEqual({ copy: 'ui.vault.error.notFound', field: 'form' });
    expect(m('bad_kind')).toEqual({ copy: 'ui.vault.error.badKind', field: 'form' });
    for (const c of ['pin_not_allowed', 'bad_id', 'duplicate_id', 'bad_link', 'bad_timestamp', 'bad_item'] as const) {
      expect(m(c)).toEqual({ copy: 'ui.vault.error.invalid', field: 'form' });
    }
  });

  it('maps VaultCorruptError, BurnPendingError, an unknown code and anything else', () => {
    expect(vaultError(new VaultCorruptError()).copy).toBe('ui.vault.error.corrupt');
    expect(vaultError(new BurnPendingError('se-vault-data')).copy).toBe('ui.vault.error.burnPending');
    expect(vaultError(new VaultValidationError('nope' as VaultValidationCode))).toEqual({ copy: 'ui.vault.error.invalid', field: 'form' });
    expect(vaultError(new VaultLockedError()).copy).toBe('ui.vault.error.saveFailed');
    expect(vaultError(new Error('quota')).copy).toBe('ui.vault.error.saveFailed');
    expect(vaultError('x', 'ui.vault.error.loadFailed').copy).toBe('ui.vault.error.loadFailed');
  });

  it('never words copy.vault.full or any vault error as "safe" (AC-304) and never names coordinates', () => {
    for (const id of Object.keys(STRINGS).filter((k) => k.startsWith('ui.vault.') || k.startsWith('ui.burn.'))) {
      expect(STRINGS[id], id).not.toMatch(/\bsafe\b/i);
    }
  });
});

describe('kinds (SPEC §17.2)', () => {
  it('splits the 16 kinds into 4 places and 12 details, each with a name', () => {
    expect([...PLACE_KINDS]).toEqual(['home_pin', 'work_pin', 'school_pin', 'place_pin']);
    expect(DETAIL_KINDS).toHaveLength(12);
    expect(new Set([...PLACE_KINDS, ...DETAIL_KINDS])).toEqual(new Set(VAULT_KINDS));
    for (const k of VAULT_KINDS) expect(Object.hasOwn(STRINGS, KIND_LABEL[k]), k).toBe(true);
    expect(groupOf('home_pin')).toBe('place');
    expect(groupOf('area_name')).toBe('detail');
  });

  it('labels area_name and street_name "Home area" and "Home street" (SCR-04, D-63), with format hints for digit kinds', () => {
    expect(t(KIND_LABEL.area_name)).toBe('Home area');
    expect(t(KIND_LABEL.street_name)).toBe('Home street');
    expect(Object.keys(KIND_HINT).sort()).toEqual(['house_number', 'phone', 'plate']);
  });
});

describe('form values → store calls', () => {
  it('a home pin with a real area name adds the pin plus a linked area_name, in one call', () => {
    const r = buildNewItems(values({ label: 'Home', area: ' Elm Quarter ' }), () => 'vi_aaaaaaaaaaaa');
    expect(r).toEqual({
      ok: true,
      items: [
        { id: 'vi_aaaaaaaaaaaa', kind: 'home_pin', label: 'Home', aliases: [], pin: gpsPin },
        { kind: 'area_name', label: 'Elm Quarter', aliases: [], linkedPinId: 'vi_aaaaaaaaaaaa' },
      ],
    });
  });

  it('links the area to THIS pin: linkedPinId is the id the pin was given (a fresh id per save)', () => {
    let n = 0;
    const newId = () => `vi_${(++n).toString(16).padStart(12, '0')}`;
    const a = buildNewItems(values({ area: 'Elm Quarter' }), newId);
    const b = buildNewItems(values({ area: 'Birch Row' }), newId);
    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(a.items[0].id).toBe('vi_000000000001');
    expect(a.items[1].linkedPinId).toBe(a.items[0].id);
    expect(b.items[1].linkedPinId).toBe(b.items[0].id);
    expect(b.items[0].id).not.toBe(a.items[0].id);
    expect(a.items[1].id).toBeUndefined();   // the store gives the area its own id
  });

  it('a full refusal of a home pin plus its area says the area counts as a second item (D-99)', () => {
    expect(vaultErrorForAdd(new VaultValidationError('full'), 2)).toEqual({ copy: 'ui.vault.error.fullWithArea', field: 'area' });
    expect(vaultErrorForAdd(new VaultValidationError('full'), 1)).toEqual({ copy: 'copy.vault.full', field: 'form' });
    expect(vaultErrorForAdd(new VaultValidationError('label_too_long'), 2)).toEqual({ copy: 'ui.vault.error.labelTooLong', field: 'label' });
    expect(vaultErrorForAdd(new Error('x'), 2).copy).toBe('ui.vault.error.saveFailed');
  });

  it('creates no area item for an empty or generic area (T-054: a generic one would fail the whole add)', () => {
    expect(areaToSave('home_pin', '   ')).toBeNull();
    expect(areaToSave('home_pin', 'Home')).toBeNull();
    expect(areaToSave('home_pin', 'place')).toBeNull();
    expect(areaToSave('work_pin', 'Elm Quarter')).toBeNull();   // only Home pins offer an area (D-63)
    const r = buildNewItems(values({ area: 'Home' }), () => 'vi_aaaaaaaaaaaa');
    expect(r.ok && r.items).toHaveLength(1);
  });

  it('refuses a place without a pin, before any store call', () => {
    expect(buildNewItems(values({ pin: null }))).toEqual({ ok: false, error: { copy: 'ui.vault.error.pinRequired', field: 'pin' } });
  });

  it('refuses a label or area over 40 characters inline, counting code points like the store (AC-082, D-79)', () => {
    expect(buildNewItems(values({ label: 'x'.repeat(41) }))).toEqual({ ok: false, error: { copy: 'ui.vault.error.labelTooLong', field: 'label' } });
    expect(buildNewItems(values({ label: 'x'.repeat(40) })).ok).toBe(true);
    expect(buildNewItems(values({ label: '😀'.repeat(40) })).ok).toBe(true);   // 80 UTF-16 units, 40 code points
    expect(buildNewItems(values({ area: 'y'.repeat(41) }))).toEqual({ ok: false, error: { copy: 'ui.vault.error.labelTooLong', field: 'area' } });
  });

  it('a detail is one item with its trimmed value and comma-separated aliases', () => {
    expect(parseAliases(' CGH , ,City Gen,')).toEqual(['CGH', 'City Gen']);
    expect(buildNewItems(values({ kind: 'employer', label: ' City General Hospital ', aliasesText: 'CGH, City Gen', pin: null }))).toEqual({
      ok: true, items: [{ kind: 'employer', label: 'City General Hospital', aliases: ['CGH', 'City Gen'] }],
    });
  });

  it('refuses more than 5 aliases or one over 40 characters on the aliases field', () => {
    const six = 'a,b,c,d,e,f';
    expect(buildNewItems(values({ kind: 'employer', label: 'X Corp', aliasesText: six, pin: null }))).toEqual({
      ok: false, error: { copy: 'ui.vault.error.tooManyAliases', field: 'aliases' },
    });
    expect(buildNewItems(values({ kind: 'employer', label: 'X Corp', aliasesText: `ok, ${'z'.repeat(41)}`, pin: null }))).toEqual({
      ok: false, error: { copy: 'ui.vault.error.aliasTooLong', field: 'aliases' },
    });
  });

  it('an edit patches the label, the aliases of a detail, and the pin only when it was replaced', () => {
    const home = item({ kind: 'home_pin', label: 'Home', pin: gpsPin, aliases: ['Nest'] });
    expect(buildPatch(values({ label: 'Home ', pin: gpsPin }), home)).toEqual({ ok: true, patch: { label: 'Home' } });
    const moved: Pin = { ...gpsPin, lat: 1 };
    expect(buildPatch(values({ label: 'Home', pin: moved }), home)).toEqual({ ok: true, patch: { label: 'Home', pin: moved } });
    expect(buildPatch(values({ label: 'Home', pin: null }), home).ok).toBe(false);
    const kid = item({});
    expect(buildPatch(values({ kind: 'child_name', label: 'Lucas', aliasesText: 'Luke', pin: null }), kid)).toEqual({
      ok: true, patch: { label: 'Lucas', aliases: ['Luke'] },
    });
  });
});

describe('describeItem: the list never shows coordinates (D-92)', () => {
  it('shows a located pin by kind and accuracy, with the low-accuracy warning above 250 m', () => {
    const v = describeItem(item({ kind: 'work_pin', label: 'City General Hospital', pin: gpsPin }));
    expect(v).toEqual({ name: 'City General Hospital', kind: 'Work', detail: 'Accuracy about ±36 m', warning: null });   // 35.4 m, rounded up
    const far = describeItem(item({ kind: 'home_pin', label: '', pin: { ...gpsPin, accuracyM: 900 } }));
    expect(far.name).toBe('Home');
    expect(far.warning).toBe(t('copy.vault.lowAccuracy', { m: 900 }));
  });

  it('shows a manual pin as entered by hand', () => {
    expect(describeItem(item({ kind: 'place_pin', label: 'Gym', pin: { ...gpsPin, accuracyM: 0, source: 'manual' } })).detail)
      .toBe(t('ui.vault.pin.manual'));
  });

  it('no item view contains any digit of the coordinates', () => {
    const views = [
      describeItem(item({ kind: 'home_pin', label: 'Home', pin: gpsPin })),
      describeItem(item({ kind: 'school_pin', label: '', pin: { ...gpsPin, source: 'manual' } })),
    ];
    const text = JSON.stringify(views);
    expect(text).not.toMatch(/51[.,]12|0[.,]98|123456|987654/);
  });

  it('groups places and details in stored order, and shows a linked area and aliases', () => {
    const a = item({ id: 'vi_aaaaaaaaaaaa', kind: 'home_pin', label: 'Home', pin: gpsPin });
    const b = item({ id: 'vi_bbbbbbbbbbbb', kind: 'area_name', label: 'Elm Quarter', linkedPinId: a.id });
    const c = item({ id: 'vi_cccccccccccc', kind: 'employer', label: 'City General Hospital', aliases: ['CGH'] });
    expect(groupItems([b, a, c])).toEqual({ places: [a], details: [b, c] });
    expect(describeItem(b).detail).toBe(t('ui.vault.linkedArea'));
    expect(describeItem(c).detail).toBe('Also: CGH');
  });
});

describe('hold to confirm (SCR-19: 1.5 s, no checkbox)', () => {
  const run = (events: Array<[ 'press' | 'release' | 'tick' | 'cancel', number]>): HoldState =>
    events.reduce<HoldState>((s, [type, at]) => holdStep(s, { type, at }), HOLD_IDLE);

  it('fires only once the hold has lasted 1.5 s', () => {
    expect(HOLD_MS).toBe(1500);
    expect(run([['press', 0], ['tick', 1499]]).phase).toBe('holding');
    expect(run([['press', 0], ['tick', 1500]]).phase).toBe('fired');
    expect(run([['press', 100], ['tick', 1599]]).phase).toBe('holding');
  });

  it('a release before 1.5 s abandons the hold; a release at or after it fires (a late timer never cheats)', () => {
    expect(run([['press', 0], ['release', 1000]]).phase).toBe('idle');
    expect(run([['press', 0], ['release', 1000], ['tick', 1600]]).phase).toBe('idle');
    expect(run([['press', 0], ['release', 1500]]).phase).toBe('fired');
  });

  it('key auto-repeat never restarts the hold, and cancel (blur, pointer cancel) abandons it', () => {
    expect(run([['press', 0], ['press', 1000], ['tick', 1500]]).phase).toBe('fired');
    expect(run([['press', 0], ['cancel', 700], ['tick', 1500]]).phase).toBe('idle');
    expect(run([['press', 0], ['cancel', 700], ['press', 800], ['tick', 2299]]).phase).toBe('holding');
    expect(run([['press', 0], ['cancel', 700], ['press', 800], ['tick', 2300]]).phase).toBe('fired');
  });

  it('a tick or release while idle does nothing; fired stays fired', () => {
    expect(run([['tick', 5000], ['release', 6000]]).phase).toBe('idle');
    expect(run([['press', 0], ['tick', 1500], ['cancel', 1600], ['press', 1700]]).phase).toBe('fired');
  });

  it('progress runs 0 → 1 over the hold', () => {
    expect(holdProgress(HOLD_IDLE, 99)).toBe(0);
    expect(holdProgress({ phase: 'holding', since: 0 }, 750)).toBe(0.5);
    expect(holdProgress({ phase: 'holding', since: 0 }, 9999)).toBe(1);
    expect(holdProgress({ phase: 'holding', since: 10 }, 0)).toBe(0);
    expect(holdProgress({ phase: 'fired' }, 0)).toBe(1);
  });

  it('a captured pointer outside the button box has slid off it (edges count as inside)', () => {
    const r = { left: 10, top: 20, right: 110, bottom: 64 };
    expect(isOutside(r, 10, 20)).toBe(false);
    expect(isOutside(r, 110, 64)).toBe(false);
    expect(isOutside(r, 60, 40)).toBe(false);
    expect(isOutside(r, 9.9, 40)).toBe(true);
    expect(isOutside(r, 110.1, 40)).toBe(true);
    expect(isOutside(r, 60, 19)).toBe(true);
    expect(isOutside(r, 60, 65)).toBe(true);
  });

  it('an outcome while closed starts the next open at the confirm step, except a pending burn (D-99)', () => {
    expect(phaseAfter('done', true)).toBe('done');
    expect(phaseAfter('error', true)).toBe('error');
    expect(phaseAfter('pending', true)).toBe('pending');
    expect(phaseAfter('done', false)).toBe('confirm');
    expect(phaseAfter('error', false)).toBe('confirm');
    expect(phaseAfter('pending', false)).toBe('pending');
    expect(burnNotice('done', true)).toBeNull();
    expect(burnNotice('done', false)).toBe('copy.burn.done');
    expect(burnNotice('pending', false)).toBe('ui.burn.pending');
    expect(burnNotice('error', false)).toBe('ui.burn.failed');
  });

  it('BurnPendingError is pending (never "Vault burned."); anything else is an error', () => {
    expect(burnFailurePhase(new BurnPendingError('se-ledger'))).toBe('pending');
    expect(burnFailurePhase(new Error('x'))).toBe('error');
    expect(burnFailurePhase(undefined)).toBe('error');
  });
});

describe('static markup', () => {
  const vaultHtml = renderToStaticMarkup(createElement(Vault, {}));

  it('Vault: one <h1>, the lock badge text exactly copy.vault.lock (AC-085), the explainer, both Add buttons and Burn vault', () => {
    expect([...vaultHtml.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1])).toEqual([t('ui.screen.vault')]);
    const badge = /<p data-vault-lock=""[^>]*>(.*?)<\/p>/.exec(vaultHtml)?.[1] ?? '';
    expect(badge.replace(/<svg[\s\S]*?<\/svg>/, '')).toBe(esc(t('copy.vault.lock')));
    expect(badge).toContain('aria-hidden="true"');
    expect(vaultHtml).toContain(esc(t('copy.vault.howUsed')));
    expect(vaultHtml).toContain(`>${t('ui.vault.addPlace')}</button>`);
    expect(vaultHtml).toContain(`>${t('ui.vault.addDetail')}</button>`);
    expect(vaultHtml).toContain(`>${t('ui.burn.action')}</button>`);
    expect(vaultHtml).toContain(esc(t('ui.vault.loading')));
  });

  it('Vault: no map, no tile or geocoder URL, no external resource of any kind', () => {
    // (copy.vault.lock itself says "Never geocoded", so the words are not searched for, only resources.)
    expect(vaultHtml).not.toMatch(/https?:|\/\/|<iframe|<img|<script|<object|<embed|<link/i);
  });

  it('Burn sheet: copy.burn.confirm and ONE hold button, with its instructions and no checkbox (D-31)', () => {
    const html = renderToStaticMarkup(createElement(BurnVaultDialog, { open: true, onClose: () => {} }));
    expect(html).toContain(esc(t('copy.burn.confirm')));
    expect(html).toContain(esc(t('ui.burn.holdHint')));
    expect(html).not.toContain('checkbox');
    expect(html).not.toContain(esc(t('copy.burn.done')));
    expect(html).not.toContain(esc(t('ui.burn.atConfirm')));   // the assistive-technology step only after its click
    expect(html).toMatch(/<p tabindex="-1" role="status"/);    // the outcome's focus target is not an action
    const hold = /<button[^>]*aria-describedby="([^"]+)"[^>]*>(.*?)<\/button>/.exec(html);
    expect(hold?.[2]).toContain(t('ui.burn.action'));
    expect(html).toContain(`id="${hold?.[1]}"`);
  });

  it('Add place form: kind radios (Home, Work, School, Other place), the pin button, the manual link, generic-label hint', () => {
    const html = renderToStaticMarkup(createElement(VaultItemForm, { group: 'place', onSaved: () => {}, onCancel: () => {} }));
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    for (const k of PLACE_KINDS) expect(html).toContain(esc(t(KIND_LABEL[k])));
    expect(html).toContain(t('ui.vault.pin.button'));
    expect(html).toContain(esc(t('copy.vault.pinHelp')));
    expect(html).toContain(t('ui.vault.manual.link'));
    expect(html).toContain(esc(t('copy.vault.genericLabel')));   // the label starts empty: display-only (D-36)
    expect(html).toContain(esc(t('ui.vault.form.area')));          // Home is the default kind: it offers an area (D-63)
    expect(html).not.toMatch(/https?:|<iframe|<img|map/i);
  });

  it('Add detail form: a kind select with all 12 detail kinds and an aliases field, no location', () => {
    const html = renderToStaticMarkup(createElement(VaultItemForm, { group: 'detail', onSaved: () => {}, onCancel: () => {} }));
    expect(html.match(/<option /g)).toHaveLength(12);
    expect(html).toContain(esc(t('ui.vault.form.aliases')));
    expect(html).not.toContain(t('ui.vault.pin.button'));
    expect(html).not.toContain('type="radio"');
  });

  it('Edit form: the kind is fixed and a pin is described as kept, never by its coordinates', () => {
    const html = renderToStaticMarkup(createElement(VaultItemForm, {
      group: 'place', editing: item({ kind: 'work_pin', label: 'City General Hospital', pin: gpsPin }), onSaved: () => {}, onCancel: () => {},
    }));
    expect(html).toContain(t('ui.vault.pin.kept'));
    expect(html).not.toContain('type="radio"');
    expect(html).not.toMatch(/51[.,]12|0[.,]98/);
  });

  it('PinButton: one button, labelled Pin this place, with an empty polite live region for failures', () => {
    const html = renderToStaticMarkup(createElement(PinButton, { onPin: () => {} }));
    expect(html).toContain(`>${t('ui.vault.pin.button')}</button>`);
    expect(html).toContain('aria-live="polite"');
  });
});

describe('AC-087 (P1): a linked area name saved by the form is matched like any other text item', () => {
  const r = buildNewItems(values({ label: 'Home', area: 'Lindqvist Heights' }), () => 'vi_aaaaaaaaaaaa');
  if (!r.ok) throw new Error('expected ok');
  const vault: VaultItem[] = r.items.map((x, i) => ({ id: x.id ?? `vi_bbbbbbbbbbb${i}`, createdAt: 1, ...x }));
  const areaId = vault[1].id;

  it('becomes an OCR term (the generic "Home" pin contributes none) and is found in photo words', () => {
    expect(termsOf(vault).map((x) => [x.vaultId, x.text])).toEqual([[areaId, 'Lindqvist Heights']]);
    const hits = matchWords([{ text: 'LINDQVIST', line: 0 }, { text: 'HEIGHTS', line: 0 }], termsOf(vault), DEFAULT_FUZZY_THRESHOLD);
    expect(hits.map((h) => h.term.vaultId)).toEqual([areaId]);
  });

  it('is in the referee VAULT and matches a home_area claim', () => {
    expect(refereeVaultItems(vault).map((x) => x.id)).toEqual([areaId]);
    const m = rulesReferee([{ id: 'i1', kind: 'home_area', value: 'Lindqvist Heights', confidence: 'medium', clueIds: [] }], refereeVaultItems(vault));
    expect(m.map((x) => [x.vaultId, x.strength])).toEqual([[areaId, 'exact']]);
  });
});
