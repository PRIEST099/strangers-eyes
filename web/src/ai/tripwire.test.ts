import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AI_HOST, extractTextParts, installTripwire, isAiHost, setVaultScanner, tripwire, TripwireError, type VaultScanner } from './tripwire';

const AI_URL = `https://${AI_HOST}/v1beta/projects/demo/models/x:generateContent`;
const body = (text: string) => JSON.stringify({ contents: [{ role: 'user', parts: [{ text }, { inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } }] }] });

describe('main.tsx', () => {
  it("imports './ai/tripwire-install' first (ARCH §8.5)", () => {
    const src = readFileSync(fileURLToPath(new URL('../main.tsx', import.meta.url)), 'utf8');
    const firstImport = src.split('\n').find((l) => /^\s*import\b/.test(l));
    expect(firstImport?.trim().startsWith("import './ai/tripwire-install'")).toBe(true);
  });
});

describe('tripwire', () => {
  const realFetch = globalThis.fetch;
  const spy = vi.fn(async () => new Response('ok'));

  beforeAll(() => {
    globalThis.fetch = spy as unknown as typeof fetch;
    installTripwire();
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it('passes non-AI URLs through untouched', async () => {
    await fetch('data:image/jpeg;base64,QUJD');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('passes other hosts and relative URLs through untouched, with no permit or scanner', async () => {
    const before = spy.mock.calls.length;
    await fetch('https://example.com/api', { method: 'POST', body: 'Lucas' });
    await fetch(new URL('https://example.org/x'));
    await fetch('/vendor/tesseract-7.0.0/worker.min.js');
    expect(spy.mock.calls.length).toBe(before + 3);
    expect(tripwire.lastTrip()).toBeNull();
  });

  it('fails closed without a vault scanner', async () => {
    tripwire.grantCloud({ id: 'p0', scanText: true });
    await expect(fetch(AI_URL, { method: 'POST', body: body('hello') })).rejects.toMatchObject({ reason: 'NO_SCANNER' });
  });

  it('blocks AI calls without a permit', async () => {
    setVaultScanner(() => null);
    await expect(fetch(AI_URL, { method: 'POST', body: body('hello') })).rejects.toBeInstanceOf(TripwireError);
    expect(tripwire.lastTrip()?.reason).toBe('NO_PERMIT');
  });

  it('blocks any AI call while an S0/S1 call holds the local lock', async () => {
    tripwire.enterLocal();
    tripwire.grantCloud({ id: 'p1', scanText: true });
    await expect(fetch(AI_URL, { method: 'POST', body: body('hello') })).rejects.toMatchObject({ reason: 'LOCAL_LOCK' });
    tripwire.exitLocal();
    tripwire.revokeCloud('p1');
  });

  it('blocks vault text and lets clean, permitted calls through', async () => {
    setVaultScanner((texts) => (texts.some((t) => t.includes('Lucas')) ? { vaultId: 'v1' } : null));
    tripwire.grantCloud({ id: 'p2', scanText: true });
    await expect(fetch(AI_URL, { method: 'POST', body: body('where is Lucas') })).rejects.toMatchObject({ reason: 'VAULT_TEXT', vaultId: 'v1' });

    const seen: string[] = [];
    const stop = tripwire.observe((o) => seen.push(o.permitId));
    tripwire.grantCloud({ id: 'p3', scanText: true });
    const before = spy.mock.calls.length;
    await fetch(AI_URL, { method: 'POST', body: body('describe the scene') });
    expect(spy.mock.calls.length).toBe(before + 1);
    expect(seen).toEqual(['p3']);
    stop();
    stop(); // idempotent: a second call must not remove another observer
  });

  it('blocks vault text in systemInstruction', async () => {
    setVaultScanner((texts) => (texts.some((t) => t.includes('Lucas')) ? { vaultId: 'v1' } : null));
    tripwire.grantCloud({ id: 'p-sys', scanText: true });
    const before = spy.mock.calls.length;
    const sysBody = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'describe the scene' }] }],
      systemInstruction: { role: 'system', parts: [{ text: 'never mention Lucas' }] },
    });
    await expect(fetch(AI_URL, { method: 'POST', body: sysBody })).rejects.toMatchObject({ reason: 'VAULT_TEXT', vaultId: 'v1' });
    expect(spy.mock.calls.length).toBe(before);
  });

  it('scans only the ACTIVE vault: with JUDGE_VAULT registered, fake-vault terms match and real-vault terms do not (R-14)', async () => {
    const scannerFor = (items: { id: string; term: string }[]): VaultScanner => (texts) => {
      const hit = items.find((item) => texts.some((t) => t.toLowerCase().includes(item.term.toLowerCase())));
      return hit ? { vaultId: hit.id } : null;
    };
    const realVault = [{ id: 'real-kid', term: 'Ellery' }];
    const judgeVault = [{ id: 'judge-kid', term: 'LUCAS' }];

    setVaultScanner(scannerFor(realVault));
    tripwire.grantCloud({ id: 'p-real', scanText: true });
    await expect(fetch(AI_URL, { method: 'POST', body: body('Ellery at the park') })).rejects.toMatchObject({ vaultId: 'real-kid' });

    setVaultScanner(scannerFor(judgeVault)); // vaultScan.useJudge(JUDGE_VAULT) re-registers; it replaces, never merges
    const before = spy.mock.calls.length;
    tripwire.grantCloud({ id: 'p-s3-real', scanText: true });
    await fetch(AI_URL, { method: 'POST', body: body('Ellery at the park') });
    expect(spy.mock.calls.length).toBe(before + 1);
    tripwire.grantCloud({ id: 'p-s3-judge', scanText: true }); // S3 in Judge Mode: the forced-leak beat still blocks
    await expect(fetch(AI_URL, { method: 'POST', body: body('lucas sample') })).rejects.toMatchObject({ reason: 'VAULT_TEXT', vaultId: 'judge-kid' });
    tripwire.grantCloud({ id: 'p-s4-judge', scanText: false }); // S4: the sample allowlist replaces the text scan
    await fetch(AI_URL, { method: 'POST', body: body('lucas sample') });
    expect(spy.mock.calls.length).toBe(before + 2);
  });

  it('does not text-scan S4 permits (the sample allowlist replaces the scan, R-14)', async () => {
    setVaultScanner(() => ({ vaultId: 'judge-v1' }));
    tripwire.grantCloud({ id: 'p-s4', scanText: false });
    const before = spy.mock.calls.length;
    await fetch(AI_URL, { method: 'POST', body: body('Lucas sample') });
    expect(spy.mock.calls.length).toBe(before + 1);
  });

  it('scans the countTokens wrapper body too (review privacy-correctness-4)', async () => {
    setVaultScanner((texts) => (texts.some((t) => t.includes('Lucas')) ? { vaultId: 'v1' } : null));
    tripwire.grantCloud({ id: 'p4', scanText: true });
    const wrapped = JSON.stringify({ generateContentRequest: { model: 'models/x', contents: [{ parts: [{ text: 'Lucas' }] }] } });
    await expect(fetch(AI_URL.replace(':generateContent', ':countTokens'), { method: 'POST', body: wrapped }))
      .rejects.toMatchObject({ reason: 'VAULT_TEXT' });
  });

  it('fails closed on bodies it cannot scan', async () => {
    setVaultScanner(() => null);
    tripwire.grantCloud({ id: 'p5', scanText: true });
    await expect(fetch(AI_URL, { method: 'POST', body: new Blob(['Lucas']) })).rejects.toMatchObject({ reason: 'UNSCANNABLE_BODY' });
    tripwire.grantCloud({ id: 'p6', scanText: true });
    await expect(fetch(new Request(AI_URL, { method: 'POST', body: 'Lucas' }))).rejects.toMatchObject({ reason: 'UNSCANNABLE_BODY' });
  });

  it('matches the AI host case-insensitively', async () => {
    tripwire.grantCloud({ id: 'p7', scanText: true });
    setVaultScanner(() => ({ vaultId: 'v9' }));
    await expect(fetch(AI_URL.replace(AI_HOST, AI_HOST.toUpperCase()), { method: 'POST', body: body('x') }))
      .rejects.toMatchObject({ reason: 'VAULT_TEXT' });
  });
});

describe('tripwire on a fresh module (no setVaultScanner yet)', () => {
  const realFetch = globalThis.fetch;
  const spy = vi.fn(async () => new Response('ok'));
  let fresh: typeof import('./tripwire');

  beforeAll(async () => {
    globalThis.fetch = spy as unknown as typeof fetch;
    vi.resetModules(); // independent of the order of the tests above: new module state, no scanner registered
    fresh = await import('./tripwire');
    fresh.installTripwire();
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it('fails closed with NO_SCANNER on an AI-host request, even with a permit (boot has not run vaultScan.init)', async () => {
    fresh.tripwire.grantCloud({ id: 'boot-1', scanText: true });
    await expect(fetch(AI_URL, { method: 'POST', body: body('hello') })).rejects.toMatchObject({ reason: 'NO_SCANNER' });
    fresh.tripwire.grantCloud({ id: 'boot-2', scanText: false }); // an S4 permit does not bypass it either
    await expect(fetch(AI_URL, { method: 'POST', body: body('hello') })).rejects.toMatchObject({ reason: 'NO_SCANNER' });
    expect(spy).not.toHaveBeenCalled();
    await fetch('data:image/jpeg;base64,QUJD'); // non-AI traffic is unaffected
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('lets the request through once a scanner is registered', async () => {
    fresh.setVaultScanner(() => null);
    fresh.tripwire.grantCloud({ id: 'boot-3', scanText: true });
    const before = spy.mock.calls.length; // a delta, so the test does not depend on clearMocks or test order
    await fetch(AI_URL, { method: 'POST', body: body('hello') });
    expect(spy.mock.calls.length - before).toBe(1);
  });
});

describe('isAiHost', () => {
  it('recognises the AI Logic host and only that host', () => {
    expect(isAiHost(`https://${AI_HOST}/v1beta/x`)).toBe(true);
    expect(isAiHost(`https://${AI_HOST.toUpperCase()}/x`)).toBe(true);
    expect(isAiHost(`https://us-central1-${AI_HOST}/x`)).toBe(true);
    expect(isAiHost('https://example.com/firebasevertexai.googleapis.com')).toBe(false);
    expect(isAiHost('/assets/x.js')).toBe(false);
    expect(isAiHost('data:image/jpeg;base64,QUJD')).toBe(false);
  });
});

describe('extractTextParts', () => {
  it('returns text and systemInstruction parts, never base64 image data', () => {
    const b = JSON.stringify({
      contents: [{ parts: [{ text: 'a' }, { inlineData: { data: 'Lucas' } }] }],
      systemInstruction: { parts: [{ text: 'rules' }] },
    });
    expect(extractTextParts(b)).toEqual(['a', 'rules']);
  });
  it('collects every string value in any shape, except base64 image bytes', () => {
    expect(extractTextParts(JSON.stringify({ inputs: { kid: 'Lucas' } }))).toEqual(['Lucas']);
    expect(extractTextParts(JSON.stringify('Lucas'))).toEqual(['Lucas']);
    expect(extractTextParts(JSON.stringify({ tools: [{ functionDeclarations: [{ description: 'Lucas' }] }] }))).toContain('Lucas');
  });
  it('scans the whole body when it is not JSON (fail closed)', () => {
    expect(extractTextParts('raw Lucas')).toEqual(['raw Lucas']);
  });
});
