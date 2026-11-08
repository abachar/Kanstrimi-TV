import { serve } from "@hono/node-server";
import { client } from "@/db";
import { getSettings, onSettingsChange, seedAccountFromEnv, verifyPassword } from "@/config";
import { schedule, closeOrphanLogs, onRunFinished, onWaitlistAvailable } from "@/catalog";
import { isApnsConfigured, notifyArrivals, notifyRunFinished } from "@/notify";
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
  // The app's alerts hang on the catalogue's events; without the APNs key they stay journalled as failed.
  if (!isApnsConfigured()) console.log("[boot] APNs non configuré (APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID) : pas d'alertes sur l'iPhone");
  onWaitlistAvailable((arrivals) => void notifyArrivals(arrivals).catch((e) => console.error("[notify] arrivées :", describeError(e))));
  onRunFinished((run) => void notifyRunFinished(run).catch((e) => console.error("[notify] traitement :", describeError(e))));
  // The provider account of the environment (the secrets of before) fills the first account once, then has nothing left to do.
  void seedAccountFromEnv()
    .then((did) => {
      if (did !== "nothing")
        console.log(
          `[boot] compte XTREAM_* de l'environnement ${did === "filled" ? "posé sur le premier fournisseur" : "ajouté en premier fournisseur"}`,
        );
    })
    .catch((e) => console.error("[boot] fournisseur de l'environnement non posé:", describeError(e)));
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
