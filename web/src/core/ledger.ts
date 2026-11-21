// web/src/core/ledger.ts: the Cloud Ledger writer interface the Egress Gate needs (ARCH §8.6), with an IN-MEMORY
// implementation. T-062 created this minimal version; T-063 owns the persistent ledger (its own unsealed database
// `se-ledger`/`entries`, newest 500, "Clear history", the counters and the receipt) and replaces `ledger` behind the
// same interface. Entries hold IDs, kinds, hashes and numbers only: never a vault string, a coordinate or a pixel
// (AC-045). Firestore never sees the Ledger.
import type { GateBlockReason, JobName, LedgerEntry, PayloadClass, Route, VaultKind } from './types';

/** What the gate knows when a call starts (SPEC §7.1 step 10: the entry is written BEFORE the call). */
export interface LedgerStart {
  sessionId: string;
  judge: boolean;
  job: JobName;
  payloadClass: PayloadClass;
  promptVersion: string | null;
}

/** How a call ended. Everything not given keeps the pending entry's value. */
export interface LedgerPatch {
  route: Route;
  mode?: LedgerEntry['mode'];
  model?: string;
  payloadClass?: PayloadClass;   // RECLASSIFIED S2→S0 (D-15) closes the S2 call's entry as S0
  inferenceSource?: 'on_device' | 'in_cloud';
  latencyMs?: number;
  bytesOut?: number;
  imagesOut?: number;
  imageSha256?: string[];
  groundedQueries?: number;
  notes?: string[];
  blocked?: { reason: GateBlockReason; vaultId?: string; vaultKind?: VaultKind };
  error?: string;
}

export interface Ledger {
  /** Writes a `pending` entry and returns its id. Until committed it reads BLOCKED, 0 B (nothing is known to be sent). */
  begin(start: LedgerStart): string;
  /** Completes a pending entry (`done`). Throws for an unknown or already completed id: each call has ONE entry. */
  commit(id: string, patch: LedgerPatch): void;
  /** A finished entry written outside the gate: QUEUED (offline queue) and CACHED (Judge Mode replay) (ARCH §8.6). */
  record(entry: Omit<LedgerEntry, 'id' | 'status'>): string;
  /** Newest last. */
  entries(): readonly LedgerEntry[];
  subscribe(listener: () => void): () => void;
  /** "Clear history" (SCR-13) and Burn vault. */
  clear(): void;
}

export class LedgerError extends Error {
  constructor(message: string) { super(message); this.name = 'LedgerError'; }
}

/** ARCH §8.6: the newest 500 entries are kept. */
export const LEDGER_MAX_ENTRIES = 500;

export interface MemoryLedgerOptions {
  max?: number;
  now?: () => number;
  newId?: () => string;
}

const defaultId = (): string => {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return 'le_' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
};

export function createMemoryLedger(opts: MemoryLedgerOptions = {}): Ledger {
  const max = opts.max ?? LEDGER_MAX_ENTRIES;
  const now = opts.now ?? Date.now;
  const newId = opts.newId ?? defaultId;
  let list: LedgerEntry[] = [];
  const listeners = new Set<() => void>();
  const emit = () => { for (const l of [...listeners]) l(); };
  /** Keep the newest `max`; a PENDING entry is never evicted (its call still has to commit it; T-062 review). */
  const push = (e: LedgerEntry) => {
    list = [...list, e];
    let excess = list.length - max;
    if (excess > 0) list = list.filter((x) => (excess > 0 && x.status === 'done' ? (excess--, false) : true));
    emit();
  };
  return {
    begin(s) {
      const id = newId();
      push({
        id, sessionId: s.sessionId, judge: s.judge, ts: now(), status: 'pending', job: s.job, payloadClass: s.payloadClass,
        route: 'BLOCKED', mode: 'RULES', model: 'rules', promptVersion: s.promptVersion, latencyMs: 0, bytesOut: 0,
        imagesOut: 0, imageSha256: [], facesInOutgoing: 0, vaultItemsInOutgoing: 0, notes: [],
      });
      return id;
    },
    commit(id, p) {
      const i = list.findIndex((e) => e.id === id);
      if (i < 0) throw new LedgerError(`ledger: unknown entry ${id}`);
      const old = list[i];
      if (old.status === 'done') throw new LedgerError(`ledger: entry ${id} is already complete`);
      const next: LedgerEntry = {
        ...old,
        status: 'done',
        route: p.route,
        mode: p.mode ?? old.mode,
        model: p.model ?? old.model,
        payloadClass: p.payloadClass ?? old.payloadClass,
        latencyMs: p.latencyMs ?? old.latencyMs,
        bytesOut: p.bytesOut ?? 0,
        imagesOut: p.imagesOut ?? 0,
        imageSha256: p.imageSha256 ? [...p.imageSha256] : [],
        facesInOutgoing: 0,        // the gate blocks any image with a face (AC-041)
        vaultItemsInOutgoing: 0,   // and any request with a vault string
        notes: p.notes ? [...p.notes] : [],
      };
      if (p.inferenceSource !== undefined) next.inferenceSource = p.inferenceSource;
      if (p.groundedQueries !== undefined) next.groundedQueries = p.groundedQueries;
      if (p.blocked !== undefined) next.blocked = { ...p.blocked };
      if (p.error !== undefined) next.error = p.error;
      list = list.map((e, j) => (j === i ? next : e));
      emit();
    },
    record(entry) {
      const id = newId();
      push({ ...entry, id, status: 'done', imageSha256: [...entry.imageSha256], notes: [...entry.notes] });
      return id;
    },
    entries: () => list,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    clear() {
      if (list.length === 0) return;
      list = [];
      emit();
    },
  };
}

/** The app's Ledger (in memory until T-063 makes it persistent behind this same interface). */
export const ledger: Ledger = createMemoryLedger();
