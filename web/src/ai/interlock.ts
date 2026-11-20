// web/src/ai/interlock.ts — the local/cloud interlock (AD-18, ARCH §8.5).
// No cloud call is authorised while an S0/S1 ("local") call runs, and no S0/S1 call starts while a cloud-capable
// call sits between "authorised" (enterCloud) and "fetch issued" (the tripwire observes its permit).
//
// D-75: at most ONE cloud call is pre-fetch at a time. The tripwire consumes permits in grant order and cannot tell
// which caller a fetch belongs to, so with two outstanding permits one call's fetch could use the other's permit:
// an S3 fetch could take an S4 permit (scanText:false) and skip the vault-text scan, and this interlock's
// bookkeeping would release local calls while a cloud call was still pending. With one outstanding permit the
// attribution is exact. The wait is only the grant → fetch gap (milliseconds: the SDK awaits cached App Check/Auth
// tokens); after the fetch, cloud calls run in parallel. An S2 call answered on Nano never fetches, so it holds the
// slot (and blocks local calls, as ARCH §8.5 already accepts) until it exits.
//
// Fairness: one FIFO queue holds waiters of both kinds. A caller is admitted at once only when nobody is waiting
// and its condition holds; otherwise it joins the queue. The queue admits from the head while the head's condition
// holds (consecutive local waiters go in together), and a newcomer never overtakes a waiter of the other kind.
// Neither side can starve the other, provided every admitted call eventually calls exit(id) (the gate's `finally`).
// Callers must never await another gate call while holding the interlock (a nested call would queue behind a
// waiter of the other kind and deadlock). Cloud retries re-enter per attempt: exit(id) → enterCloud(id) →
// grantCloud → invoke, outside any deviceQueue slot (D-75). State changes happen synchronously at admission.
import { tripwire, type TripwireObservation } from './tripwire';

/** The part of the tripwire the interlock drives. Injectable so tests can use a fake. */
export type InterlockTripwire = Pick<typeof tripwire, 'enterLocal' | 'exitLocal' | 'revokeCloud' | 'observe'>;

export type InterlockKind = 'local' | 'cloud';
export type InterlockErrorCode = 'DUPLICATE_ID' | 'EXITED_WHILE_WAITING';

export class InterlockError extends Error {
  readonly code: InterlockErrorCode;
  readonly id: string;
  constructor(code: InterlockErrorCode, id: string) {
    super(`interlock:${code}`);
    this.code = code;
    this.id = id;
  }
}

export interface InterlockState {
  /** S0/S1 calls currently admitted. */
  localHeld: number;
  /** Cloud-capable calls authorised whose fetch has not been issued yet (ids in admission order). */
  cloudPrefetch: readonly string[];
  /** Every admitted cloud-capable call that has not exited, fetched or not. */
  cloudLive: number;
  waiting: readonly { id: string; kind: InterlockKind }[];
}

export interface Interlock {
  /** S0/S1: resolves once no cloud call is pre-fetch, then holds the tripwire's local lock until exit(id). */
  enterLocal(id: string): Promise<void>;
  /** Cloud-capable (S2/S3/S4): resolves once no S0/S1 call runs and no other cloud permit is pre-fetch (D-75). The caller grants the tripwire permit after this. */
  enterCloud(id: string): Promise<void>;
  /** Releases `id`: exitLocal() for a local holder, revokeCloud(id) for a cloud permit never consumed. Idempotent. */
  exit(id: string): void;
  state(): InterlockState;
  /** Stops observing the tripwire (tests). */
  dispose(): void;
}

interface Waiter {
  id: string;
  kind: InterlockKind;
  resolve: () => void;
  reject: (e: InterlockError) => void;
}

export function createInterlock(tw: InterlockTripwire): Interlock {
  const local = new Set<string>(); // localHeld = local.size
  const cloudLive = new Set<string>();
  const cloudPrefetch = new Set<string>();
  const queue: Waiter[] = [];

  const canAdmit = (kind: InterlockKind): boolean =>
    kind === 'local' ? cloudPrefetch.size === 0 : local.size === 0 && cloudPrefetch.size === 0; // D-75: one pre-fetch permit
  const isKnown = (id: string): boolean => local.has(id) || cloudLive.has(id) || queue.some((w) => w.id === id);

  const admit = (kind: InterlockKind, id: string): void => {
    if (kind === 'local') {
      local.add(id);
      tw.enterLocal();
    } else {
      cloudLive.add(id);
      cloudPrefetch.add(id);
    }
  };

  const pump = (): void => {
    for (let head = queue[0]; head !== undefined && canAdmit(head.kind); head = queue[0]) {
      queue.shift();
      admit(head.kind, head.id);
      head.resolve();
    }
  };

  const enter = (kind: InterlockKind, id: string): Promise<void> => {
    if (isKnown(id)) return Promise.reject(new InterlockError('DUPLICATE_ID', id));
    if (queue.length === 0 && canAdmit(kind)) {
      admit(kind, id);
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      queue.push({ id, kind, resolve, reject });
    });
  };

  // The tripwire reports each permitted fetch synchronously, just before the request goes out.
  const stopObserving = tw.observe((o: TripwireObservation) => {
    if (cloudPrefetch.delete(o.permitId)) pump();
  });

  return {
    enterLocal: (id) => enter('local', id),
    enterCloud: (id) => enter('cloud', id),
    exit(id) {
      if (local.delete(id)) {
        tw.exitLocal();
      } else if (cloudLive.delete(id)) {
        if (cloudPrefetch.delete(id)) tw.revokeCloud(id); // the permit was never consumed
      } else {
        const i = queue.findIndex((w) => w.id === id);
        if (i < 0) return; // unknown or already exited: no-op
        const [w] = queue.splice(i, 1);
        w?.reject(new InterlockError('EXITED_WHILE_WAITING', id));
      }
      pump();
    },
    state: () => ({
      localHeld: local.size,
      cloudPrefetch: [...cloudPrefetch],
      cloudLive: cloudLive.size,
      waiting: queue.map((w) => ({ id: w.id, kind: w.kind })),
    }),
    dispose: stopObserving,
  };
}

/** The app-wide interlock over the real tripwire (the gate's only instance). */
export const interlock: Interlock = createInterlock(tripwire);
