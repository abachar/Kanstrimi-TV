import { and, eq } from "drizzle-orm";
import { db, schema, tmdbHasLogos } from "@/db";
import { describeError, singleFlight } from "@/shared";
import { fetchDetails, getTmdbClient } from "./details";

/** An opened sheet re-reads its TMDB document past this age, or at once when it predates the logos. */
const SHEET_TTL_MS = 7 * 24 * 3600 * 1000;

/** After a failed read, that title leaves TMDB alone ten minutes. */
const once = singleFlight(false, {
  retryAfterMs: 10 * 60 * 1000,
  onError: (e, k) => console.error(`[sheet] rafraîchissement TMDB ${k.replace(":", " ")} : ${describeError(e)}`),
});

/**
 * The TMDB document of a sheet being opened, fetched again when old. True when it was fetched now;
 * false when it was fresh, TMDB is not set up, or TMDB failed. One fetch per title at a time; never fails.
 */
export function refreshDetails(mediaType: "movie" | "tv", tmdbId: number): Promise<boolean> {
  return once(`${mediaType}:${tmdbId}`, async () => {
    const client = await getTmdbClient();
    if (!client) return false;
    const [cached] = await db
      .select({
        fetchedAt: schema.tmdbCache.fetchedAt,
        hasLogos: tmdbHasLogos,
      })
      .from(schema.tmdbCache)
      .where(
        and(eq(schema.tmdbCache.mediaType, mediaType), eq(schema.tmdbCache.tmdbId, tmdbId), eq(schema.tmdbCache.lang, client.language)),
      );
    if (cached?.hasLogos && Date.now() - cached.fetchedAt.getTime() < SHEET_TTL_MS) return false;
    await fetchDetails(client, mediaType, tmdbId);
    return true;
  });
}
