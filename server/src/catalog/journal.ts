import { db, schema, type SyncLog, type SyncRun } from "@/db";
import { and, desc, eq, inArray, lt, sql, type SQL } from "drizzle-orm";
import { logFileName } from "./runlog";

/**
 * The journal: one `sync_runs` row per run (the full pipeline, the EPG, a lone step), one
 * `sync_logs` row per step of it. The detail of a run lives in its file (`runlog.ts`).
 */

export type Trigger = "cron" | "manual";

/**
 * At boot, no job can be running: any row still "running" belongs to a process that died
 * (restart, update, crash). Close it as an error so the journal never shows a job that
 * runs forever. Steps resume by themselves: only pending items are reprocessed.
 */
export async function closeOrphanLogs(): Promise<number> {
  const closed = { status: "error" as const, message: "Interrompu par un redémarrage du serveur", finishedAt: new Date() };
  await db.update(schema.syncRuns).set(closed).where(eq(schema.syncRuns.status, "running"));
  const rows = await db
    .update(schema.syncLogs)
    .set(closed)
    .where(eq(schema.syncLogs.status, "running"))
    .returning({ id: schema.syncLogs.id });
  return rows.length;
}

export async function startRun(task: string, trigger: Trigger): Promise<{ id: number; logFile: string }> {
  const [row] = await db
    .insert(schema.syncRuns)
    .values({ task, trigger })
    .returning({ id: schema.syncRuns.id, at: schema.syncRuns.startedAt });
  const logFile = logFileName(task, row.id, row.at);
  await db.update(schema.syncRuns).set({ logFile }).where(eq(schema.syncRuns.id, row.id));
  return { id: row.id, logFile };
}
export async function finishRun(id: number, status: "success" | "error", message?: string) {
  await db.update(schema.syncRuns).set({ status, message, finishedAt: new Date() }).where(eq(schema.syncRuns.id, id));
}

export async function startLog(job: string, runId?: number) {
  const [row] = await db.insert(schema.syncLogs).values({ job, runId }).returning();
  return row.id;
}
export async function finishLog(id: number, status: "success" | "error", message?: string, stats?: Record<string, unknown>) {
  await db.update(schema.syncLogs).set({ status, message, stats, finishedAt: new Date() }).where(eq(schema.syncLogs.id, id));
}

export type RunWithSteps = SyncRun & { steps: SyncLog[] };

async function withSteps(runs: SyncRun[]): Promise<RunWithSteps[]> {
  if (!runs.length) return [];
  const steps = await db
    .select()
    .from(schema.syncLogs)
    .where(
      inArray(
        schema.syncLogs.runId,
        runs.map((r) => r.id),
      ),
    )
    .orderBy(schema.syncLogs.id);
  return runs.map((r) => ({ ...r, steps: steps.filter((s) => s.runId === r.id) }));
}

/** The runs, most recent first, with their steps; `task` and `errors` filter them. */
export async function recentRuns(opts: { limit: number; offset?: number; task?: string; errors?: boolean }) {
  const where: SQL[] = [];
  if (opts.task) where.push(eq(schema.syncRuns.task, opts.task));
  if (opts.errors) where.push(eq(schema.syncRuns.status, "error"));
  const cond = where.length ? and(...where) : undefined;
  const [runs, [{ n }]] = await Promise.all([
    db
      .select()
      .from(schema.syncRuns)
      .where(cond)
      .orderBy(desc(schema.syncRuns.startedAt))
      .limit(opts.limit)
      .offset(opts.offset ?? 0),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.syncRuns).where(cond),
  ]);
  return { runs: await withSteps(runs), total: n };
}

export async function runById(id: number): Promise<RunWithSteps | null> {
  const [run] = await db.select().from(schema.syncRuns).where(eq(schema.syncRuns.id, id));
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
    .delete(schema.syncRuns)
    .where(lt(schema.syncRuns.startedAt, new Date(Date.now() - days * 86_400_000)))
    .returning({ id: schema.syncRuns.id });
  return rows.length;
}
