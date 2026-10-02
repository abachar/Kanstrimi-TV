import { db, schema } from "@/db";
import { getTmdbClient } from "./details";

/** Five pages of twenty: enough for ten of them to be in the catalogue most weeks. */
const PAGES = 5;

/**
 * The `trending` step: TMDB's weekly trending movies and series, replaced as a whole. The ranks
 * are TMDB's; the « Top 10 » rows keep the first ten the catalogue shows. An empty list (a TMDB
 * hiccup, never a real week) fails the step and keeps the previous one, as an unreachable TMDB does.
 */
export async function runTrending() {
  const client = await getTmdbClient();
  if (!client) throw new Error("Clé API TMDB non configurée");
  const rows: (typeof schema.tmdbTrending.$inferInsert)[] = [];
  for (const mediaType of ["movie", "tv"] as const) {
    const seen = new Set<number>();
    for (let page = 1; page <= PAGES; page++) {
      for (const r of (await client.trending(mediaType, page)).results) {
        if (!Number.isInteger(r.id) || seen.has(r.id)) continue;
        seen.add(r.id);
        rows.push({ mediaType, rank: seen.size, tmdbId: r.id });
      }
    }
  }
  const movies = rows.filter((r) => r.mediaType === "movie").length;
  const series = rows.length - movies;
  if (!movies || !series) throw new Error(`Tendances TMDB vides (${movies} films, ${series} séries) : la liste précédente est gardée`);
  await db.transaction(async (tx) => {
    await tx.delete(schema.tmdbTrending);
    await tx.insert(schema.tmdbTrending).values(rows);
  });
  return { movies, series };
}
