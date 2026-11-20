import { describe, expect, it, vi } from 'vitest';
import { applyBootRedirect, bootRedirect, hrefFor, parseHash, PRODUCT_ROUTES, type AppRoute } from './router';

const prod = (h: string) => parseHash(h, { dev: false });
const dev = (h: string) => parseHash(h, { dev: true });

describe('parseHash: SPEC §8.1 route table', () => {
  it.each<[string, AppRoute]>([
    ['', { name: 'home' }],
    ['#', { name: 'home' }],
    ['#/', { name: 'home' }],
    ['#/vault', { name: 'vault' }],
    ['#/check', { name: 'check', sessionId: null }],
    ['#/check/s_01-AbC', { name: 'check', sessionId: 's_01-AbC' }],
    ['#/judge', { name: 'judge' }],
    ['#/settings', { name: 'settings' }],
    ['#/about', { name: 'about' }],
    ['#/atlas', { name: 'atlas' }],
  ])('%s', (hash, route) => {
    expect(prod(hash)).toEqual(route);
  });

  it('tolerates a trailing slash, a query inside the hash and a capitalised head', () => {
    expect(prod('#/vault/')).toEqual({ name: 'vault' });
    expect(prod('#/settings?x=1')).toEqual({ name: 'settings' });
    expect(prod('#/Judge')).toEqual({ name: 'judge' });
  });

  it('sends unknown or malformed hashes to Home', () => {
    for (const h of ['#/nope', '#/vault/extra', '#/check/a/b', '#/check/bad%zz', '#/check/has space', '#main', '#/check/' + 'x'.repeat(65), '#/ledger', '#/constructor', '#/__proto__', '#/toString']) {
      expect(prod(h)).toEqual({ name: 'home' });
    }
  });

  it('never resolves #/dev/* in a production build (AC-065)', () => {
    for (const h of ['#/dev/selftest', '#/dev/spike', '#/dev/bench', '#/dev/slice', '#/dev']) {
      expect(prod(h)).toEqual({ name: 'home' });
    }
  });

  it('resolves #/dev/<page> only in DEV builds', () => {
    expect(dev('#/dev/selftest')).toEqual({ name: 'dev', page: 'selftest' });
    expect(dev('#/dev/bench/run')).toEqual({ name: 'dev', page: 'bench' });
    expect(dev('#/dev')).toEqual({ name: 'home' });
    expect(dev('#/dev/Bad_Page')).toEqual({ name: 'home' });
  });

  it('covers every product route, and hrefFor round-trips', () => {
    expect(PRODUCT_ROUTES).toEqual(['home', 'vault', 'check', 'judge', 'settings', 'about', 'atlas']);
    const routes: AppRoute[] = [
      ...PRODUCT_ROUTES.map((name) => (name === 'check' ? { name, sessionId: null } : { name }) as AppRoute),
      { name: 'check', sessionId: 'abc-123' },
    ];
    for (const r of routes) expect(prod(hrefFor(r))).toEqual(r);
    expect(hrefFor({ name: 'home' })).toBe('#/');
    expect(dev(hrefFor({ name: 'dev', page: 'selftest' }))).toEqual({ name: 'dev', page: 'selftest' });
  });
});

describe('?judge=1 deep link (D-27)', () => {
  it('redirects to #/judge and drops only the judge parameter', () => {
    expect(bootRedirect('?judge=1')).toEqual({ search: '', hash: '#/judge' });
    expect(bootRedirect('?debug=1&judge=1')).toEqual({ search: '?debug=1', hash: '#/judge' });
  });

  it('does nothing without judge=1', () => {
    for (const s of ['', '?', '?debug=1', '?judge=0', '?judge=true', '?judges=1']) expect(bootRedirect(s)).toBeNull();
  });

  it('applyBootRedirect replaces the URL without a new history entry', () => {
    const replaceState = vi.fn();
    expect(applyBootRedirect({ pathname: '/', search: '?judge=1' }, { replaceState })).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/#/judge');
    replaceState.mockClear();
    expect(applyBootRedirect({ pathname: '/', search: '' }, { replaceState })).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
  });
});
