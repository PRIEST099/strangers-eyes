// web/src/ui/router.ts: the hash router (SPEC §8.1 route table, D-27; ARCH §3.4). Pure functions, no DOM access
// except through the arguments of applyBootRedirect, so the parsing is unit-tested in Node.
//
// Not routes (ARCH §3.4): SCR-01 Welcome renders in place of any route until the 18+ acknowledgement is stored
// (T-091); SCR-02 is a sheet; the Cloud Ledger is a rail or a sheet.

export type AppRoute =
  | { name: 'home' }
  | { name: 'vault' }
  | { name: 'check'; sessionId: string | null } // #/check/<sessionId> reopens a recent check (P1)
  | { name: 'judge' }
  | { name: 'settings' }
  | { name: 'about' }
  | { name: 'atlas' } // P1
  | { name: 'dev'; page: string }; // DEV builds only (#/dev/*); never produced when opts.dev is false

export type RouteName = AppRoute['name'];
export type ProductRouteName = Exclude<RouteName, 'dev'>;

/** Every product route of SPEC §8.1. AC-065: each exists in the production build. */
export const PRODUCT_ROUTES: readonly ProductRouteName[] = ['home', 'vault', 'check', 'judge', 'settings', 'about', 'atlas'];

const HOME: AppRoute = { name: 'home' };
const SESSION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const DEV_PAGE = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** Routes with no parameters. A Map, so `#/constructor` and other Object.prototype keys never match. */
const SIMPLE: ReadonlyMap<string, AppRoute> = new Map<string, AppRoute>([
  ['vault', { name: 'vault' }],
  ['judge', { name: 'judge' }],
  ['settings', { name: 'settings' }],
  ['about', { name: 'about' }],
  ['atlas', { name: 'atlas' }],
]);

function decode(seg: string): string | null {
  try {
    return decodeURIComponent(seg);
  } catch {
    return null; // malformed %-escape
  }
}

/**
 * Map `location.hash` to a route. Unknown or malformed hashes are Home. `#/dev/*` resolves only when `opts.dev`
 * is true (App passes `import.meta.env.DEV`), so a production build has no way to reach a dev page.
 */
export function parseHash(hash: string, opts: { dev: boolean }): AppRoute {
  let path = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = path.indexOf('?');
  if (q >= 0) path = path.slice(0, q);
  if (path !== '' && !path.startsWith('/')) return HOME; // a plain fragment such as #main is not a route
  const segs = path.split('/').filter((s) => s.length > 0);
  if (segs.length === 0) return HOME;
  const head = segs[0].toLowerCase();
  const rest = segs.slice(1);

  const simple = SIMPLE.get(head);
  if (simple) return rest.length === 0 ? { ...simple } : HOME;
  if (head === 'check') {
    if (rest.length === 0) return { name: 'check', sessionId: null };
    const id = rest.length === 1 ? decode(rest[0]) : null;
    return id !== null && SESSION_ID.test(id) ? { name: 'check', sessionId: id } : HOME;
  }
  if (head === 'dev' && opts.dev && rest.length >= 1 && DEV_PAGE.test(rest[0])) return { name: 'dev', page: rest[0] };
  return HOME;
}

/** The canonical hash for a route (the inverse of parseHash for every valid route). */
export function hrefFor(route: AppRoute): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'check':
      return route.sessionId === null ? '#/check' : `#/check/${encodeURIComponent(route.sessionId)}`;
    case 'dev':
      return import.meta.env.DEV ? `#/dev/${route.page}` : '#/'; // keeps even the "#/dev/" text out of production
    default:
      return `#/${route.name}`;
  }
}

/**
 * The deep link `?judge=1` goes to `#/judge` (SPEC §8.1, D-27). Returns the new search and hash, or null when no
 * redirect is needed. Other query parameters (e.g. `?debug=1`, ARCH §3.4) are kept.
 */
export function bootRedirect(search: string): { search: string; hash: string } | null {
  const params = new URLSearchParams(search);
  if (params.get('judge') !== '1') return null;
  params.delete('judge');
  const rest = params.toString();
  return { search: rest ? `?${rest}` : '', hash: '#/judge' };
}

/** Apply bootRedirect once at startup, before the first render (main.tsx). replaceState adds no history entry. */
export function applyBootRedirect(
  loc: Pick<Location, 'pathname' | 'search'>,
  hist: Pick<History, 'replaceState'>,
): boolean {
  const next = bootRedirect(loc.search);
  if (!next) return false;
  hist.replaceState(null, '', `${loc.pathname}${next.search}${next.hash}`);
  return true;
}
