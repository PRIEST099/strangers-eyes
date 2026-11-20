// web/src/vault/idb.ts: an idb-keyval-compatible store that CLOSES its connection on `versionchange`.
// idb-keyval's createStore keeps the database open forever, which blocks indexedDB.deleteDatabase()
// until the page reloads. Burn vault must delete immediately, so every sealed store uses this instead.
import type { UseStore } from 'idb-keyval';

export function closableStore(dbName: string, storeName: string): UseStore {
  let dbp: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbp = null;
        };
        db.onclose = () => {
          dbp = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbp = null;
        reject(req.error);
      };
      req.onblocked = () => {
        // Another connection is mid-upgrade or mid-delete; the request completes when it closes.
      };
    });
    return dbp;
  };
  return (txMode, callback) => open().then((db) => callback(db.transaction(storeName, txMode).objectStore(storeName)));
}

/**
 * Whether database `name` exists, found WITHOUT creating it (crypto.burnPending, where indexedDB.databases() is missing
 * or fails; T-054 review round 4): open it at its current version. Only an absent database needs an upgrade
 * (oldVersion 0); that upgrade is aborted, the open fails with AbortError, and no database is left behind (checked in
 * fake-indexeddb and Chromium 156: databases() stays empty). An existing database opens and its connection is closed at
 * once, so it never blocks a later deletion. Any other open failure rejects (fail closed: the caller cannot rule it out).
 */
export function databaseExists(name: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    let absent = false;
    const req = indexedDB.open(name);
    req.onupgradeneeded = () => {
      absent = true;
      try { req.transaction?.abort(); } catch { /* already finished: onsuccess closes it */ }
    };
    req.onsuccess = () => {
      req.result.close();
      resolve(!absent);
    };
    req.onerror = (e) => {
      if (!absent) { reject(req.error); return; }
      e.preventDefault();   // our own abort: the database did not exist
      resolve(false);
    };
  });
}
