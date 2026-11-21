// T-063 / SCR-15: the sent-image store keys each blob by the sha256 of its own bytes (AC-230) and keeps the newest few.
import { describe, expect, it } from 'vitest';
import { createSentImageStore, sha256OfBlob } from './ledgerImages';

const jpeg = (n: number) => new Blob([new Uint8Array([0xff, 0xd8, 0xff, n])], { type: 'image/jpeg' });

describe('sentImages', () => {
  it('keys a blob by its own sha256 (not a claimed hash)', async () => {
    const s = createSentImageStore();
    const b = jpeg(1);
    const sha = await s.remember(b);
    expect(sha).toBe(await sha256OfBlob(b));
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    expect(s.get(sha)).toBe(b);
    expect(s.get('0'.repeat(64))).toBeNull();
  });

  it('keeps the newest `max`, notifies, and clears', async () => {
    const s = createSentImageStore(2);
    let calls = 0;
    const off = s.subscribe(() => { calls++; });
    const a = await s.remember(jpeg(1));
    const b = await s.remember(jpeg(2));
    const c = await s.remember(jpeg(3));
    expect(s.get(a)).toBeNull();
    expect(s.get(b)).not.toBeNull();
    expect(s.get(c)).not.toBeNull();
    const v = s.version();
    s.clear();
    expect(s.get(c)).toBeNull();
    expect(s.version()).toBe(v + 1);
    off();
    await s.remember(jpeg(4));
    expect(calls).toBe(4);
  });
});
