// The DEV selftest's vault storage check (T-054 review) runs here against fake-indexeddb so its logic is known to be
// right; the selftest page runs the same function against the browser's IndexedDB.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { SCRATCH_DATA_DB, SCRATCH_KEYS_DB, vaultStorageCheck } from './vaultStorageCheck';

const dbNames = async () => (await indexedDB.databases()).map((d) => d.name);

describe('vaultStorageCheck (DEV selftest step vaultCrypto)', () => {
  it('passes on a key read back from IndexedDB, and leaves no database behind (never the real se-vault-*)', async () => {
    const { ok, detail } = await vaultStorageCheck();
    expect(detail).toEqual({
      keyReadBack: true, extractable: false, rawExportBlocked: true, jwkExportBlocked: true,
      fields: ['ct', 'iv', 'v'], sealed: true, ivBytes: 12, freshIv: true, plaintextFree: true, roundTrip: true,
    });
    expect(ok).toBe(true);
    const left = await dbNames();
    expect(left).not.toContain(SCRATCH_KEYS_DB);
    expect(left).not.toContain(SCRATCH_DATA_DB);
    expect(left.filter((n) => n?.startsWith('se-vault'))).toEqual([]);
  });
});
