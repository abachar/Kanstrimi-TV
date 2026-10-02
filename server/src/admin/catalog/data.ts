import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { db, schema, type Kind } from "@/db";
import type { Variant } from "@/db";
import type { Exec } from "./search";

/** How the admin narrows the Xtream view: a category, and a query in the filter language (`visible:non`, `tmdb:attente`…). */
export type CatalogFilter = {
  kind: Kind;
  q: string;
  cat: string;
  /** `q` compiled (`search.ts`): the condition a variant meets. */
  match?: SQL | null;
};
export const CATALOG_PAGE = 100;
/** The `cat` value of the entries the provider sends without a category (`category_id: null`). */
export const NO_CATEGORY = "_none";

export function catalogWhere(f: CatalogFilter): SQL {
  const where: SQL[] = [eq(schema.catalogVariants.kind, f.kind)];
  if (f.q && f.match) where.push(f.match);
  if (f.cat === NO_CATEGORY) where.push(isNull(schema.catalogVariants.categoryXtreamId));
  else if (f.cat) where.push(eq(schema.catalogVariants.categoryXtreamId, f.cat));
  return and(...where)!;
}

export async function countItems(f: CatalogFilter, ex: Exec = db): Promise<number> {
  const [{ n }] = await ex.select({ n: sql<number>`count(*)::int` }).from(schema.catalogVariants).where(catalogWhere(f));
  return n;
}

/** One page in provider order. Asks for one row past the page: cheaper than a second count(*) just to know if more remain. */
export async function pageItems(
  f: CatalogFilter,
  page: number,
  size = CATALOG_PAGE,
  ex: Exec = db,
): Promise<{ rows: Variant[]; hasMore: boolean }> {
  const rows = await ex
    .select()
    .from(schema.catalogVariants)
    .where(catalogWhere(f))
    .orderBy(asc(schema.catalogVariants.position))
    .limit(size + 1)
    .offset((page - 1) * size);
  return { rows: rows.slice(0, size), hasMore: rows.length > size };
}

/** Entries per category under the current filters, for the badges of the grouped view. */
export async function itemCountByCategory(f: CatalogFilter): Promise<Map<string, number>> {
  const rows = await db
    .select({ cat: schema.catalogVariants.categoryXtreamId, n: sql<number>`count(*)::int` })
    .from(schema.catalogVariants)
    .where(catalogWhere({ ...f, cat: "", q: "" }))
    .groupBy(schema.catalogVariants.categoryXtreamId);
  return new Map(rows.map((r) => [r.cat ?? NO_CATEGORY, r.n]));
}
