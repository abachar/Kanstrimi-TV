import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db, client } from "@/db";
import { xtream } from "@/routes/xtream";
import { admin } from "@/admin";
import { startScheduler } from "@/lib/jobs/jobs";
import { requestLogger } from "@/lib/http-log";
import { isUnlocked } from "@/lib/auth/vault";
import { deleteSettings } from "@/lib/settings";
import { describeError } from "@/lib/errors";

const app = new Hono();
app.use(requestLogger());

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
app.route("/", xtream);
app.route("/admin", admin);

app.onError((err, c) => { console.error(err); return c.text("Internal error: " + err.message, 500); });

const port = Number(process.env.PORT ?? 3000);
const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
  console.log(`Kanstrimi server → port ${port}`);
  // Pre-vault leftovers. Must never kill the process: at boot the database may not be up yet.
  void deleteSettings(["admin_password_hash", "proxy_password", "stream_mode"])
    .catch((e) => console.error("[boot] nettoyage des réglages pré-coffre échoué:", describeError(e)));
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
