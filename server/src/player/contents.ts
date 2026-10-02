import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, schema, type Content, type Variant, visibleCategory, visibleItem } from "@/db";
import { parseKey } from "@/catalog";
import type { RestContext } from "./context";
import { playableOfItem, type Playable } from "./versions";

/** What the app may see: the admin's visibility, and adult contents only when the setting allows them. */

export const visibleContent = (ctx: RestContext, kind?: "live" | "vod" | "series"): SQL =>
  and(
    kind ? eq(schema.catalogContents.kind, kind) : undefined,
    eq(schema.catalogContents.visible, true),
    ctx.serveAdult ? undefined : eq(schema.catalogContents.adult, false),
  )!;

/** « Nouveautés » holds the movies released in the last twelve months. */
export const NEW_RELEASE_MONTHS = 12;

/**
 * Released within `NEW_RELEASE_MONTHS` of `today` (a parameter so tests can pin it). Written with the
 * expression of `contents_release_idx` (undated = year 1, never new): a range of the index, not a scan.
 */
export const isNewRelease = (today = new Date()): SQL =>
  sql`coalesce(${schema.catalogContents.releaseDate}, '0001-01-01'::date) >= ${today.toISOString().slice(0, 10)}::date - make_interval(months => ${NEW_RELEASE_MONTHS})`;

export async function contentByKey(ctx: RestContext, key: string): Promise<Content | null> {
  const [c] = await db
    .select()
    .from(schema.catalogContents)
    .where(and(eq(schema.catalogContents.key, key), visibleContent(ctx)));
  return c ?? null;
}

/** The visible contents among `keys`, in the order of `keys` (« Ma liste », « Chaînes les plus regardées »). */
export async function contentsInOrder(ctx: RestContext, keys: string[], kind?: "live" | "vod" | "series"): Promise<Content[]> {
  if (!keys.length) return [];
  const rows = await db
    .select()
    .from(schema.catalogContents)
    .where(and(visibleContent(ctx, kind), inArray(schema.catalogContents.key, keys)));
  const order = new Map(keys.map((k, i) => [k, i]));
  return rows.sort((a, b) => order.get(a.key)! - order.get(b.key)!);
}

/** Does a progress or favourite key point at something the app may see? */
export async function keyExists(ctx: RestContext, key: string): Promise<boolean> {
  const parsed = parseKey(key);
  if (!parsed) return false;
  if (parsed.episode !== undefined)
    return (
      (await db.select({ id: schema.catalogEpisodes.id }).from(schema.catalogEpisodes).where(eq(schema.catalogEpisodes.key, key))).length >
        0 && (await contentByKey(ctx, parsed.seriesKey)) !== null
    );
  return (await contentByKey(ctx, key)) !== null;
}

/** Visible variants of a content, best first, already turned into playables with their category names. */
export type Variants = { items: Variant[]; playables: Playable[]; categoryName: (it: Variant) => string | null };
export async function variantsOf(content: Content): Promise<Variants> {
  const items = await db
    .select()
    .from(schema.catalogVariants)
    .where(and(eq(schema.catalogVariants.contentId, content.id), visibleItem))
    .orderBy(desc(schema.catalogVariants.qualityRank), asc(schema.catalogVariants.position), asc(schema.catalogVariants.id));
  const catIds = [...new Set(items.map((i) => i.categoryXtreamId).filter((x): x is string => x !== null))];
  const cats = catIds.length
    ? await db
        .select()
        .from(schema.catalogCategories)
        .where(and(eq(schema.catalogCategories.kind, content.kind), inArray(schema.catalogCategories.xtreamId, catIds)))
    : [];
  const names = new Map(cats.map((c) => [c.xtreamId, c.name]));
  const categoryName = (it: Variant) => (it.categoryXtreamId ? (names.get(it.categoryXtreamId) ?? null) : null);
  return { items, playables: items.map((i) => playableOfItem(i, categoryName(i))), categoryName };
}

export async function liveCategories() {
  return db
    .select()
    .from(schema.catalogCategories)
    .where(and(eq(schema.catalogCategories.kind, "live"), visibleCategory))
    .orderBy(asc(schema.catalogCategories.position));
}
