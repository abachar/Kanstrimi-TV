import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { env } from "@/shared";
import { sameOriginForms } from "./csrf";
import { isLoggedIn } from "./session";
import { toggleMenu } from "./layout";
import { loginRoutes, logoutRoutes } from "./login/routes";
import { dashboardRoutes, jobRoutes } from "./dashboard/routes";
import { cachesRoutes } from "./caches/routes";
import { catalogRoutes } from "./catalog/routes";
import { favoritesRoutes } from "./favorites/routes";
import { historyRoutes } from "./history/routes";
import { contentRoutes, itemRoutes } from "./content/routes";
import { rulesRoutes } from "./rules/routes";
import { studiosRoutes } from "./studios/routes";
import { waitlistRoutes } from "./waitlist/routes";
import { devicesRoutes, pairRoutes } from "./devices/routes";
import { tasksRoutes } from "./tasks/routes";
import { epgRoutes } from "./epg/routes";
import { settingsRoutes } from "./settings/routes";

/**
 * The admin, one folder per page: `routes.tsx` parses the request and answers, `view.tsx`
 * renders, `data.ts` holds the page's own queries. Shared rules come from `@/catalog`, `@/devices`, `@/providers/*`, `@/config`.
 */
export const admin = new Hono();

admin.use("*", sameOriginForms());

/** The stylesheet and Basecoat's script, built by `npm run css`; served before the login guard, the login page needs them. */
admin.use("/assets/*", serveStatic({ root: "./dist/assets", rewriteRequestPath: (p) => p.replace(/^\/admin\/assets/, "") }));

admin.use("*", async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (p === "/admin/login" || (await isLoggedIn(c))) return next();
  // The pairing page is reached from a QR code: come back to it once logged in.
  return c.redirect(p.startsWith("/admin/pair/") ? `/admin/login?next=${encodeURIComponent(p)}` : "/admin/login");
});

/** Dev only: polled by the layout every second; a new boot id means the server restarted → reload the page. */
admin.get("/dev/reload", (c) => {
  if (!env.devPassword) return c.notFound();
  if (c.req.query("boot") !== env.bootId) c.header("HX-Refresh", "true");
  return c.body(null, 204);
});

/** Fold / unfold the side menu, then back to the page the button was on (`next`: no Referer, secure headers say `no-referrer`). */
admin.post("/menu", async (c) => {
  toggleMenu(c);
  const next = (await c.req.formData()).get("next");
  return c.redirect(typeof next === "string" && /^\/admin(\/|\?|$)/.test(next) ? next : "/admin", 303);
});

admin.route("/login", loginRoutes);
admin.route("/logout", logoutRoutes);
admin.route("/", dashboardRoutes);
admin.route("/jobs", jobRoutes);
admin.route("/catalog", catalogRoutes);
admin.route("/favorites", favoritesRoutes);
admin.route("/history", historyRoutes);
admin.route("/content", contentRoutes);
admin.route("/item", itemRoutes);
admin.route("/rules", rulesRoutes);
admin.route("/epg", epgRoutes);
admin.route("/studios", studiosRoutes);
admin.route("/waitlist", waitlistRoutes);
admin.route("/pair", pairRoutes);
admin.route("/devices", devicesRoutes);
admin.route("/caches", cachesRoutes);
admin.route("/tasks", tasksRoutes);
admin.route("/settings", settingsRoutes);
