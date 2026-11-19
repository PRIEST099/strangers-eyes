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
