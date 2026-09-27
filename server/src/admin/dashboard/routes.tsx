import { Hono } from "hono";
import { getSettings } from "@/config";
import { counts } from "./data";
import { recentLogs } from "@/catalog";
import { cacheStats } from "@/providers/tmdb";
import { epgCacheStat } from "@/providers/xtream";
import { groupingCounts } from "@/catalog";
import { start, runAll, runningSteps, getLastError, type Step } from "@/catalog";
import { page, back } from "../http";
import { JOB_STARTED } from "../labels";
import { DashboardView } from "./view";
import { JobsStatus } from "./jobs";

/** `/admin`: the dashboard; `/admin/jobs`: what the buttons and the htmx poll of the dashboard call. */
export const dashboardRoutes = new Hono();
export const jobRoutes = new Hono();

const jobsState = () => ({ running: runningSteps(), lastError: getLastError() });

dashboardRoutes.get("/", async (c) => {
  const [s, cnt, logs, img, epg, groups] = await Promise.all([
    getSettings(),
    counts(),
    recentLogs(6),
    cacheStats(),
    epgCacheStat(),
    groupingCounts(),
  ]);
  return page(
    c,
    "Tableau de bord",
    <DashboardView d={{ s, items: cnt.items, cats: cnt.categories, logs, img, epg, groups }} jobs={jobsState()} />,
  );
});
jobRoutes.get("/status", (c) => c.html(<JobsStatus {...jobsState()} />));
jobRoutes.post("/:job", async (c) => {
  const job = c.req.param("job");
  if (!(job in JOB_STARTED)) return c.notFound();
  if (job === "pipeline") {
    void runAll();
    return back(c, "/admin", { ok: JOB_STARTED.pipeline });
  }
  if (job === "enrich" && !(await getSettings()).tmdb_api_key) return back(c, "/admin", { err: "Clé TMDB absente" });
  return back(c, "/admin", start(job as Step) ? { ok: JOB_STARTED[job as Step] } : { err: "Déjà en cours" });
});
