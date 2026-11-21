import { describe, expect, it } from 'vitest';
import { bumpVaultGeneration, readVaultGeneration, VAULT_GENERATION_KEY, type GenerationStore } from './generation';

const mem = (init: Record<string, string> = {}): GenerationStore & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
};

describe('vault generation counter (D-80)', () => {
  it('starts at 0 and only ever goes up', () => {
    const s = mem();
    expect(readVaultGeneration(s)).toBe(0);
    bumpVaultGeneration(s); bumpVaultGeneration(s);
    expect(readVaultGeneration(s)).toBe(2);
    expect(s.data[VAULT_GENERATION_KEY]).toBe('2');
  });
  it('a damaged value reads as 0 and the next bump repairs it; no storage → null and bump is a no-op', () => {
    const s = mem({ [VAULT_GENERATION_KEY]: 'x' });
    expect(readVaultGeneration(s)).toBe(0);
    bumpVaultGeneration(s);
    expect(readVaultGeneration(s)).toBe(1);
    expect(readVaultGeneration(null)).toBeNull();
    expect(() => bumpVaultGeneration(null)).not.toThrow();
  });
  it('a throwing store never throws out (read → null, bump → ignored)', () => {
    const bad: GenerationStore = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    expect(readVaultGeneration(bad)).toBeNull();
    expect(() => bumpVaultGeneration(bad)).not.toThrow();
  });
});
