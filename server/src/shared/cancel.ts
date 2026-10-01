import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Cooperative stop of a long task. The pipeline runs each task under its own signal; the steps
 * call `checkCancelled()` between two units of work (a chunk, a TMDB call, a batch of the guide),
 * so a stop never cuts a write in half: the call in flight ends, nothing new starts.
 */
const current = new AsyncLocalStorage<AbortSignal>();

export class Cancelled extends Error {
  constructor() {
    super("Arrêté depuis l'admin");
    this.name = "Cancelled";
  }
}

export const withCancel = <T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> => current.run(signal, fn);

/** Throws `Cancelled` once the task running this code was asked to stop; nothing outside a task. */
export function checkCancelled() {
  if (current.getStore()?.aborted) throw new Cancelled();
}

/** The same check, bound now: for callbacks a queue may run outside the caller's async context. */
export function cancelGuard(): () => void {
  const signal = current.getStore();
  return () => {
    if (signal?.aborted) throw new Cancelled();
  };
}

export const isCancelled = (e: unknown): e is Cancelled => e instanceof Cancelled;
