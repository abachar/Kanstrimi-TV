import { db, schema, type TaskStep, type TaskRun } from "@/db";
import { and, desc, eq, inArray, lt, sql, type SQL } from "drizzle-orm";
import { logFileName } from "./runlog";

/**
 * The journal: one `task_runs` row per run (the full pipeline, the EPG, a lone step), one
 * `task_steps` row per step of it. The detail of a run lives in its file (`runlog.ts`).
 */

export type Trigger = "cron" | "manual";

/**
 * At boot, no job can be running: any row still "running" belongs to a process that died
 * (restart, update, crash). Close it as an error so the journal never shows a job that
 * runs forever. Steps resume by themselves: only pending items are reprocessed.
 */
export async function closeOrphanLogs(): Promise<number> {
  const closed = { status: "error" as const, message: "Interrompu par un redémarrage du serveur", finishedAt: new Date() };
  await db.update(schema.taskRuns).set(closed).where(eq(schema.taskRuns.status, "running"));
  const rows = await db
    .update(schema.taskSteps)
    .set(closed)
    .where(eq(schema.taskSteps.status, "running"))
    .returning({ id: schema.taskSteps.id });
  return rows.length;
}

/**
 * A run the journal still shows as running while no process runs it (the database fell, the
 * end could not be written): closed as killed, with its steps still marked running. False when
 * the run is not running.
 */
export async function closeStaleRun(id: number, message: string): Promise<boolean> {
  const closed = { status: "killed" as const, message, finishedAt: new Date() };
  const rows = await db
    .update(schema.taskRuns)
    .set(closed)
    .where(and(eq(schema.taskRuns.id, id), eq(schema.taskRuns.status, "running")))
    .returning({ id: schema.taskRuns.id });
  await db
    .update(schema.taskSteps)
    .set(closed)
    .where(and(eq(schema.taskSteps.runId, id), eq(schema.taskSteps.status, "running")));
  return rows.length > 0;
}

export async function startRun(task: string, trigger: Trigger): Promise<{ id: number; logFile: string }> {
  const [row] = await db
    .insert(schema.taskRuns)
    .values({ task, trigger })
    .returning({ id: schema.taskRuns.id, at: schema.taskRuns.startedAt });
  const logFile = logFileName(task, row.id, row.at);
  await db.update(schema.taskRuns).set({ logFile }).where(eq(schema.taskRuns.id, row.id));
  return { id: row.id, logFile };
}
export type EndStatus = "success" | "error" | "killed";

export async function finishRun(id: number, status: EndStatus, message?: string) {
  await db.update(schema.taskRuns).set({ status, message, finishedAt: new Date() }).where(eq(schema.taskRuns.id, id));
}

export async function startStep(step: string, runId?: number) {
  const [row] = await db.insert(schema.taskSteps).values({ step, runId }).returning();
  return row.id;
}
export async function finishStep(id: number, status: EndStatus, message?: string, stats?: Record<string, unknown>) {
  await db.update(schema.taskSteps).set({ status, message, stats, finishedAt: new Date() }).where(eq(schema.taskSteps.id, id));
}

export type RunWithSteps = TaskRun & { steps: TaskStep[] };

async function withSteps(runs: TaskRun[]): Promise<RunWithSteps[]> {
  if (!runs.length) return [];
  const steps = await db
    .select()
    .from(schema.taskSteps)
    .where(
      inArray(
        schema.taskSteps.runId,
        runs.map((r) => r.id),
      ),
    )
    .orderBy(schema.taskSteps.id);
  return runs.map((r) => ({ ...r, steps: steps.filter((s) => s.runId === r.id) }));
}

/** The runs, most recent first, with their steps; `task` and `errors` filter them. */
export async function recentRuns(opts: { limit: number; offset?: number; task?: string; errors?: boolean }) {
  const where: SQL[] = [];
  if (opts.task) where.push(eq(schema.taskRuns.task, opts.task));
  if (opts.errors) where.push(eq(schema.taskRuns.status, "error"));
  const cond = where.length ? and(...where) : undefined;
  const [runs, [{ n }]] = await Promise.all([
    db
      .select()
      .from(schema.taskRuns)
      .where(cond)
      .orderBy(desc(schema.taskRuns.startedAt))
      .limit(opts.limit)
      .offset(opts.offset ?? 0),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.taskRuns).where(cond),
  ]);
  return { runs: await withSteps(runs), total: n };
}

export async function runById(id: number): Promise<RunWithSteps | null> {
  const [run] = await db.select().from(schema.taskRuns).where(eq(schema.taskRuns.id, id));
  return run ? (await withSteps([run]))[0] : null;
}

/** The last `n` runs of each task, for its card: the latest first. */
export async function lastRunsByTask(tasks: readonly string[], n: number): Promise<Record<string, RunWithSteps[]>> {
  const out: Record<string, RunWithSteps[]> = {};
  for (const task of tasks) out[task] = (await recentRuns({ limit: n, task })).runs;
  return out;
}

/** Deletes the runs (and their steps) older than `days`. */
export async function purgeRuns(days: number): Promise<number> {
  const rows = await db
    .delete(schema.taskRuns)
    .where(lt(schema.taskRuns.startedAt, new Date(Date.now() - days * 86_400_000)))
    .returning({ id: schema.taskRuns.id });
  return rows.length;
}
