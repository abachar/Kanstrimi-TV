import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const FORM = /^(application\/x-www-form-urlencoded|multipart\/form-data|text\/plain)/i;
const hostOf = (url?: string) => {
  try {
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
};

/**
 * Form posts must come from this very site. `hono/csrf` only looks at `Origin`, which Safari
 * omits on some same-origin posts; here `Sec-Fetch-Site` and `Referer` stand in when it is
 * missing. Hosts are compared without the scheme: TLS ends at the reverse proxy, so the
 * request Hono sees is http while the browser says https.
 */
export const sameOriginForms = (): MiddlewareHandler => async (c, next) => {
  if (!UNSAFE.has(c.req.method) || !FORM.test(c.req.header("content-type") ?? "")) return next();
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? new URL(c.req.url).host;
  const origin = hostOf(c.req.header("origin"));
  const allowed = origin
    ? origin === host
    : ["same-origin", "none"].includes(c.req.header("sec-fetch-site") ?? "") || hostOf(c.req.header("referer")) === host;
  if (!allowed) throw new HTTPException(403, { message: "Formulaire refusé : origine inconnue" });
  await next();
};
