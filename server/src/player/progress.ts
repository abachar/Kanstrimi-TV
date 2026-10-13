import { client as pg, db, schema } from "@/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { markWaitlistStarted } from "@/catalog";

/** "Vu" is derived here, once, at write time: 90 % of the duration. */
const FINISHED_AT = 0.9;
/** Below 5 % nothing is worth resuming: the row is kept, the resume row ignores it. */
export const RESUMABLE_FROM = 0.05;

export type Progress = { profileId: number; contentKey: string; position: number; duration: number; finished: boolean; updatedAt: Date };

const w = schema.appWatchProgress;

export async function setProgress(profileId: number, contentKey: string, position: number, duration: number): Promise<Progress> {
  const p = Math.max(0, Math.round(position)),
    d = Math.max(0, Math.round(duration));
  const finished = d > 0 && p / d >= FINISHED_AT;
  const [row] = await db
    .insert(w)
    .values({ profileId, contentKey, position: p, duration: d, finished, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [w.profileId, w.contentKey], set: { position: p, duration: d, finished, updatedAt: new Date() } })
    .returning();
  if (finished || (d > 0 && p / d >= RESUMABLE_FROM)) await markWaitlistStarted(profileId, contentKey);
  return row;
}

/** The profile's progress rows for a set of keys, as a map. */
export async function getProgress(profileId: number, keys: string[]): Promise<Map<string, Progress>> {
  if (!keys.length) return new Map();
  const rows = await db
    .select()
    .from(w)
    .where(and(eq(w.profileId, profileId), inArray(w.contentKey, keys)));
  return new Map(rows.map((r) => [r.contentKey, r]));
}

export function isResumable(p: Progress | undefined): p is Progress {
  return Boolean(p && !p.finished && p.duration > 0 && p.position / p.duration >= RESUMABLE_FROM);
}

/** The profile's keys worth a "Reprendre" card: between 5 % and 90 %, most recently watched first. */
export async function resumeKeys(profileId: number, limit = 20): Promise<Progress[]> {
  return db
    .select()
    .from(w)
    .where(
      and(
        eq(w.profileId, profileId),
        sql`not ${w.finished} and ${w.duration} > 0 and ${w.position}::real / ${w.duration} >= ${RESUMABLE_FROM}`,
      ),
    )
    .orderBy(desc(w.updatedAt))
    .limit(limit);
}

// ---------------------------------------------------------------- history (admin)

/** Every progress row, of one profile or of all, most recently watched first: the admin's « Historique ». */
export async function listProgress(profileId?: number): Promise<Progress[]> {
  return db
    .select()
    .from(w)
    .where(profileId === undefined ? undefined : eq(w.profileId, profileId))
    .orderBy(desc(w.updatedAt), desc(w.contentKey));
}

export async function deleteProgress(profileId: number, contentKey: string): Promise<void> {
  await db.delete(w).where(and(eq(w.profileId, profileId), eq(w.contentKey, contentKey)));
}

/**
 * Manual override from the admin, and the app's « Vu » / « Non vu ». « Vu » sets the position to the
 * end (or to 1/1 when the duration is unknown); « non vu » drops the row, a position at 0 meaning nothing.
 * A whole season is one statement.
 */
export async function setFinished(profileId: number, contentKeys: string | string[], finished: boolean): Promise<void> {
  const keys = [...new Set(typeof contentKeys === "string" ? [contentKeys] : contentKeys)];
  if (!keys.length) return;
  if (!finished) {
    await db.delete(w).where(and(eq(w.profileId, profileId), inArray(w.contentKey, keys)));
    return;
  }
  await pg`
    insert into app_watch_progress as p (profile_id, content_key, position, duration, finished, updated_at)
    select ${profileId}, k, coalesce(nullif(old.duration, 0), 1), coalesce(nullif(old.duration, 0), 1), true, now()
    from unnest(${keys}::text[]) as k
    left join app_watch_progress old on old.profile_id = ${profileId} and old.content_key = k
    on conflict (profile_id, content_key) do update set position = excluded.position, finished = true, updated_at = excluded.updated_at`;
  await markWaitlistStarted(profileId, keys);
}
