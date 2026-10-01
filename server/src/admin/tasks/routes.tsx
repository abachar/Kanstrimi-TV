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
  runningSteps,
  getLastError,
  pipelineSteps,
  TASKS,
  RETENTION_DAYS,
} from "@/catalog";
import { back, page } from "../http";
import { TasksView, RunView, RunLog, RUNS_PER_PAGE } from "./view";

/** `/admin/tasks`: the scheduled tasks and the runs; `/admin/tasks/:id`: one run and its log file. */
export const tasksRoutes = new Hono();

tasksRoutes.get("/", async (c) => {
  const task = c.req.query("task") ?? "";
  const errors = c.req.query("errors") === "1";
  const pageNo = Math.max(1, Number(c.req.query("page")) || 1);
  const [s, steps, byTask, list] = await Promise.all([
    getSettings(),
    pipelineSteps(),
    lastRunsByTask(TASKS, 5),
    recentRuns({ limit: RUNS_PER_PAGE, offset: (pageNo - 1) * RUNS_PER_PAGE, task: task || undefined, errors }),
  ]);
  const cron = { pipeline: s.sync_cron, epg: s.epg_cron };
  return page(
    c,
    "Tâches",
    <TasksView
      tasks={TASKS.map((t) => ({ task: t, cron: cron[t], runs: byTask[t], busy: isTaskRunning(t), steps: t === "pipeline" ? steps : [] }))}
      runs={list.runs}
      total={list.total}
      filter={{ task, errors, page: pageNo }}
      jobs={{ running: runningSteps(), lastError: getLastError() }}
      retentionDays={RETENTION_DAYS}
    />,
  );
});

const runOf = async (id: string) => (/^\d+$/.test(id) ? runById(Number(id)) : null);

tasksRoutes.get("/:id", async (c) => {
  const run = await runOf(c.req.param("id"));
  if (!run) return c.notFound();
  return page(c, `Passage n° ${run.id}`, <RunView run={run} log={run.logFile ? readRunLog(run.logFile) : null} />);
});

tasksRoutes.get("/:id/log", async (c) => {
  const run = await runOf(c.req.param("id"));
  if (!run) return c.notFound();
  return c.html(<RunLog run={run} log={run.logFile ? readRunLog(run.logFile) : null} />);
});

tasksRoutes.get("/:id/raw", async (c) => {
  const run = await runOf(c.req.param("id"));
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
  const run = await runOf(c.req.param("id"));
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
