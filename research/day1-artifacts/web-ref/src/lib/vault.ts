import { createStore, get, set, del } from 'idb-keyval';

// One object store per database with idb-keyval; do NOT use the default store
// (tesseract.js caches eng.traineddata in idb-keyval's default 'keyval-store').
const keyStore = createStore('se-vault-keys', 'keys');
const dataStore = createStore('se-vault-data', 'items');
const KEY_ID = 'vault-key-v1';

export async function getVaultKey(): Promise<CryptoKey> {
  const existing = await get<CryptoKey>(KEY_ID, keyStore);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable: exportKey()/wrapKey() will throw
    ['encrypt', 'decrypt'],
  );
  await set(KEY_ID, key, keyStore); // CryptoKey is structured-cloneable
  return key;
}

interface Sealed { v: 1; iv: Uint8Array<ArrayBuffer>; ct: ArrayBuffer }

export async function putSealed(id: string, value: unknown): Promise<void> {
  const key = await getVaultKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // fresh 96-bit IV per encryption
  const pt = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt);
  await set(id, { v: 1, iv, ct } satisfies Sealed, dataStore);
}

export async function getSealed<T>(id: string): Promise<T | undefined> {
  const rec = await get<Sealed>(id, dataStore);
  if (!rec) return undefined;
  const key = await getVaultKey();
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, key, rec.ct);
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

/** "Burn vault": delete the key; ciphertext becomes unrecoverable. */
export async function burnVault(): Promise<void> {
  await del(KEY_ID, keyStore);
  await new Promise<void>((res, rej) => {
    const r = indexedDB.deleteDatabase('se-vault-data');
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
    r.onblocked = () => res();
  });
}
