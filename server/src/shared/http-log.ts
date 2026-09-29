import type { MiddlewareHandler } from "hono";

/**
 * The Xtream protocol carries the password in every URL — as a query parameter
 * (`?username=…&password=…`) and as a path segment (`/live/<user>/<pass>/<id>.ts`).
 * That password is also the key that decrypts the settings, so it must never reach
 * journald. Hono's own logger prints the raw URL, hence this replacement.
 */
const SECRET_PARAMS = new Set(["password", "pass", "tmdb_api_key", "api_key", "token", "s", "sig"]);
const STREAM_PATH = /^\/(live|movie|series)\/([^/]+)\/[^/]+\//;
const MASK = "***";

export function redactUrl(url: string): string {
  const q = url.indexOf("?");
  const rawPath = q === -1 ? url : url.slice(0, q);
  const path = rawPath.replace(STREAM_PATH, (_m, kind: string, user: string) => `/${kind}/${user}/${MASK}/`);
  if (q === -1) return path;
  const params = new URLSearchParams(url.slice(q + 1));
  for (const key of [...params.keys()]) {
    if (SECRET_PARAMS.has(key.toLowerCase())) params.set(key, MASK);
  }
  const query = params.toString();
  return query ? `${path}?${decodeURIComponent(query)}` : path;
}

/** Every URL of a free text, redacted: what the run logs write to disk. */
export function redactText(text: string): string {
  return text.replace(/https?:\/\/[^\s"'<>]+/g, (u) => {
    try {
      const url = new URL(u);
      return url.origin + redactUrl(url.pathname + url.search);
    } catch {
      return u;
    }
  });
}

/** Same shape as hono's logger, minus the secrets. */
export function requestLogger(): MiddlewareHandler {
  return async (c, next) => {
    const u = new URL(c.req.url);
    // The dev reload poll fires every second: keep it out of the log.
    if (u.pathname === "/admin/dev/reload") return next();
    const path = redactUrl(u.pathname + u.search);
    const started = Date.now();
    console.log(`<-- ${c.req.method} ${path}`);
    await next();
    console.log(`--> ${c.req.method} ${path} ${c.res.status} ${Date.now() - started}ms`);
  };
}
