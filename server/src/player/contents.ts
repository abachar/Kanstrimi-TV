import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  type Category,
  channelContent,
  db,
  schema,
  titleContent,
  variants,
  type Content,
  type Variant,
  visibleCategory,
  visibleItem,
} from "@/db";
import { parseKey } from "@/catalog";
import type { RestContext } from "./context";
import { playableOfItem, type Playable } from "./variants";

/**
 * What the profile may see: a title or a channel its filter keeps (`app_profile_titles`,
 * `app_profile_channels`, written with the aggregates), adult ones only when the setting allows them.
 */
const t = schema.catalogTitles;
const ch = schema.catalogChannels;
export const visibleTitle = (ctx: RestContext, kind?: "vod" | "series"): SQL =>
  and(
    kind ? eq(t.kind, kind) : undefined,
    // `visible` (seen by one profile at least) is implied by the profile's row; kept for the indexes, which start with it.
    eq(t.visible, true),
    sql`exists (select 1 from ${schema.appProfileTitles} cp where cp.title_id = ${t.id} and cp.profile_id = ${ctx.profile.id})`,
    ctx.serveAdult ? undefined : eq(t.adult, false),
  )!;
export const visibleChannel = (ctx: RestContext): SQL =>
  and(
    eq(ch.visible, true),
    sql`exists (select 1 from ${schema.appProfileChannels} cp where cp.channel_id = ${ch.id} and cp.profile_id = ${ctx.profile.id})`,
    ctx.serveAdult ? undefined : eq(ch.adult, false),
  )!;

/**
 * What the profile may play: a visible variant its filter keeps, flagged adult only when the setting
 * allows it. A content is adult when all its variants are, so a mixed one stays served without its adult variants.
 */
export const servedVariant = (ctx: RestContext): SQL =>
  and(
    visibleItem,
    sql`exists (select 1 from ${schema.appProfileStreams} vp where vp.xtream_id = ${variants.id} and vp.profile_id = ${ctx.profile.id})`,
    ctx.serveAdult ? undefined : eq(variants.adult, false),
  )!;

/** « Nouveautés » holds the movies released in the last twelve months. */
export const NEW_RELEASE_MONTHS = 12;

/** What an undated content sorts as: year 1, the oldest. */
export const NO_RELEASE = "0001-01-01";

/**
 * The release date as the lists sort it: the expression of `catalog_titles_release_idx`, literal
 * included (a parameter would not match the index).
 */
export const byRelease: SQL = sql`coalesce(${schema.catalogTitles.releaseDate}, ${sql.raw(`'${NO_RELEASE}'`)}::date)`;

/**
 * Released within `NEW_RELEASE_MONTHS` of today. Written with the
 * expression of `catalog_titles_release_idx` (undated = year 1, never new): a range of the index, not a scan.
 */
export const isNewRelease = (): SQL =>
  sql`${byRelease} >= ${new Date().toISOString().slice(0, 10)}::date - make_interval(months => ${NEW_RELEASE_MONTHS})`;

/**
 * The visible contents under these keys, titles and channels alike, of one kind when it is given. A key
 * says which table it is in (`live:…` a channel, `tmdb:…` and `fallback:…` a title), but for one
 * set by hand (`manual:…`, a merge): both are asked then.
 */
async function contentsByKeys(ctx: RestContext, keys: string[], kind?: "live" | "vod" | "series"): Promise<Content[]> {
  const prefix = (k: string) => k.slice(0, k.indexOf(":"));
  const titleKeys = kind === "live" ? [] : keys.filter((k) => prefix(k) !== "live");
  const channelKeys = kind === undefined || kind === "live" ? keys.filter((k) => !["tmdb", "fallback"].includes(prefix(k))) : [];
  const [titles, channels] = await Promise.all([
    titleKeys.length
      ? db
          .select(titleContent)
          .from(t)
          .where(and(visibleTitle(ctx, kind === "live" ? undefined : kind), inArray(t.key, titleKeys)))
      : [],
    channelKeys.length
      ? db
          .select(channelContent)
          .from(ch)
          .where(and(visibleChannel(ctx), inArray(ch.key, channelKeys)))
      : [],
  ]);
  return [...titles, ...channels];
}

export async function contentByKey(ctx: RestContext, key: string): Promise<Content | null> {
  return (await contentsByKeys(ctx, [key]))[0] ?? null;
}

/** The visible contents among `keys`, in the order of `keys` (« Ma liste », « Chaînes les plus regardées »). */
export async function contentsInOrder(ctx: RestContext, keys: string[], kind?: "live" | "vod" | "series"): Promise<Content[]> {
  if (!keys.length) return [];
  const rows = await contentsByKeys(ctx, keys, kind);
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
export async function variantsOf(ctx: RestContext, content: Content): Promise<Variants> {
  const items = await db
    .select()
    .from(variants)
    .where(and(eq(variants.contentId, content.id), servedVariant(ctx)))
    .orderBy(desc(variants.qualityRank), asc(variants.position), asc(variants.id));
  const catIds = [...new Set(items.map((i) => i.categoryXtreamId).filter((x): x is string => x !== null))];
  const cats = catIds.length
    ? await db
        .select()
        .from(schema.xtreamCategories)
        .where(and(eq(schema.xtreamCategories.kind, content.kind), inArray(schema.xtreamCategories.xtreamId, catIds)))
    : [];
  const names = categoryNames(cats);
  const categoryName = (it: Variant) => categoryNameOf(names, it);
  return { items, playables: items.map((i) => playableOfItem(i, categoryName(i))), categoryName };
}

/** Category names by account and id: two providers number their categories alike. */
export const categoryNames = (cats: Pick<Category, "accountId" | "xtreamId" | "name">[]) =>
  new Map(cats.map((c) => [`${c.accountId}:${c.xtreamId}`, c.name]));
export const categoryNameOf = (names: Map<string, string>, it: Pick<Variant, "accountId" | "categoryXtreamId">) =>
  it.categoryXtreamId ? (names.get(`${it.accountId}:${it.categoryXtreamId}`) ?? null) : null;

export async function liveCategories() {
  return db
    .select()
    .from(schema.xtreamCategories)
    .where(and(eq(schema.xtreamCategories.kind, "live"), visibleCategory))
    .orderBy(asc(schema.xtreamCategories.position));
}
