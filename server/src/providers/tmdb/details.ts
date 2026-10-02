import { getSettings } from "@/config";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { TmdbClient, type TmdbDetails } from "./client";
import { hasAllNames } from "./match";
import { isUnreachable } from "@/shared";

/** A cached document is read again from TMDB past this age. */
export const DETAILS_TTL_MS = 30 * 24 * 3600 * 1000;

export async function getTmdbClient() {
  const s = await getSettings();
  if (!s.tmdb_api_key) return null;
  return new TmdbClient(s.tmdb_api_key, s.tmdb_language);
}

/** Fetch (and cache) TMDB details for a movie/tv id. */
export async function getDetails(
  client: TmdbClient,
  mediaType: "movie" | "tv",
  tmdbId: number,
  force = false,
): Promise<TmdbDetails | null> {
  const [cached] = await db
    .select()
    .from(schema.tmdbCache)
    .where(and(eq(schema.tmdbCache.mediaType, mediaType), eq(schema.tmdbCache.tmdbId, tmdbId), eq(schema.tmdbCache.lang, client.language)));
  if (cached && !force && Date.now() - cached.fetchedAt.getTime() < DETAILS_TTL_MS) return cached.data as TmdbDetails;
  try {
    return await fetchDetails(client, mediaType, tmdbId);
  } catch (e) {
    if (cached) return cached.data as TmdbDetails;
    throw e;
  }
}

/**
 * The document with every name it answers to: one cached before alternative and translated titles
 * were requested is fetched again, when `stillWrong` (default: always) says the names may change the
 * verdict. Null when TMDB has no such document; throws when TMDB cannot be reached (`isUnreachable`).
 */
export async function detailsWithNames(
  client: TmdbClient,
  mediaType: "movie" | "tv",
  tmdbId: number,
  stillWrong: (d: TmdbDetails) => boolean = () => true,
): Promise<TmdbDetails | null> {
  // No document is a verdict (a wrong id); no answer is not: an outage goes up, the entry stays pending.
  const d = await getDetails(client, mediaType, tmdbId).catch((e) => {
    if (isUnreachable(e)) throw e;
    return null;
  });
  if (!d || hasAllNames(d) || !stillWrong(d)) return d;
  return getDetails(client, mediaType, tmdbId, true).catch(() => d);
}

/** Fetches the details and stores them; throws when TMDB does. */
export async function fetchDetails(client: TmdbClient, mediaType: "movie" | "tv", tmdbId: number): Promise<TmdbDetails> {
  const data = mediaType === "movie" ? await client.movie(tmdbId) : await client.tv(tmdbId);
  await db
    .insert(schema.tmdbCache)
    .values({ mediaType, tmdbId, lang: client.language, data })
    .onConflictDoUpdate({
      target: [schema.tmdbCache.mediaType, schema.tmdbCache.tmdbId, schema.tmdbCache.lang],
      set: { data, fetchedAt: new Date() },
    });
  return data;
}

/** Read-only cached lookup (no network). */
export async function getCachedDetails(mediaType: "movie" | "tv", tmdbId: number, lang: string) {
  const [cached] = await db
    .select()
    .from(schema.tmdbCache)
    .where(and(eq(schema.tmdbCache.mediaType, mediaType), eq(schema.tmdbCache.tmdbId, tmdbId), eq(schema.tmdbCache.lang, lang)));
  return (cached?.data as TmdbDetails | undefined) ?? null;
}
