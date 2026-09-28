import { sql } from "drizzle-orm";
import { db } from "@/db";
import { cacheStats } from "@/providers/tmdb";
import { epgCacheStat } from "@/providers/xtream";

/** What one cache holds right now: a count, a size, the age of its oldest and newest entries. Read-only. */
export type CacheStat = {
  id: "tmdb" | "info" | "episodes" | "images" | "epg";
  count: number;
  bytes: number;
  oldest: string | null;
  newest: string | null;
};

async function tableStat(id: CacheStat["id"], table: string, dateColumn: string): Promise<CacheStat> {
  const [row] = await db.execute<{ count: number; bytes: number; oldest: string | null; newest: string | null }>(sql`
    select count(*)::int as count,
           pg_total_relation_size(${table})::bigint as bytes,
           min(${sql.raw(dateColumn)})::text as oldest,
           max(${sql.raw(dateColumn)})::text as newest
    from ${sql.raw(table)}`);
  return { id, count: row.count, bytes: Number(row.bytes), oldest: row.oldest, newest: row.newest };
}

export async function cacheRows(): Promise<CacheStat[]> {
  const [tmdb, info, episodes, img, epg] = await Promise.all([
    tableStat("tmdb", "tmdb_cache", "fetched_at"),
    tableStat("info", "info_cache", "fetched_at"),
    tableStat("episodes", "episodes", "updated_at"),
    cacheStats(),
    epgCacheStat(),
  ]);
  return [
    tmdb,
    info,
    episodes,
    { id: "images", count: img.files, bytes: img.bytes, oldest: null, newest: null },
    { id: "epg", count: epg.exists ? 1 : 0, bytes: epg.bytes, oldest: null, newest: epg.mtime },
  ];
}
