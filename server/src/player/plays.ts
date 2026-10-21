import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseKey } from "@/catalog";

/**
 * How many times a profile played each movie or episode (`app_plays`), counted from the progress
 * reports: a play begins with the first report after `PLAY_GAP_HOURS` without one, so an evening's
 * reports are one play and a title watched again next week is two. « Vos plus regardés » on the home:
 * a movie played twice at least, a series whose episodes' plays reach five.
 */
export const PLAY_GAP_HOURS = 6;
export const MOST_PLAYED_MIN = { movie: 2, series: 5 } as const;
export const MOST_PLAYED_LIMIT = 20;

const pl = schema.appPlays;

/** A progress report came in: a new play, or the one in progress going on. */
export async function recordPlay(profileId: number, contentKey: string, now = new Date()): Promise<void> {
  await db
    .insert(pl)
    .values({ profileId, contentKey, plays: 1, firstAt: now, lastAt: now })
    .onConflictDoUpdate({
      target: [pl.profileId, pl.contentKey],
      set: {
        plays: sql`${pl.plays} + case when ${pl.lastAt} < ${now.toISOString()}::timestamptz - ${sql.raw(`interval '${PLAY_GAP_HOURS} hours'`)} then 1 else 0 end`,
        lastAt: now,
      },
    });
}

/** The profile's plays by key (movies and episodes alike), for the admin. */
export async function playsOf(profileId?: number): Promise<Map<string, { profileId: number; plays: number; lastAt: Date }>> {
  const rows = await db
    .select({ profileId: pl.profileId, contentKey: pl.contentKey, plays: pl.plays, lastAt: pl.lastAt })
    .from(pl)
    .where(profileId === undefined ? undefined : eq(pl.profileId, profileId));
  return new Map(rows.map((r) => [`${r.profileId}:${r.contentKey}`, r]));
}

/**
 * The profile's most played titles: movies by their plays, series by the sum of their episodes',
 * `MOST_PLAYED_MIN` of their kind at least, most played first then the most recent. Visibility is the caller's.
 */
export async function mostPlayedKeys(profileId: number, min = MOST_PLAYED_MIN): Promise<{ key: string; plays: number; lastAt: Date }[]> {
  const rows = await db
    .select({ contentKey: pl.contentKey, plays: pl.plays, lastAt: pl.lastAt })
    .from(pl)
    .where(eq(pl.profileId, profileId))
    .orderBy(desc(pl.lastAt));
  const byTitle = new Map<string, { key: string; plays: number; lastAt: Date }>();
  for (const r of rows) {
    // A series under its own key, its episodes' plays summed.
    const key = parseKey(r.contentKey)?.seriesKey ?? r.contentKey;
    const t = byTitle.get(key) ?? { key, plays: 0, lastAt: r.lastAt };
    t.plays += r.plays;
    if (r.lastAt > t.lastAt) t.lastAt = r.lastAt;
    byTitle.set(key, t);
  }
  return [...byTitle.values()]
    .filter((t) => t.plays >= (parseKey(t.key)?.kind === "series" ? min.series : min.movie))
    .sort((a, b) => b.plays - a.plays || b.lastAt.getTime() - a.lastAt.getTime() || a.key.localeCompare(b.key))
    .slice(0, MOST_PLAYED_LIMIT);
}
