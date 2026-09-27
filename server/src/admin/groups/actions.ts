import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Category, Content, Item } from "@/db";
import { regroupItems } from "@/sync";
import { contentById, variantsOfContent } from "./data";

/**
 * The two manual actions on a variant, both stored in `items.key_override` and applied by a
 * partial regroup: split it out (`manual:<id>`), or merge it into another content (its key).
 * `null` goes back to the automatic key.
 */
async function overrideKey(item: Item, keyOverride: string | null): Promise<Content | null> {
  await db.update(schema.items).set({ keyOverride }).where(eq(schema.items.id, item.id));
  await regroupItems([item.id]);
  // The content the variant *left*: that is the row the admin is looking at. It may have vanished.
  return item.contentId ? contentById(item.contentId) : null;
}

export const splitVariant = (item: Item) => overrideKey(item, `manual:${item.id}`);
export const mergeVariantInto = (item: Item, contentKey: string) => overrideKey(item, contentKey);

/** Back to the automatic grouping; answers with the content the variant now belongs to. */
export async function resetVariant(item: Item): Promise<Content | null> {
  await overrideKey(item, null);
  const [after] = await db.select({ contentId: schema.items.contentId }).from(schema.items).where(eq(schema.items.id, item.id));
  return after?.contentId ? contentById(after.contentId) : null;
}

export type MergeCandidate = Pick<Content, "id" | "key" | "title" | "year" | "variantCount">;

/** Contents of the same kind whose title contains the query, the current one excluded. */
export async function mergeCandidates(item: Item, q: string, limit = 10): Promise<MergeCandidate[]> {
  if (!q) return [];
  return db.select({ id: schema.contents.id, key: schema.contents.key, title: schema.contents.title, year: schema.contents.year, variantCount: schema.contents.variantCount })
    .from(schema.contents)
    .where(and(eq(schema.contents.kind, item.kind), ilike(schema.contents.title, `%${q}%`), sql`${schema.contents.id} <> ${item.contentId ?? 0}`))
    .orderBy(desc(schema.contents.variantCount), asc(schema.contents.title)).limit(limit);
}

/** A content with its variants and the categories they sit in, keyed `<kind>:<xtreamId>`. */
export async function groupVariants(contentId: number): Promise<{ content: Content; items: Item[]; categories: Map<string, Category> } | null> {
  const content = await contentById(contentId);
  if (!content) return null;
  const [items, cats] = await Promise.all([
    variantsOfContent(content.id),
    db.select().from(schema.categories).where(eq(schema.categories.kind, content.kind)),
  ]);
  return { content, items, categories: new Map(cats.map((k) => [`${k.kind}:${k.xtreamId}`, k])) };
}
