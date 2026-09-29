import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { sql } from "drizzle-orm";
import { db, client } from "@/db";
import { getSettings, isUnlocked, onSettingsChange, verify } from "@/config";
import { player } from "@/player";
import { imgRoute } from "@/providers/tmdb";
import { logoRoute } from "@/providers/iptv";
import { admin } from "@/admin";
import { schedule, closeOrphanLogs } from "@/catalog";
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
app.get("/health", async (c) => {
  try {
    await db.execute(sql`select 1`);
    return c.json({ ok: true, unlocked: isUnlocked() });
  } catch (e) {
    return c.json({ ok: false, unlocked: isUnlocked(), error: describeError(e) }, 500);
  }
});
app.get("/", (c) => c.redirect("/admin"));
app.route("/img/logos", logoRoute); // before /img: « logos » is no TMDB size
app.route("/img", imgRoute);
app.route("/player", player);
app.route("/admin", admin);

// A 403 from the CSRF check or a 413 from the body limit must keep its status, not become a 500.
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.text("Internal error: " + err.message, 500);
});

const server = serve({ fetch: app.fetch, port: env.port, hostname: "0.0.0.0" }, () => {
  console.log(`Kanstrimi server → port ${env.port}`);
  // Local development: unlock at boot so the schedule runs and the login page is skipped.
  if (env.devPassword)
    void verify(env.devPassword)
      .then((ok) =>
        console.log(
          ok
            ? "[boot] DEV_PASSWORD : coffre déverrouillé, connexion admin automatique"
            : "[boot] DEV_PASSWORD ne correspond pas à ADMIN_PASSWORD_HASH",
        ),
      )
      .catch((e) => console.error("[boot] DEV_PASSWORD :", describeError(e)));
  // Must never kill the process: at boot the database may not be up yet.
  void closeOrphanLogs()
    .then((n) => {
      if (n) console.log(`[boot] ${n} étape(s) interrompue(s) par le redémarrage précédent`);
    })
    .catch((e) => console.error("[boot] clôture des étapes orphelines échouée:", describeError(e)));
  // The schedule follows the settings: built now, rebuilt after every save.
  onSettingsChange(schedule);
  void getSettings()
    .then(schedule)
    .catch((e) => console.error("[boot] planification impossible:", describeError(e)));
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[shutdown] ${signal} reçu`);
  const bail = setTimeout(() => {
    console.error("[shutdown] délai dépassé");
    process.exit(1);
  }, 15_000);
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
