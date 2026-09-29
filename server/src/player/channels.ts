import { Hono } from "hono";
import { db, schema, type Content, type Variant, visibleItem } from "@/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { slug } from "@/shared";
import { LIVE_THEMES, parseKey } from "@/catalog";
import type { Env, RestContext } from "./context";
import { fail, json } from "./http";
import { contentByKey, liveCategories, variantsOf, visibleContent } from "./contents";
import { favoriteSet } from "./favorites";
import { playableOfItem, qualityOfRank, versionsOf } from "./versions";
import { dayProgrammes, epgOf, type ChannelEpg } from "./epg";
import { channelLogo } from "./cards";
import type { ChannelGroupWire, ChannelWire, Version } from "./types";

/**
 * `/channels`: every visible live category with its channels; `/channels/{id}`: one channel;
 * `/channels/{id}/programmes`: its programmes until 6:00, for the live player.
 */
export const channelRoutes = new Hono<Env>();

channelRoutes.get("/", async (c) => json(await channelGroups(c.get("ctx"))));
channelRoutes.get("/:id", async (c) => {
  const key = c.req.param("id");
  if (parseKey(key)?.kind !== "live") return fail("not_found", "Chaîne introuvable");
  const content = await contentByKey(c.get("ctx"), key);
  if (!content) return fail("not_found", "Chaîne introuvable");
  return json(await channelSheet(c.get("ctx"), content));
});
channelRoutes.get("/:id/programmes", async (c) => {
  const key = c.req.param("id");
  if (parseKey(key)?.kind !== "live") return fail("not_found", "Chaîne introuvable");
  const content = await contentByKey(c.get("ctx"), key);
  if (!content) return fail("not_found", "Chaîne introuvable");
  return json(content.epgChannelId ? await dayProgrammes(content.epgChannelId) : []);
});

/** Lists and sheets alike carry `now` / `next`: the app rolls over on `end` without asking again. */
function channelWire(ctx: RestContext, c: Content, versions: Version[], favs: Set<string>, epg: ChannelEpg | undefined): ChannelWire {
  return {
    id: c.key,
    name: c.title,
    number: c.channelNumber,
    logo: channelLogo(ctx.baseUrl, c.logoUrl),
    ...(c.maxQualityRank ? { max_quality: qualityOfRank(c.maxQualityRank) } : {}),
    has_epg: epg?.hasEpg ?? false,
    is_favorite: favs.has(c.key),
    versions,
    now: epg?.now ?? null,
    next: epg?.next ?? null,
  };
}

/** French names of the markets the channels come from; the code itself otherwise. */
const MARKET_NAMES: Record<string, string> = {
  fr: "France",
  be: "Belgique",
  ch: "Suisse",
  ca: "Canada",
  lu: "Luxembourg",
  ma: "Maroc",
  dz: "Algérie",
  tn: "Tunisie",
  ar: "Monde arabe",
  us: "États-Unis",
  uk: "Royaume-Uni",
  gb: "Royaume-Uni",
  ie: "Irlande",
  it: "Italie",
  es: "Espagne",
  pt: "Portugal",
  de: "Allemagne",
  nl: "Pays-Bas",
  tr: "Turquie",
  il: "Israël",
  in: "Inde",
  pk: "Pakistan",
  cn: "Chine",
  kr: "Corée",
  jp: "Japon",
  br: "Brésil",
  pl: "Pologne",
  ro: "Roumanie",
  gr: "Grèce",
  se: "Suède",
  no: "Norvège",
  dk: "Danemark",
  ru: "Russie",
  ua: "Ukraine",
  krd: "Kurdistan",
  af: "Afrique",
};
const marketName = (m: string | null) => (m ? (MARKET_NAMES[m] ?? m.toUpperCase()) : "International");
const themeRank = (t: string) => {
  const i = (LIVE_THEMES as readonly string[]).indexOf(t);
  return i === -1 ? LIVE_THEMES.length : i;
};

/**
 * One group per market × theme (« France · Sport »), the themes coming from the provider's own
 * separator lines and thematic categories. A channel with several themes sits in each of them.
 * Markets with the most channels first; within a market, the known themes in their order, then
 * the provider's own labels alphabetically.
 */
export async function channelGroups(ctx: RestContext): Promise<ChannelGroupWire[]> {
  const [channels, items, favs] = await Promise.all([
    db
      .select()
      .from(schema.catalogContents)
      .where(visibleContent(ctx, "live"))
      .orderBy(asc(schema.catalogContents.channelNumber), asc(schema.catalogContents.title), asc(schema.catalogContents.id)),
    db
      .select()
      .from(schema.catalogVariants)
      .where(and(eq(schema.catalogVariants.kind, "live"), visibleItem, sql`${schema.catalogVariants.contentId} is not null`)),
    favoriteSet(),
  ]);
  const catName = new Map((await liveCategories()).map((c) => [c.xtreamId, c.name]));
  const epg = await epgOf(channels.map((c) => c.epgChannelId ?? ""));
  const byContent = new Map<number, Variant[]>();
  for (const it of items) byContent.set(it.contentId!, [...(byContent.get(it.contentId!) ?? []), it]);

  type Group = { market: string | null; theme: string; channels: ChannelWire[] };
  const groups = new Map<string, Group>();
  for (const c of channels) {
    const its = byContent.get(c.id) ?? [];
    if (!its.length) continue;
    const versions = versionsOf(
      ctx,
      its.map((i) => playableOfItem(i, i.categoryXtreamId ? (catName.get(i.categoryXtreamId) ?? null) : null)),
    );
    const wire = channelWire(ctx, c, versions, favs, epg.get(c.epgChannelId ?? ""));
    for (const theme of c.themes.length ? c.themes : [LIVE_THEMES[0]]) {
      const key = `${c.market ?? ""}|${theme}`;
      const g = groups.get(key) ?? { market: c.market, theme, channels: [] };
      g.channels.push(wire);
      groups.set(key, g);
    }
  }
  const perMarket = new Map<string | null, number>();
  for (const g of groups.values()) perMarket.set(g.market, (perMarket.get(g.market) ?? 0) + g.channels.length);
  return [...groups.values()]
    .sort(
      (a, b) =>
        perMarket.get(b.market)! - perMarket.get(a.market)! ||
        (a.market ?? "").localeCompare(b.market ?? "") ||
        themeRank(a.theme) - themeRank(b.theme) ||
        a.theme.localeCompare(b.theme),
    )
    .map((g) => ({ id: `${g.market ?? "intl"}-${slug(g.theme)}`, name: `${marketName(g.market)} · ${g.theme}`, channels: g.channels }));
}

export async function channelSheet(ctx: RestContext, content: Content): Promise<ChannelWire> {
  const [{ playables }, favs, epg] = await Promise.all([variantsOf(content), favoriteSet(), epgOf([content.epgChannelId ?? ""])]);
  return channelWire(ctx, content, versionsOf(ctx, playables), favs, epg.get(content.epgChannelId ?? ""));
}
