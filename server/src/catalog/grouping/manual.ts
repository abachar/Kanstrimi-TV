import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { db, schema, variants } from "@/db";
import type { Content, Variant } from "@/db";
import { contentById } from "../queries";
import { regroupItems } from "./group";
import { applyFilters } from "../filters/apply";

/**
 * The two manual actions on a variant, both stored in `catalog_variants.key_override` and applied by a
 * partial regroup: split it out (`manual:<id>`), or merge it into another content (its key).
 * `null` goes back to the automatic key.
 */
async function overrideKey(item: Variant, keyOverride: string | null): Promise<Content | null> {
  await db.update(schema.catalogVariants).set({ keyOverride }).where(eq(schema.catalogVariants.id, item.id));
  // A content the regroup made is judged by the filters at once, not at the next `filters` step.
  await applyFilters({ contentIds: await regroupItems([item.id]) });
  // The content the variant *left*: that is the row the admin is looking at. It may have vanished.
  return item.contentId ? contentById(item.contentId) : null;
}

export const splitVariant = (item: Variant) => overrideKey(item, `manual:${item.id}`);
export const mergeVariantInto = (item: Variant, contentKey: string) => overrideKey(item, contentKey);

/** Back to the automatic grouping; answers with the content the variant now belongs to. */
export async function resetVariant(item: Variant): Promise<Content | null> {
  await overrideKey(item, null);
  const [after] = await db.select({ contentId: variants.contentId }).from(variants).where(eq(variants.id, item.id));
  return after?.contentId ? contentById(after.contentId) : null;
}

export type MergeCandidate = Pick<Content, "id" | "key" | "title" | "year" | "variantCount">;

/** Contents of the same kind whose title contains the query, the current one excluded. */
export async function mergeCandidates(item: Variant, q: string, limit = 10): Promise<MergeCandidate[]> {
  if (!q) return [];
  const t = schema.catalogTitles;
  const c = schema.catalogChannels;
  if (item.kind === "live")
    return db
      .select({ id: c.id, key: c.key, title: c.name, year: sql<number | null>`null::int`, variantCount: c.sourceCount })
      .from(c)
      .where(and(ilike(c.name, `%${q}%`), sql`${c.id} <> ${item.contentId ?? 0}`))
      .orderBy(desc(c.sourceCount), asc(c.name))
      .limit(limit);
  return db
    .select({ id: t.id, key: t.key, title: t.title, year: t.year, variantCount: t.sourceCount })
    .from(t)
    .where(and(eq(t.kind, item.kind), ilike(t.title, `%${q}%`), sql`${t.id} <> ${item.contentId ?? 0}`))
    .orderBy(desc(t.sourceCount), asc(t.title))
    .limit(limit);
}
