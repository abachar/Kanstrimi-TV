import { Hono } from "hono";
import { getSettings } from "@/config";
import { appCounts, counts } from "./data";
import { cacheStats } from "@/providers/tmdb";
import { epgStat } from "@/providers/xtream";
import { groupingCounts } from "@/catalog";
import { launch, runningSteps, getLastError, lastRunsByTask, TASKS, type Task } from "@/catalog";
import { page, back } from "../http";
import { JOB_STARTED } from "../labels";
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
/** Launches a task, then back to the page the button was on (the journal or the dashboard). */
jobRoutes.post("/:task", (c) => {
  const task = c.req.param("task") as Task;
  if (!TASKS.includes(task)) return c.notFound();
  const from = c.req.header("referer");
  const to = from && new URL(from).pathname.startsWith("/admin") ? new URL(from).pathname : "/admin/tasks";
  return back(c, to, launch(task) ? { ok: JOB_STARTED[task] } : { err: "Déjà en cours" });
});
