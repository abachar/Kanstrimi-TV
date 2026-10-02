import { tmdbMediaType } from "@/db";
import { cachedRecommendations, recommendations, type TitleRef } from "@/providers/tmdb";
import { parseKey, tmdbKey } from "./keys";

/**
 * « Si vous avez aimé… » in content keys: TMDB's recommendations of a movie or a series matched to TMDB
 * (`tmdb:movie:604`), in TMDB's order; anything else has none. The caller crosses them with what the
 * app may see.
 */

function refOf(key: string): TitleRef | null {
  const p = parseKey(key);
  if (!p || p.tmdbId === undefined || p.episode !== undefined || p.kind === "live") return null;
  return { mediaType: tmdbMediaType(p.kind), tmdbId: p.tmdbId };
}
const keysOf = (ref: TitleRef, ids: number[]) => ids.map((id) => tmdbKey(ref.mediaType === "movie" ? "vod" : "series", id));

/** One title, waiting `waitMs` at most for TMDB when the cached list is missing or old. */
export async function recommendedKeys(key: string, waitMs: number): Promise<string[]> {
  const ref = refOf(key);
  return ref ? keysOf(ref, await recommendations(ref, waitMs)) : [];
}

/** Many titles, from the cache only; the rest is fetched in the background for the next call. */
export async function cachedRecommendedKeys(keys: string[]): Promise<Map<string, string[]>> {
  const refs = new Map(keys.flatMap((k) => (refOf(k) ? [[k, refOf(k)!] as const] : [])));
  const lists = await cachedRecommendations([...refs.values()]);
  const out = new Map<string, string[]>();
  for (const [key, ref] of refs) {
    const ids = lists.get(`${ref.mediaType}:${ref.tmdbId}`);
    if (ids) out.set(key, keysOf(ref, ids));
  }
  return out;
}
