/**
 * Failed logins per address, as `devices/pairing.ts` counts pairing codes: five are free, then each
 * failure doubles the wait before the next try (1 s, 2 s, 4 s… 15 min at most). A success or an hour
 * without a try forgets the address; the forgotten ones are swept at each failure, the map stays small.
 */
const FREE = 5;
const BASE_MS = 1000;
const MAX_MS = 15 * 60 * 1000;
const FORGET_MS = 60 * 60 * 1000;

const failures = new Map<string, { count: number; last: number }>();

/** Milliseconds this address must still wait before its next try; 0 = it may try now. */
export function loginWait(ip: string): number {
  const f = failures.get(ip);
  if (!f || f.count < FREE) return 0;
  const wait = Math.min(MAX_MS, BASE_MS * 2 ** (f.count - FREE));
  return Math.max(0, f.last + wait - Date.now());
}

export function loginFailed(ip: string) {
  const now = Date.now();
  for (const [k, f] of failures) if (now - f.last > FORGET_MS) failures.delete(k);
  failures.set(ip, { count: (failures.get(ip)?.count ?? 0) + 1, last: now });
}

export function loginSucceeded(ip: string) {
  failures.delete(ip);
}

/** Tests only. */
export function resetLoginAttempts() {
  failures.clear();
}
