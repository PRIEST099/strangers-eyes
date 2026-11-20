import { describe, expect, it } from 'vitest';
import { createDeviceQueue } from './deviceQueue';

/** A promise the test resolves or rejects by hand. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

describe('deviceQueue (AD-19)', () => {
  it('runs one call at a time, in FIFO order', async () => {
    const q = createDeviceQueue();
    const events: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    const results = gates.map((g, i) =>
      q.run(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        events.push(`start${i}`);
        await g.promise;
        events.push(`end${i}`);
        running--;
        return i;
      }),
    );
    await settle();
    expect(events).toEqual(['start0']);
    expect(q.pending()).toBe(3);
    gates[2]?.resolve(); // finishing out of order changes nothing: call 2 has not started
    gates[1]?.resolve();
    await settle();
    expect(events).toEqual(['start0']);
    gates[0]?.resolve();
    expect(await Promise.all(results)).toEqual([0, 1, 2]);
    expect(events).toEqual(['start0', 'end0', 'start1', 'end1', 'start2', 'end2']);
    expect(maxRunning).toBe(1);
    await settle();
    expect(q.pending()).toBe(0);
  });

  it('a rejection settles only its own caller and does not break the queue', async () => {
    const q = createDeviceQueue();
    const a = q.run(async () => { throw new Error('device failed'); });
    const b = q.run(() => { throw new Error('sync throw'); }); // a synchronous throw is caught too
    const c = q.run(async () => 'ok');
    await expect(a).rejects.toThrow('device failed');
    await expect(b).rejects.toThrow('sync throw');
    await expect(c).resolves.toBe('ok');
    await settle();
    expect(q.pending()).toBe(0);
  });

  it('does not start the next call until the previous one has settled, even if it rejects late', async () => {
    const q = createDeviceQueue();
    const d = deferred<string>();
    const order: string[] = [];
    const first = q.run(() => d.promise).catch(() => order.push('first rejected'));
    const second = q.run(async () => { order.push('second started'); });
    await settle();
    expect(order).toEqual([]);
    d.reject(new Error('late'));
    await Promise.all([first, second]);
    expect(order).toEqual(['first rejected', 'second started']);
  });
});
