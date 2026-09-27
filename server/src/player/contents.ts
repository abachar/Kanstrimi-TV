import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db, schema, type Content, type Item, visibleCategory, visibleItem } from "@/db";
import { parseKey } from "@/catalog";
import type { RestContext } from "./context";
import { playableOfItem, type Playable } from "./versions";

/** What the app may see: the admin's visibility, and adult contents only when the setting allows them. */

export const visibleContent = (ctx: RestContext, kind?: "live" | "vod" | "series"): SQL =>
  and(
    kind ? eq(schema.contents.kind, kind) : undefined,
    eq(schema.contents.visible, true),
    ctx.serveAdult ? undefined : eq(schema.contents.adult, false),
  )!;

export async function contentByKey(ctx: RestContext, key: string): Promise<Content | null> {
  const [c] = await db
    .select()
    .from(schema.contents)
    .where(and(eq(schema.contents.key, key), visibleContent(ctx)));
  return c ?? null;
}

/** Does a progress or favourite key point at something the app may see? */
export async function keyExists(ctx: RestContext, key: string): Promise<boolean> {
  const parsed = parseKey(key);
  if (!parsed) return false;
  if (parsed.episode !== undefined)
    return (
      (await db.select({ id: schema.episodes.id }).from(schema.episodes).where(eq(schema.episodes.key, key))).length > 0 &&
      (await contentByKey(ctx, parsed.seriesKey)) !== null
    );
  return (await contentByKey(ctx, key)) !== null;
}

/** Visible variants of a content, best first, already turned into playables with their category names. */
export type Variants = { items: Item[]; playables: Playable[]; categoryName: (it: Item) => string | null };
export async function variantsOf(content: Content): Promise<Variants> {
  const items = await db
    .select()
    .from(schema.items)
    .where(and(eq(schema.items.contentId, content.id), visibleItem))
    .orderBy(desc(schema.items.qualityRank), asc(schema.items.position), asc(schema.items.id));
  const catIds = [...new Set(items.map((i) => i.categoryXtreamId).filter((x): x is string => x !== null))];
  const cats = catIds.length
    ? await db
        .select()
        .from(schema.categories)
        .where(and(eq(schema.categories.kind, content.kind), inArray(schema.categories.xtreamId, catIds)))
    : [];
  const names = new Map(cats.map((c) => [c.xtreamId, c.name]));
  const categoryName = (it: Item) => (it.categoryXtreamId ? (names.get(it.categoryXtreamId) ?? null) : null);
  return { items, playables: items.map((i) => playableOfItem(i, categoryName(i))), categoryName };
}

export async function liveCategories() {
  return db
    .select()
    .from(schema.categories)
    .where(and(eq(schema.categories.kind, "live"), visibleCategory))
    .orderBy(asc(schema.categories.position));
}
