import { db, schema } from "@/db";
import { desc, gte, sql } from "drizzle-orm";

/** « Chaînes les plus regardées »: the last 30 days, 5 minutes at least, 10 channels. */
export const MOST_WATCHED_DAYS = 30;
export const MOST_WATCHED_MIN_SECONDS = 300;
export const MOST_WATCHED_LIMIT = 10;
/** One report covers at most this: the app sends every 30 s, a longer gap is a suspended app, not watching. */
export const MAX_REPORT_SECONDS = 600;

/** Adds what the app played of a channel to today's total (the server's `TZ`). */
export async function addWatchTime(contentKey: string, seconds: number): Promise<void> {
  const s = Math.min(MAX_REPORT_SECONDS, Math.max(0, Math.round(seconds)));
  if (!s) return;
  await db
    .insert(schema.appLiveWatch)
    .values({ contentKey, day: sql`current_date`, seconds: s })
    .onConflictDoUpdate({
      target: [schema.appLiveWatch.contentKey, schema.appLiveWatch.day],
      set: { seconds: sql`${schema.appLiveWatch.seconds} + excluded.seconds` },
    });
}

/**
 * Channel keys by time watched over the last `MOST_WATCHED_DAYS` days, most first, those above
 * `MOST_WATCHED_MIN_SECONDS`. Visibility is the caller's: a hidden channel is dropped there.
 */
export async function mostWatchedKeys(): Promise<string[]> {
  const total = sql<number>`sum(${schema.appLiveWatch.seconds})`;
  const rows = await db
    .select({ key: schema.appLiveWatch.contentKey })
    .from(schema.appLiveWatch)
    .where(gte(schema.appLiveWatch.day, sql`current_date - ${MOST_WATCHED_DAYS - 1}::int`))
    .groupBy(schema.appLiveWatch.contentKey)
    .having(sql`${total} >= ${MOST_WATCHED_MIN_SECONDS}`)
    .orderBy(desc(total), schema.appLiveWatch.contentKey);
  return rows.map((r) => r.key);
}
