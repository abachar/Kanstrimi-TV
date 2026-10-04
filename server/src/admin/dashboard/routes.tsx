import { Hono } from "hono";
import { getSettings } from "@/config";
import { appCounts, counts } from "./data";
import { cacheStats } from "@/providers/tmdb";
import { epgStat } from "@/catalog";
import { groupingCounts } from "@/catalog";
import { launch, pipelineSteps, runningSteps, getLastError, lastRunsByTask, TASKS, type Task } from "@/catalog";
import { page, back } from "../http";
import { JOB_STARTED, jobLabel } from "../labels";
import { DashboardView } from "./view";
import { JobsStatus } from "./jobs";

/** `/admin`: the dashboard; `/admin/jobs`: what the task buttons and the htmx poll of the dashboard call. */
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
 * Launches a task, the pipeline from the `from` step on when the form names one; the launched task
 * then shows in the task journal (pages go out with `Referrer-Policy: no-referrer`).
 */
jobRoutes.post("/:task", async (c) => {
  const task = c.req.param("task") as Task;
  if (!TASKS.includes(task)) return c.notFound();
  const body = await c.req.parseBody();
  const from = String(body.from ?? "");
  const acceptShrink = task === "pipeline" && body.accept_shrink === "1";
  const step = task === "pipeline" ? (await pipelineSteps()).find((s) => s === from) : undefined;
  const ok = step ? `Traitement lancé à partir de « ${jobLabel(step)} »` : JOB_STARTED[task];
  return back(c, "/admin/tasks", launch(task, step, { acceptShrink }) ? { ok } : { err: "Déjà en cours" });
});
