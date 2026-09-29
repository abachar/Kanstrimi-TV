import { and, asc, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import type { Content, Kind } from "@/db";
import { db, schema } from "@/db";
import { hasFallbackKey } from "@/catalog";

export type GroupsFilter = { kind: Kind; q: string; only: "" | "multi" | "fallback" | "hidden" | "adult" };
export const GROUPS_PAGE = 50;

function groupsWhere(f: GroupsFilter): SQL {
  const where: SQL[] = [eq(schema.catalogContents.kind, f.kind)];
  if (f.q) where.push(ilike(schema.catalogContents.title, `%${f.q}%`));
  if (f.only === "multi") where.push(sql`${schema.catalogContents.variantCount} > 1`);
  if (f.only === "fallback") where.push(hasFallbackKey);
  if (f.only === "hidden") where.push(eq(schema.catalogContents.visible, false));
  if (f.only === "adult") where.push(eq(schema.catalogContents.adult, true));
  return and(...where)!;
}

/** One page of contents, the ones with the most variants first. */
export async function pageGroups(f: GroupsFilter, page: number, size = GROUPS_PAGE): Promise<{ rows: Content[]; total: number }> {
  const where = groupsWhere(f);
  const [[{ n: total }], rows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.catalogContents).where(where),
    db
      .select()
      .from(schema.catalogContents)
      .where(where)
      .orderBy(desc(schema.catalogContents.variantCount), asc(schema.catalogContents.title))
      .limit(size)
      .offset((page - 1) * size),
  ]);
  return { rows, total };
}
