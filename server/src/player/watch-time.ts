import { db, schema } from "@/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";

/** « Chaînes les plus regardées »: the last 30 days, 5 minutes at least, 10 channels. */
export const MOST_WATCHED_DAYS = 30;
export const MOST_WATCHED_MIN_SECONDS = 300;
export const MOST_WATCHED_LIMIT = 10;
/** « Récentes »: the channels the profile left last, whatever the time spent. */
export const RECENT_LIMIT = 20;
/** One report covers at most this: the app sends every 30 s, a longer gap is a suspended app, not watching. */
export const MAX_REPORT_SECONDS = 600;

const lw = schema.appLiveWatch;

/** Adds what the profile played of a channel to today's total (the server's `TZ`). */
export async function addWatchTime(profileId: number, contentKey: string, seconds: number): Promise<void> {
  const s = Math.min(MAX_REPORT_SECONDS, Math.max(0, Math.round(seconds)));
  if (!s) return;
  await db
    .insert(lw)
    .values({ profileId, contentKey, day: sql`current_date`, seconds: s, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [lw.profileId, lw.contentKey, lw.day],
      set: { seconds: sql`${lw.seconds} + excluded.seconds`, updatedAt: new Date() },
    });
}

/** The profile's channel keys by last report, the last first, `RECENT_LIMIT` at most. Visibility is the caller's. */
export async function recentKeys(profileId: number): Promise<string[]> {
  const last = sql<Date>`max(${lw.updatedAt})`;
  const rows = await db
    .select({ key: lw.contentKey })
    .from(lw)
    .where(eq(lw.profileId, profileId))
    .groupBy(lw.contentKey)
    .orderBy(desc(last), lw.contentKey)
    .limit(RECENT_LIMIT);
  return rows.map((r) => r.key);
}

/**
 * The profile's channel keys by time watched over the last `MOST_WATCHED_DAYS` days, most first, those
 * above `MOST_WATCHED_MIN_SECONDS`. Visibility is the caller's: a hidden channel is dropped there.
 */
export async function mostWatchedKeys(profileId: number): Promise<string[]> {
  const total = sql<number>`sum(${lw.seconds})`;
  const rows = await db
    .select({ key: lw.contentKey })
    .from(lw)
    .where(and(eq(lw.profileId, profileId), gte(lw.day, sql`current_date - ${MOST_WATCHED_DAYS - 1}::int`)))
    .groupBy(lw.contentKey)
    .having(sql`${total} >= ${MOST_WATCHED_MIN_SECONDS}`)
    .orderBy(desc(total), lw.contentKey);
  return rows.map((r) => r.key);
}
