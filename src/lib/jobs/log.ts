import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export async function startLog(job: string) {
  const [row] = await db.insert(schema.syncLogs).values({ job }).returning();
  return row.id;
}
export async function finishLog(id: number, status: "success" | "error", message?: string, stats?: Record<string, unknown>) {
  await db.update(schema.syncLogs).set({ status, message, stats, finishedAt: new Date() }).where(eq(schema.syncLogs.id, id));
}
