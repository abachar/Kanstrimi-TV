/**
 * The catalogue's writers that touch the same rows — `merge`, the rules, the grouping and the
 * admin's regroups — run one at a time, in call order. Not reentrant: a locked function never
 * calls another locked one, only their unlocked parts.
 */
let tail: Promise<unknown> = Promise.resolve();

export function withCatalogLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.catch(() => {});
  return run;
}
