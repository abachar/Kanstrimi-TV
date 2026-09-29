import { sql } from "drizzle-orm";
import { db, schema, hiddenItem, visibleItem } from "@/db";

export type ItemCount = { kind: string; total: number; hidden: number; matched: number; unmatched: number; pending: number };
export type CategoryCount = { kind: string; total: number; hidden: number };

/** Per kind: how many entries and categories, how many hidden; the TMDB matching counts what the app sees, visible entries only. */
export async function counts(): Promise<{ items: ItemCount[]; categories: CategoryCount[] }> {
  const items = await db
    .select({
      kind: schema.catalogVariants.kind,
      total: sql<number>`count(*)::int`,
      hidden: sql<number>`count(*) filter (where ${hiddenItem})::int`,
      matched: sql<number>`count(*) filter (where ${visibleItem} and ${schema.catalogVariants.matchStatus} in ('matched','manual'))::int`,
      unmatched: sql<number>`count(*) filter (where ${visibleItem} and ${schema.catalogVariants.matchStatus} = 'unmatched')::int`,
      pending: sql<number>`count(*) filter (where ${visibleItem} and ${schema.catalogVariants.matchStatus} = 'pending')::int`,
    })
    .from(schema.catalogVariants)
    .groupBy(schema.catalogVariants.kind);
  const categories = await db
    .select({
      kind: schema.catalogCategories.kind,
      total: sql<number>`count(*)::int`,
      hidden: sql<number>`count(*) filter (where ${schema.catalogCategories.hiddenByRule} or ${schema.catalogCategories.hiddenManual})::int`,
    })
    .from(schema.catalogCategories)
    .groupBy(schema.catalogCategories.kind);
  return { items, categories };
}

export type AppCount = { favorites: number; ongoing: number; finished: number };
/** What the app stored: favourites and playback positions, for the « Application » card. */
export async function appCounts(): Promise<AppCount> {
  const [[f], [p]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.appFavorites),
    db
      .select({
        ongoing: sql<number>`count(*) filter (where not ${schema.appWatchProgress.finished})::int`,
        finished: sql<number>`count(*) filter (where ${schema.appWatchProgress.finished})::int`,
      })
      .from(schema.appWatchProgress),
  ]);
  return { favorites: f.n, ongoing: p.ongoing, finished: p.finished };
}
