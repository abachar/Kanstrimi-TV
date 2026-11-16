import { and, asc, eq, type SQL } from "drizzle-orm";
import { db, schema, tmdbMediaType, type Content, titleContent } from "@/db";

/** The contents of one kind in TMDB's weekly trending order (the `trending` step), among those `where` keeps. */
export async function trendingContents(kind: "vod" | "series", where: SQL | undefined, limit: number): Promise<Content[]> {
  const rows = await db
    .select({ content: titleContent })
    .from(schema.catalogTitles)
    .innerJoin(
      schema.cacheTmdbTrending,
      and(eq(schema.cacheTmdbTrending.tmdbId, schema.catalogTitles.tmdbId), eq(schema.cacheTmdbTrending.mediaType, tmdbMediaType(kind))),
    )
    .where(and(eq(schema.catalogTitles.kind, kind), where))
    .orderBy(asc(schema.cacheTmdbTrending.rank))
    .limit(limit);
  return rows.map((r) => r.content);
}
