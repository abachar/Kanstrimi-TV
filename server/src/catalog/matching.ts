import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema, tmdbMediaType, type Variant } from "@/db";
import { regroupItems } from "./grouping/group";
import { getDetails, getTmdbClient, setMatch } from "@/providers/tmdb";

/** Manual correction of the TMDB matching, from the admin: the match is catalogue data, TMDB only supplies the candidates. */

export type TmdbCandidate = { id: number; label: string };

/** Up to ten search hits, labelled "Title (year)". Empty when no TMDB key is configured. */
export async function searchCandidates(item: Variant, query: string, limit = 10): Promise<TmdbCandidate[]> {
  const client = await getTmdbClient();
  if (!client) return [];
  const res = item.kind === "vod" ? await client.searchMovie(query) : await client.searchTv(query);
  return (res.results ?? [])
    .slice(0, limit)
    .map((r) => ({ id: r.id, label: `${r.title ?? r.name} (${(r.release_date ?? r.first_air_date ?? "").slice(0, 4) || "?"})` }));
}

/** Assign a TMDB id by hand (null removes the association); the item is regrouped at once. */
export async function assignManual(itemId: number, tmdbId: number | null) {
  const [it] = await db.select().from(schema.catalogVariants).where(eq(schema.catalogVariants.id, itemId));
  if (!it) throw new Error("Variante introuvable");
  if (tmdbId) {
    const client = await getTmdbClient();
    if (!client) throw new Error("Clé API TMDB non configurée");
    await getDetails(client, tmdbMediaType(it.kind), tmdbId, true);
  }
  await setMatch(itemId, tmdbId, 1, tmdbId ? "manual" : "unmatched");
  await regroupItems([itemId]);
}

/** Only the failures go back to pending: what a better rule or a fresh TMDB may now find. */
export async function retryUnmatched(): Promise<number> {
  const rows = await db
    .update(schema.catalogVariants)
    .set({ matchStatus: "pending" })
    .where(and(inArray(schema.catalogVariants.kind, ["vod", "series"]), eq(schema.catalogVariants.matchStatus, "unmatched")))
    .returning({ id: schema.catalogVariants.id });
  return rows.length;
}

/** Back to pending for automatic matches; manual ones and grouping overrides stay unless asked. */
export async function resetMatches(kind?: "vod" | "series", clearOverrides = false) {
  await db
    .update(schema.catalogVariants)
    .set({ matchStatus: "pending", tmdbId: null, matchScore: null })
    .where(
      and(inArray(schema.catalogVariants.kind, kind ? [kind] : ["vod", "series"]), sql`${schema.catalogVariants.matchStatus} <> 'manual'`),
    );
  if (clearOverrides)
    await db
      .update(schema.catalogVariants)
      .set({ keyOverride: null })
      .where(inArray(schema.catalogVariants.kind, kind ? [kind] : ["vod", "series"]));
}
