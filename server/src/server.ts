import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { sql } from "drizzle-orm";
import { db, client, deleteSettings, isUnlocked } from "@/db";
import { api, images } from "@/player";
import { admin } from "@/admin";
import { startScheduler, closeOrphanLogs } from "@/sync";
import { requestLogger, describeError, env } from "@/shared";

const app = new Hono();
app.use(requestLogger());
// Images and streams are fetched by players on other origins: no cross-origin resource policy.
app.use(secureHeaders({ crossOriginResourcePolicy: false }));
app.use(bodyLimit({ maxSize: 1024 * 1024 }));

/**
 * `unlocked` is reported but never changes the status code: the vault is locked after
 * every restart until the first authenticated request, and a red healthcheck there
 * would restart a perfectly healthy container in a loop.
 */
app.get("/api/health", async (c) => {
  try { await db.execute(sql`select 1`); return c.json({ ok: true, unlocked: isUnlocked() }); }
  catch (e) { return c.json({ ok: false, unlocked: isUnlocked(), error: describeError(e) }, 500); }
});
app.get("/", (c) => c.redirect("/admin"));
app.route("/api/v1", api);
app.route("/", images);
app.route("/admin", admin);

// A 403 from the CSRF check or a 413 from the body limit must keep its status, not become a 500.
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.text("Internal error: " + err.message, 500);
});

const server = serve({ fetch: app.fetch, port: env.port, hostname: "0.0.0.0" }, () => {
  console.log(`Kanstrimi server → port ${env.port}`);
  // Pre-vault leftovers. Must never kill the process: at boot the database may not be up yet.
  void deleteSettings(["admin_password_hash", "proxy_password", "stream_mode", "proxy_username"])
    .catch((e) => console.error("[boot] nettoyage des réglages pré-coffre échoué:", describeError(e)));
  void closeOrphanLogs()
    .then((n) => { if (n) console.log(`[boot] ${n} job(s) interrompu(s) par le redémarrage précédent`); })
    .catch((e) => console.error("[boot] clôture des jobs orphelins échouée:", describeError(e)));
  startScheduler();
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[shutdown] ${signal} reçu`);
  const bail = setTimeout(() => { console.error("[shutdown] délai dépassé"); process.exit(1); }, 15_000);
  bail.unref();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await client.end({ timeout: 5 }).catch(() => {});
  console.log("[shutdown] terminé");
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
// A stray rejection must not take the server down (Node 22 throws by default).
process.on("unhandledRejection", (r) => console.error("[unhandledRejection]", r));
