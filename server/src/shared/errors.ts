const MAX = 400;

/**
 * A readable one-liner for a caught error.
 * Drizzle wraps driver failures as "Failed query: <the whole SQL> params: <thousands of values>"
 * and hides the real reason in `cause`. Prefer the cause, and never keep more than MAX chars:
 * these strings end up in the logs table and on the admin screen.
 */
export function describeError(e: unknown): string {
  const err = e as { message?: string; cause?: unknown } | undefined;
  const cause = err?.cause as { message?: string; detail?: string; hint?: string; code?: string } | undefined;
  const parts = cause?.message ? [cause.message, cause.detail, cause.hint].filter(Boolean) : [err?.message ?? String(e)];
  let msg = parts.join(" — ").replace(/\s+/g, " ").trim();
  if (cause?.code) msg = `[${cause.code}] ${msg}`;
  return msg.length > MAX ? `${msg.slice(0, MAX)}…` : msg;
}

/** Codes of a network or database outage: the next item would fail the same way. */
const UNREACHABLE = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
  "CONNECT_TIMEOUT",
]);

/** A failure of the way to the service (DNS, network, database), not of the thing asked. */
export function isUnreachable(e: unknown): boolean {
  const err = e as { code?: string; name?: string; cause?: { code?: string } } | undefined;
  return UNREACHABLE.has(err?.code ?? "") || UNREACHABLE.has(err?.cause?.code ?? "") || err?.name === "TimeoutError";
}
