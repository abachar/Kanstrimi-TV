import fs from "node:fs";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { getSettings } from "@/config";
import {
  lastRunsByTask,
  recentRuns,
  runById,
  readRunLog,
  runLogPath,
  isTaskRunning,
  killRun,
  pipelineSteps,
  TASKS,
  RETENTION_DAYS,
  type Task,
} from "@/catalog";
import { back, intParam, page } from "../http";
import { pageParam } from "../query";
import { TasksView, TaskCard, RunView, RunLog, RUNS_PER_PAGE } from "./view";

/** `/admin/tasks`: the scheduled tasks and the runs; `/admin/tasks/:id`: one run and its log file. */
export const tasksRoutes = new Hono();

/** What a task card shows: its schedule, its last runs, whether it runs now, where it may start from. */
async function taskStates(tasks: readonly Task[]) {
  const [s, steps, byTask] = await Promise.all([getSettings(), pipelineSteps(), lastRunsByTask(tasks, 5)]);
  const cron = { pipeline: s.sync_cron, epg: s.epg_cron };
  return tasks.map((t) => ({ task: t, cron: cron[t], runs: byTask[t], busy: isTaskRunning(t), steps: t === "pipeline" ? steps : [] }));
}

tasksRoutes.get("/", async (c) => {
  const task = c.req.query("task") ?? "";
  const errors = c.req.query("errors") === "1";
  const pageNo = pageParam(c.req.query("page"));
  const [tasks, list] = await Promise.all([
    taskStates(TASKS),
    recentRuns({ limit: RUNS_PER_PAGE, offset: (pageNo - 1) * RUNS_PER_PAGE, task: task || undefined, errors }),
  ]);
  return page(
    c,
    "Tâches",
    <TasksView tasks={tasks} runs={list.runs} total={list.total} filter={{ task, errors, page: pageNo }} retentionDays={RETENTION_DAYS} />,
  );
});

/** One task card alone: polled by the card itself while its task runs. */
tasksRoutes.get("/card/:task", async (c) => {
  const task = TASKS.find((t) => t === c.req.param("task"));
  if (!task) return c.notFound();
  const [state] = await taskStates([task]);
  return c.html(<TaskCard {...state} />);
});

tasksRoutes.get("/:id", async (c) => {
  const run = await runById(intParam(c, "id"));
  if (!run) return c.notFound();
  return page(c, `Passage n° ${run.id}`, <RunView run={run} log={run.logFile ? readRunLog(run.logFile) : null} />, {
    under: "/admin/tasks",
  });
});

tasksRoutes.get("/:id/log", async (c) => {
  const run = await runById(intParam(c, "id"));
  if (!run) return c.notFound();
  return c.html(<RunLog run={run} log={run.logFile ? readRunLog(run.logFile) : null} />);
});

tasksRoutes.get("/:id/raw", async (c) => {
  const run = await runById(intParam(c, "id"));
  const file = run?.logFile ? runLogPath(run.logFile) : null;
  if (!run || !file || !fs.existsSync(file)) return c.notFound();
  c.header("content-type", "text/plain; charset=utf-8");
  c.header("content-disposition", `attachment; filename="${run.logFile}"`);
  return stream(c, async (s) => {
    for await (const chunk of fs.createReadStream(file)) await s.write(chunk as Uint8Array);
  });
});

/** « Arrêter »: the run stops after the work in flight, or is closed at once when nothing runs it. */
tasksRoutes.post("/:id/kill", async (c) => {
  const run = await runById(intParam(c, "id"));
  if (!run) return c.notFound();
  const result = await killRun(run.id);
  const msg =
    result === "stopping"
      ? { ok: "Arrêt demandé : le passage s'arrête dès la fin de l'opération en cours" }
      : result === "closed"
        ? { ok: "Passage marqué arrêté : plus rien ne le faisait tourner" }
        : { err: "Ce passage n'est plus en cours" };
  return back(c, `/admin/tasks/${run.id}`, msg);
});
