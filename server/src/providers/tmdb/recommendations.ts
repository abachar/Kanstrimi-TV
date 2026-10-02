import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { describeError, singleFlight, within } from "@/shared";
import { getTmdbClient } from "./details";

/**
 * TMDB's recommendations of a title, fetched on demand and kept a week in `tmdb_recommendations`
 * (ids only, in TMDB's order). Never fails: a TMDB outage answers the list it had, or nothing.
 */

export type TitleRef = { mediaType: "movie" | "tv"; tmdbId: number };
type Row = { ids: number[]; fetchedAt: Date };

const TTL_MS = 7 * 24 * 3600 * 1000;
/** After a failed fetch, that title leaves TMDB alone ten minutes. */
const once = singleFlight<number[] | null>(null, {
  retryAfterMs: 10 * 60 * 1000,
  onError: (e, k) => console.error(`[recommandations] TMDB ${k} : ${describeError(e)}`),
});
const queued = new Set<string>();
let queue: Promise<void> = Promise.resolve();

const refId = (r: TitleRef) => `${r.mediaType}:${r.tmdbId}`;
const isFresh = (row: Row | undefined) => Boolean(row && Date.now() - row.fetchedAt.getTime() < TTL_MS);

async function cachedRows(refs: TitleRef[]): Promise<Map<string, Row>> {
  if (!refs.length) return new Map();
  // The primary key's two columns: by tmdb_id alone, the index is of no use.
  const pairs = [...new Map(refs.map((r) => [refId(r), sql`(${r.mediaType}, ${r.tmdbId}::int)`])).values()];
  const rows = await db
    .select()
    .from(schema.tmdbRecommendations)
    .where(sql`(${schema.tmdbRecommendations.mediaType}, ${schema.tmdbRecommendations.tmdbId}) in (${sql.join(pairs, sql`, `)})`);
  return new Map(rows.map((r) => [refId(r), { ids: r.ids, fetchedAt: r.fetchedAt }]));
}

/** Ask TMDB and replace the cached list; one fetch per title at a time, null when TMDB is not set up or failed. */
function fetchOnce(ref: TitleRef): Promise<number[] | null> {
  return once(refId(ref), async () => {
    const client = await getTmdbClient();
    if (!client) return null;
    const res = await client.recommendations(ref.mediaType, ref.tmdbId);
    const ids = [...new Set((res.results ?? []).map((r) => r.id).filter((id) => Number.isInteger(id) && id !== ref.tmdbId))];
    await db
      .insert(schema.tmdbRecommendations)
      .values({ ...ref, ids, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.tmdbRecommendations.mediaType, schema.tmdbRecommendations.tmdbId],
        set: { ids: sql`excluded.ids`, fetchedAt: sql`excluded.fetched_at` },
      });
    return ids;
  });
}

/**
 * One title (a sheet, a title being played). A list fetched less than a week ago answers at once;
 * otherwise TMDB is asked, `waitMs` at most, past which the old list (or nothing) answers and the
 * fetch lands for the next call.
 */
export async function recommendations(ref: TitleRef, waitMs: number): Promise<number[]> {
  const row = (await cachedRows([ref])).get(refId(ref));
  if (row && isFresh(row)) return row.ids;
  return (await within(fetchOnce(ref), waitMs, null)) ?? row?.ids ?? [];
}

/**
 * Many titles at once (the home row's seeds), from the cache only, keyed `movie:603`: the missing and
 * old ones are fetched in the background, one title after the other, for the next call.
 */
export async function cachedRecommendations(refs: TitleRef[]): Promise<Map<string, number[]>> {
  const rows = await cachedRows(refs);
  refreshInBackground(refs.filter((r) => !isFresh(rows.get(refId(r)))));
  return new Map(refs.flatMap((r) => (rows.has(refId(r)) ? [[refId(r), rows.get(refId(r))!.ids] as const] : [])));
}

function refreshInBackground(refs: TitleRef[]) {
  const todo = refs.filter((r) => !queued.has(refId(r)));
  if (!todo.length) return;
  for (const r of todo) queued.add(refId(r));
  queue = queue.then(async () => {
    for (const r of todo) {
      await fetchOnce(r);
      queued.delete(refId(r));
    }
  });
}

/** Resolves once the fetches started so far, in the background or on demand, are done (tests). */
export async function recommendationsSettled() {
  await queue;
  await once.idle();
}

/** Forget the failures and fetches in flight (tests). */
export function resetRecommendations() {
  once.reset();
  queued.clear();
}
