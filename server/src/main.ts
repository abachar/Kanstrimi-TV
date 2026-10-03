import { serve } from "@hono/node-server";
import { client } from "@/db";
import { getSettings, onSettingsChange, verifyPassword } from "@/config";
import { schedule, closeOrphanLogs } from "@/catalog";
import { describeError, env } from "@/shared";
import { app } from "./app";

const server = serve({ fetch: app.fetch, port: env.port, hostname: "0.0.0.0" }, () => {
  console.log(`Kanstrimi server → port ${env.port}`);
  // Local development: the login page is skipped when the password matches.
  if (env.devPassword)
    void verifyPassword(env.devPassword)
      .then((ok) =>
        console.log(
          ok ? "[boot] DEV_PASSWORD : connexion admin automatique" : "[boot] DEV_PASSWORD ne correspond pas à ADMIN_PASSWORD_HASH",
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
