import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { isUnlocked } from "@/config";
import { player } from "@/player";
import { imgRoute } from "@/providers/tmdb";
import { logoRoute } from "@/providers/iptv";
import { admin } from "@/admin";
import { requestLogger, describeError, env } from "@/shared";

/** The HTTP application: middlewares, mounts, health and the last-resort error handler. Served by `main.ts`. */
export const app = new Hono();
app.use(requestLogger());
/**
 * The admin runs only its own scripts (htmx, Basecoat, from `/admin/assets`): no inline script or
 * handler, nothing evaluated. Images may come from elsewhere: channel logos of the provider, the
 * public base URL of the cards.
 */
const ADMIN_CSP = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"],
  imgSrc: ["'self'", "data:", "https:", "http:"],
  objectSrc: ["'none'"],
  baseUri: ["'none'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
};
// Images and streams are fetched by players on other origins: no cross-origin resource policy.
app.use("/admin/*", secureHeaders({ crossOriginResourcePolicy: false, contentSecurityPolicy: ADMIN_CSP }));
app.use(secureHeaders({ crossOriginResourcePolicy: false }));
app.use(bodyLimit({ maxSize: 1024 * 1024 }));

/**
 * `unlocked` is reported but never changes the status code: the vault is locked after
 * every restart until the first authenticated request, and a red healthcheck there
 * would restart a perfectly healthy container in a loop. Anyone may ask: in production the
 * cause of a failure stays in the log (host and port of the database).
 */
app.get("/health", async (c) => {
  try {
    await db.execute(sql`select 1`);
    return c.json({ ok: true, unlocked: isUnlocked() });
  } catch (e) {
    const error = describeError(e);
    console.error(`[health] base injoignable : ${error}`);
    return c.json({ ok: false, unlocked: isUnlocked(), ...(env.isProd ? {} : { error }) }, 500);
  }
});
app.get("/", (c) => c.redirect("/admin"));
app.route("/img/logos", logoRoute); // before /img: « logos » is no TMDB size
app.route("/img", imgRoute);
app.route("/player", player);
app.route("/admin", admin);

/**
 * A 403 from the CSRF check or a 413 from the body limit must keep its status, not become a 500.
 * Anything else says nothing to the client (a Drizzle message carries the SQL): the detail is logged.
 */
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(`[app] ${c.req.method} ${c.req.path} :`, err);
  return c.text("Erreur interne", 500);
});
