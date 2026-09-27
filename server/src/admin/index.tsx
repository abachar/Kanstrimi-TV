import { Hono } from "hono";
import { sameOriginForms } from "./csrf";
import { isLoggedIn } from "./session";
import { loginRoutes, logoutRoutes } from "./login/routes";
import { dashboardRoutes, jobRoutes } from "./dashboard/routes";
import { catalogRoutes } from "./catalog/routes";
import { groupsRoutes } from "./groups/routes";
import { itemRoutes } from "./item/routes";
import { rulesRoutes } from "./rules/routes";
import { devicesRoutes, pairRoutes } from "./devices/routes";
import { logsRoutes } from "./logs/routes";
import { settingsRoutes } from "./settings/routes";

/**
 * The admin, one folder per page: `routes.tsx` parses the request and answers, `view.tsx`
 * renders, `data.ts` holds the page's own queries. Shared rules come from `@/catalog`, `@/devices`, `@/providers/*`, `@/config`.
 */
export const admin = new Hono();

admin.use("*", sameOriginForms());

admin.use("*", async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (p === "/admin/login" || (await isLoggedIn(c))) return next();
  // The pairing page is reached from a QR code: come back to it once logged in.
  return c.redirect(p.startsWith("/admin/pair/") ? `/admin/login?next=${encodeURIComponent(p)}` : "/admin/login");
});

admin.route("/login", loginRoutes);
admin.route("/logout", logoutRoutes);
admin.route("/", dashboardRoutes);
admin.route("/jobs", jobRoutes);
admin.route("/catalog", catalogRoutes);
admin.route("/catalog/groups", groupsRoutes);
admin.route("/item", itemRoutes);
admin.route("/rules", rulesRoutes);
admin.route("/pair", pairRoutes);
admin.route("/devices", devicesRoutes);
admin.route("/logs", logsRoutes);
admin.route("/settings", settingsRoutes);
