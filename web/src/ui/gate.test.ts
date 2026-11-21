// T-091/T-094: what App shows before any route (ui/gate.ts).
import { describe, expect, it } from 'vitest';
import { browserSupported, capabilityAfterWelcome, detectBrowserSupport, isDebugSearch, topScreen } from './gate';
import { PRODUCT_ROUTES, parseHash } from './router';

describe('browserSupported (SCR-22: no WebAssembly or no IndexedDB → the full-page message)', () => {
  it.each([
    ['object', 'object', true],
    ['undefined', 'object', false],
    ['object', 'undefined', false],
    ['undefined', 'undefined', false],
    ['function', 'object', false],
  ])('wasm=%s idb=%s → %s', (wasm, idb, ok) => {
    expect(browserSupported({ wasm, idb })).toBe(ok);
  });

  it('Node has WebAssembly but no IndexedDB, so the live check says unsupported here', () => {
    expect(typeof WebAssembly).toBe('object');
    expect(detectBrowserSupport()).toBe(typeof indexedDB === 'object');
  });
});

describe('topScreen', () => {
  it('unsupported wins over everything; then Welcome until the acknowledgement; then the app', () => {
    expect(topScreen({ supported: false, acknowledged: false })).toBe('unsupported');
    expect(topScreen({ supported: false, acknowledged: true })).toBe('unsupported');
    expect(topScreen({ supported: true, acknowledged: false })).toBe('welcome');
    expect(topScreen({ supported: true, acknowledged: true })).toBe('app');
  });
});

describe('capabilityAfterWelcome (AC-071: SCR-01 → SCR-02 → Judge Mode)', () => {
  it.each(PRODUCT_ROUTES)('%s', (name) => {
    const route = parseHash(`#/${name === 'home' ? '' : name}`, { dev: false });
    expect(capabilityAfterWelcome(route)).toBe(name === 'judge');
  });
});

describe('isDebugSearch (?debug=1 shows Settings › Developer)', () => {
  it.each([
    ['?debug=1', true],
    ['?x=2&debug=1', true],
    ['debug=1', true],
    ['', false],
    ['?debug=0', false],
    ['?debug=true', false],
    ['?debug', false],
    ['?DEBUG=1', false],
  ])('%s → %s', (search, on) => {
    expect(isDebugSearch(search)).toBe(on);
  });
});
