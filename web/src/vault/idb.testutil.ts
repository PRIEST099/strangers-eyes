// Test-only helpers for the vault tests (fake-indexeddb): dump every database and record, read stored values as text in
// every plausible encoding, and log IndexedDB deletes in call order. Production code never imports this.
import { vi } from 'vitest';

export const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export interface IdbRecord { db: string; store: string; key: IDBValidKey; value: unknown }

/** Every database, its object stores, and every record, read with plain IndexedDB calls (connections closed after). */
export async function dumpIdb(): Promise<{ dbs: Record<string, string[]>; records: IdbRecord[] }> {
  const dbs: Record<string, string[]> = {};
  const records: IdbRecord[] = [];
  for (const { name } of await indexedDB.databases()) {
    if (!name) continue;
    const db = await req(indexedDB.open(name));
    try {
      dbs[name] = Array.from(db.objectStoreNames);
      for (const s of dbs[name]) {
        const os = db.transaction(s, 'readonly').objectStore(s);
        const [keys, values] = await Promise.all([req(os.getAllKeys()), req(os.getAll())]);
        keys.forEach((key, i) => records.push({ db: name, store: s, key, value: values[i] }));
      }
    } finally {
      db.close();
    }
  }
  return { dbs, records };
}

/**
 * Every way a stored value could expose text: strings, numbers, object keys, and raw bytes decoded as latin1, UTF-8 and
 * UTF-16LE (at both byte alignments). A CryptoKey shows only its type and extractability.
 */
export function textViews(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out.push(String(v));
  else if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const b = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    out.push(new TextDecoder('latin1').decode(b), new TextDecoder('utf-8').decode(b));
    out.push(new TextDecoder('utf-16le').decode(b), new TextDecoder('utf-16le').decode(b.subarray(1)));
  } else if (v instanceof CryptoKey) out.push(`CryptoKey:${v.type}:${v.extractable}`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); textViews(x, out); }
  return out;
}

/**
 * Log, in call order: every object-store delete as "delete db/store/key" plus "committed db/store/key" when its
 * transaction completes, and every "deleteDatabase name". Undo with vi.restoreAllMocks().
 */
export function spyIdbDeletes() {
  const log: string[] = [];
  const origDelete = IDBObjectStore.prototype.delete;
  const del = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
    const where = `${this.transaction.db.name}/${this.name}/${String(key)}`;
    log.push(`delete ${where}`);
    this.transaction.addEventListener('complete', () => log.push(`committed ${where}`));
    return origDelete.call(this, key);
  });
  const origDrop = indexedDB.deleteDatabase.bind(indexedDB);
  const drop = vi.spyOn(indexedDB, 'deleteDatabase').mockImplementation((name: string) => {
    log.push(`deleteDatabase ${name}`);
    return origDrop(name);
  });
  return { log, del, drop };
}
