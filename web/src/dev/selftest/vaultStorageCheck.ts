// DEV-only (__SE_DEV_ONLY__, route #/dev/selftest): the browser half of AC-080/AC-081 and the T-054 Verify, run against the browser's
// real IndexedDB structured clone of a CryptoKey. Uses SCRATCH databases only and deletes them afterwards: it never
// opens se-vault-keys, se-vault-data, se-sessions or se-ledger. Synthetic data only. Reports booleans and sizes only.
import { get, set } from 'idb-keyval';
import { closableStore } from '../../vault/idb';
import { deleteDatabase, isSealed, seal, unseal, type Sealed } from '../../vault/crypto';

export const SCRATCH_KEYS_DB = 'se-selftest-keys';
export const SCRATCH_DATA_DB = 'se-selftest-data';
const MARK = 'Wrenfield Ottoline';   // synthetic; must never be readable in the stored record

async function rejects(p: () => Promise<unknown>): Promise<boolean> {
  try { await p(); return false; } catch { return true; }
}

function bytesContain(buf: ArrayBuffer, s: string): boolean {
  const b = new Uint8Array(buf);
  return [new TextDecoder('latin1').decode(b), new TextDecoder('utf-8').decode(b), new TextDecoder('utf-16le').decode(b)]
    .some((t) => t.includes(s));
}

export interface VaultStorageDetail {
  keyReadBack: boolean; extractable: boolean | null; rawExportBlocked: boolean; jwkExportBlocked: boolean;
  fields: string[]; sealed: boolean; ivBytes: number; freshIv: boolean; plaintextFree: boolean; roundTrip: boolean;
}

/**
 * Store a non-extractable AES-GCM key in a scratch database and READ IT BACK; the read-back key must have
 * extractable === false, and exportKey('raw') and ('jwk') must reject (AC-080). Seal a synthetic value twice with it
 * into a scratch data database: the stored record must be {v, iv, ct} only, with a 12-byte IV that differs per write
 * (AC-081), no plaintext in its bytes, and it must decrypt back to the value.
 */
export async function vaultStorageCheck(): Promise<{ ok: boolean; detail: VaultStorageDetail }> {
  const keys = closableStore(SCRATCH_KEYS_DB, 'keys');
  const data = closableStore(SCRATCH_DATA_DB, 'items');
  const detail: VaultStorageDetail = {
    keyReadBack: false, extractable: null, rawExportBlocked: false, jwkExportBlocked: false,
    fields: [], sealed: false, ivBytes: 0, freshIv: false, plaintextFree: false, roundTrip: false,
  };
  try {
    await set('k', await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']), keys);
    const key = await get<CryptoKey>('k', keys);
    detail.keyReadBack = key instanceof CryptoKey;
    if (!key || !detail.keyReadBack) return { ok: false, detail };
    detail.extractable = key.extractable;
    detail.rawExportBlocked = await rejects(() => crypto.subtle.exportKey('raw', key));
    detail.jwkExportBlocked = await rejects(() => crypto.subtle.exportKey('jwk', key));

    const value = [{ kind: 'child_name', label: MARK, aliases: [] }];
    await set('vault:v1', await seal(value, key), data);
    const first = await get<Sealed>('vault:v1', data);
    await set('vault:v1', await seal(value, key), data);
    const second = await get<Sealed>('vault:v1', data);
    if (!first || !second) return { ok: false, detail };
    detail.fields = Object.keys(second).sort();
    detail.sealed = isSealed(second);
    detail.ivBytes = second.iv.byteLength;
    detail.freshIv = first.iv.some((x, i) => x !== second.iv[i]);
    detail.plaintextFree = !bytesContain(second.ct, MARK) && !bytesContain(second.ct, 'child_name');
    detail.roundTrip = JSON.stringify(await unseal(second, key)) === JSON.stringify(value);
    const ok = detail.extractable === false && detail.rawExportBlocked && detail.jwkExportBlocked
      && detail.fields.join() === 'ct,iv,v' && detail.sealed && detail.ivBytes === 12 && detail.freshIv
      && detail.plaintextFree && detail.roundTrip;
    return { ok, detail };
  } finally {
    await deleteDatabase(SCRATCH_KEYS_DB).catch(() => undefined);
    await deleteDatabase(SCRATCH_DATA_DB).catch(() => undefined);
  }
}
