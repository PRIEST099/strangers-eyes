// web/src/ai/deviceQueue.ts — device-capable calls run single-flight (AD-19, ARCH §8.2 step 4).
// The SDK creates a new Chrome on-device session per call and destroys the previous one, and 8 GB of RAM is tight,
// so at most one device-capable call runs at a time. Calls start in FIFO order; a rejection (or a synchronous throw)
// settles only its own caller and never blocks the calls behind it.
// No timeout here: a call that never settles would block the queue, so the device timeout (Promise.race, ARCH §9.4)
// must wrap the invoke INSIDE fn, i.e. deviceQueue.run(() => withTimeout(invoke())), never around run() (D-75).

export interface DeviceQueue {
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Calls queued or running (for the Router HUD and tests). */
  pending(): number;
}

export function createDeviceQueue(): DeviceQueue {
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      pending++;
      const result = tail.then(() => fn());
      tail = result.then(
        () => { pending--; },
        () => { pending--; },
      );
      return result;
    },
    pending: () => pending,
  };
}

/** The app-wide queue: every device-capable call goes through it. */
export const deviceQueue: DeviceQueue = createDeviceQueue();
