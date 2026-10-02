import { and, asc, eq, type SQL } from "drizzle-orm";
import { db, schema, tmdbMediaType, type Content } from "@/db";

/** The contents of one kind in TMDB's weekly trending order (the `trending` step), among those `where` keeps. */
export async function trendingContents(kind: "vod" | "series", where: SQL | undefined, limit: number): Promise<Content[]> {
  const rows = await db
    .select({ content: schema.catalogContents })
    .from(schema.catalogContents)
    .innerJoin(
      schema.tmdbTrending,
      and(eq(schema.tmdbTrending.tmdbId, schema.catalogContents.tmdbId), eq(schema.tmdbTrending.mediaType, tmdbMediaType(kind))),
    )
    .where(and(eq(schema.catalogContents.kind, kind), where))
    .orderBy(asc(schema.tmdbTrending.rank))
    .limit(limit);
  return rows.map((r) => r.content);
}
