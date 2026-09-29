import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema, type Category, type Content, type Variant } from "@/db";
import type { Kind } from "@/db";

/** Single-row lookups shared by the admin pages, the grouping actions and the TMDB correction. */

export async function itemById(id: number): Promise<Variant | null> {
  const [it] = await db.select().from(schema.catalogVariants).where(eq(schema.catalogVariants.id, id));
  return it ?? null;
}

export async function contentById(id: number): Promise<Content | null> {
  const [c] = await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.id, id));
  return c ?? null;
}

export async function categoryByXtreamId(kind: Kind, xtreamId: string | null): Promise<Category | null> {
  if (!xtreamId) return null;
  const [c] = await db
    .select()
    .from(schema.catalogCategories)
    .where(and(eq(schema.catalogCategories.kind, kind), eq(schema.catalogCategories.xtreamId, xtreamId)));
  return c ?? null;
}

export async function categoriesOfKind(kind: Kind): Promise<Category[]> {
  return db
    .select()
    .from(schema.catalogCategories)
    .where(eq(schema.catalogCategories.kind, kind))
    .orderBy(asc(schema.catalogCategories.position));
}

/** The variants of a content, best quality first, hidden ones included: the admin shows them all. */
export async function variantsOfContent(contentId: number): Promise<Variant[]> {
  return db
    .select()
    .from(schema.catalogVariants)
    .where(eq(schema.catalogVariants.contentId, contentId))
    .orderBy(desc(schema.catalogVariants.qualityRank), asc(schema.catalogVariants.id));
}
