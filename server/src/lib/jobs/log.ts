import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/**
 * At boot, no job can be running: any row still "running" belongs to a process that died
 * (restart, update, crash). Close it as an error so the journal never shows a job that
 * runs forever. Steps resume by themselves: only pending items are reprocessed.
 */
export async function closeOrphanLogs(): Promise<number> {
  const rows = await db.update(schema.syncLogs)
    .set({ status: "error", message: "Interrompu par un redémarrage du serveur", finishedAt: new Date() })
    .where(eq(schema.syncLogs.status, "running")).returning({ id: schema.syncLogs.id });
  return rows.length;
}

export async function startLog(job: string) {
  const [row] = await db.insert(schema.syncLogs).values({ job }).returning();
  return row.id;
}
export async function finishLog(id: number, status: "success" | "error", message?: string, stats?: Record<string, unknown>) {
  await db.update(schema.syncLogs).set({ status, message, stats, finishedAt: new Date() }).where(eq(schema.syncLogs.id, id));
}
