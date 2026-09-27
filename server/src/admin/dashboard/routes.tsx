import { Hono } from "hono";
import { getSettings } from "@/db";
import { counts } from "@/admin/dashboard/data";
import { recentLogs } from "@/sync";
import { cacheStats } from "@/sync";
import { epgCacheStat } from "@/sync";
import { groupingCounts } from "@/sync";
import { startJob, runPipeline, runningJobs, getLastError, type Job } from "@/sync";
import { page, back } from "../http";
import { JOB_STARTED } from "../labels";
import { DashboardView } from "./view";
import { JobsStatus } from "./jobs";

export const dashboardRoutes = new Hono();

const jobsState = () => ({ running: runningJobs(), lastError: getLastError() });

dashboardRoutes.get("/", async (c) => {
  const [s, cnt, logs, img, epg, groups] = await Promise.all([getSettings(), counts(), recentLogs(6), cacheStats(), epgCacheStat(), groupingCounts()]);
  return page(c, "Tableau de bord", <DashboardView d={{ s, items: cnt.items, cats: cnt.categories, logs, img, epg, groups }} jobs={jobsState()} />);
});
dashboardRoutes.get("/jobs/status", (c) => c.html(<JobsStatus {...jobsState()} />));
dashboardRoutes.post("/jobs/:job", async (c) => {
  const job = c.req.param("job");
  if (!(job in JOB_STARTED)) return c.notFound();
  if (job === "pipeline") { void runPipeline(); return back(c, "/admin", { ok: JOB_STARTED.pipeline }); }
  if (job === "enrich" && !(await getSettings()).tmdb_api_key) return back(c, "/admin", { err: "Clé TMDB absente" });
  return back(c, "/admin", startJob(job as Job) ? { ok: JOB_STARTED[job as Job] } : { err: "Déjà en cours" });
});
