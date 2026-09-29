import { Hono } from "hono";
import { getSettings } from "@/config";
import { appCounts, counts } from "./data";
import { cacheStats } from "@/providers/tmdb";
import { epgStat } from "@/providers/xtream";
import { groupingCounts } from "@/catalog";
import { launch, pipelineSteps, runningSteps, getLastError, lastRunsByTask, TASKS, type Task } from "@/catalog";
import { page, back } from "../http";
import { JOB_STARTED, jobLabel } from "../labels";
import { DashboardView } from "./view";
import { JobsStatus } from "./jobs";

/** `/admin`: the dashboard; `/admin/jobs`: what the buttons and the htmx poll of the dashboard call. */
export const dashboardRoutes = new Hono();
export const jobRoutes = new Hono();

const jobsState = () => ({ running: runningSteps(), lastError: getLastError() });

dashboardRoutes.get("/", async (c) => {
  const [s, cnt, last, img, epg, groups, app] = await Promise.all([
    getSettings(),
    counts(),
    lastRunsByTask(TASKS, 1),
    cacheStats(),
    epgStat(),
    groupingCounts(),
    appCounts(),
  ]);
  return page(
    c,
    "Tableau de bord",
    <DashboardView d={{ s, items: cnt.items, cats: cnt.categories, last, img, epg, groups, app }} jobs={jobsState()} />,
  );
});
jobRoutes.get("/status", (c) => c.html(<JobsStatus {...jobsState()} />));
/**
 * Launches a task, the pipeline from the `from` step on when the form names one, then back to
 * the page the button was on (the journal or the dashboard).
 */
jobRoutes.post("/:task", async (c) => {
  const task = c.req.param("task") as Task;
  if (!TASKS.includes(task)) return c.notFound();
  const from = String((await c.req.parseBody()).from ?? "");
  const step = task === "pipeline" ? (await pipelineSteps()).find((s) => s === from) : undefined;
  const referer = c.req.header("referer");
  const to = referer && new URL(referer).pathname.startsWith("/admin") ? new URL(referer).pathname : "/admin/tasks";
  const ok = step ? `Traitement lancé à partir de « ${jobLabel(step)} »` : JOB_STARTED[task];
  return back(c, to, launch(task, step) ? { ok } : { err: "Déjà en cours" });
});
