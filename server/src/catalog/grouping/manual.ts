import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { db, schema, variants } from "@/db";
import type { Content, Variant } from "@/db";
import { contentById } from "../queries";
import { regroupItems } from "./group";
import { attachTitles, attachTo, titleApart } from "../matching";
import { setLiveChannel } from "../channels";
import { applyFilters } from "../filters/apply";

/**
 * The manual actions on a variant, applied at once by a partial regroup: its stream is attached by
 * hand to a title or a channel of its own (`manual:<id>`, split out) or to another one (merged), and
 * the identification then leaves it there. Going back to automatic identifies it again.
 */

/** A live variant put on another channel by hand (or given back to the reference): the channel it left, if it is still there. */
async function moved(item: Variant, key: string | null): Promise<Content | null> {
  await setLiveChannel(item, key);
  return item.contentId ? contentById(item.contentId) : null;
}

/** The contents the variant left and joined are judged by the filters at once, not at the next `filters` step. */
async function regrouped(item: Variant): Promise<Content | null> {
  await applyFilters({ contentIds: await regroupItems([item.id], item.contentId ? [item.contentId] : []) });
  // The content the variant *left*: that is the row the admin is looking at. It may have vanished.
  return item.contentId ? contentById(item.contentId) : null;
}

export async function splitVariant(item: Variant): Promise<Content | null> {
  if (item.kind === "live") return moved(item, `manual:${item.id}`);
  await attachTo([item.id], await titleApart(item), "manual", true);
  return regrouped(item);
}

export async function mergeVariantInto(item: Variant, contentKey: string): Promise<Content | null> {
  if (item.kind === "live") return moved(item, contentKey);
  const t = schema.catalogTitles;
  const [into] = await db
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.key, contentKey), eq(t.kind, item.kind)));
  if (!into) throw new Error("Titre introuvable");
  await attachTo([item.id], into.id, "manual", true);
  return regrouped(item);
}

/** Back to the automatic grouping; answers with the content the variant now belongs to (none while TMDB cannot be reached). */
export async function resetVariant(item: Variant): Promise<Content | null> {
  if (item.kind === "live") await moved(item, null);
  else {
    await db
      .update(schema.catalogStreams)
      .set({ titleId: null, how: null, manual: false })
      .where(eq(schema.catalogStreams.xtreamId, item.id));
    await attachTitles([item.id]);
    await regrouped(item);
  }
  const [after] = await db.select({ contentId: variants.contentId }).from(variants).where(eq(variants.id, item.id));
  return after?.contentId ? contentById(after.contentId) : null;
}

export type MergeCandidate = Pick<Content, "id" | "key" | "title" | "year" | "sourceCount">;

/** Contents of the same kind whose title contains the query, the current one excluded. */
export async function mergeCandidates(item: Variant, q: string, limit = 10): Promise<MergeCandidate[]> {
  if (!q) return [];
  const t = schema.catalogTitles;
  const c = schema.catalogChannels;
  if (item.kind === "live")
    return db
      .select({ id: c.id, key: c.key, title: c.name, year: sql<number | null>`null::int`, sourceCount: c.sourceCount })
      .from(c)
      .where(and(ilike(c.name, `%${q}%`), sql`${c.id} <> ${item.contentId ?? 0}`))
      .orderBy(desc(c.sourceCount), asc(c.name))
      .limit(limit);
  return db
    .select({ id: t.id, key: t.key, title: t.title, year: t.year, sourceCount: t.sourceCount })
    .from(t)
    .where(and(eq(t.kind, item.kind), ilike(t.title, `%${q}%`), sql`${t.id} <> ${item.contentId ?? 0}`))
    .orderBy(desc(t.sourceCount), asc(t.title))
    .limit(limit);
}
