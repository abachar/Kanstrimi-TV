import { Hono } from "hono";
import { db, schema, type Content, visibleItem } from "@/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { slug } from "@/shared";
import { LIVE_THEMES, parseKey } from "@/catalog";
import type { Env, RestContext } from "./context";
import { fail, json } from "./http";
import { contentByKey, liveCategories, variantsOf, visibleContent } from "./contents";
import { favoriteSet } from "./favorites";
import { MOST_WATCHED_LIMIT, mostWatchedKeys } from "./watch-time";
import { playableOfItem, qualityOfRank, versionsOf, type Playable } from "./versions";
import { guidesOf } from "./guides";
import { dayProgrammes, epgOf, type ChannelEpg } from "./epg";
import { channelLogo } from "./cards";
import type { ChannelGroupWire, ChannelWire, Version } from "./types";

/**
 * `/channels`: every visible live category with its channels; `/channels/{id}`: one channel;
 * `/channels/{id}/programmes?version=`: its programmes until 6:00, for the live player, in the guide of
 * that version (each quality may have its own), the channel's without one.
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
  const ctx = c.get("ctx");
  const content = await contentByKey(ctx, key);
  if (!content) return fail("not_found", "Chaîne introuvable");
  const { playables } = await variantsOf(content);
  const { versions, guides } = guided(ctx, playables, await epgOf(playables.flatMap((p) => p.epgIds)));
  const version = c.req.query("version");
  const id = (version && guides.has(version) ? guides.get(version) : guides.get(versions[0]?.id ?? "")) ?? null;
  return json(id ? await dayProgrammes(id) : []);
});

/** The versions of a channel and the guide of each (`guidesOf`), from the guides known to `epg`. */
function guided(ctx: RestContext, playables: Playable[], epg: Map<string, ChannelEpg>) {
  const versions = versionsOf(ctx, playables);
  return { versions, guides: guidesOf(versions, playables, (id) => epg.get(id)?.hasEpg ?? false) };
}

/** A live version's chip: its quality, then its language (« FR » for VF) when the channel mixes languages. */
export function liveChip(v: Pick<Version, "quality" | "language">, mixed: boolean): string {
  return mixed ? `${v.quality}/${v.language === "VF" ? "FR" : v.language}` : v.quality;
}

/**
 * Lists and sheets alike carry `now` / `next`: the app rolls over on `end` without asking again. The
 * channel's guide is its first version's; a version whose guide differs carries its own.
 */
function channelWire(
  ctx: RestContext,
  c: Content,
  playables: Playable[],
  favs: Set<string>,
  epgs: Map<string, ChannelEpg>,
  watchedRank?: number,
): ChannelWire {
  const { versions: all, guides } = guided(ctx, playables, epgs);
  const main = guides.get(all[0]?.id ?? "") ?? null;
  const epg = main ? epgs.get(main) : undefined;
  const mixed = new Set(all.map((v) => v.language)).size > 1;
  const versions: Version[] = all.map((v) => {
    const own = guides.get(v.id) ?? null;
    const labelled = { ...v, chip: liveChip(v, mixed) };
    if (own === main) return labelled;
    const e = own ? epgs.get(own) : undefined;
    return { ...labelled, has_epg: e?.hasEpg ?? false, now: e?.now ?? null, next: e?.next ?? null };
  });
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
    ...(watchedRank ? { watched_rank: watchedRank } : {}),
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
  eg: "Égypte",
  sa: "Arabie saoudite",
  ae: "Émirats arabes unis",
  qa: "Qatar",
  lb: "Liban",
  kw: "Koweït",
  bh: "Bahreïn",
  om: "Oman",
  jo: "Jordanie",
  iq: "Irak",
  sy: "Syrie",
  ly: "Libye",
  ye: "Yémen",
  ps: "Palestine",
  sd: "Soudan",
  mr: "Mauritanie",
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

/** The first group a channel sits in on the Direct screen, « France · Sport »: what a search result says of it. */
export function channelGroupName(c: Pick<Content, "country" | "market" | "themes">): string {
  return `${marketName(c.country?.toLowerCase() ?? c.market)} · ${c.themes[0] ?? LIVE_THEMES[0]}`;
}
const themeRank = (t: string) => {
  const i = (LIVE_THEMES as readonly string[]).indexOf(t);
  return i === -1 ? LIVE_THEMES.length : i;
};

/**
 * One group per market × theme (« France · Sport »), the themes coming from the provider's own
 * separator lines and thematic categories. A channel with several themes sits in each of them.
 * A region's channels go under their country (« Maroc · Sport »), the pan-Arab ones stay under
 * « Monde arabe ». Markets with the most channels first; within a market, the known themes in
 * their order, then the provider's own labels alphabetically.
 */
export async function channelGroups(ctx: RestContext): Promise<ChannelGroupWire[]> {
  const [channels, items, favs, watchedKeys] = await Promise.all([
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
    mostWatchedKeys(),
  ]);
  const visibleKeys = new Set(channels.map((c) => c.key));
  const watchedRank = new Map(
    watchedKeys
      .filter((k) => visibleKeys.has(k))
      .slice(0, MOST_WATCHED_LIMIT)
      .map((k, i) => [k, i + 1]),
  );
  const catName = new Map((await liveCategories()).map((c) => [c.xtreamId, c.name]));
  const byContent = new Map<number, Playable[]>();
  for (const it of items)
    byContent.set(it.contentId!, [
      ...(byContent.get(it.contentId!) ?? []),
      playableOfItem(it, it.categoryXtreamId ? (catName.get(it.categoryXtreamId) ?? null) : null),
    ]);
  const epg = await epgOf([...byContent.values()].flat().flatMap((p) => p.epgIds));

  type Group = { market: string | null; theme: string; channels: ChannelWire[] };
  const groups = new Map<string, Group>();
  for (const c of channels) {
    const playables = byContent.get(c.id) ?? [];
    if (!playables.length) continue;
    const wire = channelWire(ctx, c, playables, favs, epg, watchedRank.get(c.key));
    const market = c.country?.toLowerCase() ?? c.market;
    for (const theme of c.themes.length ? c.themes : [LIVE_THEMES[0]]) {
      const key = `${market ?? ""}|${theme}`;
      const g = groups.get(key) ?? { market, theme, channels: [] };
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
    .map((g) => ({
      id: `${g.market ?? "intl"}-${slug(g.theme)}`,
      name: `${marketName(g.market)} · ${g.theme}`,
      section: marketName(g.market),
      theme: g.theme,
      channels: g.channels,
    }));
}

export async function channelSheet(ctx: RestContext, content: Content): Promise<ChannelWire> {
  const [{ playables }, favs] = await Promise.all([variantsOf(content), favoriteSet()]);
  return channelWire(ctx, content, playables, favs, await epgOf(playables.flatMap((p) => p.epgIds)));
}
