import type { Context } from "hono";
import { Layout } from "./layout";

/** A full page in the admin layout; flash messages travel in `?ok=` / `?err=`. */
export const page = (c: Context, title: string, body: unknown, loggedIn = true) =>
  c.html(Layout({ title, path: new URL(c.req.url).pathname + new URL(c.req.url).search, flash: { ok: c.req.query("ok"), err: c.req.query("err") }, loggedIn, children: body as never }) as never);

/** Redirect after a form post, carrying a flash message. */
export const back = (c: Context, to: string, msg: { ok?: string; err?: string }) => {
  const u = new URL(to, "http://x");
  if (msg.ok) u.searchParams.set("ok", msg.ok);
  if (msg.err) u.searchParams.set("err", msg.err);
  return c.redirect(u.pathname + u.search, 303);
};

export const form = async (c: Context) => Object.fromEntries((await c.req.formData()).entries()) as Record<string, string>;
/** HTMX checkbox: an unchecked box is never sent, so absence of the field means false. */
export const checked = async (c: Context, name: string) => (await c.req.formData()).has(name);
export const zerr = (e: { issues: { path: PropertyKey[]; message: string }[] }) => e.issues.map((i) => `${i.path.map(String).join(".")}: ${i.message}`).join(", ");
