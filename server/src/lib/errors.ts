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
  const parts = cause?.message
    ? [cause.message, cause.detail, cause.hint].filter(Boolean)
    : [err?.message ?? String(e)];
  let msg = parts.join(" — ").replace(/\s+/g, " ").trim();
  if (cause?.code) msg = `[${cause.code}] ${msg}`;
  return msg.length > MAX ? `${msg.slice(0, MAX)}…` : msg;
}
