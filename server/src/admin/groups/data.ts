import { and, asc, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Content, Item } from "@/db";
import type { Kind } from "@/db";

export type GroupsFilter = { kind: Kind; q: string; only: "" | "multi" | "fallback" | "hidden" | "adult" };
export const GROUPS_PAGE = 50;

function groupsWhere(f: GroupsFilter): SQL {
  const where: SQL[] = [eq(schema.contents.kind, f.kind)];
  if (f.q) where.push(ilike(schema.contents.title, `%${f.q}%`));
  if (f.only === "multi") where.push(sql`${schema.contents.variantCount} > 1`);
  if (f.only === "fallback") where.push(sql`${schema.contents.key} like 'fallback:%'`);
  if (f.only === "hidden") where.push(eq(schema.contents.visible, false));
  if (f.only === "adult") where.push(eq(schema.contents.adult, true));
  return and(...where)!;
}

/** One page of contents, the ones with the most variants first. */
export async function pageGroups(f: GroupsFilter, page: number, size = GROUPS_PAGE): Promise<{ rows: Content[]; total: number }> {
  const where = groupsWhere(f);
  const [[{ n: total }], rows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.contents).where(where),
    db.select().from(schema.contents).where(where).orderBy(desc(schema.contents.variantCount), asc(schema.contents.title)).limit(size).offset((page - 1) * size),
  ]);
  return { rows, total };
}

/** The variants of a content, best quality first. */
export async function variantsOfContent(contentId: number): Promise<Item[]> {
  return db.select().from(schema.items).where(eq(schema.items.contentId, contentId)).orderBy(desc(schema.items.qualityRank), asc(schema.items.id));
}

export async function contentById(id: number): Promise<Content | null> {
  const [c] = await db.select().from(schema.contents).where(eq(schema.contents.id, id));
  return c ?? null;
}
