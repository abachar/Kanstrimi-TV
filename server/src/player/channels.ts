import { Hono } from "hono";
import { db, schema, type Content, type Item, visibleItem } from "@/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { slug } from "@/shared";
import { parseKey } from "@/catalog";
import type { Env, RestContext } from "./context";
import { fail, json } from "./http";
import { contentByKey, liveCategories, variantsOf, visibleContent } from "./contents";
import { favoriteSet } from "./favorites";
import { playableOfItem, qualityOfRank, versionsOf } from "./versions";
import type { ChannelGroupWire, ChannelWire, Version } from "./types";

/** `/channels`: every visible live category with its channels; `/channels/{id}`: one channel. */
export const channelRoutes = new Hono<Env>();

channelRoutes.get("/", async (c) => json(await channelGroups(c.get("ctx"))));
channelRoutes.get("/:id", async (c) => {
  const key = c.req.param("id");
  if (parseKey(key)?.kind !== "live") return fail("not_found", "Chaîne introuvable");
  const content = await contentByKey(c.get("ctx"), key);
  if (!content) return fail("not_found", "Chaîne introuvable");
  return json(await channelSheet(c.get("ctx"), content));
});

function channelWire(ctx: RestContext, c: Content, versions: Version[], favs: Set<string>): ChannelWire {
  return {
    id: c.key,
    name: c.title,
    number: c.channelNumber,
    logo: c.logoUrl,
    ...(c.maxQualityRank ? { max_quality: qualityOfRank(c.maxQualityRank) } : {}),
    has_epg: Boolean(c.epgChannelId),
    is_favorite: favs.has(c.key),
    versions,
  };
}

export async function channelGroups(ctx: RestContext): Promise<ChannelGroupWire[]> {
  const cats = await liveCategories();
  const [channels, items, favs] = await Promise.all([
    db
      .select()
      .from(schema.contents)
      .where(visibleContent(ctx, "live"))
      .orderBy(asc(schema.contents.channelNumber), asc(schema.contents.title), asc(schema.contents.id)),
    db
      .select()
      .from(schema.items)
      .where(and(eq(schema.items.kind, "live"), visibleItem, sql`${schema.items.contentId} is not null`)),
    favoriteSet(),
  ]);
  const catName = new Map(cats.map((c) => [c.xtreamId, c.name]));
  const byContent = new Map<number, Item[]>();
  for (const it of items) {
    if (it.categoryXtreamId && !catName.has(it.categoryXtreamId)) continue;
    byContent.set(it.contentId!, [...(byContent.get(it.contentId!) ?? []), it]);
  }
  const byCat = new Map<string, ChannelWire[]>();
  for (const c of channels) {
    const its = byContent.get(c.id) ?? [];
    if (!its.length || !c.categoryXtreamId) continue;
    const versions = versionsOf(
      ctx,
      its.map((i) => playableOfItem(i, i.categoryXtreamId ? (catName.get(i.categoryXtreamId) ?? null) : null)),
    );
    byCat.set(c.categoryXtreamId, [...(byCat.get(c.categoryXtreamId) ?? []), channelWire(ctx, c, versions, favs)]);
  }
  return cats
    .filter((k) => byCat.has(k.xtreamId))
    .map((k) => ({ id: slug(k.name) + "-" + k.xtreamId, name: k.name, channels: byCat.get(k.xtreamId)! }));
}

/** `now` / `next` stay null until the EPG lives in the database. */
export async function channelSheet(ctx: RestContext, content: Content): Promise<ChannelWire> {
  const { playables } = await variantsOf(content);
  return { ...channelWire(ctx, content, versionsOf(ctx, playables), await favoriteSet()), now: null, next: null };
}
