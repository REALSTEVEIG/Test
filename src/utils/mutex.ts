/**
 * A tiny per-key async mutex.
 *
 * Guarantees that async critical sections keyed by the same string run one at a
 * time, in FIFO order. This prevents lost-update race conditions when, for
 * example, a background processing task and a manual status update touch the
 * same payment concurrently (both do read-modify-write on the store).
 *
 * This is an in-process lock only. A multi-instance deployment would use a
 * distributed lock or database-level concurrency control instead — see the
 * store abstraction for where that would plug in.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // The previous task queued for this key (or a resolved promise).
    const previous = this.tails.get(key) ?? Promise.resolve();

    // Our run starts once the previous one settles (success or failure).
    const run = previous.then(fn, fn);

    // Record our run as the new tail so the next caller waits for us.
    this.tails.set(key, run);

    try {
      return await run;
    } finally {
      // If no one queued after us, drop the key to avoid unbounded growth.
      if (this.tails.get(key) === run) {
        this.tails.delete(key);
      }
    }
  }
}
