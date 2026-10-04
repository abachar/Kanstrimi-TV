import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { isMenuCollapsed, Layout } from "./layout";

/** A route's numeric identifier: a positive integer, else 404 — never a `NaN` down to the database. */
export function intParam(c: Context, name: string): number {
  return positiveInt(c.req.param(name) ?? "");
}

/** The same rule for an identifier posted in a form: a positive integer that fits a column, else 404. */
export function intField(f: Record<string, string>, name: string): number {
  return positiveInt(f[name] ?? "");
}

function positiveInt(v: string): number {
  if (!/^[1-9]\d{0,9}$/.test(v) || Number(v) > 2_147_483_647) throw new HTTPException(404, { message: "Introuvable" });
  return Number(v);
}

/** A full page in the admin layout; flash messages travel in `?ok=` / `?err=`. */
export const page = (c: Context, title: string, body: unknown, loggedIn = true) =>
  c.html(
    Layout({
      title,
      path: new URL(c.req.url).pathname + new URL(c.req.url).search,
      flash: loggedIn ? { ok: c.req.query("ok"), err: c.req.query("err") } : {},
      loggedIn,
      collapsed: isMenuCollapsed(c),
      children: body as never,
    }) as never,
  );

/**
 * Redirect after a form post, carrying a flash message. A post htmx sent (a form behind
 * `hx-confirm`) gets `HX-Redirect` instead: the browser would follow a 303 inside the request and
 * htmx would swap the whole page into the form.
 */
export const back = (c: Context, to: string, msg: { ok?: string; err?: string }) => {
  const u = new URL(to, "http://x");
  if (msg.ok) u.searchParams.set("ok", msg.ok);
  if (msg.err) u.searchParams.set("err", msg.err);
  if (c.req.header("HX-Request")) {
    c.header("HX-Redirect", u.pathname + u.search);
    return c.body(null, 204);
  }
  return c.redirect(u.pathname + u.search, 303);
};

export const form = async (c: Context) => Object.fromEntries((await c.req.formData()).entries()) as Record<string, string>;
/** HTMX checkbox: an unchecked box is never sent, so absence of the field means false. */
export const checked = async (c: Context, name: string) => (await c.req.formData()).has(name);
export const zerr = (e: { issues: { path: PropertyKey[]; message: string }[] }) =>
  e.issues.map((i) => `${i.path.map(String).join(".")}: ${i.message}`).join(", ");
