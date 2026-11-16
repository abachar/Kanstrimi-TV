import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { variants as v, type Kind } from "@/db";
import type { Exec } from "../catalog/search";

/**
 * The streams' screen: what the providers send, one line per stream, whatever the catalogue made of it.
 * The other screens show our entries (a film, a channel); here one finds a stream by what the provider
 * says of it, sees where it is filed, and files it elsewhere.
 */

export const STREAMS_PAGE = 50;

/**
 * A column of `variants` named in full: a selection from one table writes its columns bare, and a
 * sub-select would read a bare `account_id` as its own.
 */
const of = (column: string) => sql.raw(`"variants"."${column}"`);

export type StreamRow = {
  id: number;
  name: string;
  account: string | null;
  category: string | null;
  quality: string | null;
  lang: string | null;
  /** The entry it is filed under: its id (titles and channels share one sequence), its name, and whether the catalogue knows it. */
  contentId: number | null;
  entry: string | null;
  known: boolean;
  how: string | null;
  manual: boolean;
  hidden: boolean;
  /** true: left out by every profile's filter; false: kept by one at least; null: not judged yet. */
  filtered: boolean | null;
};

/** One page of the streams of a kind meeting `where` (the compiled query, about `variants`), by name, and how many there are. */
export async function searchStreams(
  ex: Exec,
  kind: Kind,
  where: SQL | null,
  offset: number,
): Promise<{ rows: StreamRow[]; total: number }> {
  const cond = and(eq(v.kind, kind), where ?? undefined);
  const [[{ n }], rows] = await Promise.all([
    ex.select({ n: sql<number>`count(*)::int` }).from(v).where(cond),
    ex
      .select({
        id: v.id,
        name: v.name,
        account: sql<string | null>`(select a.name from xtream_accounts a where a.id = ${of("account_id")})`,
        // A provider may list a category twice: the first name will do.
        category: sql<string | null>`(select k.name from xtream_categories k
          where k.account_id = ${of("account_id")} and k.kind = ${of("kind")} and k.xtream_id = ${of("category_xtream_id")} limit 1)`,
        quality: v.quality,
        lang: v.lang,
        contentId: v.contentId,
        entry: sql<string | null>`coalesce(
          (select t.title || coalesce(' (' || t.year || ')', '') from catalog_titles t where t.id = ${of("title_id")}),
          (select c.name from catalog_channels c where c.id = ${of("channel_id")}))`,
        known: sql<boolean>`(${of("tmdb_id")} is not null or ${of("channel_name")} is not null)`,
        how: v.how,
        manual: v.manual,
        hidden: v.hidden,
        filtered: v.filtered,
      })
      .from(v)
      .where(cond)
      // The same order on every database, whatever its collation: without case nor accents, byte by byte.
      .orderBy(sql`unaccent(lower(${v.name})) collate "C"`, asc(v.id))
      .limit(STREAMS_PAGE)
      .offset(offset),
  ]);
  return { rows, total: n };
}
