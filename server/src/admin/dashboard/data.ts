import { sql } from "drizzle-orm";
import { db, schema, hiddenItem } from "@/db";

export type ItemCount = { kind: string; total: number; hidden: number; matched: number; unmatched: number; pending: number };
export type CategoryCount = { kind: string; total: number; hidden: number };

/** Per kind: how many entries and categories, how many hidden, where the TMDB matching stands. */
export async function counts(): Promise<{ items: ItemCount[]; categories: CategoryCount[] }> {
  const items = await db
    .select({
      kind: schema.items.kind,
      total: sql<number>`count(*)::int`,
      hidden: sql<number>`count(*) filter (where ${hiddenItem})::int`,
      matched: sql<number>`count(*) filter (where ${schema.items.matchStatus} in ('matched','manual'))::int`,
      unmatched: sql<number>`count(*) filter (where ${schema.items.matchStatus} = 'unmatched')::int`,
      pending: sql<number>`count(*) filter (where ${schema.items.matchStatus} = 'pending')::int`,
    })
    .from(schema.items)
    .groupBy(schema.items.kind);
  const categories = await db
    .select({
      kind: schema.categories.kind,
      total: sql<number>`count(*)::int`,
      hidden: sql<number>`count(*) filter (where ${schema.categories.hiddenByRule} or ${schema.categories.hiddenManual})::int`,
    })
    .from(schema.categories)
    .groupBy(schema.categories.kind);
  return { items, categories };
}

export type AppCount = { favorites: number; ongoing: number; finished: number };
/** What the app stored: favourites and playback positions, for the « Application » card. */
export async function appCounts(): Promise<AppCount> {
  const [[f], [p]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.favorites),
    db
      .select({
        ongoing: sql<number>`count(*) filter (where not ${schema.watchProgress.finished})::int`,
        finished: sql<number>`count(*) filter (where ${schema.watchProgress.finished})::int`,
      })
      .from(schema.watchProgress),
  ]);
  return { favorites: f.n, ongoing: p.ongoing, finished: p.finished };
}
