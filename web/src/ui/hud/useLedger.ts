// web/src/ui/hud/useLedger.ts: React subscriptions to the app's in-memory Ledger (core/ledger.ts `ledger`, the one the
// gate writes through appDeps) and to the sent-image store (core/ledgerImages.ts). One source for the HUD, the header
// chip, the Ledger rail/sheet and Settings: each re-renders on every begin/commit/record/clear.
import { useMemo, useSyncExternalStore } from 'react';
import { ledger, type Ledger } from '../../core/ledger';
import { sentImages, type SentImageStore } from '../../core/ledgerImages';
import { ledgerCounters } from '../../core/ledgerView';
import type { LedgerCounters, LedgerEntry } from '../../core/types';

/** Newest last. `entries()` returns a new array on every change, so the snapshot is stable between changes. */
export function useLedgerEntries(l: Ledger = ledger): readonly LedgerEntry[] {
  return useSyncExternalStore(l.subscribe, l.entries, l.entries);
}

export function useLedgerCounters(l: Ledger = ledger): LedgerCounters {
  const entries = useLedgerEntries(l);
  return useMemo(() => ledgerCounters(entries), [entries]);
}

/** Re-renders when a sent image is remembered or cleared; returns the store for lookups. */
export function useSentImages(s: SentImageStore = sentImages): SentImageStore {
  useSyncExternalStore(s.subscribe, s.version, s.version);
  return s;
}
