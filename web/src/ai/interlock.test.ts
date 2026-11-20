import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createInterlock, InterlockError, type InterlockTripwire } from './interlock';
import { AI_HOST, type TripwireObservation } from './tripwire';

/** A fake tripwire that records calls and lets a test "issue" a permitted fetch. */
function fakeTripwire() {
  const log: string[] = [];
  const observers = new Set<(o: TripwireObservation) => void>();
  const tw: InterlockTripwire = {
    enterLocal: () => { log.push('enterLocal'); },
    exitLocal: () => { log.push('exitLocal'); },
    revokeCloud: (id: string) => { log.push(`revoke:${id}`); },
    observe: (fn) => {
      observers.add(fn);
      return () => { observers.delete(fn); };
    },
  };
  const fetched = (permitId: string) =>
    observers.forEach((fn) => fn({ permitId, url: 'https://ai.invalid/x', bytes: 0, textParts: [], at: 0 }));
  return { tw, log, fetched, observerCount: () => observers.size };
}

/** Lets every pending promise continuation run. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

/** Tracks whether a promise has resolved or rejected yet. */
function track(p: Promise<void>) {
  const t = { done: false, error: null as unknown };
  p.then(() => { t.done = true; }, (e: unknown) => { t.error = e; });
  return t;
}

describe('interlock (AD-18)', () => {
  it('admits a local call at once when idle and holds the tripwire lock until exit', async () => {
    const { tw, log } = fakeTripwire();
    const il = createInterlock(tw);
    await il.enterLocal('s0');
    expect(il.state().localHeld).toBe(1);
    expect(log).toEqual(['enterLocal']);
    il.exit('s0');
    expect(il.state().localHeld).toBe(0);
    expect(log).toEqual(['enterLocal', 'exitLocal']);
  });

  it('holds a cloud call back while an S0/S1 call runs', async () => {
    const { tw } = fakeTripwire();
    const il = createInterlock(tw);
    await il.enterLocal('s0');
    const c = track(il.enterCloud('s3'));
    await settle();
    expect(c.done).toBe(false);
    expect(il.state().cloudPrefetch).toEqual([]);
    il.exit('s0');
    await settle();
    expect(c.done).toBe(true);
    expect(il.state().cloudPrefetch).toEqual(['s3']);
  });

  it('holds a local call back while a cloud call is authorised but has not fetched, and releases it on fetch', async () => {
    const { tw, log, fetched } = fakeTripwire();
    const il = createInterlock(tw);
    await il.enterCloud('s3');
    const l = track(il.enterLocal('s0'));
    await settle();
    expect(l.done).toBe(false);
    expect(log).toEqual([]); // the tripwire lock is not taken while waiting

    fetched('s3'); // the tripwire saw the cloud call's fetch go out
    expect(il.state()).toMatchObject({ localHeld: 1, cloudPrefetch: [], cloudLive: 1 }); // synchronous admission
    await settle();
    expect(l.done).toBe(true);
    expect(log).toEqual(['enterLocal']);

    il.exit('s3'); // fetched already: nothing to revoke
    expect(log).toEqual(['enterLocal']);
    il.exit('s0');
    expect(log).toEqual(['enterLocal', 'exitLocal']);
  });

  it('revokes the permit of a cloud call that exits without fetching (S2 answered on device) and wakes local waiters', async () => {
    const { tw, log } = fakeTripwire();
    const il = createInterlock(tw);
    await il.enterCloud('s2');
    const l = track(il.enterLocal('s0'));
    il.exit('s2');
    expect(log).toEqual(['revoke:s2', 'enterLocal']);
    await settle();
    expect(l.done).toBe(true);
  });

  it('never has a local holder and a pre-fetch cloud call at the same time', async () => {
    const { tw, fetched } = fakeTripwire();
    const il = createInterlock(tw);
    const order: string[] = [];
    const run = async (kind: 'local' | 'cloud', id: string) => {
      await (kind === 'local' ? il.enterLocal(id) : il.enterCloud(id));
      order.push(`in:${id}`);
      const s = il.state();
      expect(s.localHeld > 0 && s.cloudPrefetch.length > 0).toBe(false);
    };
    const all = [run('cloud', 'a'), run('cloud', 'b'), run('local', 'l1'), run('cloud', 'c'), run('local', 'l2')];
    await settle();
    expect(order).toEqual(['in:a']); // D-75: b waits for a's fetch; l1, c and l2 queue behind b
    fetched('a');
    await settle();
    expect(order).toEqual(['in:a', 'in:b']);
    fetched('b');
    await settle();
    expect(order).toEqual(['in:a', 'in:b', 'in:l1']); // c is next in line, so l2 does not jump ahead of it
    il.exit('l1');
    await settle();
    expect(order).toEqual(['in:a', 'in:b', 'in:l1', 'in:c']);
    il.exit('c'); // c never fetched: revoked, then l2 goes
    await settle();
    expect(order).toEqual(['in:a', 'in:b', 'in:l1', 'in:c', 'in:l2']);
    await Promise.all(all);
  });

  it('is fair: a stream of cloud calls cannot starve a waiting local call', async () => {
    const { tw, fetched } = fakeTripwire();
    const il = createInterlock(tw);
    await il.enterCloud('c1');
    const l = track(il.enterLocal('s0'));
    const c2 = track(il.enterCloud('c2')); // no S0/S1 holds the lock, but s0 is waiting first
    await settle();
    expect(c2.done).toBe(false);
    fetched('c1');
    await settle();
    expect(l.done).toBe(true);
    expect(c2.done).toBe(false);
    il.exit('s0');
    await settle();
    expect(c2.done).toBe(true);
  });

  it('is fair: a stream of local calls cannot starve a waiting cloud call', async () => {
    const { tw } = fakeTripwire();
    const il = createInterlock(tw);
    await il.enterLocal('l1');
    const c = track(il.enterCloud('c1'));
    const l2 = track(il.enterLocal('l2')); // the lock is local already, but c1 is waiting first
    await settle();
    expect(l2.done).toBe(false);
    il.exit('l1');
    await settle();
    expect(c.done).toBe(true);
    expect(l2.done).toBe(false);
    il.exit('c1');
    await settle();
    expect(l2.done).toBe(true);
  });

  it('D-75: admits only one pre-fetch cloud call at a time; the next goes in once the first fetch is issued', async () => {
    const { tw, fetched, log } = fakeTripwire();
    const il = createInterlock(tw);
    await il.enterCloud('a'); // pass A authorised
    const b = track(il.enterCloud('b')); // pass B must wait until A's permit is consumed
    await settle();
    expect(b.done).toBe(false);
    expect(il.state().cloudPrefetch).toEqual(['a']);
    fetched('a');
    await settle();
    expect(b.done).toBe(true);
    expect(il.state()).toMatchObject({ cloudPrefetch: ['b'], cloudLive: 2 });
    il.exit('a');
    fetched('b');
    il.exit('b');
    expect(log.filter((x) => x.startsWith('revoke'))).toEqual([]);
  });

  it('D-75: a waiting cloud call is admitted when the pre-fetch one exits without fetching (its permit revoked)', async () => {
    const { tw, log } = fakeTripwire();
    const il = createInterlock(tw);
    await il.enterCloud('s2'); // e.g. explain answered on Nano
    const s3 = track(il.enterCloud('s3'));
    await settle();
    expect(s3.done).toBe(false);
    il.exit('s2');
    await settle();
    expect(s3.done).toBe(true);
    expect(log).toContain('revoke:s2');
  });

  it('admits consecutive waiters of one kind together', async () => {
    const { tw, log } = fakeTripwire();
    const il = createInterlock(tw);
    await il.enterCloud('c1');
    const ls = ['l1', 'l2', 'l3'].map((id) => track(il.enterLocal(id)));
    il.exit('c1');
    await settle();
    expect(ls.every((t) => t.done)).toBe(true);
    expect(il.state().localHeld).toBe(3);
    expect(log.filter((x) => x === 'enterLocal')).toHaveLength(3);
    il.exit('l2');
    il.exit('l1');
    expect(il.state().localHeld).toBe(1);
  });

  it('rejects a duplicate id, held or waiting', async () => {
    const { tw } = fakeTripwire();
    const il = createInterlock(tw);
    await il.enterLocal('x');
    await expect(il.enterCloud('x')).rejects.toMatchObject({ code: 'DUPLICATE_ID', id: 'x' });
    const w = il.enterCloud('y');
    await expect(il.enterLocal('y')).rejects.toBeInstanceOf(InterlockError);
    il.exit('x');
    await w;
    il.exit('y');
  });

  it('allows an id to be reused after exit (RECLASSIFY reuses the Ledger id)', async () => {
    const { tw } = fakeTripwire();
    const il = createInterlock(tw);
    await il.enterCloud('id1');
    il.exit('id1');
    await il.enterLocal('id1');
    expect(il.state().localHeld).toBe(1);
  });

  it('exit is idempotent and ignores unknown ids', async () => {
    const { tw, log } = fakeTripwire();
    const il = createInterlock(tw);
    await il.enterLocal('a');
    await il.enterLocal('b');
    il.exit('a');
    il.exit('a');
    il.exit('nope');
    expect(il.state().localHeld).toBe(1);
    expect(log.filter((x) => x === 'exitLocal')).toHaveLength(1);
  });

  it('exit of a waiting id rejects its wait and lets the queue move on', async () => {
    const { tw } = fakeTripwire();
    const il = createInterlock(tw);
    await il.enterLocal('l1');
    const c = il.enterCloud('c1');
    const l2 = track(il.enterLocal('l2'));
    il.exit('c1');
    await expect(c).rejects.toMatchObject({ code: 'EXITED_WHILE_WAITING' });
    await settle();
    expect(l2.done).toBe(true); // c1 no longer blocks the head of the queue
    expect(il.state().waiting).toEqual([]);
  });

  it('ignores observations for permits it did not admit, and dispose stops observing', async () => {
    const { tw, fetched, observerCount } = fakeTripwire();
    const il = createInterlock(tw);
    await il.enterCloud('c1');
    fetched('other');
    expect(il.state().cloudPrefetch).toEqual(['c1']);
    il.dispose();
    expect(observerCount()).toBe(0);
  });
});

describe('interlock + real tripwire', () => {
  const AI_URL = `https://${AI_HOST}/v1beta/projects/demo/models/x:streamGenerateContent`;
  const body = JSON.stringify({ contents: [{ parts: [{ text: 'describe the scene' }] }] });
  const realFetch = globalThis.fetch;
  const spy = vi.fn(async () => new Response('ok'));
  let tw: typeof import('./tripwire');
  let il: typeof import('./interlock');

  beforeAll(async () => {
    globalThis.fetch = spy as unknown as typeof fetch;
    vi.resetModules(); // a fresh tripwire (module state) for this block
    tw = await import('./tripwire');
    il = await import('./interlock');
    tw.installTripwire();
    tw.setVaultScanner(() => null);
  });
  afterAll(() => {
    il.interlock.dispose();
    globalThis.fetch = realFetch;
  });

  it('S0 waits for the authorised cloud fetch to go out; a cloud fetch during S0 trips LOCAL_LOCK', async () => {
    await il.interlock.enterCloud('s3');
    tw.tripwire.grantCloud({ id: 's3', scanText: true });
    const l = track(il.interlock.enterLocal('s0'));
    await settle();
    expect(l.done).toBe(false);
    expect(tw.tripwire.isLocalHeld()).toBe(false);

    const before = spy.mock.calls.length;
    await fetch(AI_URL, { method: 'POST', body }); // passes the tripwire; its observer releases the S0 call
    expect(spy.mock.calls.length - before).toBe(1);
    await settle();
    expect(l.done).toBe(true);
    expect(tw.tripwire.isLocalHeld()).toBe(true);

    await expect(fetch(AI_URL, { method: 'POST', body })).rejects.toMatchObject({ reason: 'LOCAL_LOCK' });
    il.interlock.exit('s0');
    il.interlock.exit('s3');
    expect(tw.tripwire.isLocalHeld()).toBe(false);
  });

  it('D-75: an S3 fetch can never use a pending S4 permit (scanText:false), so its vault-text scan always runs', async () => {
    tw.setVaultScanner((texts) => (texts.some((t) => t.includes('LUCAS')) ? { vaultId: 'v-child' } : null));
    await il.interlock.enterCloud('s4'); // Judge Mode sample call: its permit skips the text scan
    tw.tripwire.grantCloud({ id: 's4', scanText: false });
    const s3 = track(il.interlock.enterCloud('s3')); // must wait: one pre-fetch permit at a time
    await settle();
    expect(s3.done).toBe(false);
    await fetch(AI_URL, { method: 'POST', body }); // the S4 fetch consumes the S4 permit
    await settle();
    expect(s3.done).toBe(true);
    tw.tripwire.grantCloud({ id: 's3', scanText: true });
    const leaky = JSON.stringify({ contents: [{ parts: [{ text: 'hi LUCAS' }] }] });
    await expect(fetch(AI_URL, { method: 'POST', body: leaky })).rejects.toMatchObject({ reason: 'VAULT_TEXT' });
    il.interlock.exit('s4');
    il.interlock.exit('s3');
    tw.setVaultScanner(() => null);
  });

  it('a cloud permit revoked on exit cannot be used by a later fetch', async () => {
    await il.interlock.enterCloud('s2');
    tw.tripwire.grantCloud({ id: 's2', scanText: true });
    il.interlock.exit('s2'); // answered on device, never fetched
    await expect(fetch(AI_URL, { method: 'POST', body })).rejects.toMatchObject({ reason: 'NO_PERMIT' });
  });
});
