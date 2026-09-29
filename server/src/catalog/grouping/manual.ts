import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Category, Content, Variant } from "@/db";
import { contentById, variantsOfContent } from "../queries";
import { regroupItems } from "./group";

/**
 * The two manual actions on a variant, both stored in `catalog_variants.key_override` and applied by a
 * partial regroup: split it out (`manual:<id>`), or merge it into another content (its key).
 * `null` goes back to the automatic key.
 */
async function overrideKey(item: Variant, keyOverride: string | null): Promise<Content | null> {
  await db.update(schema.catalogVariants).set({ keyOverride }).where(eq(schema.catalogVariants.id, item.id));
  await regroupItems([item.id]);
  // The content the variant *left*: that is the row the admin is looking at. It may have vanished.
  return item.contentId ? contentById(item.contentId) : null;
}

export const splitVariant = (item: Variant) => overrideKey(item, `manual:${item.id}`);
export const mergeVariantInto = (item: Variant, contentKey: string) => overrideKey(item, contentKey);

/** Back to the automatic grouping; answers with the content the variant now belongs to. */
export async function resetVariant(item: Variant): Promise<Content | null> {
  await overrideKey(item, null);
  const [after] = await db
    .select({ contentId: schema.catalogVariants.contentId })
    .from(schema.catalogVariants)
    .where(eq(schema.catalogVariants.id, item.id));
  return after?.contentId ? contentById(after.contentId) : null;
}

export type MergeCandidate = Pick<Content, "id" | "key" | "title" | "year" | "variantCount">;

/** Contents of the same kind whose title contains the query, the current one excluded. */
export async function mergeCandidates(item: Variant, q: string, limit = 10): Promise<MergeCandidate[]> {
  if (!q) return [];
  return db
    .select({
      id: schema.catalogContents.id,
      key: schema.catalogContents.key,
      title: schema.catalogContents.title,
      year: schema.catalogContents.year,
      variantCount: schema.catalogContents.variantCount,
    })
    .from(schema.catalogContents)
    .where(
      and(
        eq(schema.catalogContents.kind, item.kind),
        ilike(schema.catalogContents.title, `%${q}%`),
        sql`${schema.catalogContents.id} <> ${item.contentId ?? 0}`,
      ),
    )
    .orderBy(desc(schema.catalogContents.variantCount), asc(schema.catalogContents.title))
    .limit(limit);
}

/** A content with its variants and the categories they sit in, keyed `<kind>:<xtreamId>`. */
export async function groupVariants(
  contentId: number,
): Promise<{ content: Content; items: Variant[]; categories: Map<string, Category> } | null> {
  const content = await contentById(contentId);
  if (!content) return null;
  const [items, cats] = await Promise.all([
    variantsOfContent(content.id),
    db.select().from(schema.catalogCategories).where(eq(schema.catalogCategories.kind, content.kind)),
  ]);
  return { content, items, categories: new Map(cats.map((k) => [`${k.kind}:${k.xtreamId}`, k])) };
}
