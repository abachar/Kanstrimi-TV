import { db, schema } from "@/db";
import { desc, eq, inArray, sql } from "drizzle-orm";

/** "Vu" is derived here, once, at write time: 90 % of the duration. */
export const FINISHED_AT = 0.9;
/** Below 5 % nothing is worth resuming: the row is kept, the resume row ignores it. */
export const RESUMABLE_FROM = 0.05;

export type Progress = { contentKey: string; position: number; duration: number; finished: boolean; updatedAt: Date };

export async function setProgress(contentKey: string, position: number, duration: number): Promise<Progress> {
  const p = Math.max(0, Math.round(position)),
    d = Math.max(0, Math.round(duration));
  const finished = d > 0 && p / d >= FINISHED_AT;
  const [row] = await db
    .insert(schema.appWatchProgress)
    .values({ contentKey, position: p, duration: d, finished, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.appWatchProgress.contentKey, set: { position: p, duration: d, finished, updatedAt: new Date() } })
    .returning();
  return row;
}

/** Progress rows for a set of keys, as a map. */
export async function getProgress(keys: string[]): Promise<Map<string, Progress>> {
  if (!keys.length) return new Map();
  const rows = await db.select().from(schema.appWatchProgress).where(inArray(schema.appWatchProgress.contentKey, keys));
  return new Map(rows.map((r) => [r.contentKey, r]));
}

export function isResumable(p: Progress | undefined): p is Progress {
  return Boolean(p && !p.finished && p.duration > 0 && p.position / p.duration >= RESUMABLE_FROM);
}

/** Keys worth a "Reprendre" card: between 5 % and 90 %, most recently watched first. */
export async function resumeKeys(limit = 20): Promise<Progress[]> {
  return db
    .select()
    .from(schema.appWatchProgress)
    .where(
      sql`not ${schema.appWatchProgress.finished} and ${schema.appWatchProgress.duration} > 0 and ${schema.appWatchProgress.position}::real / ${schema.appWatchProgress.duration} >= ${RESUMABLE_FROM}`,
    )
    .orderBy(desc(schema.appWatchProgress.updatedAt))
    .limit(limit);
}

// ---------------------------------------------------------------- history (admin)

/** Every progress row, most recently watched first: the admin's « Historique ». */
export async function listProgress(): Promise<Progress[]> {
  return db
    .select()
    .from(schema.appWatchProgress)
    .orderBy(desc(schema.appWatchProgress.updatedAt), desc(schema.appWatchProgress.contentKey));
}

export async function deleteProgress(contentKey: string): Promise<void> {
  await db.delete(schema.appWatchProgress).where(eq(schema.appWatchProgress.contentKey, contentKey));
}

/**
 * Manual override from the admin. « Vu » sets the position to the end (or to 1/1 when the
 * duration is unknown); « non vu » drops the row, a position at 0 meaning nothing.
 */
export async function setFinished(contentKey: string, finished: boolean): Promise<void> {
  if (!finished) return deleteProgress(contentKey);
  const [row] = await db.select().from(schema.appWatchProgress).where(eq(schema.appWatchProgress.contentKey, contentKey));
  const duration = row?.duration || 1;
  await db
    .insert(schema.appWatchProgress)
    .values({ contentKey, position: duration, duration, finished: true, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.appWatchProgress.contentKey, set: { position: duration, finished: true, updatedAt: new Date() } });
}
