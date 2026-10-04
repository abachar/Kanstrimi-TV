import { getSettings } from "@/config";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { TmdbClient, type TmdbDetails } from "./client";
import { hasAllNames } from "./match";
import { describeError, isUnreachable } from "@/shared";

/** A cached document is read again from TMDB past this age. */
export const DETAILS_TTL_MS = 30 * 24 * 3600 * 1000;

export async function getTmdbClient() {
  const s = await getSettings();
  if (!s.tmdb_api_key) return null;
  return new TmdbClient(s.tmdb_api_key, s.tmdb_language);
}

/** A document of `tmdb_cache`: details by (`movie` | `tv`, id, language), a season by (`tv_season`, show id, `<lang>#s<n>`). */
export type TmdbCacheKey = { mediaType: string; tmdbId: number; lang: string };

export async function readTmdbCache(k: TmdbCacheKey): Promise<{ data: Record<string, unknown>; fetchedAt: Date } | undefined> {
  const [row] = await db
    .select({ data: schema.tmdbCache.data, fetchedAt: schema.tmdbCache.fetchedAt })
    .from(schema.tmdbCache)
    .where(and(eq(schema.tmdbCache.mediaType, k.mediaType), eq(schema.tmdbCache.tmdbId, k.tmdbId), eq(schema.tmdbCache.lang, k.lang)));
  return row;
}

export async function writeTmdbCache(k: TmdbCacheKey, data: Record<string, unknown>) {
  await db
    .insert(schema.tmdbCache)
    .values({ ...k, data })
    .onConflictDoUpdate({
      target: [schema.tmdbCache.mediaType, schema.tmdbCache.tmdbId, schema.tmdbCache.lang],
      set: { data, fetchedAt: new Date() },
    });
}

/** Fetch (and cache) TMDB details for a movie/tv id. */
export async function getDetails(
  client: TmdbClient,
  mediaType: "movie" | "tv",
  tmdbId: number,
  force = false,
): Promise<TmdbDetails | null> {
  const cached = await readTmdbCache({ mediaType, tmdbId, lang: client.language });
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
  return getDetails(client, mediaType, tmdbId, true).catch((e) => {
    console.warn(`[tmdb] relecture de ${mediaType} ${tmdbId} impossible, fiche gardée : ${describeError(e)}`);
    return d;
  });
}

/** Fetches the details and stores them; throws when TMDB does. */
export async function fetchDetails(client: TmdbClient, mediaType: "movie" | "tv", tmdbId: number): Promise<TmdbDetails> {
  const data = mediaType === "movie" ? await client.movie(tmdbId) : await client.tv(tmdbId);
  await writeTmdbCache({ mediaType, tmdbId, lang: client.language }, data);
  return data;
}

/** Read-only cached lookup (no network). */
export async function getCachedDetails(mediaType: "movie" | "tv", tmdbId: number, lang: string) {
  return ((await readTmdbCache({ mediaType, tmdbId, lang }))?.data as TmdbDetails | undefined) ?? null;
}
