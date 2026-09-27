import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema, type Category, type Content, type Item } from "@/db";
import type { Kind } from "@/db";

/** Single-row lookups shared by the admin pages, the grouping actions and the TMDB correction. */

export async function itemById(id: number): Promise<Item | null> {
  const [it] = await db.select().from(schema.items).where(eq(schema.items.id, id));
  return it ?? null;
}

export async function contentById(id: number): Promise<Content | null> {
  const [c] = await db.select().from(schema.contents).where(eq(schema.contents.id, id));
  return c ?? null;
}

export async function categoryByXtreamId(kind: Kind, xtreamId: string | null): Promise<Category | null> {
  if (!xtreamId) return null;
  const [c] = await db
    .select()
    .from(schema.categories)
    .where(and(eq(schema.categories.kind, kind), eq(schema.categories.xtreamId, xtreamId)));
  return c ?? null;
}

export async function categoriesOfKind(kind: Kind): Promise<Category[]> {
  return db.select().from(schema.categories).where(eq(schema.categories.kind, kind)).orderBy(asc(schema.categories.position));
}

/** The variants of a content, best quality first, hidden ones included: the admin shows them all. */
export async function variantsOfContent(contentId: number): Promise<Item[]> {
  return db
    .select()
    .from(schema.items)
    .where(eq(schema.items.contentId, contentId))
    .orderBy(desc(schema.items.qualityRank), asc(schema.items.id));
}
