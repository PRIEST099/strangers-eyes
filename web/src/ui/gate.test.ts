// T-091/T-094: what App shows before any route (ui/gate.ts).
import { afterEach, describe, expect, it } from 'vitest';
import { browserSupported, capabilityAfterWelcome, detectBrowserSupport, isDebugSearch, topScreen } from './gate';
import { PRODUCT_ROUTES, parseHash } from './router';

describe('browserSupported (SCR-22: no WebAssembly or no IndexedDB → the full-page message)', () => {
  it.each([
    ['object', 'object', 'function', true],
    ['undefined', 'object', 'function', false],
    ['object', 'undefined', 'function', false],
    ['object', 'object', 'undefined', false],
    ['undefined', 'undefined', 'undefined', false],
    ['function', 'object', 'function', false],
  ])('wasm=%s idb=%s deleteDatabase=%s → %s', (wasm, idb, idbDelete, ok) => {
    expect(browserSupported({ wasm, idb, idbDelete })).toBe(ok);
  });
});

describe('detectBrowserSupport never throws (a crash here would blank the app)', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  afterEach(() => {
    if (had) Object.defineProperty(globalThis, 'indexedDB', had);
    else delete (globalThis as Record<string, unknown>).indexedDB;
  });
  const setIdb = (desc: PropertyDescriptor) => Object.defineProperty(globalThis, 'indexedDB', { configurable: true, ...desc });

  it('Node has WebAssembly but no IndexedDB: unsupported, no ReferenceError', () => {
    delete (globalThis as Record<string, unknown>).indexedDB;
    expect(typeof WebAssembly).toBe('object');
    expect(detectBrowserSupport()).toBe(false);
  });

  it('a real IDBFactory shape is supported', () => {
    setIdb({ value: { deleteDatabase: () => {}, open: () => {} } });
    expect(detectBrowserSupport()).toBe(true);
  });

  it('indexedDB === null (Firefox with IndexedDB disabled) is unsupported', () => {
    setIdb({ value: null });
    expect(detectBrowserSupport()).toBe(false);
  });

  it('an indexedDB getter that throws (site data blocked) is unsupported, not a crash', () => {
    setIdb({ get() { throw new DOMException('denied', 'SecurityError'); } });
    expect(() => detectBrowserSupport()).not.toThrow();
    expect(detectBrowserSupport()).toBe(false);
  });

  it('an object without deleteDatabase is unsupported', () => {
    setIdb({ value: {} });
    expect(detectBrowserSupport()).toBe(false);
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
