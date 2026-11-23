// web/src/ui/screens/Vault.tsx: #/vault (SPEC SCR-04; Burn vault SCR-19). The lock badge (copy.vault.lock, AC-085), the
// explainer, the items grouped as Places (pins) and Names and details (text), Add place / Add detail, the "n / 20"
// counter and Burn vault within two taps (SR-16).
// Everything stays on this device: the screen reads and writes only the sealed vault (vault/vaultStore) and never
// makes a request. No map, no geocoding; a pin is described by its source and accuracy, never its coordinates (D-92).
// The list reloads on every vault change, in this tab or another one (vault/sync.ts onVaultChange). No console (SR-15).
// TODO(Judge Mode task): in Judge Mode (ai/vaultScan.ts vaultScan.mode() === 'judge') this screen must show the FAKE
// vault (vaultScan.judgeVault()) read-only with copy.judge.fakeVault, must not call loadVault (SCR-04 States, D-37), and
// must not offer VaultItemForm (add, edit), delete or BurnVaultDialog: all of them act on the real vault.
import { useEffect, useRef, useState } from 'react';
import { t, type StringId } from '../../core/strings';
import { VAULT_MAX_ITEMS, type VaultItem } from '../../core/types';
import { accuracyMetres, isLowAccuracy } from '../../vault/geolocation';
import { onVaultChange } from '../../vault/sync';
import { isPinKind, loadVault, removeItem } from '../../vault/vaultStore';
import { BurnVaultDialog, type BurnOutcome } from '../components/BurnVaultDialog';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { CARD, EYEBROW, H1, LEAD } from '../components/surface';
import { KIND_LABEL, vaultError, VaultItemForm, type VaultGroup } from '../components/VaultItemForm';

type LoadState = { status: 'loading' } | { status: 'ready'; items: VaultItem[] } | { status: 'error'; copy: StringId };
type FormState = { group: VaultGroup; editing?: VaultItem; key: number } | null;

export interface ItemView {
  /** The label, or the kind's name when the label is empty. */
  name: string;
  kind: string;
  /** Source and accuracy for a pin, the link for a linked home area, other spellings for a detail. Never coordinates. */
  detail: string | null;
  /** copy.vault.lowAccuracy for a located pin worse than 250 m. */
  warning: string | null;
}

/** What the list shows for one item (D-92: never lat/lng, only how the pin was set and how accurate it is). */
export function describeItem(item: VaultItem): ItemView {
  const kind = t(KIND_LABEL[item.kind]);
  const name = item.label.trim() || kind;
  let detail: string | null = null;
  let warning: string | null = null;
  if (item.pin) {
    if (item.pin.source === 'manual') detail = t('ui.vault.pin.manual');
    else {
      const m = accuracyMetres(item.pin.accuracyM);
      detail = t('ui.vault.pin.accuracy', { m });
      if (isLowAccuracy(item.pin.accuracyM)) warning = t('copy.vault.lowAccuracy', { m });
    }
  } else if (item.linkedPinId !== undefined) {
    detail = t('ui.vault.linkedArea');
  } else if (item.aliases.length > 0) {
    detail = t('ui.vault.aliasesShown', { list: item.aliases.join(', ') });
  }
  return { name, kind, detail, warning };
}

/** Places (pins) and Names and details (text), each in stored order. */
export function groupItems(items: readonly VaultItem[]): { places: VaultItem[]; details: VaultItem[] } {
  return { places: items.filter((x) => isPinKind(x.kind)), details: items.filter((x) => !isPinKind(x.kind)) };
}

export interface VaultDeps {
  load: () => Promise<VaultItem[]>;
  remove: (id: string) => Promise<void>;
  watch: (listener: () => void) => () => void;
}
const APP_DEPS: VaultDeps = { load: loadVault, remove: removeItem, watch: onVaultChange };

/** A burn outcome the closed Burn sheet could not show (D-99); one the sheet showed needs no notice here. */
export const burnNotice = (outcome: BurnOutcome, shown: boolean): StringId | null =>
  shown ? null : outcome === 'done' ? 'copy.burn.done' : outcome === 'pending' ? 'ui.burn.pending' : 'ui.burn.failed';

/** The kind tile's glyph (inline SVG, decorative): a house outline for a place, a tag for a name or detail. */
function KindGlyph({ place }: { place: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-[18px]">
      {place
        ? <path d="M4 11 12 4l8 7 M6 9.5V20h12V9.5 M10 20v-5h4v5" />
        : <path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9-8-8Z M8 8h.01" />}
    </svg>
  );
}

/** The empty vault's locked box (stroke line-strong, decorative). The copy stays inline in Vault (its tree is tested). */
function LockedBox() {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true" className="size-16 text-line-strong">
      <path d="M10 26h44v30H10Z M10 26l6-10h32l6 10 M32 16v10" />
      <path d="M26 40h12v10H26Z M28.5 40v-3a3.5 3.5 0 0 1 7 0v3" />
    </svg>
  );
}

function ItemRow({ item, onEdit, onDelete }: { item: VaultItem; onEdit: () => void; onDelete: () => void }) {
  const v = describeItem(item);
  return (
    <li className={`${CARD} flex flex-wrap items-center gap-x-3 gap-y-2`}>
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg">
        <KindGlyph place={isPinKind(item.kind)} />
      </span>
      <div className="min-w-0 flex-1">
        {/* The kind as an eyebrow, unless the name already is the kind (an unnamed item). */}
        {v.name !== v.kind && <p className={EYEBROW}>{v.kind}</p>}
        <p className="text-title font-semibold break-words">{v.name}</p>
        {v.detail && <p className="text-small text-muted break-words">{v.detail}</p>}
        {v.warning && (
          <p className="mt-1 flex items-start gap-1.5 text-small font-medium text-verdict-amber">
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            {v.warning}
          </p>
        )}
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="compact" aria-label={t('ui.vault.editAria', { name: v.name })} onClick={onEdit}>
          {t('ui.vault.edit')}
        </Button>
        <Button variant="ghost" size="compact" aria-label={t('ui.vault.deleteAria', { name: v.name })} onClick={onDelete}>
          {t('ui.vault.delete')}
        </Button>
      </div>
    </li>
  );
}

function Group({ titleId, items, onEdit, onDelete }: {
  titleId: StringId; items: VaultItem[]; onEdit: (x: VaultItem) => void; onDelete: (x: VaultItem) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-title font-semibold">{t(titleId)}</h2>
      {items.length === 0 ? (
        <p className="text-small text-muted">{t('ui.vault.groupEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((x) => <ItemRow key={x.id} item={x} onEdit={() => onEdit(x)} onDelete={() => onDelete(x)} />)}
        </ul>
      )}
    </section>
  );
}

export function Vault({ deps = APP_DEPS }: { deps?: VaultDeps } = {}) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [form, setForm] = useState<FormState>(null);
  const [toDelete, setToDelete] = useState<VaultItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<StringId | null>(null);
  const [burnOpen, setBurnOpen] = useState(false);
  const [notice, setNotice] = useState<StringId | null>(null);
  const formKey = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeadingOnClose = useRef(false);

  // Load now and on every vault change (this tab or another). The latest load wins; nothing runs after unmount. A change
  // also clears the transient status ("Added…", "Deleted…"): it described a vault that no longer is (a burn, another
  // tab). This tab's own add or delete announces BEFORE it resolves, so its own status is set after the clear.
  useEffect(() => {
    let alive = true;
    let seq = 0;
    const load = () => {
      const my = ++seq;
      deps.load().then(
        (items) => { if (alive && my === seq) setState({ status: 'ready', items }); },
        (e: unknown) => { if (alive && my === seq) setState({ status: 'error', copy: vaultError(e, 'ui.vault.error.loadFailed').copy }); },
      );
    };
    const off = deps.watch(() => { setNotice(null); load(); });
    load();
    return () => { alive = false; off(); };
  }, [deps]);

  const items = state.status === 'ready' ? state.items : [];
  const count = items.length;
  const full = state.status === 'ready' && count >= VAULT_MAX_ITEMS;

  const openAdd = (group: VaultGroup) => {
    // A 21st item is refused (AC-082). The store refuses it too (also a race with another tab), with the same copy.
    if (full) { setNotice('copy.vault.full'); return; }
    setNotice(null);
    setForm({ group, key: ++formKey.current });
  };
  const openEdit = (item: VaultItem) => {
    setNotice(null);
    setForm({ group: isPinKind(item.kind) ? 'place' : 'detail', editing: item, key: ++formKey.current });
  };
  const askDelete = (item: VaultItem) => {
    setNotice(null);
    setDeleteError(null);
    setToDelete(item);
  };

  const confirmDelete = async () => {
    if (!toDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deps.remove(toDelete.id);
      const id = toDelete.id;
      // Drop the row now (the reload announced by the store follows), so the sheet's focus return cannot land on it.
      setState((s) => (s.status === 'ready' ? { status: 'ready', items: s.items.filter((x) => x.id !== id) } : s));
      focusHeadingOnClose.current = true;
      setToDelete(null);
      setNotice('ui.vault.deleted');
    } catch (e) {
      setDeleteError(vaultError(e, 'ui.vault.error.saveFailed').copy);
    } finally {
      setDeleting(false);
    }
  };
  const closeDelete = () => {
    setToDelete(null);
    setDeleteError(null);
    if (focusHeadingOnClose.current) {
      focusHeadingOnClose.current = false;
      headingRef.current?.focus();
    }
  };

  const formTitle: StringId = form?.editing
    ? (form.group === 'place' ? 'ui.vault.form.editPlace' : 'ui.vault.form.editDetail')
    : (form?.group === 'detail' ? 'ui.vault.form.addDetail' : 'ui.vault.form.addPlace');
  const { places, details } = groupItems(items);
  const deleteView = toDelete ? describeItem(toDelete) : null;
  const deletingLinkedHome = toDelete?.kind === 'home_pin' && items.some((x) => x.linkedPinId === toDelete.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h1 ref={headingRef} tabIndex={-1} className={H1}>{t('ui.screen.vault')}</h1>
        {/* AC-085: the plaque's text is exactly copy.vault.lock (the icon is aria-hidden and has no text). Teal here
            means "protected / never sent" (DESIGN §6.1). */}
        <div className="rounded-card border-l-4 border-l-verdict-teal bg-verdict-teal-bg p-4">
          <p data-vault-lock="" className="flex items-start gap-2.5 text-body font-semibold text-fg">
            <Icon name="lock" className="mt-0.5 size-5 shrink-0 text-verdict-teal" />
            {t('copy.vault.lock')}
          </p>
        </div>
        <p className={LEAD}>{t('copy.vault.howUsed')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => openAdd('place')}>{t('ui.vault.addPlace')}</Button>
        <Button onClick={() => openAdd('detail')}>{t('ui.vault.addDetail')}</Button>
        {state.status === 'ready' && (
          <p className="ml-auto inline-flex h-7 items-center rounded-chip border border-line-strong bg-surface-2 px-2.5 font-mono text-small font-semibold tabular-nums">
            <span aria-hidden="true">{t('ui.vault.counter', { n: count, max: VAULT_MAX_ITEMS })}</span>
            <span className="sr-only">{t('ui.vault.counterSr', { n: count, max: VAULT_MAX_ITEMS })}</span>
          </p>
        )}
      </div>

      <p role="status" aria-live="polite" className={notice ? 'text-small font-medium' : 'sr-only'}>
        {notice ? t(notice) : ''}
      </p>

      {state.status === 'loading' && <p className="text-body text-muted">{t('ui.vault.loading')}</p>}
      {state.status === 'error' && <p role="alert" className="text-body font-medium text-verdict-red">{t(state.copy)}</p>}
      {state.status === 'ready' && count === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong px-4 py-8 text-center">
          <LockedBox />
          <p className="max-w-[40ch] text-body text-muted">{t('copy.vault.empty')}</p>
        </div>
      )}
      {state.status === 'ready' && count > 0 && (
        <>
          <Group titleId="ui.vault.places" items={places} onEdit={openEdit} onDelete={askDelete} />
          <Group titleId="ui.vault.details" items={details} onEdit={openEdit} onDelete={askDelete} />
        </>
      )}

      <div className={`${CARD} mt-2 flex flex-wrap items-center justify-between gap-3`}>
        <p className={EYEBROW}>{t('ui.vault.dangerZone')}</p>
        <Button variant="quietDanger" onClick={() => setBurnOpen(true)}>{t('ui.burn.action')}</Button>
      </div>

      <Sheet open={form !== null} onClose={() => setForm(null)} title={t(formTitle)}>
        {form && (
          <VaultItemForm
            key={form.key}
            group={form.group}
            editing={form.editing}
            onSaved={(how) => { setForm(null); setNotice(how === 'added' ? 'ui.vault.added' : 'ui.vault.saved'); }}
            onCancel={() => setForm(null)}
          />
        )}
      </Sheet>

      <Sheet open={toDelete !== null} onClose={closeDelete} title={t('ui.vault.deleteTitle')}>
        {deleteView && (
          <div className="flex flex-col gap-4">
            <p>{t('ui.vault.deleteBody', { name: deleteView.name })}</p>
            {deletingLinkedHome && <p className="text-small text-muted">{t('ui.vault.deleteAreaStays')}</p>}
            <p role="alert" className={deleteError ? 'text-small font-medium text-verdict-red' : 'sr-only'}>
              {deleteError ? t(deleteError) : ''}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setToDelete(null)}>{t('ui.vault.cancel')}</Button>
              <Button variant="danger" aria-disabled={deleting || undefined} onClick={() => { void confirmDelete(); }}>
                {t('ui.vault.delete')}
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      <BurnVaultDialog
        open={burnOpen}
        onClose={() => setBurnOpen(false)}
        onOutcome={(outcome, shown) => { const n = burnNotice(outcome, shown); if (n) setNotice(n); }}
      />
    </div>
  );
}
