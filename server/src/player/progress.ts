import { client as pg, db, schema } from "@/db";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { markWaitlistStarted } from "@/catalog";

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
  if (finished || (d > 0 && p / d >= RESUMABLE_FROM)) await markWaitlistStarted(contentKey);
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
 * Manual override from the admin, and the app's « Vu » / « Non vu ». « Vu » sets the position to the
 * end (or to 1/1 when the duration is unknown); « non vu » drops the row, a position at 0 meaning nothing.
 * A whole season is one statement.
 */
export async function setFinished(contentKeys: string | string[], finished: boolean): Promise<void> {
  const keys = [...new Set(typeof contentKeys === "string" ? [contentKeys] : contentKeys)];
  if (!keys.length) return;
  if (!finished) {
    await db.delete(schema.appWatchProgress).where(inArray(schema.appWatchProgress.contentKey, keys));
    return;
  }
  await pg`
    insert into app_watch_progress as p (content_key, position, duration, finished, updated_at)
    select k, coalesce(nullif(old.duration, 0), 1), coalesce(nullif(old.duration, 0), 1), true, now()
    from unnest(${keys}::text[]) as k
    left join app_watch_progress old on old.content_key = k
    on conflict (content_key) do update set position = excluded.position, finished = true, updated_at = excluded.updated_at`;
  await markWaitlistStarted(keys);
}
