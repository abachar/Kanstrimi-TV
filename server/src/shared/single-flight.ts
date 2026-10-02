export type SingleFlight<T> = ((key: string, fn: () => Promise<T>) => Promise<T>) & {
  /** Keys that failed within the retry delay (tests). */
  failures: () => number;
  /** Resolves once the calls in flight now are over (tests). */
  idle: () => Promise<void>;
  /** Forget the failures and the calls in flight (tests). */
  reset: () => void;
};

/**
 * One call per key at a time: a caller asking for a key already running joins it. Never fails: a
 * failure answers `fallback`, goes to `onError`, and with `retryAfterMs` the key answers `fallback`
 * without calling for that long. Expired failures are swept at the next one, so the map never grows.
 */
export function singleFlight<T>(
  fallback: T,
  opts: { retryAfterMs?: number; onError?: (e: unknown, key: string) => void } = {},
): SingleFlight<T> {
  const retryAfterMs = opts.retryAfterMs ?? 0;
  const inFlight = new Map<string, Promise<T>>();
  const failedAt = new Map<string, number>();
  const run = (key: string, fn: () => Promise<T>): Promise<T> => {
    const failed = failedAt.get(key);
    if (failed !== undefined && Date.now() - failed < retryAfterMs) return Promise.resolve(fallback);
    let p = inFlight.get(key);
    if (!p) {
      let started: Promise<T>;
      try {
        started = fn();
      } catch (e) {
        started = Promise.reject(e);
      }
      p = started
        .then(
          (v) => {
            failedAt.delete(key);
            return v;
          },
          (e) => {
            if (retryAfterMs) {
              const now = Date.now();
              for (const [k, at] of failedAt) if (now - at >= retryAfterMs) failedAt.delete(k);
              failedAt.set(key, now);
            }
            opts.onError?.(e, key);
            return fallback;
          },
        )
        .finally(() => inFlight.delete(key));
      inFlight.set(key, p);
    }
    return p;
  };
  return Object.assign(run, {
    failures: () => failedAt.size,
    idle: async () => {
      await Promise.all(inFlight.values());
    },
    reset: () => {
      inFlight.clear();
      failedAt.clear();
    },
  });
}
