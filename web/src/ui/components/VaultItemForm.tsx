// web/src/ui/components/VaultItemForm.tsx: add or edit one vault item (SPEC SCR-04 "Add place" / "Add detail" flows,
// §17.2 kinds, D-23 limits, D-36 generic labels, D-63 home area). Everything here stays on this device: the form
// talks only to vault/vaultStore (sealed IndexedDB) and vault/geolocation (the browser's own location service).
// No map, no address search, no reverse geocoding, no network. Coordinates are never shown back (D-92): a pin is
// described by its source and accuracy only. No console here (SR-15).
// The store is the authority on every rule (it refuses a 21st item, a label over 40 code points, a generic text
// label…); the form checks lengths first only so the right field gets the message, and maps every store error code to
// copy (vaultError). The pure parts (vaultError, buildNewItems, buildPatch, areaToSave…) are unit-tested.
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { t, type StringId } from '../../core/strings';
import { PIN_KINDS, VAULT_KINDS, VAULT_LABEL_MAX, type Pin, type VaultItem, type VaultKind } from '../../core/types';
import { BurnPendingError, VaultCorruptError } from '../../vault/crypto';
import { accuracyMetres, isLowAccuracy, MANUAL_ERROR_COPY, manualPin, parseManualCoords } from '../../vault/geolocation';
import {
  addItems, isGenericVaultString, isPinKind, newVaultId, updateItem, VAULT_ALIASES_MAX, VaultValidationError,
  type VaultValidationCode,
} from '../../vault/vaultStore';
import { Button } from './Button';
import { PinButton } from './PinButton';

export type VaultGroup = 'place' | 'detail';

/** SPEC §17.2: pins are places; every other kind is a "name or detail". */
export const PLACE_KINDS: readonly VaultKind[] = PIN_KINDS;
export const DETAIL_KINDS: readonly VaultKind[] = VAULT_KINDS.filter((k) => !PIN_KINDS.includes(k));
export const groupOf = (kind: VaultKind): VaultGroup => (isPinKind(kind) ? 'place' : 'detail');

/** Picker and list names. area_name / street_name read "Home area" / "Home street" (SCR-04, D-63). */
export const KIND_LABEL: Readonly<Record<VaultKind, StringId>> = {
  home_pin: 'ui.vault.kind.home_pin',
  work_pin: 'ui.vault.kind.work_pin',
  school_pin: 'ui.vault.kind.school_pin',
  place_pin: 'ui.vault.kind.place_pin',
  self_name: 'ui.vault.kind.self_name',
  child_name: 'ui.vault.kind.child_name',
  person_name: 'ui.vault.kind.person_name',
  employer: 'ui.vault.kind.employer',
  school_name: 'ui.vault.kind.school_name',
  area_name: 'ui.vault.kind.area_name',
  street_name: 'ui.vault.kind.street_name',
  plate: 'ui.vault.kind.plate',
  house_number: 'ui.vault.kind.house_number',
  phone: 'ui.vault.kind.phone',
  descriptor: 'ui.vault.kind.descriptor',
  other_text: 'ui.vault.kind.other_text',
};

/** Format hints for plates, phones and house numbers (SCR-04 "Add detail"). */
export const KIND_HINT: Readonly<Partial<Record<VaultKind, StringId>>> = {
  plate: 'ui.vault.hint.plate',
  phone: 'ui.vault.hint.phone',
  house_number: 'ui.vault.hint.house_number',
};

// ---------- errors → copy ----------

/** Which field a message belongs to; `form` is the form-level alert. */
export type ErrorField = 'label' | 'area' | 'aliases' | 'pin' | 'form';
export interface VaultError { copy: StringId; field: ErrorField }

/** Every VaultValidationCode (T-054, D-79/D-80). A Record, so a new code fails the typecheck until it has copy. */
const CODE_COPY: Readonly<Record<VaultValidationCode, StringId>> = {
  full: 'copy.vault.full',
  label_too_long: 'ui.vault.error.labelTooLong',
  alias_too_long: 'ui.vault.error.aliasTooLong',
  too_many_aliases: 'ui.vault.error.tooManyAliases',
  label_required: 'ui.vault.error.labelRequired',
  bad_kind: 'ui.vault.error.badKind',
  pin_required: 'ui.vault.error.pinRequired',
  bad_pin: 'ui.vault.error.badPin',
  not_found: 'ui.vault.error.notFound',
  // Programming or data errors the form cannot cause through its own fields: one honest generic message.
  pin_not_allowed: 'ui.vault.error.invalid',
  bad_id: 'ui.vault.error.invalid',
  duplicate_id: 'ui.vault.error.invalid',
  bad_link: 'ui.vault.error.invalid',
  bad_timestamp: 'ui.vault.error.invalid',
  bad_item: 'ui.vault.error.invalid',
};
const CODE_FIELD: Readonly<Record<VaultValidationCode, ErrorField>> = {
  full: 'form',
  label_too_long: 'label',
  alias_too_long: 'aliases',
  too_many_aliases: 'aliases',
  label_required: 'label',
  bad_kind: 'form',
  pin_required: 'pin',
  bad_pin: 'pin',
  not_found: 'form',
  pin_not_allowed: 'form',
  bad_id: 'form',
  duplicate_id: 'form',
  bad_link: 'form',
  bad_timestamp: 'form',
  bad_item: 'form',
};

/**
 * The copy (and field) for anything a vault operation rejects with. VaultCorruptError (an undecryptable or unknown
 * record) points at Burn vault; BurnPendingError means a previous burn has not finished. Anything else is `fallback`.
 */
export function vaultError(e: unknown, fallback: StringId = 'ui.vault.error.saveFailed'): VaultError {
  if (e instanceof VaultValidationError) {
    return Object.hasOwn(CODE_COPY, e.code)
      ? { copy: CODE_COPY[e.code], field: CODE_FIELD[e.code] }
      : { copy: 'ui.vault.error.invalid', field: 'form' };
  }
  if (e instanceof VaultCorruptError) return { copy: 'ui.vault.error.corrupt', field: 'form' };
  if (e instanceof BurnPendingError) return { copy: 'ui.vault.error.burnPending', field: 'form' };
  return { copy: fallback, field: 'form' };
}

/**
 * An add's refusal. A home pin with its area is TWO items (addItems is all or nothing), so a `full` refusal of that
 * pair says the area counts as a second item, on the area field (D-99), instead of the generic copy.vault.full.
 */
export function vaultErrorForAdd(e: unknown, itemCount: number): VaultError {
  if (e instanceof VaultValidationError && e.code === 'full' && itemCount > 1) return { copy: 'ui.vault.error.fullWithArea', field: 'area' };
  return vaultError(e);
}

// ---------- form values → store calls (pure) ----------

export interface VaultFormValues {
  kind: VaultKind;
  label: string;
  /** Detail items only: other spellings, comma-separated. */
  aliasesText: string;
  /** Home pins only, add only: the optional area name (D-63). */
  area: string;
  pin: Pin | null;
}

/** Lengths count Unicode code points, as the store does (D-23 as amended by D-79). */
export const codePoints = (s: string): number => [...s].length;
export const tooLong = (s: string): boolean => codePoints(s) > VAULT_LABEL_MAX;
export const parseAliases = (text: string): string[] => text.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
/** Empty or generic ("Home", "Work"…): display-only, never matched (D-36, AC-088). Same test as the store's. */
export const isDisplayOnlyLabel = (label: string): boolean => isGenericVaultString(label.trim());

/**
 * The linked area_name text, or null when none is created (T-054 note on SCR-04): only for a home pin, only when the
 * area text is non-empty and not generic. addItems is all or nothing, so a generic area would make the pin fail too.
 */
export function areaToSave(kind: VaultKind, area: string): string | null {
  const a = area.trim();
  return kind === 'home_pin' && a !== '' && !isGenericVaultString(a) ? a : null;
}

/** Length checks the store also makes, done first so the message lands on the right field. */
function lengthError(v: VaultFormValues, withAliases: boolean): VaultError | null {
  if (tooLong(v.label.trim())) return { copy: 'ui.vault.error.labelTooLong', field: 'label' };
  if (areaToSave(v.kind, v.area) !== null && tooLong(v.area.trim())) return { copy: 'ui.vault.error.labelTooLong', field: 'area' };
  if (withAliases) {
    const aliases = parseAliases(v.aliasesText);
    if (aliases.length > VAULT_ALIASES_MAX) return { copy: 'ui.vault.error.tooManyAliases', field: 'aliases' };
    if (aliases.some(tooLong)) return { copy: 'ui.vault.error.aliasTooLong', field: 'aliases' };
  }
  return null;
}

export type NewVaultItem = Parameters<typeof addItems>[0][number];
export type VaultPatch = Parameters<typeof updateItem>[1];

/** The addItems input for a new item: a pin (plus its linked area_name), or one detail with its aliases. */
export function buildNewItems(
  v: VaultFormValues,
  newId: () => string = newVaultId,
): { ok: true; items: NewVaultItem[] } | { ok: false; error: VaultError } {
  const place = isPinKind(v.kind);
  const tooLongError = lengthError(v, !place);
  if (tooLongError) return { ok: false, error: tooLongError };
  const label = v.label.trim();
  if (!place) return { ok: true, items: [{ kind: v.kind, label, aliases: parseAliases(v.aliasesText) }] };
  if (!v.pin) return { ok: false, error: { copy: 'ui.vault.error.pinRequired', field: 'pin' } };
  const id = newId();
  const pinItem: NewVaultItem = { id, kind: v.kind, label, aliases: [], pin: v.pin };
  const area = areaToSave(v.kind, v.area);
  return {
    ok: true,
    items: area === null ? [pinItem] : [pinItem, { kind: 'area_name', label: area, aliases: [], linkedPinId: id }],
  };
}

/**
 * The updateItem patch for an edit: the label always; aliases for a detail; the pin only if it was replaced (a
 * pin's aliases, if any, are kept as they are). The kind never changes here (delete and add again instead).
 */
export function buildPatch(v: VaultFormValues, original: VaultItem): { ok: true; patch: VaultPatch } | { ok: false; error: VaultError } {
  const place = isPinKind(original.kind);
  const tooLongError = lengthError({ ...v, kind: original.kind, area: '' }, !place);
  if (tooLongError) return { ok: false, error: tooLongError };
  const patch: VaultPatch = { label: v.label.trim() };
  if (!place) patch.aliases = parseAliases(v.aliasesText);
  else if (!v.pin) return { ok: false, error: { copy: 'ui.vault.error.pinRequired', field: 'pin' } };
  else if (v.pin !== original.pin) patch.pin = v.pin;
  return { ok: true, patch };
}

// ---------- the component ----------

export interface VaultItemFormProps {
  /** Add mode: which flow. Ignored when `editing` is set (the item's own group). */
  group: VaultGroup;
  /** Edit mode: the item as stored. */
  editing?: VaultItem;
  /** Called after the store committed the change (the list refreshes itself through onVaultChange). */
  onSaved: (saved: 'added' | 'updated') => void;
  onCancel: () => void;
}

type PinSource = 'none' | 'existing' | 'geolocation' | 'manual';

const INPUT =
  'min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-body text-fg placeholder:text-muted ' +
  'aria-invalid:border-verdict-red';
const HINT = 'text-small text-muted';
const ERR = 'text-small font-medium text-verdict-red';
const LABEL = 'text-small font-semibold';

function FieldError({ id, copy }: { id: string; copy: StringId | null }) {
  // Always mounted, so a message that appears is announced (the field also points at it via aria-describedby).
  return (
    <p id={id} aria-live="polite" className={copy ? ERR : 'sr-only'}>
      {copy ? t(copy) : ''}
    </p>
  );
}

const describedBy = (...ids: Array<string | false | null | undefined>) => ids.filter(Boolean).join(' ') || undefined;

export function VaultItemForm({ group: addGroup, editing, onSaved, onCancel }: VaultItemFormProps) {
  const group: VaultGroup = editing ? groupOf(editing.kind) : addGroup;
  const kinds = group === 'place' ? PLACE_KINDS : DETAIL_KINDS;
  const [kind, setKind] = useState<VaultKind>(editing?.kind ?? kinds[0]);
  const [label, setLabel] = useState(editing?.label ?? '');
  const [aliasesText, setAliasesText] = useState(editing ? editing.aliases.join(', ') : '');
  const [area, setArea] = useState('');
  const [pin, setPin] = useState<Pin | null>(editing?.pin ?? null);
  const [pinSource, setPinSource] = useState<PinSource>(editing?.pin ? 'existing' : 'none');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState('');
  const [manualApplied, setManualApplied] = useState<string | null>(null);
  const [manualError, setManualError] = useState<StringId | null>(null);
  const [error, setError] = useState<VaultError | null>(null);
  const [saving, setSaving] = useState(false);

  const id = useId();
  const ids = {
    kind: `${id}-kind`, label: `${id}-label`, labelHint: `${id}-label-hint`, labelErr: `${id}-label-err`,
    generic: `${id}-generic`, area: `${id}-area`, areaHint: `${id}-area-hint`, areaErr: `${id}-area-err`,
    aliases: `${id}-aliases`, aliasesHint: `${id}-aliases-hint`, aliasesErr: `${id}-aliases-err`,
    pinHelp: `${id}-pin-help`, pinStatus: `${id}-pin-status`, pinErr: `${id}-pin-err`,
    manual: `${id}-manual`, manualHint: `${id}-manual-hint`, manualErr: `${id}-manual-err`, formErr: `${id}-form-err`,
  };
  const labelRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLInputElement>(null);
  const aliasesRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const manualRef = useRef<HTMLInputElement>(null);

  // "Enter coordinates I know" replaces itself with the field: focus moves into it (not after a pin failure, which
  // only reveals it below the focused Pin button).
  const focusManualNext = useRef(false);
  const openManual = (focus: boolean) => {
    focusManualNext.current = focus;
    setManualOpen(true);
  };
  useEffect(() => {
    if (manualOpen && focusManualNext.current) {
      focusManualNext.current = false;
      manualRef.current?.focus();
    }
  }, [manualOpen]);

  const place = group === 'place';
  // Live: a label over 40 characters is refused inline (AC-082) before any save is tried.
  const labelError: StringId | null = tooLong(label.trim()) ? 'ui.vault.error.labelTooLong' : error?.field === 'label' ? error.copy : null;
  const areaGeneric = kind === 'home_pin' && area.trim() !== '' && areaToSave(kind, area) === null;
  const areaError: StringId | null = areaToSave(kind, area) !== null && tooLong(area.trim())
    ? 'ui.vault.error.labelTooLong' : error?.field === 'area' ? error.copy : null;
  const aliasesError: StringId | null = error?.field === 'aliases' ? error.copy : null;
  const pinError: StringId | null = error?.field === 'pin' ? error.copy : null;
  const formError: StringId | null = error?.field === 'form' ? error.copy : null;
  const showArea = !editing && kind === 'home_pin';
  const hint = KIND_HINT[kind];

  const focusField = (field: ErrorField) => {
    const el = field === 'label' ? labelRef.current
      : field === 'area' ? areaRef.current
      : field === 'aliases' ? aliasesRef.current
      : field === 'pin' ? (manualOpen ? manualRef.current : pinRef.current?.querySelector('button') ?? null)
      : null;
    el?.focus();
  };

  /** Apply the manual field: a valid pair becomes the pin; anything else is an inline error. */
  const applyManual = (): Pin | null => {
    const r = parseManualCoords(manualText);
    if (!r.ok) {
      setManualError(MANUAL_ERROR_COPY[r.reason]);
      manualRef.current?.focus();
      return null;
    }
    const p = manualPin(r.lat, r.lng, Date.now());
    setPin(p);
    setPinSource('manual');
    setManualApplied(manualText);
    setManualError(null);
    if (error?.field === 'pin') setError(null);
    return p;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    let currentPin = pin;
    // Coordinates typed but not applied yet: Save applies them (or stops on an invalid pair).
    if (place && manualOpen && manualText.trim() !== '' && manualText !== manualApplied) {
      currentPin = applyManual();
      if (!currentPin) return;
    }
    const values: VaultFormValues = { kind, label, aliasesText, area, pin: currentPin };
    const built = editing ? buildPatch(values, editing) : buildNewItems(values);
    if (!built.ok) {
      setError(built.error);
      focusField(built.error.field);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (editing && 'patch' in built) await updateItem(editing.id, built.patch);
      else if ('items' in built) await addItems(built.items);
      onSaved(editing ? 'updated' : 'added');
    } catch (err) {
      const ve = 'items' in built ? vaultErrorForAdd(err, built.items.length) : vaultError(err);
      setError(ve);
      setSaving(false);
      focusField(ve.field);
    }
  };

  const onPin = (p: Pin) => {
    setPin(p);
    setPinSource('geolocation');
    setManualText('');
    setManualApplied(null);
    setManualError(null);
    if (error?.field === 'pin') setError(null);
  };

  let pinStatus: ReactNode = null;
  if (pinSource === 'existing') pinStatus = t('ui.vault.pin.kept');
  else if (pinSource === 'manual') pinStatus = t('ui.vault.pin.manualSet');
  else if (pinSource === 'geolocation' && pin) {
    const m = accuracyMetres(pin.accuracyM);
    pinStatus = (
      <>
        {t('ui.vault.pin.got', { m })}
        {isLowAccuracy(pin.accuracyM) && (
          <span className="mt-1 block font-medium text-verdict-amber">{t('copy.vault.lowAccuracy', { m })}</span>
        )}
      </>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5" aria-describedby={formError ? ids.formErr : undefined}>
      {/* Kind (SPEC §17.2). Fixed while editing: delete and add again to change it. */}
      {editing ? (
        <p className="text-small">
          <span className="text-muted">{t('ui.vault.form.kind')}: </span>
          <span className="font-medium">{t(KIND_LABEL[editing.kind])}</span>
        </p>
      ) : place ? (
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className={`mb-2 ${LABEL}`}>{t('ui.vault.form.placeKind')}</legend>
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
            {PLACE_KINDS.map((k) => (
              <label
                key={k}
                className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-3 text-small font-medium transition-colors duration-150 hover:bg-surface-2 has-checked:border-fg has-checked:bg-surface-2"
              >
                <input type="radio" name={ids.kind} value={k} checked={kind === k} onChange={() => setKind(k)} className="size-4 shrink-0 accent-fg" />
                {t(KIND_LABEL[k])}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor={ids.kind} className={LABEL}>{t('ui.vault.form.detailKind')}</label>
          <select id={ids.kind} value={kind} onChange={(e) => setKind(e.target.value as VaultKind)} className={INPUT}>
            {DETAIL_KINDS.map((k) => (
              <option key={k} value={k}>{t(KIND_LABEL[k])}</option>
            ))}
          </select>
        </div>
      )}

      {/* Label: optional for a place, the value itself for a detail. ≤ 40 characters (D-23). */}
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.label} className={LABEL}>
          {t(place ? 'ui.vault.form.placeLabel' : 'ui.vault.form.value')}
        </label>
        <input
          ref={labelRef}
          id={ids.label}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={label}
          onChange={(e) => { setLabel(e.target.value); if (error?.field === 'label') setError(null); }}
          aria-invalid={labelError ? true : undefined}
          aria-describedby={describedBy(ids.labelHint, hint && `${id}-kind-hint`, place && isDisplayOnlyLabel(label) && ids.generic, ids.labelErr)}
          className={INPUT}
        />
        <p id={ids.labelHint} className={HINT}>{t(place ? 'ui.vault.form.placeLabelHint' : 'ui.vault.form.valueHint')}</p>
        {hint && <p id={`${id}-kind-hint`} className={HINT}>{t(hint)}</p>}
        {place && isDisplayOnlyLabel(label) && <p id={ids.generic} className={HINT}>{t('copy.vault.genericLabel')}</p>}
        <FieldError id={ids.labelErr} copy={labelError} />
      </div>

      {showArea && (
        <div className="flex flex-col gap-2">
          <label htmlFor={ids.area} className={LABEL}>{t('ui.vault.form.area')}</label>
          <input
            ref={areaRef}
            id={ids.area}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={area}
            onChange={(e) => { setArea(e.target.value); if (error?.field === 'area') setError(null); }}
            aria-invalid={areaError ? true : undefined}
            aria-describedby={describedBy(ids.areaHint, areaGeneric && `${ids.area}-generic`, ids.areaErr)}
            className={INPUT}
          />
          <p id={ids.areaHint} className={HINT}>{t('ui.vault.form.areaHint')}</p>
          {areaGeneric && <p id={`${ids.area}-generic`} className={HINT}>{t('ui.vault.form.areaGeneric')}</p>}
          <FieldError id={ids.areaErr} copy={areaError} />
        </div>
      )}

      {!place && (
        <div className="flex flex-col gap-2">
          <label htmlFor={ids.aliases} className={LABEL}>{t('ui.vault.form.aliases')}</label>
          <input
            ref={aliasesRef}
            id={ids.aliases}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={aliasesText}
            onChange={(e) => { setAliasesText(e.target.value); if (error?.field === 'aliases') setError(null); }}
            aria-invalid={aliasesError ? true : undefined}
            aria-describedby={describedBy(ids.aliasesHint, ids.aliasesErr)}
            className={INPUT}
          />
          <p id={ids.aliasesHint} className={HINT}>{t('ui.vault.form.aliasesHint')}</p>
          <FieldError id={ids.aliasesErr} copy={aliasesError} />
        </div>
      )}

      {place && (
        <fieldset className="flex min-w-0 flex-col gap-3 rounded-card border border-line-strong p-4">
          <legend className={`px-1 ${LABEL}`}>{t('ui.vault.form.location')}</legend>
          <p id={ids.pinHelp} className={HINT}>{t('copy.vault.pinHelp')}</p>
          <div ref={pinRef}>
            <PinButton
              onPin={onPin}
              onFailure={() => openManual(false)}
              describedBy={describedBy(ids.pinHelp, ids.pinErr)}
            />
          </div>
          <p id={ids.pinStatus} aria-live="polite" className="text-small font-medium">{pinStatus}</p>
          <FieldError id={ids.pinErr} copy={pinError} />
          {!manualOpen ? (
            <Button variant="ghost" className="self-start underline" onClick={() => openManual(true)}>
              {t('ui.vault.manual.link')}
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <label htmlFor={ids.manual} className={LABEL}>{t('ui.vault.manual.label')}</label>
              <p id={ids.manualHint} className={HINT}>{t('copy.vault.manualCoords')}</p>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={manualRef}
                  id={ids.manual}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  value={manualText}
                  onChange={(e) => { setManualText(e.target.value); setManualError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyManual(); } }}
                  aria-invalid={manualError ? true : undefined}
                  aria-describedby={describedBy(ids.manualHint, ids.manualErr, pinError && ids.pinErr)}
                  className={`${INPUT} min-w-0 flex-1`}
                />
                <Button onClick={() => { applyManual(); }}>{t('ui.vault.manual.use')}</Button>
              </div>
              <FieldError id={ids.manualErr} copy={manualError} />
            </div>
          )}
        </fieldset>
      )}

      <p id={ids.formErr} role="alert" className={formError ? ERR : 'sr-only'}>
        {formError ? t(formError) : ''}
      </p>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>{t('ui.vault.cancel')}</Button>
        <Button type="submit" variant="primary" aria-disabled={saving || undefined}>
          {t(saving ? 'ui.vault.form.saving' : 'ui.vault.form.save')}
        </Button>
      </div>
    </form>
  );
}
