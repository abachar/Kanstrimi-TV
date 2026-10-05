import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { describeError, singleFlight, within } from "@/shared";
import { getTmdbClient } from "./details";
import type { TitleRef } from "./recommendations";

/**
 * What the player asks of a title beyond its sheet, fetched on demand when it plays and kept a week in
 * `tmdb_extras`. Never fails: a TMDB outage answers what it had, or null (unknown).
 */

export type Extras = { creditsScene: boolean };
type Row = Extras & { fetchedAt: Date };

const TTL_MS = 7 * 24 * 3600 * 1000;
/** TMDB's keywords « aftercreditsstinger » and « duringcreditsstinger ». */
const CREDITS_SCENE_KEYWORDS = new Set([179430, 179431]);
/** After a failed fetch, that title leaves TMDB alone ten minutes. */
const once = singleFlight<Extras | null>(null, {
  retryAfterMs: 10 * 60 * 1000,
  onError: (e, k) => console.error(`[extras] TMDB ${k} : ${describeError(e)}`),
});

const refId = (r: TitleRef) => `${r.mediaType}:${r.tmdbId}`;

async function cachedRow(ref: TitleRef): Promise<Row | undefined> {
  const [row] = await db
    .select()
    .from(schema.tmdbExtras)
    .where(and(eq(schema.tmdbExtras.mediaType, ref.mediaType), eq(schema.tmdbExtras.tmdbId, ref.tmdbId)));
  return row;
}

/** Ask TMDB and replace the cached row; one fetch per title at a time, null when TMDB is not set up or failed. */
function fetchOnce(ref: TitleRef): Promise<Extras | null> {
  return once(refId(ref), async () => {
    const client = await getTmdbClient();
    if (!client) return null;
    // Keywords exist for movies only: an episode's credits scene is announced nowhere.
    const keywords = ref.mediaType === "movie" ? ((await client.movieKeywords(ref.tmdbId)).keywords ?? []) : [];
    const found: Extras = { creditsScene: keywords.some((k) => CREDITS_SCENE_KEYWORDS.has(k.id)) };
    await db
      .insert(schema.tmdbExtras)
      .values({ ...ref, ...found, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.tmdbExtras.mediaType, schema.tmdbExtras.tmdbId],
        set: { creditsScene: sql`excluded.credits_scene`, fetchedAt: sql`excluded.fetched_at` },
      });
    return found;
  });
}

/**
 * A row fetched less than a week ago answers at once; otherwise TMDB is asked, `waitMs` at most, past
 * which the old row (or null) answers and the fetch lands for the next call.
 */
export async function extras(ref: TitleRef, waitMs: number): Promise<Extras | null> {
  const row = await cachedRow(ref);
  if (row && Date.now() - row.fetchedAt.getTime() < TTL_MS) return row;
  return (await within(fetchOnce(ref), waitMs, null)) ?? row ?? null;
}

/** Resolves once the fetches started so far are done (tests). */
export const extrasSettled = () => once.idle();

/** Forget the failures and fetches in flight (tests). */
export const resetExtras = () => once.reset();
