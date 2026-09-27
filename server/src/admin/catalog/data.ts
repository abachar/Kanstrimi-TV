import { and, asc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db, schema, hiddenItem, visibleItem, type Kind } from "@/db";
import type { Item } from "@/db";

/** How the admin narrows the catalogue. `vis` and `tmdb` are independent: "hidden and TMDB unmatched" is a valid question. */
export type CatalogFilter = {
  kind: Kind;
  q: string;
  cat: string;
  vis: "" | "visible" | "hidden";
  tmdb: "" | "matched" | "unmatched" | "pending";
};
export const CATALOG_PAGE = 100;

export function catalogWhere(f: CatalogFilter): SQL {
  const where: SQL[] = [eq(schema.items.kind, f.kind)];
  if (f.q) where.push(ilike(schema.items.name, `%${f.q}%`));
  if (f.cat) where.push(eq(schema.items.categoryXtreamId, f.cat));
  if (f.vis === "hidden") where.push(hiddenItem);
  if (f.vis === "visible") where.push(visibleItem);
  if (f.tmdb === "unmatched") where.push(eq(schema.items.matchStatus, "unmatched"));
  if (f.tmdb === "pending") where.push(eq(schema.items.matchStatus, "pending"));
  if (f.tmdb === "matched") where.push(sql`${schema.items.matchStatus} in ('matched','manual')`);
  return and(...where)!;
}

export async function countItems(f: CatalogFilter): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.items).where(catalogWhere(f));
  return n;
}

/** One page in provider order. Asks for one row past the page: cheaper than a second count(*) just to know if more remain. */
export async function pageItems(f: CatalogFilter, page: number, size = CATALOG_PAGE): Promise<{ rows: Item[]; hasMore: boolean }> {
  const rows = await db
    .select()
    .from(schema.items)
    .where(catalogWhere(f))
    .orderBy(asc(schema.items.position))
    .limit(size + 1)
    .offset((page - 1) * size);
  return { rows: rows.slice(0, size), hasMore: rows.length > size };
}

/** Entries per category, for the badges of the grouped view. */
export async function itemCountByCategory(kind: Kind): Promise<Map<string, number>> {
  const rows = await db
    .select({ cat: schema.items.categoryXtreamId, n: sql<number>`count(*)::int` })
    .from(schema.items)
    .where(eq(schema.items.kind, kind))
    .groupBy(schema.items.categoryXtreamId);
  return new Map(rows.map((r) => [r.cat ?? "", r.n]));
}
